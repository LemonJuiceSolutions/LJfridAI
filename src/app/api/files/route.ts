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
        // Legacy unscoped files (uploaded before this change) sit under the root —
        // admin migration script needed to move them under <companyId>/.
        const ALLOWED_EXTRA_DIRS: Record<string, string> = {
            'excel-etl': join(process.cwd(), 'python-backend', 'EEXXCC', companyId),
            'data_lake': join(getDataLakePath(), companyId),
        };

        const uploadDir = ALLOWED_EXTRA_DIRS[folder] || join(process.cwd(), 'public', folder, companyId);

        try {
            const files = await readdir(uploadDir);

            const fileInfos = await Promise.all(files.map(async (file) => {
                const filepath = join(uploadDir, file);
                const stats = await stat(filepath);
                return {
                    name: file,
                    url: `/${folder}/${file}`,
                    size: stats.size,
                    createdAt: stats.birthtime,
                };
            }));

            return NextResponse.json({ success: true, files: fileInfos });
        } catch (e) {
            // Did not exist? return empty
            return NextResponse.json({ success: true, files: [] });
        }

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
