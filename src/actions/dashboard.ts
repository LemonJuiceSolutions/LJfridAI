'use server';

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

async function getSession() {
    return await getServerSession(authOptions);
}

export async function getPageLayout(pageId: string) {
    const session = await getSession();
    if (!session?.user?.email) return null;

    try {
        const user = await db.user.findUnique({
            where: { email: session.user.email },
            include: { company: true }
        });

        if (!user?.companyId) return null;

        const layout = await db.pageLayout.findUnique({
            where: {
                companyId_pageId_userId: {
                    companyId: user.companyId,
                    pageId,
                    userId: user.id
                }
            }
        });

        return layout;
    } catch (error) {
        console.error(`Error fetching layout for ${pageId}:`, error);
        return null;
    }
}

export async function savePageLayout(pageId: string, layouts: any, items: any) {
    const session = await getSession();
    if (!session?.user?.email) return { success: false, error: "Unauthorized" };

    try {
        const user = await db.user.findUnique({
            where: { email: session.user.email },
            include: { company: true }
        });

        if (!user?.companyId) return { success: false, error: "User or company not found" };

        await db.pageLayout.upsert({
            where: {
                companyId_pageId_userId: {
                    companyId: user.companyId,
                    pageId,
                    userId: user.id
                }
            },
            update: {
                layouts,
                items,
                updatedAt: new Date()
            },
            create: {
                companyId: user.companyId,
                pageId,
                userId: user.id,
                layouts,
                items
            }
        });

        revalidatePath('/dashboard');
        return { success: true };
    } catch (error) {
        console.error(`Error saving layout for ${pageId}:`, error);
        return { success: false, error: "Failed to save layout" };
    }
}
