/**
 * Pipeline SQL Executor
 *
 * Executes SQL queries directly without going through Server Actions,
 * bypassing RSC serialization that truncates results >10MB.
 * Large results are saved to disk and a reference object is returned
 * so downstream pipeline nodes can read them back.
 */

import sql from 'mssql';
import { db } from '@/lib/db';
import fs from 'fs';
import path from 'path';

const DATA_LAKE_PATH = process.env.DATA_LAKE_PATH || 'data_lake';
const LARGE_RESULT_THRESHOLD = 5 * 1024 * 1024; // 5MB — save to file if larger

// Pool cache (reuse connections across pipeline nodes)
const poolCache = new Map<string, sql.ConnectionPool>();

async function getPool(connectorId: string): Promise<sql.ConnectionPool> {
  if (poolCache.has(connectorId)) {
    const cached = poolCache.get(connectorId)!;
    if (cached.connected) return cached;
    poolCache.delete(connectorId);
  }

  const connector = await db.connector.findUnique({
    where: { id: connectorId },
    select: { config: true },
  });
  if (!connector) throw new Error(`Connector ${connectorId} not found`);

  const config =
    typeof connector.config === 'string'
      ? JSON.parse(connector.config)
      : connector.config;

  const pool = await new sql.ConnectionPool({
    server: config.server || config.host,
    database: config.database,
    user: config.user || config.username,
    password: config.password,
    port: config.port ? parseInt(String(config.port), 10) || 1433 : 1433,
    options: {
      encrypt:
        config.encrypt ??
        !!(config.server || config.host || '').includes('database.windows.net'),
      trustServerCertificate: config.trustServerCertificate ?? (process.env.NODE_ENV !== 'production'),
      enableArithAbort: true,
    },
    requestTimeout: 300000, // 5 minutes
    connectionTimeout: 30000,
  }).connect();

  poolCache.set(connectorId, pool);
  return pool;
}

// ---------------------------------------------------------------------------
// Large-result reference type
// ---------------------------------------------------------------------------

/** Pointer to a large result set stored on disk. */
export interface LargeResultRef {
  __pipelineResultRef: true;
  filePath: string;
  rowCount: number;
  sizeBytes: number;
}

export function isLargeResultRef(val: unknown): val is LargeResultRef {
  return (
    val !== null &&
    typeof val === 'object' &&
    (val as any).__pipelineResultRef === true
  );
}

/**
 * Resolve a result — if it is a file reference, read from disk;
 * otherwise return the data array as-is.
 */
export function resolveResult(result: unknown): any[] {
  if (isLargeResultRef(result)) {
    const raw = fs.readFileSync(result.filePath, 'utf-8');
    return JSON.parse(raw);
  }
  if (Array.isArray(result)) return result;
  if (result && typeof result === 'object' && 'data' in result) {
    return (result as any).data || [];
  }
  return result as any;
}

// ---------------------------------------------------------------------------
// Core executor
// ---------------------------------------------------------------------------

/**
 * Persist data to disk if it exceeds the threshold; otherwise return as-is.
 */
function maybeSaveToDisk(
  data: any[],
  executionId: string,
  nodeName: string,
): any[] | LargeResultRef {
  const json = JSON.stringify(data);
  const sizeBytes = Buffer.byteLength(json, 'utf-8');

  if (sizeBytes > LARGE_RESULT_THRESHOLD) {
    const dir = path.join(process.cwd(), DATA_LAKE_PATH, 'pipeline-cache', executionId);
    fs.mkdirSync(dir, { recursive: true });

    const safeName = nodeName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(dir, `${safeName}.json`);
    fs.writeFileSync(filePath, json, 'utf-8');

    console.log(
      `[PipelineSQL] Large result "${nodeName}": ${data.length} rows, ` +
        `${(sizeBytes / 1024 / 1024).toFixed(1)}MB -> ${filePath}`,
    );

    return {
      __pipelineResultRef: true,
      filePath,
      rowCount: data.length,
      sizeBytes,
    } as LargeResultRef;
  }

  return data;
}

/**
 * Execute SQL directly for pipeline nodes — NO Server Action, NO RSC
 * serialization.  Large results (>5 MB) are saved to `data_lake/` and a
 * {@link LargeResultRef} is returned instead of the raw rows.
 */
export async function executePipelineSql(
  query: string,
  connectorId: string,
  executionId: string,
  nodeName: string,
  dependencies?: { tableName: string; data?: any }[],
): Promise<{ data: any[] | LargeResultRef; error: string | null }> {
  let pool: sql.ConnectionPool;
  const createdTempTables: string[] = [];

  try {
    pool = await getPool(connectorId);

    let finalQuery = query;

    // --- Materialise dependency data as global temp tables ---
    if (dependencies && dependencies.length > 0) {
      const nameMap = new Map<string, string>();

      for (const dep of dependencies) {
        // Resolve file-backed refs to arrays
        const rows: any[] = resolveResult(dep.data);
        if (!rows || rows.length === 0) continue;

        const uid = Date.now().toString().slice(-6) + Math.floor(Math.random() * 1000);
        const safe = dep.tableName.replace(/[^a-zA-Z0-9_]/g, '_');
        const tempName = `##${safe}_${uid}`;
        nameMap.set(dep.tableName, tempName);

        const columns = Object.keys(rows[0]);
        const colDefs = columns.map(c => `[${c}] NVARCHAR(MAX)`).join(', ');

        const req = pool.request();
        await req.query(`IF OBJECT_ID('tempdb..${tempName}') IS NOT NULL DROP TABLE ${tempName};`);
        await req.query(`CREATE TABLE ${tempName} (${colDefs});`);
        createdTempTables.push(tempName);

        // Batch insert (100 rows at a time)
        const batchSize = 100;
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          const values = batch.map(row => {
            const vals = columns.map(col => {
              const v = row[col];
              if (v === null || v === undefined) return 'NULL';
              if (typeof v === 'number') return v.toString();
              if (typeof v === 'boolean') return v ? '1' : '0';
              if (v instanceof Date) return `'${v.toISOString()}'`;
              return `N'${String(v).replace(/'/g, "''")}'`;
            }).join(', ');
            return `(${vals})`;
          }).join(', ');

          if (values.length > 0) {
            await req.query(`INSERT INTO ${tempName} VALUES ${values};`);
          }
        }

        console.log(`[PipelineSQL] Temp table ${tempName}: ${rows.length} rows, ${columns.length} cols`);
      }

      // Replace table references in the query
      for (const [original, temp] of nameMap.entries()) {
        const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Replace [TableName] and bare TableName references
        finalQuery = finalQuery.replace(new RegExp(`\\[${escaped}\\]`, 'gi'), temp);
        finalQuery = finalQuery.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), temp);
      }
    }

    // --- Execute the main query ---
    const result = await pool.request().query(finalQuery);
    const data = result.recordset || [];

    return { data: maybeSaveToDisk(data, executionId, nodeName), error: null };
  } catch (e: any) {
    return { data: [], error: e.message || String(e) };
  } finally {
    // Clean up temp tables
    if (createdTempTables.length > 0) {
      try {
        const req = pool!.request();
        for (const t of createdTempTables) {
          await req.query(`IF OBJECT_ID('tempdb..${t}') IS NOT NULL DROP TABLE ${t};`).catch(() => {});
        }
      } catch { /* best effort */ }
    }
  }
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/**
 * Remove cached pipeline result files for a given execution.
 */
export function cleanupPipelineCache(executionId: string) {
  try {
    const dir = path.join(
      process.cwd(),
      DATA_LAKE_PATH,
      'pipeline-cache',
      executionId,
    );
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(
        `[PipelineSQL] Cleaned up cache for execution ${executionId}`,
      );
    }
  } catch (e) {
    console.warn(`[PipelineSQL] Failed to cleanup cache:`, e);
  }
}
