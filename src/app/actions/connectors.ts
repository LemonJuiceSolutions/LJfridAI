'use server'

import { db } from '@/lib/db';
import { getAuthenticatedUser } from '../actions';
import sql from 'mssql';
import nodemailer from 'nodemailer';

export async function getConnectorsAction() {
    const user = await getAuthenticatedUser();
    if (!user) return { error: 'Non autorizzato' };

    try {
        const connectors = await db.connector.findMany({
            where: { companyId: user.companyId },
            orderBy: { createdAt: 'desc' }
        });
        return { data: connectors };
    } catch (e) {
        console.error("Get Connectors Error:", e);
        return { error: 'Errore durante il recupero connettori' };
    }
}

export async function createConnectorAction(data: { name: string, type: string, config: string }) {
    const user = await getAuthenticatedUser();
    if (!user) return { error: 'Non autorizzato' };

    try {
        const connector = await db.connector.create({
            data: {
                ...data,
                companyId: user.companyId
            }
        });
        return { data: connector };
    } catch (e) {
        console.error("Create Connector Error:", e);
        return { error: 'Errore creazione connettore' };
    }
}

export async function deleteConnectorAction(id: string) {
    const user = await getAuthenticatedUser();
    if (!user) return { error: 'Non autorizzato' };

    try {
        await db.connector.delete({
            where: { id, companyId: user.companyId }
        });
        return { success: true };
    } catch (e) {
        return { error: 'Errore eliminazione connettore' };
    }
}

export async function updateConnectorAction(id: string, data: { name: string, type: string, config: string }) {
    const user = await getAuthenticatedUser();
    if (!user) return { error: 'Non autorizzato' };

    try {
        const existing = await db.connector.findUnique({ where: { id } });
        if (!existing || existing.companyId !== user.companyId) return { error: 'Connettore non trovato' };

        const connector = await db.connector.update({
            where: { id },
            data: { ...data }
        });
        return { data: connector };
    } catch (e) {
        return { error: 'Errore aggiornamento connettore' };
    }
}

export async function testConnectorAction(type: string, config: string) {
    const user = await getAuthenticatedUser();
    if (!user) return { error: 'Non autorizzato' };

    try {
        let conf;
        try {
            conf = JSON.parse(config);
        } catch {
            return { success: false, message: 'Configurazione JSON non valida' };
        }

        if (type === 'SQL') {
            try {
                const sqlConfig: any = {
                    user: conf.user,
                    password: conf.password,
                    server: conf.host,
                    database: conf.database,
                    options: {
                        encrypt: conf.host && conf.host.includes('database.windows.net'), // Encrypt only for Azure, false for local/IP
                        trustServerCertificate: true,
                        connectTimeout: 15000 // Increased to 15s
                    }
                };

                // Only add port if explicitly provided, otherwise let driver decide (e.g. for named instances)
                if (conf.port) {
                    const parsedPort = parseInt(conf.port);
                    if (!isNaN(parsedPort)) {
                        sqlConfig.port = parsedPort;
                    }
                }

                const pool = new sql.ConnectionPool(sqlConfig);
                await pool.connect();
                await pool.close();
                return { success: true, message: 'Connessione SQL Server riuscita!' };
            } catch (err: any) {
                return { success: false, message: `Errore SQL: ${err.message}` };
            }
        }

        if (type === 'SMTP') {
            try {
                const transporter = nodemailer.createTransport({
                    host: conf.host,
                    port: parseInt(conf.port) || 587,
                    secure: (parseInt(conf.port) === 465),
                    auth: {
                        user: conf.user,
                        pass: conf.password,
                    },
                    tls: {
                        rejectUnauthorized: false
                    },
                    connectionTimeout: 5000
                });
                await transporter.verify();
                return { success: true, message: 'Connessione SMTP riuscita!' };
            } catch (err: any) {
                return { success: false, message: `Errore SMTP: ${err.message}` };
            }
        }

        if (type === 'HUBSPOT') {
            try {
                const res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts?limit=1', {
                    headers: {
                        'Authorization': `Bearer ${conf.accessToken}`,
                        'Content-Type': 'application/json'
                    }
                });
                if (res.ok) {
                    return { success: true, message: 'Connessione HubSpot valida!' };
                } else {
                    const errorData = await res.json().catch(() => ({}));
                    return { success: false, message: `Errore HubSpot: ${errorData.message || res.statusText}` };
                }
            } catch (err: any) {
                return { success: false, message: `Errore Network: ${err.message}` };
            }
        }

        if (type === 'SHAREPOINT') {
            // Validate required fields
            if (!conf.tenantId || !conf.clientId) {
                return { success: false, message: 'Tenant ID e Client ID sono obbligatori' };
            }
            if (!conf.siteUrl || !conf.filePath) {
                return { success: false, message: 'URL Sito e Percorso File sono obbligatori' };
            }

            // Import and call SharePoint test action
            const { testSharePointConnectionAction } = await import('./sharepoint');
            const result = await testSharePointConnectionAction(
                conf.tenantId,
                conf.clientId,
                conf.siteUrl,
                conf.filePath,
                conf.sheetName || '',
                conf._siteId,
                conf._driveId,
                conf._fileId
            );

            if (result.needsAuth) {
                // Signal that Device Code auth is needed
                return {
                    success: false,
                    needsAuth: true,
                    message: result.message || 'Autenticazione richiesta. Usa il flusso Device Code.'
                };
            }

            return result;
        }

        return { success: false, message: 'Tipo connettore non supportato per il test' };

    } catch (e: any) {
        return { error: `Errore generico test: ${e.message}` };
    }
}
