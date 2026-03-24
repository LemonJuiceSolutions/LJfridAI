/**
 * Hybrid preview cache: Parquet files for tabular data, DB for metadata.
 *
 * Architecture:
 * - LARGE tabular data (sqlPreviewData, pythonPreviewResult.data) → Parquet on disk
 * - SMALL metadata (timestamps, style overrides, chart configs, HTML) → NodePreviewCache DB table
 *
 * This avoids OOM crashes when serializing large datasets AND gives
 * 10-50x compression on tabular data via Parquet columnar storage.
 */

import { db } from '@/lib/db';

// parquet-cache uses Node.js 'fs' — only import dynamically on server side
// to avoid "Module not found: Can't resolve 'fs'" in Next.js client bundles
async function getParquetCache() {
    return await import('@/lib/parquet-cache');
}

/**
 * Recursively walk a tree and apply a callback to each node.
 */
function walkTree(node: any, callback: (node: any) => void) {
    if (!node || typeof node !== 'object') return;
    callback(node);
    if (node.options && typeof node.options === 'object') {
        for (const key in node.options) {
            const val = node.options[key];
            if (Array.isArray(val)) {
                for (const item of val) walkTree(item, callback);
            } else {
                walkTree(val, callback);
            }
        }
    }
    if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) walkTree(child, callback);
    }
}

// ─── SAVE HELPERS ────────────────────────────────────────────────────────────

/**
 * Save a node's preview data using the hybrid strategy:
 * - Tabular data → Parquet file
 * - Metadata/non-tabular → NodePreviewCache DB row
 *
 * @returns The metadata-only cache data (without bulky arrays) for the DB row
 */
export async function saveNodePreview(
    treeId: string,
    nodeId: string,
    cacheData: any,
): Promise<void> {
    // 1. Extract tabular data and save to Parquet (dynamic import to avoid 'fs' in client bundle)
    const { writeParquet } = await getParquetCache();

    const sqlRows = cacheData.sqlPreviewData;
    if (Array.isArray(sqlRows) && sqlRows.length > 0) {
        await writeParquet(treeId, `${nodeId}_sql`, sqlRows);
        // Replace rows with a marker in the DB entry
        cacheData.sqlPreviewData = `__parquet__`;
    }

    // Python table data
    const pythonResult = cacheData.pythonPreviewResult;
    if (pythonResult?.type === 'table' && Array.isArray(pythonResult.data) && pythonResult.data.length > 0) {
        await writeParquet(treeId, `${nodeId}_python`, pythonResult.data);
        cacheData.pythonPreviewResult = { ...pythonResult, data: '__parquet__' };
    }

    // Python chart with embedded data array
    if (pythonResult?.type === 'chart' && Array.isArray(pythonResult.data) && pythonResult.data.length > 0) {
        await writeParquet(treeId, `${nodeId}_python`, pythonResult.data);
        cacheData.pythonPreviewResult = { ...pythonResult, data: '__parquet__' };
    }

    // 2. Save metadata to DB
    await db.nodePreviewCache.upsert({
        where: { treeId_nodeId: { treeId, nodeId } },
        create: { treeId, nodeId, data: cacheData },
        update: { data: cacheData },
    });
}


// ─── HYDRATION ───────────────────────────────────────────────────────────────

/**
 * Load all NodePreviewCache entries + Parquet files for a tree and merge them
 * into the parsed tree JSON object.
 *
 * Components continue reading node.sqlPreviewData, node.pythonPreviewResult, etc.
 * as before — fully backward compatible.
 *
 * @param treeId - The tree ID
 * @param parsedTree - The already-parsed tree JSON object (mutated in place)
 * @returns The same tree object, hydrated with preview data
 */
export async function hydrateTreeWithPreviews(treeId: string, parsedTree: any): Promise<any> {
    if (!treeId || !parsedTree) return parsedTree;

    try {
        const cacheEntries = await db.nodePreviewCache.findMany({
            where: { treeId },
        });

        if (cacheEntries.length === 0) return parsedTree;

        // Build a lookup map: nodeId -> cached data
        const cacheMap = new Map<string, any>();
        for (const entry of cacheEntries) {
            cacheMap.set(entry.nodeId, entry.data);
        }

        // Collect nodeIds that need Parquet reads
        const parquetReads: Array<{ nodeId: string; field: 'sql' | 'python'; target: any; key: string }> = [];

        // Walk the tree and merge cache data into nodes
        walkTree(parsedTree, (node) => {
            if (!node.id) return;
            const cached = cacheMap.get(node.id);
            if (!cached) return;

            // SQL Preview Data
            if (cached.sqlPreviewData) {
                const cacheTs = cached.sqlPreviewTimestamp || 0;
                const nodeTs = node.sqlPreviewTimestamp || 0;
                if (!node.sqlPreviewData || cacheTs >= nodeTs) {
                    if (cached.sqlPreviewData === '__parquet__') {
                        // Will be loaded from Parquet file
                        parquetReads.push({ nodeId: node.id, field: 'sql', target: node, key: 'sqlPreviewData' });
                    } else {
                        node.sqlPreviewData = cached.sqlPreviewData;
                    }
                    node.sqlPreviewTimestamp = cached.sqlPreviewTimestamp;
                }
            }

            // Python Preview Result
            if (cached.pythonPreviewResult) {
                const cacheTs = cached.pythonPreviewResult.timestamp || 0;
                const nodeTs = node.pythonPreviewResult?.timestamp || 0;
                if (!node.pythonPreviewResult || cacheTs >= nodeTs) {
                    node.pythonPreviewResult = { ...cached.pythonPreviewResult };
                    if (cached.pythonPreviewResult.data === '__parquet__') {
                        parquetReads.push({ nodeId: node.id, field: 'python', target: node.pythonPreviewResult, key: 'data' });
                    }
                }
            }

            // AI Result
            if (cached.aiResult && node.aiConfig) {
                const cacheTs = cached.aiResultTimestamp || 0;
                const nodeTs = node.aiConfig?.lastRunAt || 0;
                if (cacheTs >= nodeTs) {
                    node.aiConfig.lastResult = cached.aiResult;
                    node.aiConfig.lastRunAt = cached.aiResultTimestamp;
                }
            }

            // Generic Execution Result
            if (cached.executionPreviewResult) {
                const cacheTs = cached.executionPreviewResult.timestamp || 0;
                const nodeTs = node.executionPreviewResult?.timestamp || 0;
                if (!node.executionPreviewResult || cacheTs >= nodeTs) {
                    node.executionPreviewResult = cached.executionPreviewResult;
                }
            }
        });

        // Load Parquet files in parallel (dynamic import to avoid 'fs' in client bundle)
        if (parquetReads.length > 0) {
            const { readParquet } = await getParquetCache();
            await Promise.all(
                parquetReads.map(async ({ nodeId, field, target, key }) => {
                    try {
                        const rows = await readParquet(treeId, `${nodeId}_${field}`);
                        if (rows) {
                            target[key] = rows;
                        }
                    } catch (err: any) {
                        console.warn(`[hydrateTree] Parquet read failed for ${nodeId}_${field}:`, err.message);
                    }
                })
            );
        }
    } catch (err: any) {
        console.warn('[hydrateTreeWithPreviews] Failed to load cache, falling back to inline data:', err.message);
    }

    return parsedTree;
}

// ─── STRIP (for tree JSON saves) ─────────────────────────────────────────────

/**
 * Strip heavy preview data from a parsed tree JSON object.
 * Call this before saving the tree JSON to keep it lightweight.
 * Only removes the bulky data arrays, keeps timestamps and metadata.
 */
export function stripPreviewDataFromTree(parsedTree: any): any {
    walkTree(parsedTree, (node) => {
        // Remove ONLY large tabular SQL data (the 18k+ row arrays that cause OOM)
        if (Array.isArray(node.sqlPreviewData) && node.sqlPreviewData.length > 100) {
            delete node.sqlPreviewData;
            // Keep sqlPreviewTimestamp so UI knows data exists (loaded from cache)
        }

        // For Python preview: only strip the large .data array if it's tabular (table type).
        // Keep everything else: html, chartBase64, chartHtml, rechartsConfig, variables, etc.
        if (node.pythonPreviewResult) {
            const pr = node.pythonPreviewResult;
            if (pr.type === 'table' && Array.isArray(pr.data) && pr.data.length > 100) {
                // Only strip the large data array, keep everything else
                const { data, ...rest } = pr;
                node.pythonPreviewResult = rest;
            }
            // For chart type: strip .data if it's a large backing array
            if (pr.type === 'chart' && Array.isArray(pr.data) && pr.data.length > 100) {
                const { data, ...rest } = pr;
                node.pythonPreviewResult = rest;
            }
            // html, variable, small chart data — keep as-is (not large)
        }
    });
    return parsedTree;
}

// ─── CLEANUP ─────────────────────────────────────────────────────────────────

/**
 * Delete all cached preview data for a tree (DB + Parquet files).
 * Call this when a tree is deleted.
 */
export async function deleteTreePreviewCache(treeId: string): Promise<void> {
    const { deleteTreeParquetCache } = await getParquetCache();
    await Promise.all([
        db.nodePreviewCache.deleteMany({ where: { treeId } }),
        deleteTreeParquetCache(treeId),
    ]);
}
