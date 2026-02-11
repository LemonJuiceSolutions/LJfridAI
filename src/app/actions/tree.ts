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

        revalidatePath('/');
        revalidatePath('/pipeline');

        return { success: true, error: null };
    } catch (e) {
        const error = e instanceof Error ? e.message : "Si è verificato un errore imprevisto durante l'eliminazione.";
        console.error("Error in deleteTreeAction: ", e);
        return { success: false, error };
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
