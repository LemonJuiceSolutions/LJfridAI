/**
 * Scheduler executor functions — pure Node.js, NO Next.js dependencies.
 *
 * These are simplified versions of the corresponding functions in src/app/actions.ts
 * and src/app/actions/scheduler.ts, stripped of auth checks and next/cache calls.
 * They are used by both the in-process scheduler (scheduler-service.ts) and the
 * standalone scheduler microservice (scheduler-service/).
 *
 * All functions run in "system" context (bypass auth = true).
 */

import { db } from '@/lib/db';
import sql from 'mssql';
import { pythonFetch } from '@/lib/python-backend';
import { resolveTheme } from '@/lib/chart-theme';

// ─────────────────────────────────────────────────────────────────────────────
// Type definitions (mirror those in actions.ts for compat)
// ─────────────────────────────────────────────────────────────────────────────

export type SqlPreviewDep = {
  tableName: string;
  query?: string;
  isPython?: boolean;
  pythonCode?: string;
  connectorId?: string;
  pipelineDependencies?: SqlPreviewDep[];
  data?: any[];
  nodeName?: string;
  displayName?: string;
};

export type PythonPreviewResult = {
  success: boolean;
  data?: any[];
  columns?: string[];
  variables?: Record<string, any>;
  chartBase64?: string;
  chartHtml?: string;
  html?: string;
  rechartsConfig?: any;
  rechartsData?: any[];
  rechartsStyle?: any;
  plotlyJson?: any;
  error?: string;
  rowCount?: number;
  stdout?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function getMssqlConfig(conf: any): sql.config {
  const cfg: sql.config = {
    user: conf.user || conf.username,
    password: conf.password,
    server: conf.host || conf.server,
    database: conf.database,
    options: {
      encrypt: !!(conf.host && conf.host.includes('database.windows.net')),
      trustServerCertificate: process.env.NODE_ENV !== 'production',
      connectTimeout: 60000,
      requestTimeout: 600000,
    },
  };
  if (conf.port) {
    const p = parseInt(conf.port);
    if (!isNaN(p)) cfg.port = p;
  }
  return cfg;
}

async function getConnectorConf(connectorId: string): Promise<{ conf: any; companyId: string } | null> {
  const connector = await db.connector.findUnique({ where: { id: connectorId } });
  if (!connector?.config) return null;
  let conf: any = connector.config;
  if (typeof conf === 'string') {
    try { conf = JSON.parse(conf); } catch { return null; }
  }
  return { conf, companyId: connector.companyId };
}

// ─────────────────────────────────────────────────────────────────────────────
// executeSqlPreview
// Mirrors executeSqlPreviewAction from actions.ts (bypass-auth path only).
// ─────────────────────────────────────────────────────────────────────────────

export async function executeSqlPreview(
  query: string,
  connectorId: string,
  pipelineDependencies: SqlPreviewDep[] = [],
  overrideCompanyId?: string,
): Promise<{ data: any[] | null; error: string | null }> {
  let pool: sql.ConnectionPool | null = null;
  let transaction: sql.Transaction | null = null;
  const createdTempTables: string[] = [];

  try {
    // Resolve company from connector. MUST end up with a concrete companyId —
    // falling back to an undefined Prisma filter would read connectors across
    // every tenant in the database. The caller (scheduler executor) can also
    // pass `overrideCompanyId` when it has already proven the task's tenant
    // — that lets ancestor SQL nodes without an explicit connector still
    // reach a company-scoped fallback connector instead of failing closed.
    let companyId: string | null = overrideCompanyId ?? null;
    let connector: any = null;

    if (connectorId) {
      connector = await db.connector.findFirst({
        where: { id: connectorId, type: 'SQL' },
      });
      if (connector) companyId = connector.companyId;
    }

    // Connector inheritance fallback via pipeline dependencies
    if (!connector) {
      const findInherited = (deps: SqlPreviewDep[]): string | undefined => {
        for (const d of deps) {
          if (d.query && d.connectorId) return d.connectorId;
          if (d.pipelineDependencies?.length) {
            const nested = findInherited(d.pipelineDependencies);
            if (nested) return nested;
          }
        }
      };
      const inheritedId = findInherited(pipelineDependencies);
      if (inheritedId) {
        connector = await db.connector.findFirst({ where: { id: inheritedId, type: 'SQL' } });
        if (connector) companyId = connector.companyId;
      }
      if (!connector && companyId) {
        connector = await db.connector.findFirst({
          where: { companyId, type: 'SQL' },
        });
      }
    }

    if (!connector || !companyId) {
      return {
        data: null,
        error: '[Security] Scheduler cannot resolve companyId for SQL preview — no valid connector in node or dependencies.',
      };
    }

    let conf: any = connector.config;
    if (typeof conf === 'string') {
      try { conf = JSON.parse(conf); } catch { return { data: null, error: 'Config connettore non valida.' }; }
    }

    pool = new sql.ConnectionPool(getMssqlConfig(conf));
    await pool.connect();

    transaction = new sql.Transaction(pool);
    await transaction.begin();
    const request = new sql.Request(transaction);

    // Flatten deps
    const flattenDeps = (deps: SqlPreviewDep[], result: SqlPreviewDep[] = [], seen = new Set<string>()): SqlPreviewDep[] => {
      for (const dep of deps) {
        if (dep.pipelineDependencies?.length) flattenDeps(dep.pipelineDependencies, result, seen);
        if (!seen.has(dep.tableName)) { seen.add(dep.tableName); result.push(dep); }
      }
      return result;
    };
    const allDeps = flattenDeps(pipelineDependencies);

    const nameMap = new Map<string, string>();
    const escapeRe = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const knownSchemas = new Set(['dbo', 'sys', 'information_schema', 'guest', 'db_owner']);

    const isAliasPrefix = (prefix: string | undefined): boolean => {
      if (!prefix) return false;
      const clean = prefix.replace(/[\.\[\]]/g, '').trim();
      if (!clean) return false;
      if (knownSchemas.has(clean.toLowerCase())) return false;
      return clean.length <= 5;
    };

    const replaceTableRef = (sqlText: string, origName: string, tempName: string): string => {
      const esc = escapeRe(origName);
      let out = sqlText;
      // Match 0/1/2 leading qualifiers ([db].[schema].[name] | [schema].[name] | [name])
      // Temp tables (##xxx) cannot be referenced with db/schema prefix, so we
      // strip the qualifiers entirely.
      out = out.replace(new RegExp(`((?:(?:\\[[^\\]]+\\]|\\w+)\\.){0,2})\\[${esc}\\]`, 'gi'), (m, prefix) => {
        // Re-check alias on innermost prefix (last segment before the bracketed name).
        const segs = (prefix as string).split('.').filter(Boolean);
        const inner = segs[segs.length - 1];
        if (isAliasPrefix(inner)) return m;
        return tempName;
      });
      out = out.replace(new RegExp(`((?:(?:\\[[^\\]]+\\]|\\w+)\\.){0,2})\\b${esc}\\b`, 'gi'), (m, prefix) => {
        const segs = (prefix as string).split('.').filter(Boolean);
        const inner = segs[segs.length - 1];
        if (isAliasPrefix(inner)) return m;
        return tempName;
      });
      return out;
    };

    let schemaSourceTable: string | null = null;

    for (const dep of allDeps) {
      const uid = Date.now().toString().slice(-6) + Math.floor(Math.random() * 1000);
      const sanitized = dep.tableName.replace(/[^a-zA-Z0-9_]/g, '_');
      const tempName = `##${sanitized}_${uid}`;
      nameMap.set(dep.tableName, tempName);
      const MIN_ALIAS = 8;
      if (dep.nodeName && dep.nodeName !== dep.tableName && dep.nodeName.length >= MIN_ALIAS && !nameMap.has(dep.nodeName)) nameMap.set(dep.nodeName, tempName);
      if (dep.displayName && dep.displayName !== dep.tableName && dep.displayName !== dep.nodeName && dep.displayName.length >= MIN_ALIAS && !nameMap.has(dep.displayName)) nameMap.set(dep.displayName, tempName);

      try {
        await request.query(`IF OBJECT_ID('tempdb..${tempName}') IS NOT NULL DROP TABLE ${tempName};`);

        let rows: any[] = [];
        let cols: string[] = [];

        if (dep.data && Array.isArray(dep.data)) {
          rows = dep.data;
          if (rows.length > 0) cols = Object.keys(rows[0]);
        } else if (dep.isPython && dep.pythonCode) {
          const pr = await executePythonPreview(dep.pythonCode, 'table', {}, dep.pipelineDependencies, dep.connectorId);
          if (pr.success && pr.data?.length) { rows = pr.data; cols = Object.keys(rows[0]); }
        } else if (dep.query) {
          let sq = dep.query.trim();
          for (const [orig, tmp] of nameMap.entries()) { if (orig !== dep.tableName) sq = replaceTableRef(sq, orig, tmp); }
          const res = await request.query(sq);
          if (res.recordset?.length) { rows = res.recordset; cols = Object.keys(rows[0]); }
        }

        if (rows.length > 0) {
          const colDefs = cols.map(c => `[${c}] NVARCHAR(MAX)`).join(', ');
          await request.query(`CREATE TABLE ${tempName} (${colDefs});`);
          if (!schemaSourceTable) schemaSourceTable = tempName;
          createdTempTables.push(tempName);
          const batchSize = 100;
          for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize);
            const values = batch.map(row => {
              const vals = cols.map(col => {
                const v = row[col];
                if (v === null || v === undefined) return 'NULL';
                if (typeof v === 'number') return v.toString();
                if (typeof v === 'boolean') return v ? '1' : '0';
                if (v instanceof Date) return `'${v.toISOString()}'`;
                return `N'${String(v).replace(/'/g, "''")}'`;
              }).join(', ');
              return `(${vals})`;
            }).join(', ');
            if (values) await request.query(`INSERT INTO ${tempName} VALUES ${values};`);
          }
        } else {
          if (schemaSourceTable) {
            await request.query(`SELECT TOP 0 * INTO ${tempName} FROM ${schemaSourceTable};`);
          } else {
            await request.query(`CREATE TABLE ${tempName} ([_empty_placeholder] NVARCHAR(1));`);
          }
          createdTempTables.push(tempName);
        }
      } catch (depErr: any) {
        throw new Error(`Errore dipendenza "${dep.tableName}": ${depErr.message}`);
      }
    }

    // Replace table refs in main query
    let finalQuery = query.trim();
    for (const [orig, tmp] of nameMap.entries()) finalQuery = replaceTableRef(finalQuery, orig, tmp);

    const result = await request.query(finalQuery);
    await transaction.commit();
    return { data: result.recordset || [], error: null };

  } catch (e: any) {
    try { await transaction?.rollback(); } catch {}
    return { data: null, error: e.message };
  } finally {
    try { await pool?.close(); } catch {}
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// executePythonPreview
// Mirrors executePythonPreviewAction from actions.ts (bypass-auth path only).
// ─────────────────────────────────────────────────────────────────────────────

export async function executePythonPreview(
  code: string,
  outputType: 'table' | 'variable' | 'chart' | 'html',
  inputData: Record<string, any[]> = {},
  dependencies?: SqlPreviewDep[],
  connectorId?: string,
  selectedDocuments?: string[],
  dfTarget?: string,
  overrideCompanyId?: string,
): Promise<PythonPreviewResult> {
  try {
    // companyId MUST be concrete. If neither overrideCompanyId nor a valid
    // connectorId resolves to a tenant, refuse to run — chart theme and
    // SharePoint fallback lookups would otherwise leak across tenants.
    let companyId: string | null = overrideCompanyId ?? null;
    const envVars: Record<string, string> = {};

    // Resolve company and env vars from connector
    if (connectorId && connectorId !== 'none') {
      const connector = await db.connector.findUnique({ where: { id: connectorId } });
      if (connector) {
        companyId = connector.companyId;
        const resolvedCompanyId: string = connector.companyId;
        let config: any = connector.config;
        if (typeof config === 'string') { try { config = JSON.parse(config); } catch { config = {}; } }
        if (config.accessToken) envVars['HUBSPOT_TOKEN'] = config.accessToken;
        if (config.token) envVars['HUBSPOT_TOKEN'] = config.token;
        if (config.apiKey) envVars['HUBSPOT_API_KEY'] = config.apiKey;
        if (config.password) envVars['DB_PASSWORD'] = config.password;
        if (config.username) envVars['DB_USERNAME'] = config.username;
        if (connector.type === 'LEMLIST' && config.apiKey) {
          envVars['LEMLIST_API_KEY'] = config.apiKey;
          envVars['LEMLIST_BASE_URL'] = 'https://api.lemlist.com/api';
        }
        if (connector.type === 'SHAREPOINT') {
          try {
            const { getCachedSharePointTokenAction } = await import('@/app/actions/sharepoint');
            const tenantId = config.tenantId || '0089ad7d-e10f-49b4-bf68-60e706423382';
            const clientId = config.clientId || '7ff50e8a-eb8c-4bf8-9fa6-f4068c6fe82b';
            const authResult = await getCachedSharePointTokenAction(tenantId, clientId, config.clientSecret, resolvedCompanyId);
            if (authResult.accessToken) {
              envVars['SHAREPOINT_TOKEN'] = authResult.accessToken;
              if (config._siteId) envVars['SHAREPOINT_SITE_ID'] = config._siteId;
              if (config._driveId) envVars['SHAREPOINT_DRIVE_ID'] = config._driveId;
              if (config._fileId) envVars['SHAREPOINT_FILE_ID'] = config._fileId;
              if (config.siteUrl) envVars['SHAREPOINT_SITE_URL'] = config.siteUrl;
              if (config.filePath) envVars['SHAREPOINT_FILE_PATH'] = config.filePath;
              if (config.sheetName) envVars['SHAREPOINT_SHEET_NAME'] = config.sheetName;
            }
          } catch { /* skip SharePoint token on error */ }
        }
      }
    }

    // SharePoint company-wide fallback
    if (!envVars['SHAREPOINT_TOKEN'] && companyId) {
      try {
        const spConn = await db.connector.findFirst({ where: { companyId, type: 'SHAREPOINT' } });
        if (spConn?.config) {
          let spCfg: any = spConn.config;
          if (typeof spCfg === 'string') { try { spCfg = JSON.parse(spCfg); } catch { spCfg = {}; } }
          const { getCachedSharePointTokenAction } = await import('@/app/actions/sharepoint');
          const ar = await getCachedSharePointTokenAction(
            spCfg.tenantId || '0089ad7d-e10f-49b4-bf68-60e706423382',
            spCfg.clientId || '7ff50e8a-eb8c-4bf8-9fa6-f4068c6fe82b',
            spCfg.clientSecret,
            companyId,
          );
          if (ar.accessToken) {
            envVars['SHAREPOINT_TOKEN'] = ar.accessToken;
            if (spCfg._siteId) envVars['SHAREPOINT_SITE_ID'] = spCfg._siteId;
            if (spCfg._driveId) envVars['SHAREPOINT_DRIVE_ID'] = spCfg._driveId;
            if (spCfg._fileId) envVars['SHAREPOINT_FILE_ID'] = spCfg._fileId;
            if (spCfg.siteUrl) envVars['SHAREPOINT_SITE_URL'] = spCfg.siteUrl;
            if (spCfg.filePath) envVars['SHAREPOINT_FILE_PATH'] = spCfg.filePath;
            if (spCfg.sheetName) envVars['SHAREPOINT_SHEET_NAME'] = spCfg.sheetName;
          }
        }
      } catch { /* ignore */ }
    }

    // Documents dir
    if (selectedDocuments?.length) {
      try {
        const { getDataLakePath } = await import('@/lib/data-lake');
        envVars['DOCUMENTS_DIR'] = getDataLakePath();
        envVars['SELECTED_DOCUMENTS'] = selectedDocuments.join(',');
      } catch { /* ignore */ }
    }

    // query_db() support. We only enable it when we have a resolved companyId,
    // so the /api/internal/query-db endpoint can enforce tenant scoping on the
    // other side. Running Python with an empty QUERY_DB_COMPANY_ID would make
    // it depend on the endpoint's own defaults — safer to refuse here.
    if (connectorId && connectorId !== 'none') {
      if (!companyId) {
        return {
          success: false,
          error: '[Security] Connector supplied without a resolvable tenant — refusing to enable query_db() in Python.',
        };
      }
      const port = process.env.PORT || '9002';
      envVars['QUERY_DB_ENDPOINT'] = `http://localhost:${port}/api/internal/query-db`;
      envVars['QUERY_DB_CONNECTOR_ID'] = connectorId;
      if (!process.env.INTERNAL_QUERY_TOKEN) {
        throw new Error('Missing required env var: INTERNAL_QUERY_TOKEN');
      }
      envVars['QUERY_DB_TOKEN'] = process.env.INTERNAL_QUERY_TOKEN;
      envVars['QUERY_DB_COMPANY_ID'] = companyId;
    }

    // Resolve SQL dependencies not already in inputData
    if (dependencies?.length) {
      for (const dep of dependencies) {
        if (inputData[dep.tableName]) continue;
        if (dep.query) {
          const res = await executeSqlPreview(dep.query, dep.connectorId || '', dep.pipelineDependencies);
          if (res.data) inputData[dep.tableName] = res.data;
        } else if (dep.isPython && dep.pythonCode) {
          const pr = await executePythonPreview(dep.pythonCode, 'table', {}, dep.pipelineDependencies, dep.connectorId);
          if (pr.success && pr.data) inputData[dep.tableName] = pr.data;
        }
      }
    }

    // Load chart theme
    let chartThemeData: Record<string, any> | undefined;
    if (companyId) {
      try {
        const company = await db.company.findUnique({ where: { id: companyId }, select: { chartTheme: true } });
        if (company?.chartTheme) chartThemeData = resolveTheme(company.chartTheme as any);
      } catch { /* ignore */ }
    }

    // Call Python backend with retry
    const MAX_RETRIES = 3;
    const RETRY_DELAYS = [1000, 2000, 4000];

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000);
      try {
        const response = await pythonFetch('/execute', {
          method: 'POST',
          body: JSON.stringify({ code, outputType, inputData, env: envVars, chartTheme: chartThemeData, ...(dfTarget ? { dfTable: dfTarget } : {}) }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Python backend HTTP ${response.status}: ${errText}`);
        }
        const result = await response.json();
        if (!result.success) return { success: false, error: result.error || 'Unknown Python error', stdout: result.stdout };
        if (outputType === 'table') {
          if (result._autoSwitchedOutputType === 'html' && result.html) return { success: true, html: result.html, stdout: result.stdout };
          return { success: true, data: result.data, columns: result.columns, rowCount: result.rowCount, stdout: result.stdout };
        } else if (outputType === 'variable') {
          return { success: true, variables: result.variables, stdout: result.stdout };
        } else if (outputType === 'chart') {
          return { success: true, chartBase64: result.chartBase64, chartHtml: result.chartHtml, rechartsConfig: result.rechartsConfig, rechartsData: result.rechartsData, rechartsStyle: result.rechartsStyle, plotlyJson: result.plotlyJson, data: result.data, stdout: result.stdout };
        } else if (outputType === 'html') {
          return { success: true, html: result.html, stdout: result.stdout };
        }
        return { success: true, ...result };
      } catch (err: any) {
        clearTimeout(timeoutId);
        // Retry classification — see @/lib/scheduler/retry-policy (unit-tested).
        const { isRetriable } = await import('@/lib/scheduler/retry-policy');
        if (attempt < MAX_RETRIES && isRetriable(err)) {
          await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
          continue;
        }
        return { success: false, error: String(err?.message || '') };
      }
    }

    return { success: false, error: 'Max retries exceeded' };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// exportTableToSql
// Mirrors exportTableToSqlAction from actions.ts (isSystem=true path).
// ─────────────────────────────────────────────────────────────────────────────

export async function exportTableToSql(
  targetConnectorId: string,
  targetTableName: string,
  sourceData: any[],
  createTableIfNotExists = true,
  truncate = true,
): Promise<{ success: boolean; error?: string; rowsInserted?: number }> {
  if (!targetConnectorId || !targetTableName) return { success: false, error: 'Connettore e nome tabella obbligatori.' };
  if (!sourceData?.length) return { success: false, error: 'Nessun dato da esportare.' };

  let pool: sql.ConnectionPool | null = null;
  try {
    const connector = await db.connector.findFirst({ where: { id: targetConnectorId, type: 'SQL' } });
    if (!connector?.config) return { success: false, error: 'Connettore SQL non trovato.' };
    let conf: any = connector.config;
    if (typeof conf === 'string') { try { conf = JSON.parse(conf); } catch { return { success: false, error: 'Config connettore non valida.' }; } }

    pool = new sql.ConnectionPool(getMssqlConfig(conf));
    await pool.connect();

    const columns = Object.keys(sourceData[0]);
    const safeTable = targetTableName.replace(/[^a-zA-Z0-9_]/g, '_');

    if (createTableIfNotExists) {
      await pool.request().query(`IF OBJECT_ID('[${safeTable}]', 'U') IS NOT NULL DROP TABLE [${safeTable}]`);
      const colDefs = columns.map(c => `[${c.trim().replace(/[^a-zA-Z0-9_ ]+/g, '')}] NVARCHAR(MAX)`).join(', ');
      await pool.request().query(`CREATE TABLE [${safeTable}] (${colDefs})`);
    }

    const MAX_PARAMS = 2000;
    const batchSize = Math.max(1, Math.min(1000, Math.floor(MAX_PARAMS / (columns.length || 1))));
    let totalInserted = 0;

    for (let i = 0; i < sourceData.length; i += batchSize) {
      const batch = sourceData.slice(i, i + batchSize);
      const req = pool.request();
      const valueRows = batch.map((row, bi) => {
        const rowVals = columns.map((col, ci) => {
          const paramName = `p${bi}_${ci}`;
          const v = row[col];
          req.input(paramName, v === null || v === undefined ? null : String(v));
          return `@${paramName}`;
        });
        return `(${rowVals.join(', ')})`;
      });
      const safeCols = columns.map(c => `[${c.trim().replace(/[^a-zA-Z0-9_ ]+/g, '')}]`).join(', ');
      await req.query(`INSERT INTO [${safeTable}] (${safeCols}) VALUES ${valueRows.join(', ')}`);
      totalInserted += batch.length;
    }

    return { success: true, rowsInserted: totalInserted };
  } catch (e: any) {
    return { success: false, error: e.message };
  } finally {
    try { await pool?.close(); } catch {}
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// saveAncestorPreviews
// Mirrors saveAncestorPreviewsBatchAction from actions/scheduler.ts (no revalidatePath).
// ─────────────────────────────────────────────────────────────────────────────

export async function saveAncestorPreviews(
  treeId: string,
  ancestorPreviews: Array<{
    nodeId: string;
    isPython: boolean;
    pythonOutputType?: string;
    result: any;
  }>,
): Promise<{ success: boolean; savedCount: number }> {
  if (!treeId || !ancestorPreviews?.length) return { success: true, savedCount: 0 };

  const nowMs = Date.now();
  let savedCount = 0;

  for (const preview of ancestorPreviews) {
    if (!preview.nodeId || preview.result == null) continue;
    const res = preview.result;

    const existingCache = await db.nodePreviewCache.findUnique({
      where: { treeId_nodeId: { treeId, nodeId: preview.nodeId } },
    });
    const existing = (existingCache?.data as any) || {};
    const cacheData: any = { ...existing };

    const sqlData = Array.isArray(res)
      ? res
      : (res && typeof res === 'object' && 'data' in res && Array.isArray(res.data))
        ? res.data
        : (res && typeof res === 'object' && 'rechartsData' in res && Array.isArray(res.rechartsData))
          ? res.rechartsData
          : null;

    const existingHasSql = !!existing.sqlPreviewData;
    const shouldWriteSqlPreview = !preview.isPython || !existingHasSql;

    if (sqlData && shouldWriteSqlPreview) {
      cacheData.sqlPreviewData = sqlData;
      cacheData.sqlPreviewTimestamp = nowMs;
    }

    const hasPythonChart = res && typeof res === 'object' && (res.chartBase64 || res.chartHtml || res.rechartsConfig);
    const hasPythonVariables = res && typeof res === 'object' && res.variables;

    if (preview.isPython || hasPythonChart || hasPythonVariables) {
      const outputType = preview.pythonOutputType || 'table';
      const existingPython = existing.pythonPreviewResult;
      const preserved = {
        ...(existingPython?.plotlyStyleOverrides ? { plotlyStyleOverrides: existingPython.plotlyStyleOverrides } : {}),
        ...(existingPython?.plotlyJson && !res.plotlyJson ? { plotlyJson: existingPython.plotlyJson } : {}),
        ...(existingPython?.htmlStyleOverrides ? { htmlStyleOverrides: existingPython.htmlStyleOverrides } : {}),
      };

      if (hasPythonChart || outputType === 'chart') {
        cacheData.pythonPreviewResult = {
          type: 'chart', chartBase64: res.chartBase64, chartHtml: res.chartHtml,
          rechartsConfig: res.rechartsConfig, rechartsData: res.rechartsData,
          rechartsStyle: res.rechartsStyle, plotlyJson: res.plotlyJson,
          data: res.data, timestamp: nowMs, ...preserved,
        };
      } else if (outputType === 'variable') {
        cacheData.pythonPreviewResult = {
          type: 'variable', variables: res.variables || res, timestamp: nowMs, ...preserved,
        };
      } else if (outputType === 'html') {
        cacheData.pythonPreviewResult = {
          type: 'html', html: res.html, timestamp: nowMs, ...preserved,
        };
      } else {
        cacheData.pythonPreviewResult = {
          type: outputType, data: res.data || (Array.isArray(res) ? res : null),
          stdout: res.stdout, timestamp: nowMs, ...preserved,
        };
      }
    }

    try {
      // Route through the hybrid preview-cache layer: heavy fields (row
      // arrays, HTML, chart, base64, plotly JSON) are offloaded to DuckDB,
      // Postgres only stores lightweight metadata + pointer markers. This
      // prevents multi-MB UPDATEs from blocking the main DB during scheduler
      // runs.
      const { saveNodePreview } = await import('@/lib/preview-cache');
      await saveNodePreview(treeId, preview.nodeId, cacheData);
      savedCount++;
    } catch (e: any) {
      console.error(`[saveAncestorPreviews] Failed to save preview for nodeId=${preview.nodeId}:`, e.message);
    }
  }

  return { success: true, savedCount };
}
