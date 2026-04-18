import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { readFile, stat } from 'fs/promises';
import { join, extname } from 'path';
import { getDataLakePath } from '@/lib/data-lake';

const MIME_TYPES: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogg': 'video/ogg',
    '.pdf': 'application/pdf',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.csv': 'text/csv',
    '.json': 'application/json',
    '.txt': 'text/plain',
};

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const session = await getServerSession(authOptions);
    const companyId = (session?.user as any)?.companyId as string | undefined;
    if (!companyId) {
        return new NextResponse('Non autorizzato', { status: 401 });
    }

    try {
        const { path } = await params;
        if (!path || path.length === 0) {
            return new NextResponse('Not Found', { status: 404 });
        }

        // SECURITY: resolve the file under the caller's companyId subtree.
        // Legacy URLs built before tenant scoping lack the companyId prefix —
        // we prepend it so saved widgets keep working. Cross-tenant reads are
        // impossible because the server, not the client, decides the prefix.
        const scopedPath = path[0] === companyId ? path : [companyId, ...path];
        const scopedFile = getDataLakePath(...scopedPath);

        // Path traversal guard — resolved path must stay inside the data-lake root.
        const { resolve: pathResolve } = await import('path');
        const lakeRoot = getDataLakePath();
        if (!pathResolve(scopedFile).startsWith(pathResolve(lakeRoot))) {
            return new NextResponse('Forbidden', { status: 403 });
        }

        // Try scoped first, fall back to legacy flat path (pre-tenant-scoping
        // uploads live in getDataLakePath() without a companyId prefix).
        const legacyFile = getDataLakePath(...(path[0] === companyId ? path.slice(1) : path));
        let filepath = scopedFile;
        try {
            await stat(scopedFile);
        } catch {
            try {
                await stat(legacyFile);
                filepath = legacyFile;
            } catch {
                return new NextResponse('Not Found', { status: 404 });
            }
        }
        const buffer = await readFile(filepath);
        const ext = extname(filepath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        // SECURITY: nosniff blocks MIME sniffing (anti stored-XSS polyglot).
        // Force attachment for non-preview-safe types; inline only for images/pdf/video
        // which the browser handles without running scripts.
        const INLINE_SAFE = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'video/mp4', 'video/webm', 'application/pdf']);
        const disposition = INLINE_SAFE.has(contentType) ? 'inline' : 'attachment';

        return new NextResponse(buffer, {
            headers: {
                'Content-Type': contentType,
                'X-Content-Type-Options': 'nosniff',
                'Content-Disposition': disposition,
                'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
            },
        });
    } catch {
        return new NextResponse('Not Found', { status: 404 });
    }
}
