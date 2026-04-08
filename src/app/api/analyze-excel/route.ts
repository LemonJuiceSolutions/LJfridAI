import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import { access } from 'fs/promises';
import { getDataLakePath } from '@/lib/data-lake';
import { getPythonBackendUrl } from '@/lib/python-backend';
// join is kept for the EEXXCC path below

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const filename = body.filename as string;

        if (!filename) {
            return NextResponse.json({ success: false, error: 'Nessun file specificato' }, { status: 400 });
        }

        // Search in multiple folders
        const searchDirs = [
            getDataLakePath(),
            join(process.cwd(), 'python-backend', 'EEXXCC'),
        ];

        let filepath = '';
        for (const dir of searchDirs) {
            const candidate = join(dir, filename);
            try {
                await access(candidate);
                filepath = candidate;
                break;
            } catch {}
        }

        if (!filepath) {
            return NextResponse.json({ success: false, error: `File non trovato: ${filename}` }, { status: 404 });
        }

        // Call Python backend to analyze the Excel file
        const response = await fetch(`${getPythonBackendUrl()}/analyze-excel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filepath }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return NextResponse.json({
                success: false,
                error: errorData.error || 'Analisi Excel fallita nel backend Python'
            }, { status: 500 });
        }

        const analysis = await response.json();

        return NextResponse.json({
            success: true,
            analysis: { ...analysis, filepath },
        });

    } catch (error) {
        console.error('Excel analysis error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Analisi fallita'
        }, { status: 500 });
    }
}
