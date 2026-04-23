'use server'

import { db } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/session';

interface BackupData {
    version: string;
    exportDate: string;
    connectors: Array<{
        name: string;
        type: string;
        config: any;
    }>;
}

export async function exportSettingsAction() {
    const sessionUser = await getAuthenticatedUser();
    if (!sessionUser) return { error: 'Non autorizzato' };

    const user = await db.user.findUnique({ where: { id: sessionUser.id } });
    if (!user || !user.companyId) return { error: 'Utente non associato a nessuna azienda' };

    try {
        // Get all connectors for the company
        const connectors = await db.connector.findMany({
            where: { companyId: user.companyId },
            select: {
                name: true,
                type: true,
                config: true
            }
        });

        // Redact sensitive fields from connector configs before export
        const REDACTED = '****';
        const SENSITIVE_KEYS = ['password', 'pwd', 'secret', 'apiKey', 'api_key', 'token', 'connectionString'];
        function redactConfig(config: Record<string, any>): Record<string, any> {
            const redacted: Record<string, any> = {};
            for (const [key, value] of Object.entries(config)) {
                if (SENSITIVE_KEYS.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
                    redacted[key] = REDACTED;
                } else {
                    redacted[key] = value;
                }
            }
            return redacted;
        }

        const backupData: BackupData = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            connectors: connectors.map((c: any) => ({
                name: c.name,
                type: c.type,
                config: redactConfig(JSON.parse(c.config))
            }))
        };

        return {
            success: true,
            data: JSON.stringify(backupData, null, 2)
        };

    } catch (e: any) {
        console.error('Export Settings Error:', e);
        return { error: `Errore durante l'esportazione: ${e.message}` };
    }
}

export async function importSettingsAction(jsonData: string) {
    const sessionUser = await getAuthenticatedUser();
    if (!sessionUser) return { error: 'Non autorizzato' };

    const user = await db.user.findUnique({ where: { id: sessionUser.id } });
    if (!user || !user.companyId) return { error: 'Utente non associato a nessuna azienda' };

    try {
        // Parse and validate JSON
        let backupData: BackupData;
        try {
            backupData = JSON.parse(jsonData);
        } catch {
            return { error: 'File JSON non valido' };
        }

        if (!backupData.version || !backupData.connectors) {
            return { error: 'Formato backup non valido' };
        }

        let imported = 0;
        let skipped = 0;
        const errors: string[] = [];

        // Import connectors
        for (const connector of backupData.connectors) {
            try {
                // Check if connector with same name already exists
                const existing = await db.connector.findFirst({
                    where: {
                        companyId: user.companyId,
                        name: connector.name
                    }
                });

                if (existing) {
                    skipped++;
                    continue;
                }

                // Create new connector
                await db.connector.create({
                    data: {
                        name: connector.name,
                        type: connector.type,
                        config: JSON.stringify(connector.config),
                        companyId: user.companyId
                    }
                });
                imported++;
            } catch (e: any) {
                errors.push(`${connector.name}: ${e.message}`);
            }
        }

        return {
            success: true,
            message: `Importati: ${imported}, Saltati (già esistenti): ${skipped}`,
            errors: errors.length > 0 ? errors : undefined
        };

    } catch (e: any) {
        console.error('Import Settings Error:', e);
        return { error: `Errore durante l'importazione: ${e.message}` };
    }
}
