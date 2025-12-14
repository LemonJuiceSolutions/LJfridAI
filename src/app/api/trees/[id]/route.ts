import { NextRequest, NextResponse } from 'next/server';
import { getTreeAction, deleteTreeAction } from '@/app/actions';

/**
 * GET /api/trees/:id - Get a specific tree by ID
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        if (!id) {
            return NextResponse.json(
                { success: false, error: 'ID albero richiesto' },
                { status: 400 }
            );
        }

        const result = await getTreeAction(id);

        if (result.error) {
            return NextResponse.json(
                { success: false, error: result.error },
                { status: result.error.includes('non trovato') ? 404 : 500 }
            );
        }

        return NextResponse.json({
            success: true,
            tree: result.data
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Errore interno del server';
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}

/**
 * DELETE /api/trees/:id - Delete a tree by ID
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        if (!id) {
            return NextResponse.json(
                { success: false, error: 'ID albero richiesto' },
                { status: 400 }
            );
        }

        const result = await deleteTreeAction(id);

        if (!result.success) {
            return NextResponse.json(
                { success: false, error: result.error },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true, message: 'Albero eliminato con successo' });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Errore interno del server';
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
