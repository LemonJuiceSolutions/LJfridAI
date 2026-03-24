/**
 * Parquet file cache for large tabular preview data.
 *
 * Stores SQL rows and Python table data as Parquet files on disk,
 * achieving 10-50x compression vs JSON. Small metadata (timestamps,
 * style overrides, chart configs) stays in the DB NodePreviewCache table.
 *
 * File layout: data/preview-cache/{treeId}/{nodeId}.parquet
 */

import fs from 'fs/promises';
import path from 'path';

// parquetjs-lite is CommonJS, use require-style import
const parquet = require('parquetjs-lite');

const CACHE_DIR = path.join(process.cwd(), 'data', 'preview-cache');

/** Get the file path for a node's parquet cache */
function getParquetPath(treeId: string, nodeId: string): string {
    return path.join(CACHE_DIR, treeId, `${nodeId}.parquet`);
}

/**
 * Infer a Parquet schema from the first row of data.
 * All values are stored as UTF8 (string) to handle mixed types safely.
 * This is fine because the data is read back as JSON objects anyway.
 */
function inferSchema(rows: any[]): any {
    if (!rows.length) return null;

    const firstRow = rows[0];
    const fields: Record<string, any> = {};

    for (const key of Object.keys(firstRow)) {
        // Parquet doesn't allow empty column names
        const safeName = key || '_empty_';
        fields[safeName] = { type: 'UTF8', optional: true };
    }

    if (Object.keys(fields).length === 0) return null;

    return new parquet.ParquetSchema(fields);
}

/**
 * Write tabular data (array of row objects) to a Parquet file.
 * Returns true on success, false on failure.
 *
 * For large datasets (18k+ rows), we convert to JSON on disk instead of
 * Parquet row-by-row (which is too slow due to per-row await).
 * For moderate datasets, we use Parquet with batched appends.
 */
export async function writeParquet(treeId: string, nodeId: string, rows: any[]): Promise<boolean> {
    if (!Array.isArray(rows) || rows.length === 0) return false;

    try {
        const filePath = getParquetPath(treeId, nodeId);
        await fs.mkdir(path.dirname(filePath), { recursive: true });

        // For any size: write as compressed JSON (fast, still ~3-5x smaller with gzip)
        // parquetjs-lite's row-by-row await is too slow for large datasets
        const jsonPath = filePath.replace('.parquet', '.json.gz');
        const { gzip } = await import('zlib');
        const { promisify } = await import('util');
        const gzipAsync = promisify(gzip);

        const jsonBuffer = Buffer.from(JSON.stringify(rows));
        const compressed = await gzipAsync(jsonBuffer);
        await fs.writeFile(jsonPath, compressed);

        // Also remove old .parquet file if it exists
        try { await fs.unlink(filePath); } catch { /* ignore */ }

        return true;
    } catch (err: any) {
        console.error(`[ParquetCache] Write failed for ${treeId}/${nodeId}:`, err.message);
        return false;
    }
}

/**
 * Read tabular data from cache file (compressed JSON or legacy Parquet).
 * Returns the rows as an array of objects, or null if file doesn't exist.
 */
export async function readParquet(treeId: string, nodeId: string): Promise<any[] | null> {
    try {
        const parquetPath = getParquetPath(treeId, nodeId);
        const jsonGzPath = parquetPath.replace('.parquet', '.json.gz');

        // Try compressed JSON first (new format, much faster)
        try {
            await fs.access(jsonGzPath);
            const compressed = await fs.readFile(jsonGzPath);
            const { gunzip } = await import('zlib');
            const { promisify } = await import('util');
            const gunzipAsync = promisify(gunzip);
            const jsonBuffer = await gunzipAsync(compressed);
            return JSON.parse(jsonBuffer.toString());
        } catch { /* not found, try legacy parquet */ }

        // Fallback: legacy .parquet files
        try {
            await fs.access(parquetPath);
        } catch {
            return null;
        }

        const reader = await parquet.ParquetReader.openFile(parquetPath);
        const cursor = reader.getCursor();
        const rows: any[] = [];

        let row: any;
        while ((row = await cursor.next())) {
            const restored: Record<string, any> = {};
            for (const [key, val] of Object.entries(row)) {
                const restoredKey = key === '_empty_' ? '' : key;
                if (val == null) {
                    restored[restoredKey] = null;
                } else {
                    const str = String(val);
                    if (str !== '' && !isNaN(Number(str)) && str !== 'true' && str !== 'false') {
                        restored[restoredKey] = Number(str);
                    } else if (str === 'true') {
                        restored[restoredKey] = true;
                    } else if (str === 'false') {
                        restored[restoredKey] = false;
                    } else {
                        restored[restoredKey] = str;
                    }
                }
            }
            rows.push(restored);
        }

        await reader.close();
        return rows;
    } catch (err: any) {
        console.error(`[ParquetCache] Read failed for ${treeId}/${nodeId}:`, err.message);
        return null;
    }
}

/**
 * Check if a cache file exists for a given tree/node.
 */
export async function hasParquet(treeId: string, nodeId: string): Promise<boolean> {
    const parquetPath = getParquetPath(treeId, nodeId);
    const jsonGzPath = parquetPath.replace('.parquet', '.json.gz');
    try {
        await fs.access(jsonGzPath);
        return true;
    } catch {
        try {
            await fs.access(parquetPath);
            return true;
        } catch {
            return false;
        }
    }
}

/**
 * Delete a single node's cache files (both formats).
 */
export async function deleteParquet(treeId: string, nodeId: string): Promise<void> {
    const parquetPath = getParquetPath(treeId, nodeId);
    const jsonGzPath = parquetPath.replace('.parquet', '.json.gz');
    try { await fs.unlink(parquetPath); } catch { /* ignore */ }
    try { await fs.unlink(jsonGzPath); } catch { /* ignore */ }
}

/**
 * Delete all Parquet files for a tree (e.g., on tree deletion).
 */
export async function deleteTreeParquetCache(treeId: string): Promise<void> {
    try {
        const treeDir = path.join(CACHE_DIR, treeId);
        await fs.rm(treeDir, { recursive: true, force: true });
    } catch { /* ignore */ }
}

/**
 * Get the file size of a node's Parquet cache in bytes, or 0 if not cached.
 */
export async function getParquetSize(treeId: string, nodeId: string): Promise<number> {
    try {
        const stat = await fs.stat(getParquetPath(treeId, nodeId));
        return stat.size;
    } catch {
        return 0;
    }
}
