import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDataLakePath } from '@/lib/data-lake';
import { isMagicCompatible } from '@/lib/upload-validation';

// SECURITY: hard limits to prevent disk-fill DoS and stored XSS via polyglots.
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const ALLOWED_MIME_PREFIXES = [
    'image/', 'video/', 'audio/',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument',
    'application/vnd.ms-excel',
    'application/msword',
    'application/json',
    'text/csv', 'text/plain', 'text/markdown',
    'application/zip', 'application/x-zip-compressed',
];
const FORBIDDEN_EXTENSIONS = new Set([
    'html', 'htm', 'svg', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx',
    'php', 'py', 'sh', 'exe', 'bat', 'cmd', 'jar', 'war',
]);

function isMimeAllowed(mime: string): boolean {
    if (!mime) return false;
    return ALLOWED_MIME_PREFIXES.some(p => mime.startsWith(p));
}

function getExtension(name: string): string {
    const i = name.lastIndexOf('.');
    return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

// Magic-byte validator lives in @/lib/upload-validation for unit testability.

export async function POST(request: NextRequest) {
    const session = await getServerSession(authOptions);
    const companyId = (session?.user as any)?.companyId as string | undefined;
    if (!companyId) {
        return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
    }

    // SECURITY: pre-check Content-Length before consuming body
    const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_FILE_SIZE * 1.1) {
        return NextResponse.json({ success: false, error: 'File troppo grande (max 50MB)' }, { status: 413 });
    }

    try {
        const data = await request.formData();
        const file: File | null = data.get('file') as unknown as File;
        const folder = (data.get('folder') as string) || 'data_lake';

        if (!file) {
            return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });
        }

        // SECURITY: enforce size limit
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json({ success: false, error: 'File troppo grande (max 50MB)' }, { status: 413 });
        }

        // SECURITY: enforce MIME whitelist
        if (!isMimeAllowed(file.type)) {
            return NextResponse.json({ success: false, error: `Tipo file non consentito: ${file.type || 'unknown'}` }, { status: 415 });
        }

        // SECURITY: validate folder against whitelist (no arbitrary subdir creation)
        if (folder.includes('..') || folder.includes('/') || folder.includes('\\')) {
            return NextResponse.json({ success: false, error: 'Invalid folder' }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // SECURITY: verify content matches declared MIME via magic-byte sniff.
        // Blocks polyglots (e.g. HTML/JS smuggled inside a .png).
        if (!isMagicCompatible(file.type, buffer)) {
            return NextResponse.json(
                { success: false, error: `Contenuto del file non corrisponde al tipo dichiarato (${file.type})` },
                { status: 415 }
            );
        }

        // SECURITY CRITICAL: scope upload dir per companyId to prevent cross-tenant access
        const isLegacyPublic = ['uploads', 'documents', 'images', 'videos'].includes(folder);
        const uploadDir = isLegacyPublic
            ? join(process.cwd(), 'public', folder, companyId)
            : getDataLakePath(folder === 'data_lake' ? companyId : `${companyId}/${folder}`);
        await mkdir(uploadDir, { recursive: true });

        // SECURITY: sanitize customName same way as file.name; reject path separators + traversal
        const customName = data.get('name') as string;
        if (customName && (customName.includes('..') || customName.includes('/') || customName.includes('\\'))) {
            return NextResponse.json({ success: false, error: 'Invalid filename' }, { status: 400 });
        }
        const sanitize = (n: string) => n.replace(/[^a-zA-Z0-9.-]/g, '_');
        const filename = customName ? sanitize(customName) : sanitize(file.name);

        // SECURITY: reject executable / script extensions (anti-XSS-via-polyglot)
        const ext = getExtension(filename);
        if (FORBIDDEN_EXTENSIONS.has(ext)) {
            return NextResponse.json({ success: false, error: `Estensione non consentita: .${ext}` }, { status: 415 });
        }

        const filepath = join(uploadDir, filename);

        await writeFile(filepath, buffer);

        // Legacy public folders use static URL; data lake files served via API.
        // Data-lake URL includes companyId so the GET route can enforce tenant
        // isolation against the first path segment.
        const subpath = folder === 'data_lake'
            ? `${companyId}/${filename}`
            : `${companyId}/${folder}/${filename}`;
        const url = isLegacyPublic
            ? `/${folder}/${companyId}/${filename}`
            : `/api/data-lake/${subpath}`;

        return NextResponse.json({ success: true, url, name: filename });
    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json({ success: false, error: 'Upload failed' }, { status: 500 });
    }
}
