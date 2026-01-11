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
    if (!session?.user || !(session.user as any).companyId) {
        return null;
    }

    const companyId = (session.user as any).companyId;
    const userId = (session.user as any).id;

    try {
        const layout = await db.pageLayout.findFirst({
            where: {
                companyId,
                pageId,
                userId
            }
        });

        if (!layout) return null;

        return {
            layouts: layout.layouts,
            items: layout.items
        };
    } catch (error) {
        console.error("Failed to load page layout:", error);
        return null;
    }
}

export async function savePageLayout(pageId: string, layouts: any, items: any) {
    const session = await getSession();
    if (!session?.user || !(session.user as any).companyId) {
        throw new Error("Unauthorized");
    }

    const companyId = (session.user as any).companyId;
    const userId = (session.user as any).id;

    // specific restriction: prevent overwriting if not allowed?
    // for now, allow user to save their own layout.

    try {
        await db.pageLayout.upsert({
            where: {
                companyId_pageId_userId: {
                    companyId,
                    pageId,
                    userId
                }
            },
            create: {
                companyId,
                userId,
                pageId,
                layouts: layouts || {},
                items: items || []
            },
            update: {
                layouts: layouts || {},
                items: items || []
            }
        });

        revalidatePath(`/${pageId}`);
    } catch (error) {
        console.error("Failed to save page layout:", error);
        // We can throw or return an error object. Returning ensures client doesn't crash.
        throw new Error("Failed to save layout");
    }
}
