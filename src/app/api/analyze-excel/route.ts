import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import { access } from 'fs/promises';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDataLakePath } from '@/lib/data-lake';
import { getPythonBackendUrl } from '@/lib/python-backend';
// join is kept for the EEXXCC path below

export async function POST(request: NextRequest) {
    const session = await getServerSession(authOptions);
    const companyId = (session?.user as any)?.companyId as string | undefined;
    if (!companyId) {
        return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const filename = body.filename as string;

        if (!filename) {
            return NextResponse.json({ success: false, error: 'Nessun file specificato' }, { status: 400 });
        }

        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            return NextResponse.json({ success: false, error: 'Invalid filename' }, { status: 400 });
        }

        // SECURITY: scope search dirs per companyId to prevent cross-tenant Excel read.
        // Legacy flat paths (pre-tenant-scoping) listed AFTER scoped so scoped wins
        // on collisions. A migration moves legacy files under <companyId>/.
        const { resolve: pathResolve } = await import('path');
        const scopedDirs = [
            join(getDataLakePath(), companyId),
            join(process.cwd(), 'python-backend', 'EEXXCC', companyId),
        ];
        const legacyDirs = [
            getDataLakePath(),
            join(process.cwd(), 'python-backend', 'EEXXCC'),
        ];

        let filepath = '';
        for (const dir of scopedDirs) {
            const candidate = join(dir, filename);
            if (!pathResolve(candidate).startsWith(pathResolve(dir))) continue;
            try { await access(candidate); filepath = candidate; break; } catch {}
        }
        if (!filepath) {
            for (const dir of legacyDirs) {
                const candidate = join(dir, filename);
                if (!pathResolve(candidate).startsWith(pathResolve(dir))) continue;
                try { await access(candidate); filepath = candidate; break; } catch {}
            }
        }

        if (!filepath) {
            return NextResponse.json({ success: false, error: `File non trovato: ${filename}` }, { status: 404 });
        }

        // Call Python backend to analyze the Excel file
        // PERF: timeout to prevent hanging serverless function on Python backend stall
        const response = await fetch(`${getPythonBackendUrl()}/analyze-excel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filepath }),
            signal: AbortSignal.timeout(120_000), // 2 min for large Excel
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
