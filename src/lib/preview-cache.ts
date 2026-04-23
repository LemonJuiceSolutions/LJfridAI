/**
 * Hybrid preview cache with DuckDB-backed blob storage.
 *
 * Architecture:
 * - HEAVY payloads (row arrays, HTML, chart HTML, base64 images, large plotly
 *   JSON) → DuckDB file at `data/preview-cache/preview.duckdb`
 * - LIGHT metadata (timestamps, type flags, style overrides, small chart
 *   configs) → PostgreSQL NodePreviewCache table (via Prisma)
 *
 * Why:
 * - Postgres writes for the NodePreviewCache table are tiny → no lock
 *   contention during scheduler runs (root cause of the dashboard freeze).
 * - DuckDB native columnar compression + gzip → 145 MB JSON blobs become
 *   ~5–15 MB on disk, with partial reads available.
 */

import { db } from '@/lib/db';
import type { PreviewField } from '@/lib/preview-cache/duckdb-store';

const DUCKDB_MARKER = '__duckdb__';

// Offload thresholds (bytes, serialized). Only values above these go to DuckDB.
// Small values stay inline in Postgres for fastest reads.
const PLOTLY_OFFLOAD_BYTES = 50_000;
const EXEC_DATA_OFFLOAD_BYTES = 10_000;
const AI_RESULT_OFFLOAD_BYTES = 20_000;
const HTML_OFFLOAD_BYTES = 5_000;

// Dynamic import — DuckDB uses a native binding and must stay out of the
// client bundle.
async function getDuckDbStore() {
    return await import('@/lib/preview-cache/duckdb-store');
}

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

function jsonSize(value: any): number {
    try { return JSON.stringify(value).length; } catch { return 0; }
}

// ─── SAVE ────────────────────────────────────────────────────────────────────

/**
 * Save a node's preview data.
 * Heavy fields are offloaded to DuckDB; lightweight metadata is upserted
 * to the Postgres NodePreviewCache row.
 */
export async function saveNodePreview(
    treeId: string,
    nodeId: string,
    cacheData: any,
): Promise<void> {
    const offloads: Array<{ field: PreviewField; value: any }> = [];

    // Shallow clone so we don't mutate the caller's object with markers.
    const stripped: any = { ...cacheData };
    if (stripped.pythonPreviewResult) {
        stripped.pythonPreviewResult = { ...stripped.pythonPreviewResult };
    }
    if (stripped.executionPreviewResult) {
        stripped.executionPreviewResult = { ...stripped.executionPreviewResult };
    }

    // 1. SQL Preview Data (rows)
    if (Array.isArray(stripped.sqlPreviewData) && stripped.sqlPreviewData.length > 0) {
        offloads.push({ field: 'sql_data', value: stripped.sqlPreviewData });
        stripped._sqlRowCount = stripped.sqlPreviewData.length;
        stripped.sqlPreviewData = DUCKDB_MARKER;
    }

    // 2. Python Preview Result — offload each heavy sub-field independently.
    const py = stripped.pythonPreviewResult;
    if (py && typeof py === 'object') {
        // 2a. Tabular / chart backing rows
        if (Array.isArray(py.data) && py.data.length > 0) {
            offloads.push({ field: 'python_data', value: py.data });
            py._dataRowCount = py.data.length;
            py.data = DUCKDB_MARKER;
        }
        // 2b. Raw HTML (can be MBs for rich reports)
        if (typeof py.html === 'string' && py.html.length > HTML_OFFLOAD_BYTES) {
            offloads.push({ field: 'python_html', value: py.html });
            py._htmlSize = py.html.length;
            py.html = DUCKDB_MARKER;
        }
        // 2c. Chart HTML (plotly/matplotlib embedded)
        if (typeof py.chartHtml === 'string' && py.chartHtml.length > HTML_OFFLOAD_BYTES) {
            offloads.push({ field: 'python_chart_html', value: py.chartHtml });
            py._chartHtmlSize = py.chartHtml.length;
            py.chartHtml = DUCKDB_MARKER;
        }
        // 2d. Chart base64 image
        if (typeof py.chartBase64 === 'string' && py.chartBase64.length > HTML_OFFLOAD_BYTES) {
            offloads.push({ field: 'python_chart_base64', value: py.chartBase64 });
            py._chartBase64Size = py.chartBase64.length;
            py.chartBase64 = DUCKDB_MARKER;
        }
        // 2e. Plotly JSON (can also be large)
        if (py.plotlyJson && typeof py.plotlyJson === 'object'
            && jsonSize(py.plotlyJson) > PLOTLY_OFFLOAD_BYTES) {
            offloads.push({ field: 'python_plotly', value: py.plotlyJson });
            py.plotlyJson = DUCKDB_MARKER;
        }
    }

    // 3. Execution Preview Result (generic ancestor results)
    const exec = stripped.executionPreviewResult;
    if (exec && exec.data !== undefined && exec.data !== null) {
        if (jsonSize(exec.data) > EXEC_DATA_OFFLOAD_BYTES) {
            offloads.push({ field: 'exec_data', value: exec.data });
            exec.data = DUCKDB_MARKER;
        }
    }

    // 4. AI result (only when heavy)
    if (stripped.aiResult && jsonSize(stripped.aiResult) > AI_RESULT_OFFLOAD_BYTES) {
        offloads.push({ field: 'ai_result', value: stripped.aiResult });
        stripped.aiResult = DUCKDB_MARKER;
    }

    // Write heavy blobs to DuckDB first. If this fails we still try to save
    // metadata (but without markers) to keep Postgres consistent.
    if (offloads.length > 0) {
        try {
            const { putBlobs } = await getDuckDbStore();
            await putBlobs(treeId, nodeId, offloads);
        } catch (err: any) {
            console.error(`[saveNodePreview] DuckDB write failed for ${treeId}/${nodeId}: ${err.message}`);
            // Undo markers so data lands inline in Postgres as a fallback.
            if (stripped.sqlPreviewData === DUCKDB_MARKER && cacheData.sqlPreviewData) {
                stripped.sqlPreviewData = cacheData.sqlPreviewData;
            }
            if (stripped.pythonPreviewResult && cacheData.pythonPreviewResult) {
                stripped.pythonPreviewResult = cacheData.pythonPreviewResult;
            }
            if (stripped.executionPreviewResult && cacheData.executionPreviewResult) {
                stripped.executionPreviewResult = cacheData.executionPreviewResult;
            }
            if (stripped.aiResult === DUCKDB_MARKER) {
                stripped.aiResult = cacheData.aiResult;
            }
        }
    }

    await db.nodePreviewCache.upsert({
        where: { treeId_nodeId: { treeId, nodeId } },
        create: { treeId, nodeId, data: stripped },
        update: { data: stripped },
    });
}

// ─── HYDRATION ───────────────────────────────────────────────────────────────

/**
 * Load all NodePreviewCache entries + DuckDB blobs for a tree and merge them
 * into the parsed tree JSON.
 *
 * Components continue reading node.sqlPreviewData, node.pythonPreviewResult,
 * etc. as before — fully backward compatible.
 */
export async function hydrateTreeWithPreviews(treeId: string, parsedTree: any): Promise<any> {
    if (!treeId || !parsedTree) return parsedTree;

    try {
        const cacheEntries = await db.nodePreviewCache.findMany({ where: { treeId } });
        if (cacheEntries.length === 0) return parsedTree;

        const cacheMap = new Map<string, any>();
        for (const entry of cacheEntries) cacheMap.set(entry.nodeId, entry.data);

        // First pass: merge light metadata, collect blob requests.
        const duckDbNeeds = new Map<string, Set<PreviewField>>();

        function need(nodeId: string, field: PreviewField) {
            if (!duckDbNeeds.has(nodeId)) duckDbNeeds.set(nodeId, new Set());
            duckDbNeeds.get(nodeId)!.add(field);
        }

        walkTree(parsedTree, (node) => {
            if (!node.id) return;
            const cached = cacheMap.get(node.id);
            if (!cached) return;

            // SQL
            if (cached.sqlPreviewData !== undefined) {
                const cacheTs = cached.sqlPreviewTimestamp || 0;
                const nodeTs = node.sqlPreviewTimestamp || 0;
                if (!node.sqlPreviewData || cacheTs >= nodeTs) {
                    if (cached.sqlPreviewData === DUCKDB_MARKER) {
                        need(node.id, 'sql_data');
                    } else {
                        node.sqlPreviewData = cached.sqlPreviewData;
                    }
                    node.sqlPreviewTimestamp = cached.sqlPreviewTimestamp;
                }
            }

            // Python result
            if (cached.pythonPreviewResult) {
                const cacheTs = cached.pythonPreviewResult.timestamp || 0;
                const nodeTs = node.pythonPreviewResult?.timestamp || 0;
                if (!node.pythonPreviewResult || cacheTs >= nodeTs) {
                    node.pythonPreviewResult = { ...cached.pythonPreviewResult };
                    const p = node.pythonPreviewResult;
                    if (p.data === DUCKDB_MARKER) need(node.id, 'python_data');
                    if (p.html === DUCKDB_MARKER) need(node.id, 'python_html');
                    if (p.chartHtml === DUCKDB_MARKER) need(node.id, 'python_chart_html');
                    if (p.chartBase64 === DUCKDB_MARKER) need(node.id, 'python_chart_base64');
                    if (p.plotlyJson === DUCKDB_MARKER) need(node.id, 'python_plotly');
                }
            }

            // AI
            if (cached.aiResult !== undefined && node.aiConfig) {
                const cacheTs = cached.aiResultTimestamp || 0;
                const nodeTs = node.aiConfig?.lastRunAt || 0;
                if (cacheTs >= nodeTs) {
                    if (cached.aiResult === DUCKDB_MARKER) {
                        need(node.id, 'ai_result');
                        // placeholder; actual value filled in second pass
                    } else {
                        node.aiConfig.lastResult = cached.aiResult;
                    }
                    node.aiConfig.lastRunAt = cached.aiResultTimestamp;
                }
            }

            // Execution
            if (cached.executionPreviewResult) {
                const cacheTs = cached.executionPreviewResult.timestamp || 0;
                const nodeTs = node.executionPreviewResult?.timestamp || 0;
                if (!node.executionPreviewResult || cacheTs >= nodeTs) {
                    node.executionPreviewResult = { ...cached.executionPreviewResult };
                    if (node.executionPreviewResult.data === DUCKDB_MARKER) {
                        need(node.id, 'exec_data');
                    }
                }
            }
        });

        // Batch load blobs from DuckDB.
        let blobs: Map<string, Map<PreviewField, any>> = new Map();
        if (duckDbNeeds.size > 0) {
            const { getBlobsForTree } = await getDuckDbStore();
            const allFields = new Set<PreviewField>();
            for (const fs of duckDbNeeds.values()) for (const f of fs) allFields.add(f);
            blobs = await getBlobsForTree(treeId, Array.from(duckDbNeeds.keys()), Array.from(allFields));
        }

        // Second pass: inject blob values.
        if (blobs.size > 0) {
            walkTree(parsedTree, (node) => {
                const nodeBlobs = blobs.get(node.id);
                if (!nodeBlobs) return;
                if (nodeBlobs.has('sql_data')) node.sqlPreviewData = nodeBlobs.get('sql_data');
                const p = node.pythonPreviewResult;
                if (p) {
                    if (nodeBlobs.has('python_data')) p.data = nodeBlobs.get('python_data');
                    if (nodeBlobs.has('python_html')) p.html = nodeBlobs.get('python_html');
                    if (nodeBlobs.has('python_chart_html')) p.chartHtml = nodeBlobs.get('python_chart_html');
                    if (nodeBlobs.has('python_chart_base64')) p.chartBase64 = nodeBlobs.get('python_chart_base64');
                    if (nodeBlobs.has('python_plotly')) p.plotlyJson = nodeBlobs.get('python_plotly');
                }
                if (nodeBlobs.has('ai_result') && node.aiConfig) {
                    node.aiConfig.lastResult = nodeBlobs.get('ai_result');
                }
                const ex = node.executionPreviewResult;
                if (ex && nodeBlobs.has('exec_data')) {
                    ex.data = nodeBlobs.get('exec_data');
                }
            });
        }
    } catch (err: any) {
        console.warn('[hydrateTreeWithPreviews] Failed to load cache:', err.message);
    }

    return parsedTree;
}

/**
 * Resolve DuckDB markers inside a single cache entry value (for API routes
 * that load one cached object at a time, e.g. widget-data-batch and
 * getNodePreviewAction). Mutates and returns the same object.
 *
 * maxRows: optional limit on returned array length (post-load slicing).
 */
export async function resolveCacheEntry(
    treeId: string,
    nodeId: string,
    cached: any,
    maxRows?: number,
): Promise<any> {
    if (!cached) return cached;

    const neededFields: PreviewField[] = [];

    if (cached.sqlPreviewData === DUCKDB_MARKER) neededFields.push('sql_data');

    const p = cached.pythonPreviewResult;
    if (p) {
        if (p.data === DUCKDB_MARKER) neededFields.push('python_data');
        if (p.html === DUCKDB_MARKER) neededFields.push('python_html');
        if (p.chartHtml === DUCKDB_MARKER) neededFields.push('python_chart_html');
        if (p.chartBase64 === DUCKDB_MARKER) neededFields.push('python_chart_base64');
        if (p.plotlyJson === DUCKDB_MARKER) neededFields.push('python_plotly');
    }

    if (cached.executionPreviewResult?.data === DUCKDB_MARKER) {
        neededFields.push('exec_data');
    }
    if (cached.aiResult === DUCKDB_MARKER) neededFields.push('ai_result');

    if (neededFields.length > 0) {
        try {
            const { getBlobsForTree } = await getDuckDbStore();
            const m = await getBlobsForTree(treeId, [nodeId], neededFields);
            const entry = m.get(nodeId);
            if (entry) {
                if (entry.has('sql_data')) cached.sqlPreviewData = entry.get('sql_data');
                if (p) {
                    if (entry.has('python_data')) p.data = entry.get('python_data');
                    if (entry.has('python_html')) p.html = entry.get('python_html');
                    if (entry.has('python_chart_html')) p.chartHtml = entry.get('python_chart_html');
                    if (entry.has('python_chart_base64')) p.chartBase64 = entry.get('python_chart_base64');
                    if (entry.has('python_plotly')) p.plotlyJson = entry.get('python_plotly');
                }
                if (entry.has('exec_data') && cached.executionPreviewResult) {
                    cached.executionPreviewResult.data = entry.get('exec_data');
                }
                if (entry.has('ai_result')) cached.aiResult = entry.get('ai_result');
            }
        } catch (err: any) {
            console.warn(`[resolveCacheEntry] DuckDB read failed for ${treeId}/${nodeId}: ${err.message}`);
        }
    }

    // Row truncation for transport if requested
    if (maxRows !== undefined && maxRows > 0) {
        if (Array.isArray(cached.sqlPreviewData) && cached.sqlPreviewData.length > maxRows) {
            cached._sqlTotalRows = cached.sqlPreviewData.length;
            cached.sqlPreviewData = cached.sqlPreviewData.slice(0, maxRows);
        }
        if (Array.isArray(cached.pythonPreviewResult?.data) && cached.pythonPreviewResult.data.length > maxRows) {
            cached.pythonPreviewResult._totalRows = cached.pythonPreviewResult.data.length;
            cached.pythonPreviewResult.data = cached.pythonPreviewResult.data.slice(0, maxRows);
        }
    }

    return cached;
}

// ─── STRIP (for tree JSON saves) ─────────────────────────────────────────────

/**
 * Strip heavy preview data from a parsed tree JSON object.
 * Call this before saving the tree JSON to keep it lightweight.
 * Only removes bulky data arrays; keeps timestamps and metadata.
 */
export function stripPreviewDataFromTree(parsedTree: any): any {
    walkTree(parsedTree, (node) => {
        if (Array.isArray(node.sqlPreviewData) && node.sqlPreviewData.length > 100) {
            delete node.sqlPreviewData;
        }

        if (node.pythonPreviewResult) {
            const pr = node.pythonPreviewResult;
            if (pr.type === 'table' && Array.isArray(pr.data) && pr.data.length > 100) {
                const { data, ...rest } = pr;
                node.pythonPreviewResult = rest;
            }
            if (pr.type === 'chart' && Array.isArray(pr.data) && pr.data.length > 100) {
                const { data, ...rest } = pr;
                node.pythonPreviewResult = rest;
            }
        }
    });
    return parsedTree;
}

// ─── CLEANUP ─────────────────────────────────────────────────────────────────

/**
 * Delete all cached preview data for a tree (Postgres row + DuckDB blobs).
 */
export async function deleteTreePreviewCache(treeId: string): Promise<void> {
    const { deleteTree } = await getDuckDbStore();
    await Promise.all([
        db.nodePreviewCache.deleteMany({ where: { treeId } }),
        deleteTree(treeId),
    ]);
}

/**
 * Delete cached preview data for a single node.
 */
export async function deleteNodePreviewCache(treeId: string, nodeId: string): Promise<void> {
    const { deleteNode } = await getDuckDbStore();
    await Promise.all([
        db.nodePreviewCache.deleteMany({ where: { treeId, nodeId } }).catch(() => undefined),
        deleteNode(treeId, nodeId),
    ]);
}
