'use server';

import { db } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { getAuthenticatedUser } from '@/lib/session';

export async function deleteTreeAction(id: string): Promise<{ success: boolean, error: string | null }> {
    try {
        const user = await getAuthenticatedUser();
        if (!user) {
            return { success: false, error: 'Non autorizzato' };
        }

        // Verify ownership
        const tree = await db.tree.findUnique({
            where: { id, companyId: user.companyId }
        });

        if (!tree) {
            return { success: false, error: 'Albero non trovato o non autorizzato.' };
        }

        await db.tree.delete({ where: { id } });

        // Clean up preview cache (Parquet files + DB entries)
        try {
            const { deleteTreePreviewCache } = await import('@/lib/preview-cache');
            await deleteTreePreviewCache(id);
        } catch { /* non-critical */ }

        revalidatePath('/');
        revalidatePath('/pipeline');

        return { success: true, error: null };
    } catch (e) {
        const error = e instanceof Error ? e.message : "Si è verificato un errore imprevisto durante l'eliminazione.";
        console.error("Error in deleteTreeAction: ", e);
        return { success: false, error };
    }
}

export interface NodeSearchMatch {
    nodeId: string | null;
    label: string; // question / sqlResultName / pythonResultName / decision
    type: 'sql' | 'python' | 'mixed' | 'question' | 'decision';
}

export interface TreeNodeSearchResult {
    id: string;
    name: string;
    description: string;
    type: string;
    createdAt: string;
    matchingNodes: NodeSearchMatch[];
}

function collectMatchingNodes(node: any, query: string, results: NodeSearchMatch[] = []): NodeSearchMatch[] {
    if (!node || typeof node === 'string') return results;
    if (node.ref || node.subTreeRef) return results;

    const q = query.toLowerCase();
    const fields = [
        node.question,
        node.sqlResultName,
        node.pythonResultName,
        node.decision,
    ];
    if (fields.some(f => typeof f === 'string' && f.toLowerCase().includes(q))) {
        const label = node.sqlResultName || node.pythonResultName || node.question || node.decision || '';
        const type: NodeSearchMatch['type'] =
            node.sqlQuery && node.pythonCode ? 'mixed'
            : node.sqlQuery ? 'sql'
            : node.pythonCode ? 'python'
            : node.question ? 'question'
            : 'decision';
        // Avoid duplicates
        if (!results.some(r => r.nodeId === (node.id ?? null) && r.label === label)) {
            results.push({ nodeId: node.id ?? null, label, type });
        }
    }

    if (node.options) {
        for (const child of Object.values(node.options)) {
            if (Array.isArray(child)) {
                for (const c of child) collectMatchingNodes(c, query, results);
            } else {
                collectMatchingNodes(child, query, results);
            }
        }
    }
    return results;
}

export async function searchTreesByNodeContentAction(query: string): Promise<{ data: TreeNodeSearchResult[] | null; error: string | null }> {
    try {
        const user = await getAuthenticatedUser();
        if (!user) return { data: null, error: 'Non autorizzato' };
        if (!query.trim()) return { data: [], error: null };

        const trees = await db.tree.findMany({
            where: {
                companyId: user.companyId,
                jsonDecisionTree: { contains: query, mode: 'insensitive' },
            },
            select: { id: true, name: true, description: true, type: true, createdAt: true, jsonDecisionTree: true },
        });

        const results: TreeNodeSearchResult[] = trees.map(t => {
            let matchingNodes: NodeSearchMatch[] = [];
            try {
                const parsed = JSON.parse(t.jsonDecisionTree);
                matchingNodes = collectMatchingNodes(parsed, query);
            } catch { /* ignore parse errors */ }
            return {
                id: t.id,
                name: t.name,
                description: t.description,
                type: t.type,
                createdAt: t.createdAt.toISOString(),
                matchingNodes,
            };
        });

        return { data: results, error: null };
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Errore nella ricerca';
        return { data: null, error };
    }
}

export async function deleteAllTreesAction(): Promise<{ success: boolean, error: string | null }> {
    try {
        const user = await getAuthenticatedUser();
        if (!user) {
            return { success: false, error: 'Non autorizzato' };
        }

        await db.tree.deleteMany({
            where: { companyId: user.companyId }
        });

        revalidatePath('/');
        revalidatePath('/pipeline');

        return { success: true, error: null };
    } catch (e) {
        const error = e instanceof Error ? e.message : "Si è verificato un errore imprevisto durante l'eliminazione di massa.";
        console.error("Error in deleteAllTreesAction: ", e);
        return { success: false, error };
    }
}
