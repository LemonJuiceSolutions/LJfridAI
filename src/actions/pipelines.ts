'use server';

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

async function getSession() {
    return await getServerSession(authOptions);
}

export async function getPipelines() {
    const session = await getSession();
    if (!session?.user || !(session.user as any).companyId) {
        return [];
    }

    const companyId = (session.user as any).companyId;

    try {
        return await db.pipeline.findMany({
            where: { companyId },
            orderBy: { updatedAt: 'desc' }
        });
    } catch (error) {
        console.error("Failed to fetch pipelines:", error);
        return [];
    }
}

export async function savePipeline(pipeline: any) {
    const session = await getSession();
    if (!session?.user || !(session.user as any).companyId) {
        throw new Error("Unauthorized");
    }

    const companyId = (session.user as any).companyId;

    try {
        if (pipeline.id && !pipeline.id.startsWith('pipe_')) {
            const existing = await db.pipeline.findUnique({ where: { id: pipeline.id } });

            if (existing) {
                await db.pipeline.update({
                    where: { id: pipeline.id },
                    data: {
                        name: pipeline.name,
                        description: pipeline.description,
                        nodes: pipeline.nodes,
                        edges: pipeline.edges,
                        updatedAt: new Date()
                    }
                });
            } else {
                await db.pipeline.create({
                    data: {
                        id: pipeline.id,
                        name: pipeline.name,
                        description: pipeline.description,
                        nodes: pipeline.nodes,
                        edges: pipeline.edges,
                        companyId
                    }
                });
            }
        } else {
            await db.pipeline.create({
                data: {
                    name: pipeline.name,
                    description: pipeline.description,
                    nodes: pipeline.nodes,
                    edges: pipeline.edges,
                    companyId
                }
            });
        }
        revalidatePath('/pipelines');
    } catch (error) {
        console.error("Failed to save pipeline:", error);
        throw new Error("Failed to save pipeline");
    }
}

export async function deletePipeline(id: string) {
    const session = await getSession();
    if (!session?.user || !(session.user as any).companyId) {
        throw new Error("Unauthorized");
    }
    const companyId = (session.user as any).companyId;

    try {
        const existing = await db.pipeline.findFirst({ where: { id, companyId } });
        if (!existing) throw new Error("Not found or unauthorized");

        await db.pipeline.delete({ where: { id } });
        revalidatePath('/pipelines');
    } catch (error) {
        console.error("Failed to delete pipeline:", error);
        throw new Error("Failed to delete pipeline");
    }
}
