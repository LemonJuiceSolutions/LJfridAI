'use server';

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

async function getSession() {
    return await getServerSession(authOptions);
}

export async function getConnections() {
    const session = await getSession();
    if (!session?.user || !(session.user as any).companyId) {
        return [];
    }

    const companyId = (session.user as any).companyId;

    try {
        return await db.connection.findMany({
            where: { companyId },
            orderBy: { updatedAt: 'desc' }
        });
    } catch (error) {
        console.error("Failed to fetch connections:", error);
        return [];
    }
}

export async function saveConnection(connection: any) {
    const session = await getSession();
    if (!session?.user || !(session.user as any).companyId) {
        throw new Error("Unauthorized");
    }

    const companyId = (session.user as any).companyId;

    try {
        if (connection.id) {
            const existing = await db.connection.findUnique({ where: { id: connection.id } });

            if (existing) {
                await db.connection.update({
                    where: { id: connection.id },
                    data: {
                        name: connection.name,
                        type: connection.type,
                        config: connection.config,
                        updatedAt: new Date()
                    }
                });
            } else {
                await db.connection.create({
                    data: {
                        id: connection.id,
                        name: connection.name,
                        type: connection.type,
                        config: connection.config,
                        companyId
                    }
                });
            }
        } else {
            await db.connection.create({
                data: {
                    name: connection.name,
                    type: connection.type,
                    config: connection.config,
                    companyId
                }
            });
        }
        revalidatePath('/settings');
    } catch (error) {
        console.error("Failed to save connection:", error);
        throw new Error("Failed to save connection");
    }
}

export async function deleteConnection(id: string) {
    const session = await getSession();
    if (!session?.user || !(session.user as any).companyId) {
        throw new Error("Unauthorized");
    }
    const companyId = (session.user as any).companyId;

    try {
        const existing = await db.connection.findFirst({ where: { id, companyId } });
        if (!existing) throw new Error("Not found or unauthorized");

        await db.connection.delete({ where: { id } });
        revalidatePath('/settings');
    } catch (error) {
        console.error("Failed to delete connection:", error);
        throw new Error("Failed to delete connection");
    }
}
