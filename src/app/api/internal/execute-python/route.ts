/**
 * Internal API route for pipeline Python execution.
 * Replaces Server Action calls to avoid the ~10MB response size limit
 * imposed by the React Flight protocol on Server Actions.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { executePythonPreviewAction } from '@/app/actions';

export const maxDuration = 300; // 5 minutes

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
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
