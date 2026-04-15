import { NextRequest, NextResponse } from 'next/server';
import { readdir, unlink, stat } from 'fs/promises';
import { join } from 'path';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDataLakePath } from '@/lib/data-lake';

export async function GET(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const folder = searchParams.get('folder') || 'data_lake';

        // Special folders outside public/
        const ALLOWED_EXTRA_DIRS: Record<string, string> = {
            'excel-etl': join(process.cwd(), 'python-backend', 'EEXXCC'),
            'data_lake': getDataLakePath(),
        };

        const uploadDir = ALLOWED_EXTRA_DIRS[folder] || join(process.cwd(), 'public', folder);

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
    if (!session) {
        return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const name = searchParams.get('name');
        const folder = searchParams.get('folder') || 'data_lake';

        if (!name) return NextResponse.json({ success: false, error: 'Filename required' }, { status: 400 });

        const ALLOWED_EXTRA_DIRS: Record<string, string> = {
            'excel-etl': join(process.cwd(), 'python-backend', 'EEXXCC'),
            'data_lake': getDataLakePath(),
        };
        const baseDir = ALLOWED_EXTRA_DIRS[folder] || join(process.cwd(), 'public', folder);
        const filepath = join(baseDir, name);
        await unlink(filepath);

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ success: false, error: 'Delete failed' }, { status: 500 });
    }
}
