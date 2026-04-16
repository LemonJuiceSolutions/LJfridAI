/**
 * Internal API route for saving pipeline preview results.
 * Replaces Server Action calls to avoid the ~10MB body size limit
 * imposed by the React Flight protocol on Server Actions.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { saveAncestorPreviewsBatchAction } from '@/app/actions/scheduler';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!(session?.user as any)?.companyId) {
            return NextResponse.json({ success: false, savedCount: 0 }, { status: 401 });
        }

        const body = await req.json();
        const { treeId, previewBatch } = body;

        if (!treeId || !previewBatch) {
            return NextResponse.json({ success: false, savedCount: 0 }, { status: 400 });
        }

        const result = await saveAncestorPreviewsBatchAction(treeId, previewBatch);

        return NextResponse.json(result);
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Internal server error';
        console.error('[api/internal/save-previews] Error:', e);
        return NextResponse.json({ success: false, savedCount: 0, error }, { status: 500 });
    }
}
