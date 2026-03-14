import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { getDataLakePath } from '@/lib/data-lake';

export async function POST(request: NextRequest) {
    try {
        const data = await request.formData();
        const file: File | null = data.get('file') as unknown as File;
        const folder = (data.get('folder') as string) || 'data_lake';

        if (!file) {
            return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Legacy public/ folders stay in public/; everything else goes to data lake
        const isLegacyPublic = ['uploads', 'documents', 'images', 'videos'].includes(folder);
        const uploadDir = isLegacyPublic
            ? join(process.cwd(), 'public', folder)
            : getDataLakePath(folder === 'data_lake' ? '' : folder);
        await mkdir(uploadDir, { recursive: true });

        // Sanitize filename
        const customName = data.get('name') as string;
        const filename = customName ? customName : file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const filepath = join(uploadDir, filename);

        await writeFile(filepath, buffer);

        // Legacy public folders use static URL; data lake files served via API
        const subpath = folder === 'data_lake' ? filename : `${folder}/${filename}`;
        const url = isLegacyPublic
            ? `/${folder}/${filename}`
            : `/api/data-lake/${subpath}`;

        return NextResponse.json({ success: true, url, name: filename });
    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json({ success: false, error: 'Upload failed' }, { status: 500 });
    }
}
