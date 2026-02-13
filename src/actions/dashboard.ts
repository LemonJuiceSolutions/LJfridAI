'use server';

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// Cache user lookup to avoid repeated DB queries within the same request
async function getAuthenticatedUser() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return null;

    const user = await db.user.findUnique({
        where: { email: session.user.email },
        select: { id: true, companyId: true }
    });

    if (!user?.companyId) return null;
    return user;
}

export async function getPageLayout(pageId: string) {
    try {
        const user = await getAuthenticatedUser();
        if (!user) return null;

        const layout = await db.pageLayout.findUnique({
            where: {
                companyId_pageId_userId: {
                    companyId: user.companyId!,
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
    try {
        const user = await getAuthenticatedUser();
        if (!user) return { success: false, error: "Unauthorized" };

        await db.pageLayout.upsert({
            where: {
                companyId_pageId_userId: {
                    companyId: user.companyId!,
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
                companyId: user.companyId!,
                pageId,
                userId: user.id,
                layouts,
                items
            }
        });

        // Removed revalidatePath('/dashboard') - it was causing unnecessary
        // full page re-renders on every layout save. The client already has
        // the latest state since it just sent the update.
        return { success: true };
    } catch (error) {
        console.error(`Error saving layout for ${pageId}:`, error);
        return { success: false, error: "Failed to save layout" };
    }
}
