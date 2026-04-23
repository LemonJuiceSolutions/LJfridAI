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
import { rateLimit } from '@/lib/rate-limit';
import fs from 'fs/promises';
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

async function ensureCacheDir() {
    await fs.mkdir(CACHE_DIR, { recursive: true });
}

/** Remove cached files older than CACHE_TTL_MS (best-effort). */
async function cleanupStaleCache() {
    try {
        const files = await fs.readdir(CACHE_DIR).catch(() => [] as string[]);
        const now = Date.now();
        await Promise.all(files.map(async (file) => {
            const fp = path.join(CACHE_DIR, file);
            const stat = await fs.stat(fp);
            if (now - stat.mtimeMs > CACHE_TTL_MS) {
                await fs.unlink(fp);
            }
        }));
    } catch { /* best effort */ }
}

/** Save large data to disk and return a lightweight reference.
 *  Accepts an optional pre-serialized JSON string to avoid double-stringify. */
async function cacheLargeResult(data: any[], preSerializedJson?: string): Promise<{
    __pipelineCacheRef: true;
    refId: string;
    rowCount: number;
    sizeBytes: number;
}> {
    await ensureCacheDir();
    const refId = randomUUID();
    const filePath = path.join(CACHE_DIR, `${refId}.json`);
    const json = preSerializedJson ?? JSON.stringify(data);
    await fs.writeFile(filePath, json, 'utf-8');
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
async function resolveCacheRef(ref: any): Promise<any[] | null> {
    if (!ref?.__pipelineCacheRef || !ref?.refId) return null;
    const filePath = path.join(CACHE_DIR, `${ref.refId}.json`);
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content);
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        const user = session?.user as { id?: string; companyId?: string } | undefined;
        if (!user?.companyId) {
            return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
        }

        const uid = user.id || user.companyId;
        const rl = await rateLimit(`sql-exec:${uid}`, 30, 60_000);
        if (!rl.allowed) {
            return NextResponse.json({ data: null, error: 'Rate limit superato. Riprova tra poco.' }, { status: 429 });
        }

        // Opportunistic cleanup of old cached files
        await cleanupStaleCache();

        const body = await req.json();
        const { query, connectorId, dependencies } = body;

        if (!query) {
            return NextResponse.json({ data: null, error: 'Missing query' }, { status: 400 });
        }

        // Resolve any cached large-result refs in incoming dependencies
        const resolvedDeps = await Promise.all((dependencies || []).map(async (dep: any) => {
            if (dep.data?.__pipelineCacheRef) {
                const resolved = await resolveCacheRef(dep.data);
                if (resolved) {
                    console.log(
                        `[execute-sql] Resolved cache ref for dep "${dep.tableName}": ${resolved.length} rows`,
                    );
                    return { ...dep, data: resolved };
                }
            }
            return dep;
        }));

        const result = await executeSqlPreviewAction(query, connectorId || '', resolvedDeps);

        // If result data is too large for a JSON response (~10 MB browser limit),
        // cache it on disk and return a lightweight reference instead.
        // Stringify once and reuse for both size check and disk write.
        if (result.data && Array.isArray(result.data)) {
            try {
                const serialized = JSON.stringify(result.data);
                if (serialized.length > LARGE_THRESHOLD) {
                    const ref = await cacheLargeResult(result.data, serialized);
                    return NextResponse.json({ ...result, data: ref });
                }
            } catch {
                // If stringify itself fails, the data is definitely too large
                return NextResponse.json({
                    ...result,
                    data: await cacheLargeResult(result.data),
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
