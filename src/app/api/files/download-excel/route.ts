/**
 * Proxy to Python backend /download-excel.
 *
 * Replaces hardcoded http://localhost:5005 client-side fetch in
 * data-table.tsx — that broke in production (CORS + unreachable host)
 * and in Docker (port not exposed to host).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPythonBackendUrl } from '@/lib/python-backend';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!(session?.user as any)?.companyId) {
        return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
    }

    try {
        const body = await request.text();
        const upstream = await fetch(`${getPythonBackendUrl()}/download-excel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            signal: AbortSignal.timeout(60_000),
        });

        if (!upstream.ok) {
            return NextResponse.json({ error: 'Download fallito' }, { status: upstream.status });
        }

        const blob = await upstream.blob();
        return new NextResponse(blob, {
            status: 200,
            headers: {
                'Content-Type': upstream.headers.get('content-type') || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': upstream.headers.get('content-disposition') || 'attachment; filename="export.xlsx"',
            },
        });
    } catch (e: any) {
        console.error('[download-excel] Proxy error:', e.message);
        return NextResponse.json({ error: 'Errore proxy' }, { status: 500 });
    }
}
