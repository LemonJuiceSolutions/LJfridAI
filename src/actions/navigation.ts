'use server';

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

// Type definitions matching the hook's expectation, but adapted for DB
export type NavigationItem = {
    id: string;
    label: string;
    href: string;
    icon: string;
    group: 'main' | 'settings';
    order: number;
    requiredPermission?: string | null;
};

async function getSession() {
    return await getServerSession(authOptions);
}

export async function getNavigationItems() {
    const session = await getSession();
    if (!session?.user || !(session.user as any).companyId) {
        return { main: [], settings: [] };
    }

    const companyId = (session.user as any).companyId;

    try {
        const items = await db.navigationItem.findMany({
            where: { companyId },
            orderBy: { order: 'asc' }
        });

        return {
            main: items.filter((i: any) => i.group === 'main'),
            settings: items.filter((i: any) => i.group === 'settings')
        };
    } catch (error) {
        console.error("Failed to fetch navigation items:", error);
        // Return empty arrays so the client-side fallback can take over
        return { main: [], settings: [] };
    }
}

export async function addNavItem(group: 'main' | 'settings', item: { label: string; href: string; icon: string; order?: number }) {
    const session = await getSession();
    if (!session?.user || !(session.user as any).companyId) {
        throw new Error("Unauthorized");
    }

    const companyId = (session.user as any).companyId;

    // Determine order if not provided
    let order = item.order;
    if (order === undefined) {
        const lastItem = await db.navigationItem.findFirst({
            where: { companyId, group },
            orderBy: { order: 'desc' }
        });
        order = (lastItem?.order ?? -1) + 1;
    }

    await db.navigationItem.create({
        data: {
            label: item.label,
            href: item.href,
            icon: item.icon,
            group,
            order,
            companyId
        }
    });

    revalidatePath('/settings/navigation');
    revalidatePath('/');
}

export async function updateNavItem(group: 'main' | 'settings', originalHref: string, item: { label: string; href: string; icon: string }) {
    const session = await getSession();
    if (!session?.user || !(session.user as any).companyId) {
        throw new Error("Unauthorized");
    }
    const companyId = (session.user as any).companyId;

    // Find the item by originalHref and companyId
    // Note: This relies on href being unique per group/company, or we need ID.
    // The previous hook used href as ID. We should transition to using DB IDs.
    // But for now, let's find it.

    const existingItem = await db.navigationItem.findFirst({
        where: { companyId, group, href: originalHref }
    });

    if (!existingItem) {
        throw new Error("Item not found");
    }

    await db.navigationItem.update({
        where: { id: existingItem.id },
        data: {
            label: item.label,
            href: item.href,
            icon: item.icon
        }
    });

    revalidatePath('/settings/navigation');
    revalidatePath('/');
}

export async function removeNavItem(group: 'main' | 'settings', href: string) {
    const session = await getSession();
    if (!session?.user || !(session.user as any).companyId) {
        throw new Error("Unauthorized");
    }
    const companyId = (session.user as any).companyId;

    const existingItem = await db.navigationItem.findFirst({
        where: { companyId, group, href }
    });

    if (existingItem) {
        await db.navigationItem.delete({
            where: { id: existingItem.id }
        });
    }

    revalidatePath('/settings/navigation');
    revalidatePath('/');
}

export async function restoreDefaults() {
    // Logic to restore defaults, potentially reading from a seed or constant
    // For now, doing nothing or simple clear
    // TODO: Implement default seeding if needed
}
