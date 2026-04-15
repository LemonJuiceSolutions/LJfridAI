import { NextRequest, NextResponse } from 'next/server';
import { processDescriptionAction, getTreesAction } from '@/app/actions';
import { parsePaginationParams, paginateResult } from '@/lib/pagination';

/**
 * GET /api/trees - List all trees (cursor-based pagination)
 * Query params: limit (1-100, default 20), cursor (tree id)
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const { limit, cursor } = parsePaginationParams(searchParams);

        const result = await getTreesAction();

        if (result.error) {
            return NextResponse.json({ success: false, error: result.error }, { status: 500 });
        }

        const allTrees = (result.data?.map(tree => ({
            id: tree.id,
            name: tree.name,
            description: tree.description,
            createdAt: tree.createdAt
        })) || []);

        // Apply cursor: skip items up to and including the cursor
        let startIndex = 0;
        if (cursor) {
            const cursorIndex = allTrees.findIndex(t => t.id === cursor);
            if (cursorIndex !== -1) {
                startIndex = cursorIndex + 1;
            }
        }

        const sliced = allTrees.slice(startIndex, startIndex + limit + 1);
        const paginated = paginateResult(sliced, limit);

        return NextResponse.json({
            success: true,
            ...paginated,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Errore interno del server';
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}

/**
 * POST /api/trees - Create a new tree from description
 * Body: { description: string, openRouterApiKey?: string, openRouterModel?: string }
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { description, openRouterApiKey, openRouterModel } = body;

        if (!description || typeof description !== 'string') {
            return NextResponse.json(
                { success: false, error: 'Il campo "description" è obbligatorio' },
                { status: 400 }
            );
        }

        // Build OpenRouter config if provided
        const openRouterConfig = openRouterApiKey
            ? { apiKey: openRouterApiKey, model: openRouterModel || 'google/gemini-2.0-flash-001' }
            : undefined;

        const result = await processDescriptionAction(description, 'Nuovo Albero AI', 'RULE', openRouterConfig);


        if (result.error) {
            return NextResponse.json({ success: false, error: result.error }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            tree: {
                id: result.data?.id,
                name: result.data?.name,
                description: result.data?.description,
                naturalLanguageDecisionTree: result.data?.naturalLanguageDecisionTree,
                jsonDecisionTree: result.data?.jsonDecisionTree,
                questionsScript: result.data?.questionsScript,
                createdAt: result.data?.createdAt
            }
        }, { status: 201 });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Errore interno del server';
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
