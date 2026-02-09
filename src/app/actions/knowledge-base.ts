'use server';

import { db } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/session';

export async function getKnowledgeBaseEntriesAction(
    search?: string,
    category?: string
): Promise<{ data: any[] | null; error: string | null }> {
    const user = await getAuthenticatedUser();
    if (!user?.companyId) return { data: null, error: 'Non autorizzato' };

    try {
        const where: any = { companyId: user.companyId };

        if (search) {
            const term = search.toLowerCase();
            where.OR = [
                { question: { contains: term, mode: 'insensitive' } },
                { answer: { contains: term, mode: 'insensitive' } },
                { tags: { hasSome: [term] } },
            ];
        }

        if (category) {
            where.category = category;
        }

        const entries = await db.knowledgeBaseEntry.findMany({
            where,
            orderBy: { updatedAt: 'desc' },
            take: 100,
        });

        return { data: entries, error: null };
    } catch (e: any) {
        return { data: null, error: e.message };
    }
}

export async function createKnowledgeBaseEntryAction(data: {
    question: string;
    answer: string;
    tags: string[];
    category?: string;
    context?: string;
}): Promise<{ data: any | null; error: string | null }> {
    const user = await getAuthenticatedUser();
    if (!user?.companyId) return { data: null, error: 'Non autorizzato' };

    try {
        const entry = await db.knowledgeBaseEntry.create({
            data: {
                question: data.question,
                answer: data.answer,
                tags: data.tags,
                category: data.category || 'Generale',
                context: data.context,
                companyId: user.companyId,
            },
        });

        return { data: entry, error: null };
    } catch (e: any) {
        return { data: null, error: e.message };
    }
}

export async function updateKnowledgeBaseEntryAction(
    id: string,
    data: {
        question?: string;
        answer?: string;
        tags?: string[];
        category?: string;
        context?: string;
    }
): Promise<{ data: any | null; error: string | null }> {
    const user = await getAuthenticatedUser();
    if (!user?.companyId) return { data: null, error: 'Non autorizzato' };

    try {
        // Verify ownership
        const existing = await db.knowledgeBaseEntry.findUnique({ where: { id } });
        if (!existing || existing.companyId !== user.companyId) {
            return { data: null, error: 'Entry non trovata' };
        }

        const entry = await db.knowledgeBaseEntry.update({
            where: { id },
            data,
        });

        return { data: entry, error: null };
    } catch (e: any) {
        return { data: null, error: e.message };
    }
}

export async function deleteKnowledgeBaseEntryAction(
    id: string
): Promise<{ success: boolean; error: string | null }> {
    const user = await getAuthenticatedUser();
    if (!user?.companyId) return { success: false, error: 'Non autorizzato' };

    try {
        const existing = await db.knowledgeBaseEntry.findUnique({ where: { id } });
        if (!existing || existing.companyId !== user.companyId) {
            return { success: false, error: 'Entry non trovata' };
        }

        await db.knowledgeBaseEntry.delete({ where: { id } });
        return { success: true, error: null };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function getKnowledgeBaseCategoriesAction(): Promise<{ data: string[] | null; error: string | null }> {
    const user = await getAuthenticatedUser();
    if (!user?.companyId) return { data: null, error: 'Non autorizzato' };

    try {
        const entries = await db.knowledgeBaseEntry.findMany({
            where: { companyId: user.companyId },
            select: { category: true },
            distinct: ['category'],
        });

        const categories = entries
            .map(e => e.category)
            .filter((c): c is string => c !== null);

        return { data: categories, error: null };
    } catch (e: any) {
        return { data: null, error: e.message };
    }
}
