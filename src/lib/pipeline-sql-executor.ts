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

// Pool cache (reuse connections across pipeline nodes).
const poolCache = new Map<string, sql.ConnectionPool>();
// Track when each pool was last borrowed — periodic eviction drops idle ones
// to bound cache growth and reclaim sockets (Azure/AWS close idle TCP).
const poolLastUsedAt = new Map<string, number>();

/**
 * Close and evict a cached pool. Silent on error — caller has already decided
 * the pool is bad (connection test failed, connector config changed, etc.).
 */
async function evictPool(connectorId: string): Promise<void> {
  const pool = poolCache.get(connectorId);
  poolCache.delete(connectorId);
  poolLastUsedAt.delete(connectorId);
  if (pool) {
    try { await pool.close(); } catch { /* ignore */ }
  }
}

async function getPool(connectorId: string, companyId?: string): Promise<sql.ConnectionPool> {
  if (poolCache.has(connectorId)) {
    const cached = poolCache.get(connectorId)!;
    // Validate on borrow — a disconnected or poisoned pool (e.g. connector
    // password rotated) would otherwise silently return errors for the
    // process lifetime. A 1s SELECT 1 is cheap.
    if (cached.connected) {
      try {
        await cached.request().query('SELECT 1 AS ok');
        poolLastUsedAt.set(connectorId, Date.now());
        return cached;
      } catch {
        await evictPool(connectorId);
      }
    } else {
      await evictPool(connectorId);
    }
  }

  // SECURITY: scope connector lookup by companyId when available to prevent cross-tenant access (C-02)
  const connector = companyId
    ? await db.connector.findFirst({
        where: { id: connectorId, companyId },
        select: { config: true },
      })
    : await db.connector.findUnique({
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
  poolLastUsedAt.set(connectorId, Date.now());
  return pool;
}

/**
 * Startup sweep: delete pipeline-cache directories older than MAX_AGE_HOURS.
 * If the process crashed mid-execution, the `cleanupPipelineCache` call in
 * the finally block never ran — files would linger forever.
 */
const CACHE_MAX_AGE_HOURS = 24;
let cacheSweepScheduled = false;
export function startPipelineCacheSweep(): void {
  if (cacheSweepScheduled) return;
  cacheSweepScheduled = true;

  const sweep = () => {
    const cacheRoot = path.join(process.cwd(), DATA_LAKE_PATH, 'pipeline-cache');
    fs.promises.readdir(cacheRoot).then(async (entries) => {
      const cutoff = Date.now() - CACHE_MAX_AGE_HOURS * 60 * 60 * 1000;
      for (const entry of entries) {
        const full = path.join(cacheRoot, entry);
        try {
          const s = await fs.promises.stat(full);
          if (s.mtimeMs < cutoff) {
            await fs.promises.rm(full, { recursive: true, force: true });
            console.log(`[PipelineSQL] swept stale cache dir: ${entry}`);
          }
        } catch { /* ignore per-entry errors */ }
      }
    }).catch(() => { /* cache root may not exist yet */ });
  };

  // Run once at startup, then every hour.
  sweep();
  setInterval(sweep, 60 * 60 * 1000).unref();
}

// Auto-start the sweep on module import. Safe: .unref() lets the process exit,
// and the globalThis guard prevents HMR from stacking intervals.
declare global {
  // eslint-disable-next-line no-var
  var _pipelineCacheSweepStarted: boolean | undefined;
}
if (!globalThis._pipelineCacheSweepStarted) {
  globalThis._pipelineCacheSweepStarted = true;
  startPipelineCacheSweep();
}

/**
 * Periodic pool eviction: close and forget pools that haven't been used
 * in a while. Bounds the cache and reclaims sockets held against remote
 * MSSQL servers (Azure rotates connections; idle pools get killed
 * server-side and reappear as "connection closed" noise).
 */
const POOL_IDLE_MAX_MS = 30 * 60_000;

declare global {
  // eslint-disable-next-line no-var
  var _poolEvictionStarted: boolean | undefined;
}
if (!globalThis._poolEvictionStarted) {
  globalThis._poolEvictionStarted = true;
  setInterval(() => {
    const cutoff = Date.now() - POOL_IDLE_MAX_MS;
    for (const [id, ts] of poolLastUsedAt) {
      if (ts < cutoff) {
        void evictPool(id);
      }
    }
  }, 10 * 60_000).unref();
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
  companyId?: string,
): Promise<{ data: any[] | LargeResultRef; error: string | null }> {
  let pool: sql.ConnectionPool;
  const createdTempTables: string[] = [];

  try {
    pool = await getPool(connectorId, companyId);

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

        // SECURITY CRITICAL: whitelist column names — they were interpolated raw
        // into CREATE TABLE / INSERT, allowing SQL injection from malicious
        // upstream Python nodes that produce rows with crafted column names.
        const COLUMN_RE = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
        const columns = Object.keys(rows[0]).filter(c => {
          if (!COLUMN_RE.test(c)) {
            console.warn(`[PipelineSQL] Dropping unsafe column name: ${c}`);
            return false;
          }
          return true;
        });
        if (columns.length === 0) {
          console.warn(`[PipelineSQL] All columns rejected for ${dep.tableName} — skipping`);
          continue;
        }
        const colDefs = columns.map(c => `[${c}] NVARCHAR(MAX)`).join(', ');

        const setupReq = pool.request();
        await setupReq.query(`IF OBJECT_ID('tempdb..${tempName}') IS NOT NULL DROP TABLE ${tempName};`);
        await setupReq.query(`CREATE TABLE ${tempName} (${colDefs});`);
        createdTempTables.push(tempName);

        // SECURITY CRITICAL: parameterized inserts (was: string-concat with manual
        // single-quote escape — vulnerable to NUL bytes and crafted column names).
        const batchSize = 100;
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          const insertReq = pool.request();
          const placeholders = batch.map((row, rowIdx) => {
            const cellPlaceholders = columns.map((col, colIdx) => {
              const param = `p_${i + rowIdx}_${colIdx}`;
              const v = row[col];
              // Bind via mssql .input() — driver handles escaping/typing
              if (v === null || v === undefined) {
                insertReq.input(param, null);
              } else if (typeof v === 'number') {
                insertReq.input(param, v);
              } else if (typeof v === 'boolean') {
                insertReq.input(param, v ? 1 : 0);
              } else if (v instanceof Date) {
                insertReq.input(param, v.toISOString());
              } else {
                insertReq.input(param, String(v));
              }
              return `@${param}`;
            }).join(', ');
            return `(${cellPlaceholders})`;
          }).join(', ');

          if (placeholders.length > 0) {
            await insertReq.query(`INSERT INTO ${tempName} VALUES ${placeholders};`);
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
