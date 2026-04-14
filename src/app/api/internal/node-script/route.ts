/**
 * Internal API to fetch the current script for a node.
 * Used by the agent chat frontend as a fallback when editScript
 * updates the DB directly (via MCP) but the stream doesn't
 * carry the updated script back to the client.
 *
 * Priority: tree JSON (ground truth, always updated by editScript)
 *           > AgentConversation (may be stale)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const companyId = (session.user as any).companyId;
    if (!companyId) {
        return NextResponse.json({ error: 'No company context' }, { status: 403 });
    }

    const nodeId = req.nextUrl.searchParams.get('nodeId');
    const treeId = req.nextUrl.searchParams.get('treeId');
    if (!nodeId) return NextResponse.json({ error: 'nodeId required' }, { status: 400 });

    // 1. Try tree JSON first (ground truth — editScript always updates this)
    if (treeId) {
        try {
            const tree = await db.tree.findFirst({
                where: { id: treeId, companyId },
                select: { jsonDecisionTree: true },
            });
            if (tree) {
                const json = JSON.parse(tree.jsonDecisionTree);
                const _ = await import('lodash');
                const node = _.default.get(json, nodeId.replace('root.', ''));
                if (node?.pythonCode) {
                    return NextResponse.json({ script: node.pythonCode, source: 'tree' });
                }
            }
        } catch (err) {
            console.warn('[node-script] Error reading tree JSON:', err);
        }
    }

    // 2. If no treeId provided, search this company's trees for this nodeId
    if (!treeId) {
        try {
            const trees = await db.tree.findMany({
                where: { companyId },
                select: { id: true, jsonDecisionTree: true },
                take: 30,
            });
            const _ = await import('lodash');
            const nodePath = nodeId.replace('root.', '');
            for (const tree of trees) {
                try {
                    const json = JSON.parse(tree.jsonDecisionTree);
                    const node = _.default.get(json, nodePath);
                    if (node?.pythonCode) {
                        return NextResponse.json({ script: node.pythonCode, source: 'tree-scan' });
                    }
                } catch { /* skip malformed JSON */ }
            }
        } catch (err) {
            console.warn('[node-script] Error scanning trees:', err);
        }
    }

    // 3. Fallback to AgentConversation
    const conv = await db.agentConversation.findFirst({
        where: { nodeId, companyId },
        orderBy: { updatedAt: 'desc' },
        select: { script: true },
    });

    if (conv?.script) {
        return NextResponse.json({ script: conv.script, source: 'conversation' });
    }

    return NextResponse.json({ script: null });
}
