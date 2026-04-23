/**
 * DuckDB-backed heavy blob store for preview cache.
 *
 * Stores bulky preview payloads (row arrays, HTML strings, chart data, base64
 * images, plotly JSON) in a local DuckDB file. PostgreSQL NodePreviewCache
 * only retains lightweight metadata + pointer markers, eliminating lock
 * contention on the main database during scheduler runs.
 *
 * Concurrency: in-process write queue serializes writes. DuckDB's own file
 * lock + WAL handle multi-process (scheduler-service + Next.js).
 */

import path from 'path';
import fs from 'fs/promises';
import { gzip as gzipCb, gunzip as gunzipCb } from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(gzipCb);
const gunzipAsync = promisify(gunzipCb);

const DB_DIR = path.join(process.cwd(), 'data', 'preview-cache');
const DB_PATH = path.join(DB_DIR, 'preview.duckdb');

export type PreviewField =
    | 'sql_data'
    | 'python_data'
    | 'python_html'
    | 'python_chart_html'
    | 'python_chart_base64'
    | 'python_plotly'
    | 'exec_data'
    | 'ai_result';

// HMR-safe singleton: Next.js dev Turbopack recompiles recreate module
// instances. Each instance opened its OWN DuckDB handle to the same file.
// Writes committed on handle A sat in WAL until checkpoint, so reads from
// handle B (other HMR instance) returned stale rows — root cause of the
// "save succeeds but UI shows previous value" bug. Pin the handle on
// globalThis so every HMR instance shares ONE DuckDB connection.
type DuckDbSingleton = { db: any | null; initPromise: Promise<any> | null };
const __duckG = globalThis as unknown as { __fridaiDuckDb?: DuckDbSingleton };
if (!__duckG.__fridaiDuckDb) {
    __duckG.__fridaiDuckDb = { db: null, initPromise: null };
}

async function openDb() {
    await fs.mkdir(DB_DIR, { recursive: true });
    const mod: any = await import('duckdb-async');
    const Database = mod.Database;
    const db = await Database.create(DB_PATH);
    await db.exec(`
        CREATE TABLE IF NOT EXISTS preview_blobs (
            tree_id VARCHAR NOT NULL,
            node_id VARCHAR NOT NULL,
            field VARCHAR NOT NULL,
            content BLOB NOT NULL,
            size_bytes INTEGER NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (tree_id, node_id, field)
        );
    `);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_blobs_tree ON preview_blobs(tree_id);`);
    return db;
}

async function initDb(): Promise<any> {
    const s = __duckG.__fridaiDuckDb!;
    if (s.db) return s.db;
    if (s.initPromise) return s.initPromise;
    s.initPromise = (async () => {
        try {
            s.db = await openDb();
            return s.db;
        } catch (err) {
            s.initPromise = null;
            throw err;
        }
    })();
    return s.initPromise;
}

// In-process write queue — serializes writes to avoid concurrent transaction
// conflicts within the same process. Promoted to globalThis for the same HMR
// reason as the DuckDB handle: otherwise each module instance would have its
// own queue and concurrent writes across instances could collide.
type WriteQueueSingleton = { queue: Promise<any> };
const __wqG = globalThis as unknown as { __fridaiWriteQueue?: WriteQueueSingleton };
if (!__wqG.__fridaiWriteQueue) {
    __wqG.__fridaiWriteQueue = { queue: Promise.resolve() };
}

function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
    const s = __wqG.__fridaiWriteQueue!;
    const next = s.queue.then(() => withRetry(fn), () => withRetry(fn));
    s.queue = next.catch(() => undefined);
    return next;
}

const MAX_WRITE_RETRIES = 5;
const BASE_BACKOFF_MS = 40;

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastErr: any;
    for (let attempt = 0; attempt < MAX_WRITE_RETRIES; attempt++) {
        try {
            return await fn();
        } catch (err: any) {
            lastErr = err;
            const msg = String(err?.message || err || '').toLowerCase();
            const retriable = msg.includes('lock') || msg.includes('conflict')
                || msg.includes('busy') || msg.includes('database is locked')
                || msg.includes('could not acquire');
            if (!retriable) throw err;
            const delay = BASE_BACKOFF_MS * (1 << attempt) + Math.floor(Math.random() * 30);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw lastErr;
}

async function encode(value: any): Promise<Buffer> {
    const json = JSON.stringify(value);
    return gzipAsync(Buffer.from(json, 'utf-8'));
}

async function decode(buf: Buffer): Promise<any> {
    const raw = await gunzipAsync(buf);
    return JSON.parse(raw.toString('utf-8'));
}

// ── Decoded-blob LRU ────────────────────────────────────────────────────────
// Dashboard loads on trees with large Plotly figures were triggering dozens of
// gunzip + JSON.parse per request (5-50 MB each). Under memory pressure Node's
// GC thrashed → event loop stalled → client fetch hit "Load failed". Cache the
// decoded value keyed by (tree:node:field) with a total-byte cap and short TTL.
// Writes on the same tree/node invalidate the cached decode.

interface BlobCacheEntry { value: any; bytes: number; ts: number; }
// HMR-safe singleton: in Next.js dev, Turbopack recompiles this module on edit,
// creating new instances. Each instance had its own blobCache Map → writes via
// instance A would invalidate cache A, but reads from instance B still hit
// a stale Map B. Root cause of "value saves but UI shows previous version".
// Pinning the Map + byte counter on globalThis keeps one instance across HMR.
type BlobCacheSingleton = { cache: Map<string, BlobCacheEntry>; bytes: number };
const __g = globalThis as unknown as { __fridaiBlobCache?: BlobCacheSingleton };
if (!__g.__fridaiBlobCache) {
    __g.__fridaiBlobCache = { cache: new Map<string, BlobCacheEntry>(), bytes: 0 };
}
const blobCache = __g.__fridaiBlobCache.cache;
// Default 32MB — the Next.js dev server auto-restarts at 80% heap usage,
// and this cache competes with Turbopack + widget-discovery + Plotly JSON
// for the same heap. 32MB halves the pressure vs the original 64MB while
// still serving repeat dashboard polls from cache. Tune via env.
const BLOB_CACHE_MAX_BYTES = Math.max(8, Number(process.env.PREVIEW_BLOB_CACHE_MB) || 32) * 1024 * 1024;
const BLOB_CACHE_TTL_MS = 2 * 60 * 1000;

function blobCacheKey(treeId: string, nodeId: string, field: string): string {
    return `${treeId}\x00${nodeId}\x00${field}`;
}

function cacheInsert(key: string, value: any, bytes: number, ts: number): void {
    const s = __g.__fridaiBlobCache!;
    const existing = blobCache.get(key);
    if (existing) {
        s.bytes -= existing.bytes;
        blobCache.delete(key);
    }
    blobCache.set(key, { value, bytes, ts });
    s.bytes += bytes;
    // Evict oldest (Map preserves insertion order) until under cap.
    while (s.bytes > BLOB_CACHE_MAX_BYTES) {
        const first = blobCache.keys().next();
        if (first.done) break;
        const evicted = blobCache.get(first.value);
        blobCache.delete(first.value);
        if (evicted) s.bytes -= evicted.bytes;
    }
}

function invalidateBlobCache(treeId: string, nodeId?: string, field?: string): void {
    const s = __g.__fridaiBlobCache!;
    const prefix = nodeId
        ? field
            ? blobCacheKey(treeId, nodeId, field)
            : `${treeId}\x00${nodeId}\x00`
        : `${treeId}\x00`;
    const keysToDelete: string[] = [];
    for (const [k, entry] of blobCache) {
        if (field ? k === prefix : k.startsWith(prefix)) {
            s.bytes -= entry.bytes;
            keysToDelete.push(k);
        }
    }
    for (const k of keysToDelete) blobCache.delete(k);
}

/**
 * Upsert one blob for a tree/node/field. Value is gzipped JSON.
 */
export async function putBlob(
    treeId: string,
    nodeId: string,
    field: PreviewField,
    value: any,
): Promise<void> {
    if (value === undefined || value === null) return;
    const encoded = await encode(value);
    const b64 = encoded.toString('base64');
    await enqueueWrite(async () => {
        const db = await initDb();
        await db.run(
            `INSERT OR REPLACE INTO preview_blobs(tree_id, node_id, field, content, size_bytes, updated_at)
             VALUES (?, ?, ?, from_base64(?), ?, CURRENT_TIMESTAMP)`,
            treeId, nodeId, field, b64, encoded.length,
        );
    });
    invalidateBlobCache(treeId, nodeId, field);
}

/**
 * Batch upsert multiple blobs for one node atomically.
 */
export async function putBlobs(
    treeId: string,
    nodeId: string,
    entries: Array<{ field: PreviewField; value: any }>,
): Promise<void> {
    const encoded = await Promise.all(
        entries
            .filter(e => e.value !== undefined && e.value !== null)
            .map(async e => {
                const buf = await encode(e.value);
                return { field: e.field, buf, b64: buf.toString('base64') };
            }),
    );
    if (encoded.length === 0) return;

    await enqueueWrite(async () => {
        const db = await initDb();
        await db.exec('BEGIN TRANSACTION');
        try {
            for (const { field, buf, b64 } of encoded) {
                await db.run(
                    `INSERT OR REPLACE INTO preview_blobs(tree_id, node_id, field, content, size_bytes, updated_at)
                     VALUES (?, ?, ?, from_base64(?), ?, CURRENT_TIMESTAMP)`,
                    treeId, nodeId, field, b64, buf.length,
                );
            }
            await db.exec('COMMIT');
        } catch (err) {
            await db.exec('ROLLBACK').catch(() => undefined);
            throw err;
        }
    });
    invalidateBlobCache(treeId, nodeId);
}

/**
 * Delete specific fields for a node. Used when scheduler overwrites preview
 * types (e.g. chart → table).
 */
export async function deleteFields(
    treeId: string,
    nodeId: string,
    fields: PreviewField[],
): Promise<void> {
    if (fields.length === 0) return;
    await enqueueWrite(async () => {
        const db = await initDb();
        const placeholders = fields.map(() => '?').join(',');
        await db.run(
            `DELETE FROM preview_blobs WHERE tree_id = ? AND node_id = ? AND field IN (${placeholders})`,
            treeId, nodeId, ...fields,
        );
    });
    for (const f of fields) invalidateBlobCache(treeId, nodeId, f);
}

/**
 * Fetch a single blob for a node/field.
 */
export async function getBlob(
    treeId: string,
    nodeId: string,
    field: PreviewField,
): Promise<any | null> {
    const db = await initDb();
    const rows = await db.all(
        `SELECT content FROM preview_blobs WHERE tree_id = ? AND node_id = ? AND field = ?`,
        treeId, nodeId, field,
    );
    if (!rows || rows.length === 0) return null;
    const content = rows[0].content;
    return decode(Buffer.isBuffer(content) ? content : Buffer.from(content));
}

/**
 * Batch fetch blobs for multiple nodes in a single tree.
 * Returns Map<nodeId, Map<field, decodedValue>>.
 */
export async function getBlobsForTree(
    treeId: string,
    nodeIds: string[],
    fields: PreviewField[],
): Promise<Map<string, Map<PreviewField, any>>> {
    const result = new Map<string, Map<PreviewField, any>>();
    if (nodeIds.length === 0 || fields.length === 0) return result;

    // Serve from decoded-blob LRU where possible; only miss to DuckDB.
    const now = Date.now();
    const missingByNode = new Map<string, PreviewField[]>();
    for (const nodeId of nodeIds) {
        const perNode = new Map<PreviewField, any>();
        const missingForThisNode: PreviewField[] = [];
        for (const field of fields) {
            const entry = blobCache.get(blobCacheKey(treeId, nodeId, field));
            if (entry && now - entry.ts < BLOB_CACHE_TTL_MS) {
                perNode.set(field, entry.value);
            } else {
                missingForThisNode.push(field);
            }
        }
        if (perNode.size > 0) result.set(nodeId, perNode);
        if (missingForThisNode.length > 0) missingByNode.set(nodeId, missingForThisNode);
    }

    if (missingByNode.size === 0) return result;

    const missingNodeIds = Array.from(missingByNode.keys());
    const distinctMissingFields = Array.from(
        new Set(Array.from(missingByNode.values()).flat()),
    );

    const db = await initDb();
    const nodePlaceholders = missingNodeIds.map(() => '?').join(',');
    const fieldPlaceholders = distinctMissingFields.map(() => '?').join(',');
    const rows = await db.all(
        `SELECT node_id, field, content FROM preview_blobs
         WHERE tree_id = ? AND node_id IN (${nodePlaceholders}) AND field IN (${fieldPlaceholders})`,
        treeId, ...missingNodeIds, ...distinctMissingFields,
    );

    for (const row of rows) {
        // Skip rows whose (node, field) combo wasn't actually requested
        // (DuckDB IN clauses cross product nodes × fields).
        const wanted = missingByNode.get(row.node_id);
        if (!wanted || !wanted.includes(row.field as PreviewField)) continue;

        const buf = Buffer.isBuffer(row.content) ? row.content : Buffer.from(row.content);
        const decoded = await decode(buf);
        cacheInsert(blobCacheKey(treeId, row.node_id, row.field), decoded, buf.length, now);

        if (!result.has(row.node_id)) result.set(row.node_id, new Map());
        result.get(row.node_id)!.set(row.field as PreviewField, decoded);
    }
    return result;
}

/**
 * Delete all blobs for a node.
 */
export async function deleteNode(treeId: string, nodeId: string): Promise<void> {
    await enqueueWrite(async () => {
        const db = await initDb();
        await db.run(`DELETE FROM preview_blobs WHERE tree_id = ? AND node_id = ?`, treeId, nodeId);
    });
    invalidateBlobCache(treeId, nodeId);
}

/**
 * Delete all blobs for a tree. Called when a tree is deleted.
 */
export async function deleteTree(treeId: string): Promise<void> {
    await enqueueWrite(async () => {
        const db = await initDb();
        await db.run(`DELETE FROM preview_blobs WHERE tree_id = ?`, treeId);
    });
    invalidateBlobCache(treeId);
}

/**
 * Inspection / diagnostics.
 */
export async function getStats(): Promise<{
    count: number;
    totalBytes: number;
    maxBytes: number;
    avgBytes: number;
}> {
    const db = await initDb();
    const rows = await db.all(
        `SELECT COUNT(*)::BIGINT AS cnt,
                COALESCE(SUM(size_bytes), 0)::BIGINT AS total,
                COALESCE(MAX(size_bytes), 0)::BIGINT AS max_size,
                COALESCE(AVG(size_bytes), 0)::BIGINT AS avg_size
         FROM preview_blobs`,
    );
    const r = rows[0];
    return {
        count: Number(r.cnt),
        totalBytes: Number(r.total),
        maxBytes: Number(r.max_size),
        avgBytes: Number(r.avg_size),
    };
}

/**
 * Close DB connection (for graceful shutdown / tests).
 */
export async function closeStore(): Promise<void> {
    const s = __duckG.__fridaiDuckDb;
    if (s?.db) {
        try { await s.db.close(); } catch { /* ignore */ }
        s.db = null;
        s.initPromise = null;
    }
}
