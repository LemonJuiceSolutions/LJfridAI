import { NextRequest, NextResponse } from 'next/server';
import { readdir, unlink, stat } from 'fs/promises';
import { join } from 'path';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const folder = searchParams.get('folder') || 'uploads';

        // Allow 'python-backend/EEXXCC' as a special folder outside public/
        const ALLOWED_EXTRA_DIRS: Record<string, string> = {
            'excel-etl': join(process.cwd(), 'python-backend', 'EEXXCC'),
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
    try {
        const { searchParams } = new URL(request.url);
        const name = searchParams.get('name');
        const folder = searchParams.get('folder') || 'uploads';

        if (!name) return NextResponse.json({ success: false, error: 'Filename required' }, { status: 400 });

        const filepath = join(process.cwd(), 'public', folder, name);
        await unlink(filepath);

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ success: false, error: 'Delete failed' }, { status: 500 });
    }
}
