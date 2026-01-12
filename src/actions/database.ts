'use server';

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

async function getSession() {
    return await getServerSession(authOptions);
}

/**
 * Get list of all tables in the database
 */
export async function getTablesAction(): Promise<{ tables?: { name: string; count: number }[]; error?: string }> {
    const session = await getSession();
    if (!session?.user) {
        return { error: "Non autorizzato" };
    }

    try {
        // Get table names from Prisma metadata
        const tableNames = Object.keys((db as any)._runtimeDataModel?.models || {});

        // Get row counts for each table
        const tables = await Promise.all(
            tableNames.map(async (name) => {
                try {
                    const modelName = name.charAt(0).toLowerCase() + name.slice(1);
                    const model = (db as any)[modelName];
                    if (model && typeof model.count === 'function') {
                        const count = await model.count();
                        return { name, count };
                    }
                    return { name, count: 0 };
                } catch {
                    return { name, count: 0 };
                }
            })
        );

        return { tables: tables.sort((a, b) => a.name.localeCompare(b.name)) };
    } catch (error) {
        console.error("Failed to get tables:", error);
        return { error: "Impossibile caricare le tabelle" };
    }
}

/**
 * Get schema/columns for a specific table
 */
export async function getTableSchemaAction(tableName: string): Promise<{ columns?: { name: string; type: string; isRelation?: boolean }[]; error?: string }> {
    const session = await getSession();
    if (!session?.user) {
        return { error: "Non autorizzato" };
    }

    try {
        const models = (db as any)._runtimeDataModel?.models || {};
        const model = models[tableName];

        if (!model) {
            return { error: "Tabella non trovata" };
        }

        // Prisma runtime model fields can be either an object or an array
        let columns: { name: string; type: string; isRelation?: boolean }[] = [];

        if (Array.isArray(model.fields)) {
            // Fields is an array
            columns = model.fields.map((field: any) => ({
                name: field.name,
                type: field.type || 'unknown',
                isRelation: field.relationName !== undefined || field.kind === 'object'
            }));
        } else if (typeof model.fields === 'object') {
            // Fields is an object
            columns = Object.entries(model.fields).map(([name, field]: [string, any]) => ({
                name: field.name || name,
                type: field.type || 'unknown',
                isRelation: field.relationName !== undefined || field.kind === 'object'
            }));
        }

        return { columns };
    } catch (error) {
        console.error("Failed to get table schema:", error);
        return { error: "Impossibile caricare lo schema" };
    }
}

/**
 * Get data from a specific table with pagination
 */
export async function getTableDataAction(
    tableName: string,
    page: number = 1,
    pageSize: number = 50
): Promise<{ data?: any[]; total?: number; error?: string }> {
    const session = await getSession();
    if (!session?.user) {
        return { error: "Non autorizzato" };
    }

    try {
        const modelName = tableName.charAt(0).toLowerCase() + tableName.slice(1);
        const model = (db as any)[modelName];

        if (!model || typeof model.findMany !== 'function') {
            return { error: "Tabella non trovata" };
        }

        const [data, total] = await Promise.all([
            model.findMany({
                skip: (page - 1) * pageSize,
                take: pageSize,
                orderBy: { id: 'desc' }
            }),
            model.count()
        ]);

        // Serialize data (handle dates, etc.)
        const serializedData = JSON.parse(JSON.stringify(data));

        return { data: serializedData, total };
    } catch (error: any) {
        console.error("Failed to get table data:", error);
        // Handle case where table doesn't have 'id' field for ordering
        if (error.code === 'P2009' || error.message?.includes('orderBy')) {
            try {
                const modelName = tableName.charAt(0).toLowerCase() + tableName.slice(1);
                const model = (db as any)[modelName];

                const [data, total] = await Promise.all([
                    model.findMany({
                        skip: (page - 1) * pageSize,
                        take: pageSize
                    }),
                    model.count()
                ]);

                const serializedData = JSON.parse(JSON.stringify(data));
                return { data: serializedData, total };
            } catch (retryError) {
                return { error: "Impossibile caricare i dati" };
            }
        }
        return { error: "Impossibile caricare i dati" };
    }
}
