'use server';

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { ChartTheme, resolveTheme } from "@/lib/chart-theme";

async function getCompanyId(): Promise<string | null> {
    const session = await getServerSession(authOptions);
    if (!session?.user) return null;
    const userId = (session.user as any).id;
    if (!userId) return null;

    const user = await db.user.findUnique({
        where: { id: userId },
        select: { companyId: true },
    });
    return user?.companyId || null;
}

export async function getChartThemeAction(): Promise<{
    theme?: ChartTheme;
    error?: string;
}> {
    try {
        const companyId = await getCompanyId();
        if (!companyId) return { error: 'Non autorizzato' };

        const company = await db.company.findUnique({
            where: { id: companyId },
            select: { chartTheme: true },
        });

        return {
            theme: resolveTheme(company?.chartTheme as Partial<ChartTheme> | null),
        };
    } catch (error: any) {
        console.error('Failed to get chart theme:', error);
        return { error: `Impossibile caricare il tema: ${error?.message || String(error)}` };
    }
}

export async function saveChartThemeAction(
    theme: Partial<ChartTheme>
): Promise<{ success: boolean; error?: string }> {
    try {
        const companyId = await getCompanyId();
        if (!companyId) return { success: false, error: 'Non autorizzato' };

        await db.company.update({
            where: { id: companyId },
            data: { chartTheme: theme as any },
        });

        revalidatePath('/settings');
        return { success: true };
    } catch (error: any) {
        console.error('Failed to save chart theme:', error);
        return { success: false, error: `Impossibile salvare il tema: ${error?.message || String(error)}` };
    }
}

export async function resetChartThemeAction(): Promise<{
    success: boolean;
    error?: string;
}> {
    try {
        const companyId = await getCompanyId();
        if (!companyId) return { success: false, error: 'Non autorizzato' };

        await db.company.update({
            where: { id: companyId },
            data: { chartTheme: Prisma.DbNull },
        });

        revalidatePath('/settings');
        return { success: true };
    } catch (error: any) {
        console.error('Failed to reset chart theme:', error);
        return { success: false, error: `Impossibile ripristinare il tema: ${error?.message || String(error)}` };
    }
}
