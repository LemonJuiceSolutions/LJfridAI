/**
 * Internal API route for pipeline SQL execution.
 * Replaces Server Action calls to avoid the ~10MB response size limit
 * imposed by the React Flight protocol on Server Actions.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { executeSqlPreviewAction } from '@/app/actions';

export const maxDuration = 300; // 5 minutes

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { query, connectorId, dependencies } = body;

        if (!query) {
            return NextResponse.json({ data: null, error: 'Missing query' }, { status: 400 });
        }

        const result = await executeSqlPreviewAction(query, connectorId || '', dependencies || []);

        return NextResponse.json(result);
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Internal server error';
        console.error('[api/internal/execute-sql] Error:', e);
        return NextResponse.json({ data: null, error }, { status: 500 });
    }
}
