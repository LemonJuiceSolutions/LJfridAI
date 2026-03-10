import { NextRequest, NextResponse } from 'next/server';
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
    try {
        const { path } = await params;
        const filepath = getDataLakePath(...path);

        // Prevent path traversal
        const base = getDataLakePath();
        if (!filepath.startsWith(base)) {
            return new NextResponse('Forbidden', { status: 403 });
        }

        await stat(filepath); // throws if not found
        const buffer = await readFile(filepath);
        const ext = extname(filepath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        return new NextResponse(buffer, {
            headers: { 'Content-Type': contentType },
        });
    } catch {
        return new NextResponse('Not Found', { status: 404 });
    }
}
