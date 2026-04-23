/**
 * Internal API route for pipeline Python execution.
 * Replaces Server Action calls to avoid the ~10MB response size limit
 * imposed by the React Flight protocol on Server Actions.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { executePythonPreviewAction } from '@/app/actions';
import { rateLimit } from '@/lib/rate-limit';

export const maxDuration = 300; // 5 minutes

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        const sessionUser = session?.user as any;
        if (!sessionUser?.companyId) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        // Rate limit: max 30 Python executions per minute per user
        const rl = await rateLimit(`exec-python:${sessionUser.id}`, 30, 60_000);
        if (!rl.allowed) {
            return NextResponse.json(
                { success: false, error: 'Troppe esecuzioni. Riprova tra poco.' },
                { status: 429 }
            );
        }

        const body = await req.json();
        const { code, outputType, inputData, dependencies, connectorId, selectedDocuments } = body;

        if (!code) {
            return NextResponse.json({ success: false, error: 'Missing code' }, { status: 400 });
        }

        const result = await executePythonPreviewAction(
            code,
            outputType || 'table',
            inputData || {},
            dependencies,
            connectorId,
            undefined,
            selectedDocuments
        );

        return NextResponse.json(result);
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Internal server error';
        console.error('[api/internal/execute-python] Error:', e);
        return NextResponse.json({ success: false, error }, { status: 500 });
    }
}
