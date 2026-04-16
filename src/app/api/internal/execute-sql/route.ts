/**
 * Internal API route for pipeline SQL execution.
 * Replaces Server Action calls to avoid the ~10MB response size limit
 * imposed by the React Flight protocol on Server Actions.
 *
 * Large results (>5 MB) are saved to disk and a reference object is returned.
 * Subsequent requests that receive those references as dependency data will
 * resolve them back to the full dataset server-side, so the client never
 * needs to hold >5 MB in a single JSON response.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { executeSqlPreviewAction } from '@/app/actions';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export const maxDuration = 300; // 5 minutes

// ---------------------------------------------------------------------------
// Large-result disk cache
// ---------------------------------------------------------------------------

const DATA_LAKE_PATH = process.env.DATA_LAKE_PATH || 'data_lake';
const CACHE_DIR = path.join(process.cwd(), DATA_LAKE_PATH, 'pipeline-cache', '_api');
const LARGE_THRESHOLD = 5 * 1024 * 1024; // 5 MB
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function ensureCacheDir() {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
}

/** Remove cached files older than CACHE_TTL_MS (best-effort). */
function cleanupStaleCache() {
    try {
        if (!fs.existsSync(CACHE_DIR)) return;
        const now = Date.now();
        for (const file of fs.readdirSync(CACHE_DIR)) {
            const fp = path.join(CACHE_DIR, file);
            const stat = fs.statSync(fp);
            if (now - stat.mtimeMs > CACHE_TTL_MS) {
                fs.unlinkSync(fp);
            }
        }
    } catch { /* best effort */ }
}

/** Save large data to disk and return a lightweight reference. */
function cacheLargeResult(data: any[]): {
    __pipelineCacheRef: true;
    refId: string;
    rowCount: number;
    sizeBytes: number;
} {
    ensureCacheDir();
    const refId = randomUUID();
    const filePath = path.join(CACHE_DIR, `${refId}.json`);
    const json = JSON.stringify(data);
    fs.writeFileSync(filePath, json, 'utf-8');
    console.log(
        `[execute-sql] Cached large result: ${data.length} rows, ` +
        `${(json.length / 1024 / 1024).toFixed(1)}MB -> ${filePath}`,
    );
    return {
        __pipelineCacheRef: true,
        refId,
        rowCount: data.length,
        sizeBytes: json.length,
    };
}

/** Resolve a cache reference back to the original data array. */
function resolveCacheRef(ref: any): any[] | null {
    if (!ref?.__pipelineCacheRef || !ref?.refId) return null;
    const filePath = path.join(CACHE_DIR, `${ref.refId}.json`);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!(session?.user as any)?.companyId) {
            return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
        }

        // Opportunistic cleanup of old cached files
        cleanupStaleCache();

        const body = await req.json();
        const { query, connectorId, dependencies } = body;

        if (!query) {
            return NextResponse.json({ data: null, error: 'Missing query' }, { status: 400 });
        }

        // Resolve any cached large-result refs in incoming dependencies
        const resolvedDeps = (dependencies || []).map((dep: any) => {
            if (dep.data?.__pipelineCacheRef) {
                const resolved = resolveCacheRef(dep.data);
                if (resolved) {
                    console.log(
                        `[execute-sql] Resolved cache ref for dep "${dep.tableName}": ${resolved.length} rows`,
                    );
                    return { ...dep, data: resolved };
                }
            }
            return dep;
        });

        const result = await executeSqlPreviewAction(query, connectorId || '', resolvedDeps);

        // If result data is too large for a JSON response (~10 MB browser limit),
        // cache it on disk and return a lightweight reference instead.
        if (result.data && Array.isArray(result.data)) {
            try {
                const jsonSize = JSON.stringify(result.data).length;
                if (jsonSize > LARGE_THRESHOLD) {
                    const ref = cacheLargeResult(result.data);
                    return NextResponse.json({ ...result, data: ref });
                }
            } catch {
                // If stringify itself fails, the data is definitely too large
                return NextResponse.json({
                    ...result,
                    data: cacheLargeResult(result.data),
                });
            }
        }

        return NextResponse.json(result);
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Internal server error';
        console.error('[api/internal/execute-sql] Error:', e);
        return NextResponse.json({ data: null, error }, { status: 500 });
    }
}
