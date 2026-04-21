/**
 * One-off migration: NodePreviewCache (Postgres JSON) + legacy .json.gz
 * files → DuckDB blob store + trimmed Postgres rows.
 *
 *   npx tsx scripts/migrate-preview-cache-to-duckdb.ts
 *   npx tsx scripts/migrate-preview-cache-to-duckdb.ts --dry-run
 *   npx tsx scripts/migrate-preview-cache-to-duckdb.ts --tree <treeId>
 *   npx tsx scripts/migrate-preview-cache-to-duckdb.ts --min-kb 100
 *
 * Self-contained: uses PrismaClient + duckdb-store directly. Does NOT import
 * `src/lib/preview-cache.ts` (which chains to `server-only`).
 *
 * Safe to re-run: each row is re-processed idempotently.
 */

import { PrismaClient } from '@prisma/client';
import {
    putBlobs, getStats, type PreviewField,
} from '../src/lib/preview-cache/duckdb-store';

const db = new PrismaClient();

const DUCKDB_MARKER = '__duckdb__';

const PLOTLY_OFFLOAD_BYTES = 50_000;
const EXEC_DATA_OFFLOAD_BYTES = 10_000;
const AI_RESULT_OFFLOAD_BYTES = 20_000;
const HTML_OFFLOAD_BYTES = 5_000;

function jsonSize(value: any): number {
    try { return JSON.stringify(value).length; } catch { return 0; }
}

/**
 * Re-implementation of saveNodePreview's offload logic, inline, without the
 * server-only chain. Returns the trimmed payload to write back to Postgres.
 */
async function splitAndStore(treeId: string, nodeId: string, cached: any): Promise<any> {
    const stripped: any = { ...cached };
    if (stripped.pythonPreviewResult) {
        stripped.pythonPreviewResult = { ...stripped.pythonPreviewResult };
    }
    if (stripped.executionPreviewResult) {
        stripped.executionPreviewResult = { ...stripped.executionPreviewResult };
    }

    const offloads: Array<{ field: PreviewField; value: any }> = [];

    // SQL rows
    if (Array.isArray(stripped.sqlPreviewData) && stripped.sqlPreviewData.length > 0) {
        offloads.push({ field: 'sql_data', value: stripped.sqlPreviewData });
        stripped._sqlRowCount = stripped.sqlPreviewData.length;
        stripped.sqlPreviewData = DUCKDB_MARKER;
    }

    const py = stripped.pythonPreviewResult;
    if (py && typeof py === 'object') {
        if (Array.isArray(py.data) && py.data.length > 0) {
            offloads.push({ field: 'python_data', value: py.data });
            py._dataRowCount = py.data.length;
            py.data = DUCKDB_MARKER;
        }
        if (typeof py.html === 'string' && py.html.length > HTML_OFFLOAD_BYTES) {
            offloads.push({ field: 'python_html', value: py.html });
            py._htmlSize = py.html.length;
            py.html = DUCKDB_MARKER;
        }
        if (typeof py.chartHtml === 'string' && py.chartHtml.length > HTML_OFFLOAD_BYTES) {
            offloads.push({ field: 'python_chart_html', value: py.chartHtml });
            py._chartHtmlSize = py.chartHtml.length;
            py.chartHtml = DUCKDB_MARKER;
        }
        if (typeof py.chartBase64 === 'string' && py.chartBase64.length > HTML_OFFLOAD_BYTES) {
            offloads.push({ field: 'python_chart_base64', value: py.chartBase64 });
            py._chartBase64Size = py.chartBase64.length;
            py.chartBase64 = DUCKDB_MARKER;
        }
        if (py.plotlyJson && typeof py.plotlyJson === 'object'
            && jsonSize(py.plotlyJson) > PLOTLY_OFFLOAD_BYTES) {
            offloads.push({ field: 'python_plotly', value: py.plotlyJson });
            py.plotlyJson = DUCKDB_MARKER;
        }
    }

    const exec = stripped.executionPreviewResult;
    if (exec && exec.data !== undefined && exec.data !== null
        && jsonSize(exec.data) > EXEC_DATA_OFFLOAD_BYTES) {
        offloads.push({ field: 'exec_data', value: exec.data });
        exec.data = DUCKDB_MARKER;
    }

    if (stripped.aiResult && jsonSize(stripped.aiResult) > AI_RESULT_OFFLOAD_BYTES) {
        offloads.push({ field: 'ai_result', value: stripped.aiResult });
        stripped.aiResult = DUCKDB_MARKER;
    }

    if (offloads.length > 0) {
        await putBlobs(treeId, nodeId, offloads);
    }

    return stripped;
}

type Args = { dryRun: boolean; onlyTree?: string; minSizeKb: number };

function parseArgs(): Args {
    const argv = process.argv.slice(2);
    let dryRun = false;
    let onlyTree: string | undefined;
    let minSizeKb = 0;
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--dry-run') dryRun = true;
        else if (a === '--tree' && argv[i + 1]) { onlyTree = argv[++i]; }
        else if (a === '--min-kb' && argv[i + 1]) { minSizeKb = Number(argv[++i]); }
    }
    return { dryRun, onlyTree, minSizeKb };
}

async function main() {
    const args = parseArgs();
    const startedAt = Date.now();

    console.log('[migrate] Starting preview-cache migration to DuckDB');
    console.log(`[migrate] Mode: ${args.dryRun ? 'DRY RUN (no writes)' : 'LIVE'}`);
    if (args.onlyTree) console.log(`[migrate] Scope: tree ${args.onlyTree}`);
    if (args.minSizeKb > 0) console.log(`[migrate] Filter: rows > ${args.minSizeKb} KB only`);

    const where: any = {};
    if (args.onlyTree) where.treeId = args.onlyTree;

    const entries = await db.nodePreviewCache.findMany({
        where,
        select: { treeId: true, nodeId: true, data: true },
    });
    console.log(`[migrate] Found ${entries.length} Postgres cache entries to scan`);

    let converted = 0;
    let skipped = 0;
    let errored = 0;
    let bytesSavedPg = 0;

    for (const entry of entries) {
        const origSize = JSON.stringify(entry.data).length;
        if (args.minSizeKb > 0 && origSize < args.minSizeKb * 1024) {
            skipped++;
            continue;
        }

        const cached: any = entry.data || {};

        if (args.dryRun) {
            converted++;
            continue;
        }

        try {
            const stripped = await splitAndStore(entry.treeId, entry.nodeId, cached);
            await db.nodePreviewCache.update({
                where: { treeId_nodeId: { treeId: entry.treeId, nodeId: entry.nodeId } },
                data: { data: stripped },
            });
            converted++;
            const newSize = JSON.stringify(stripped).length;
            bytesSavedPg += Math.max(0, origSize - newSize);
        } catch (err: any) {
            errored++;
            console.error(`[migrate] Error for ${entry.treeId}/${entry.nodeId}: ${err.message}`);
        }

        if ((converted + errored) % 50 === 0 && converted + errored > 0) {
            console.log(`[migrate] Progress: ${converted} ok, ${errored} err, ${skipped} skipped`);
        }
    }

    const stats = await getStats();
    const elapsedS = Math.round((Date.now() - startedAt) / 1000);

    console.log('─────────────────────────────────────');
    console.log('[migrate] Summary:');
    console.log(`  Converted:      ${converted}`);
    console.log(`  Skipped:        ${skipped}`);
    console.log(`  Errored:        ${errored}`);
    console.log(`  Postgres saved: ${(bytesSavedPg / 1024 / 1024).toFixed(1)} MB`);
    console.log(`  DuckDB blobs:   ${stats.count} rows, ${(stats.totalBytes / 1024 / 1024).toFixed(1)} MB total, ${(stats.maxBytes / 1024 / 1024).toFixed(1)} MB max`);
    console.log(`  Elapsed:        ${elapsedS}s`);
    console.log('─────────────────────────────────────');

    if (args.dryRun) {
        console.log('[migrate] Dry run — no changes written. Re-run without --dry-run to apply.');
    }
}

main()
    .catch(err => {
        console.error('[migrate] Fatal error:', err);
        process.exit(1);
    })
    .finally(() => db.$disconnect());
