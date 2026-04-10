/**
 * Internal API to fetch the current script for a node.
 * Used by the agent chat frontend as a fallback when editScript
 * updates the DB directly (via MCP) but the stream doesn't
 * carry the updated script back to the client.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
    const nodeId = req.nextUrl.searchParams.get('nodeId');
    const treeId = req.nextUrl.searchParams.get('treeId');
    if (!nodeId) return NextResponse.json({ error: 'nodeId required' }, { status: 400 });

    // Try AgentConversation first (most up-to-date after editScript)
    const conv = await db.agentConversation.findFirst({
        where: { nodeId },
        orderBy: { updatedAt: 'desc' },
        select: { script: true },
    });

    if (conv?.script) {
        return NextResponse.json({ script: conv.script });
    }

    // Fallback: check tree JSON directly (editScript saves here too)
    if (treeId) {
        try {
            const tree = await db.tree.findUnique({ where: { id: treeId }, select: { jsonDecisionTree: true } });
            if (tree) {
                const json = JSON.parse(tree.jsonDecisionTree);
                const _ = await import('lodash');
                const node = _.default.get(json, nodeId.replace('root.', ''));
                if (node?.pythonCode) {
                    return NextResponse.json({ script: node.pythonCode });
                }
            }
        } catch (err) {
            console.warn('[node-script] Error reading tree JSON:', err);
        }
    }

    return NextResponse.json({ script: null });
}
