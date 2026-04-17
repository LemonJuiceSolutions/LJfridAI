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
        // SECURITY: enforce first path segment matches caller's companyId.
        // Legacy files without a company prefix remain inaccessible until moved
        // (the migration script handles this).
        if (!path || path.length === 0 || path[0] !== companyId) {
            return new NextResponse('Forbidden', { status: 403 });
        }
        const filepath = getDataLakePath(...path);

        // Prevent path traversal — resolved path must stay inside company's subtree.
        const { resolve: pathResolve } = await import('path');
        const companyBase = getDataLakePath(companyId);
        if (!pathResolve(filepath).startsWith(pathResolve(companyBase))) {
            return new NextResponse('Forbidden', { status: 403 });
        }

        await stat(filepath); // throws if not found
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
