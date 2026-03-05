/**
 * Internal API endpoint for Python sandbox to execute SQL queries.
 * Called by the injected `query_db()` function inside the Python runtime.
 * Only accepts requests from localhost (Python backend at port 5005).
 */
import { NextRequest, NextResponse } from 'next/server';
import { executeSqlPreviewAction } from '@/app/actions';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { query, connectorId, internalToken } = body;

        // Basic validation
        if (!query || !connectorId) {
            return NextResponse.json(
                { error: 'Missing query or connectorId' },
                { status: 400 }
            );
        }

        // Verify internal token (shared secret between Next.js and Python backend)
        const expectedToken = process.env.INTERNAL_QUERY_TOKEN || 'fridai-internal-query-2024';
        if (internalToken !== expectedToken) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Execute SQL using existing infrastructure (bypasses auth for internal calls)
        const result = await executeSqlPreviewAction(query, connectorId, [], true);

        if (result.error) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        const data = result.data || [];
        return NextResponse.json({
            success: true,
            data,
            columns: data.length > 0 ? Object.keys(data[0]) : [],
            rowCount: data.length,
        });
    } catch (e: any) {
        console.error('[internal/query-db] Error:', e.message);
        return NextResponse.json(
            { error: e.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
