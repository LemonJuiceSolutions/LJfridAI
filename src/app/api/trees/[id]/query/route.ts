import { NextRequest, NextResponse } from 'next/server';
import { diagnoseProblemAction } from '@/app/actions';

/**
 * POST /api/trees/:id/query - Query a tree with DetAI
 * Body: { 
 *   question: string,
 *   history?: string,
 *   currentAnswer?: string,
 *   openRouterApiKey?: string,
 *   openRouterModel?: string
 * }
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const { question, history, currentAnswer, openRouterApiKey, openRouterModel } = body;

        if (!id) {
            return NextResponse.json(
                { success: false, error: 'ID albero richiesto' },
                { status: 400 }
            );
        }

        if (!question || typeof question !== 'string') {
            return NextResponse.json(
                { success: false, error: 'Il campo "question" è obbligatorio' },
                { status: 400 }
            );
        }

        // Build OpenRouter config if provided
        const openRouterConfig = openRouterApiKey
            ? { apiKey: openRouterApiKey, model: openRouterModel || 'google/gemini-2.0-flash-001' }
            : undefined;

        const result = await diagnoseProblemAction(
            {
                id: id, // Pass the tree ID as context ID
                userState: {}, // Default empty state
                userProblem: question,
                history: history || '',
                currentAnswer: currentAnswer || '',
                specificTreeId: id
            },
            openRouterConfig
        );


        if (result.error) {
            return NextResponse.json({ success: false, error: result.error }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            diagnosis: {
                question: result.data?.question,
                options: result.data?.options,
                isFinalDecision: result.data?.isFinalDecision,
                treeName: result.data?.treeName,
                nodeIds: result.data?.nodeIds,
                media: result.data?.media,
                links: result.data?.links,
                triggers: result.data?.triggers
            }
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Errore interno del server';
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
