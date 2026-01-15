"use server";

import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const CONTAINER_NAME = "rulesage-db";
const DB_USER = "postgres";
const DB_NAME = "rulesagedb";

/**
 * Creates a database backup and returns the SQL dump as a string
 */
export async function backupDatabaseAction(): Promise<{ sql?: string; error?: string }> {
    try {
        console.log("[BACKUP] Starting database backup...");

        const { stdout, stderr } = await execAsync(
            `docker exec ${CONTAINER_NAME} pg_dump -U ${DB_USER} ${DB_NAME}`
        );

        if (stderr && !stderr.includes("warning")) {
            console.error("[BACKUP] Error:", stderr);
            return { error: stderr };
        }

        console.log(`[BACKUP] Success! Backup size: ${stdout.length} bytes`);
        return { sql: stdout };

    } catch (error: any) {
        console.error("[BACKUP] Exception:", error);
        return { error: error.message || "Backup failed" };
    }
}

/**
 * Restores the database from an SQL dump string
 */
export async function restoreDatabaseAction(sql: string): Promise<{ success?: boolean; error?: string }> {
    try {
        console.log("[RESTORE] Starting database restore...");
        console.log(`[RESTORE] SQL size: ${sql.length} bytes`);

        // First, drop and recreate all tables to ensure clean restore
        // We'll use a transaction-safe approach by piping the SQL directly

        // Write SQL to a temp file in the container, then execute it
        const escapedSql = sql.replace(/'/g, "'\\''"); // Escape single quotes for shell

        // Use echo and pipe approach (simpler for Next.js server action)
        const { stdout, stderr } = await execAsync(
            `echo '${escapedSql}' | docker exec -i ${CONTAINER_NAME} psql -U ${DB_USER} ${DB_NAME}`,
            { maxBuffer: 50 * 1024 * 1024 } // 50MB buffer for large databases
        );

        if (stderr && stderr.includes("ERROR")) {
            console.error("[RESTORE] Error:", stderr);
            return { error: stderr };
        }

        console.log("[RESTORE] Success!");
        return { success: true };

    } catch (error: any) {
        console.error("[RESTORE] Exception:", error);
        return { error: error.message || "Restore failed" };
    }
}
