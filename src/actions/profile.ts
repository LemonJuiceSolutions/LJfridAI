"use server";

import { db } from "@/lib/db";
import { getAuthenticatedUser } from "@/app/actions";
import { revalidatePath } from "next/cache";

export async function getProfileAction() {
    const user = await getAuthenticatedUser();
    if (!user) return { error: "Non autorizzato" };

    const userInfo = await db.user.findUnique({
        where: { id: user.id },
        select: {
            id: true,
            name: true,
            email: true,
            companyId: true,
            role: true,
            company: {
                select: { name: true }
            }
        }
    });

    return { data: userInfo };
}

export async function updateProfileAction(data: { name: string; email: string; companyId?: string }) {
    const user = await getAuthenticatedUser();
    if (!user) return { error: "Non autorizzato" };

    try {
        await db.user.update({
            where: { id: user.id },
            data: {
                name: data.name,
                email: data.email,
                companyId: data.companyId || null
            }
        });

        revalidatePath('/settings/profile');
        return { success: true };
    } catch (e: any) {
        return { error: `Errore aggiornamento profilo: ${e.message}` };
    }
}

export async function getCompaniesAction() {
    const user = await getAuthenticatedUser();
    if (!user) return { error: "Non autorizzato" };

    const companies = await db.company.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true }
    });

    return { data: companies };
}

export async function createCompanyAction(name: string) {
    const user = await getAuthenticatedUser();
    if (!user) return { error: "Non autorizzato" };

    try {
        const company = await db.company.create({
            data: { name }
        });
        return { data: company };
    } catch (e: any) {
        return { error: `Errore creazione azienda: ${e.message}` };
    }
}
