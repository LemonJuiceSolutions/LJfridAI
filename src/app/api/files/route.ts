import { NextRequest, NextResponse } from 'next/server';
import { readdir, unlink, stat } from 'fs/promises';
import { join, resolve } from 'path';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDataLakePath } from '@/lib/data-lake';

export async function GET(request: NextRequest) {
    const session = await getServerSession(authOptions);
    const companyId = (session?.user as any)?.companyId as string | undefined;
    if (!companyId) {
        return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const folder = searchParams.get('folder') || 'data_lake';

        if (folder.includes('..') || folder.includes('/') || folder.includes('\\')) {
            return NextResponse.json({ success: false, error: 'Invalid folder' }, { status: 400 });
        }

        // SECURITY CRITICAL: scope dirs per companyId to prevent cross-tenant file access.
        const SCOPED_DIRS: Record<string, string> = {
            'excel-etl': join(process.cwd(), 'python-backend', 'EEXXCC', companyId),
            'data_lake': join(getDataLakePath(), companyId),
        };
        // Legacy (flat) paths from the pre-tenant-scoping era. Listed here so
        // existing files remain visible; a one-time migration script moves
        // them under <companyId>/ (scripts/migrate-files-to-company.ts).
        const LEGACY_DIRS: Record<string, string> = {
            'excel-etl': join(process.cwd(), 'python-backend', 'EEXXCC'),
            'data_lake': getDataLakePath(),
        };

        const scopedDir = SCOPED_DIRS[folder] || join(process.cwd(), 'public', folder, companyId);
        const legacyDir = LEGACY_DIRS[folder] || join(process.cwd(), 'public', folder);

        const readSafe = async (dir: string) => {
            try { return await readdir(dir); } catch { return []; }
        };

        const [scopedFiles, legacyFiles] = await Promise.all([readSafe(scopedDir), readSafe(legacyDir)]);

        // Scoped files win over legacy on name collision.
        const seen = new Set(scopedFiles);
        const combined = [
            ...scopedFiles.map(f => ({ name: f, dir: scopedDir, scoped: true })),
            ...legacyFiles
                .filter(f => !seen.has(f) && scopedDir !== legacyDir)
                .map(f => ({ name: f, dir: legacyDir, scoped: false })),
        ];

        const fileInfos = (await Promise.all(combined.map(async ({ name, dir, scoped }) => {
            try {
                const filepath = join(dir, name);
                const stats = await stat(filepath);
                if (!stats.isFile()) return null;
                return {
                    name,
                    url: `/${folder}/${name}`,
                    size: stats.size,
                    createdAt: stats.birthtime,
                    legacy: !scoped,
                };
            } catch {
                return null;
            }
        }))).filter(Boolean);

        return NextResponse.json({ success: true, files: fileInfos });

    } catch (error) {
        return NextResponse.json({ success: false, error: 'List failed' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    const session = await getServerSession(authOptions);
    const companyId = (session?.user as any)?.companyId as string | undefined;
    if (!companyId) {
        return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const name = searchParams.get('name');
        const folder = searchParams.get('folder') || 'data_lake';

        if (!name) return NextResponse.json({ success: false, error: 'Filename required' }, { status: 400 });

        if (folder.includes('..') || folder.includes('/') || folder.includes('\\')) {
            return NextResponse.json({ success: false, error: 'Invalid folder' }, { status: 400 });
        }

        if (name.includes('..') || name.includes('/') || name.includes('\\')) {
            return NextResponse.json({ success: false, error: 'Invalid filename' }, { status: 400 });
        }

        // SECURITY CRITICAL: scope dirs per companyId
        const ALLOWED_EXTRA_DIRS: Record<string, string> = {
            'excel-etl': join(process.cwd(), 'python-backend', 'EEXXCC', companyId),
            'data_lake': join(getDataLakePath(), companyId),
        };
        const baseDir = ALLOWED_EXTRA_DIRS[folder] || join(process.cwd(), 'public', folder, companyId);
        const filepath = join(baseDir, name);

        // Verify resolved path stays within base directory
        if (!resolve(filepath).startsWith(resolve(baseDir))) {
            return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
        }

        await unlink(filepath);

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ success: false, error: 'Delete failed' }, { status: 500 });
    }
}
