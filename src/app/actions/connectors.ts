'use server'

import { db } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/session';
import sql from 'mssql';
import nodemailer from 'nodemailer';
import fs from 'fs/promises';
import path from 'path';
import type { MediaItem, LinkItem, TriggerItem } from '@/lib/types';
import { applyPlotlyOverrides, plotlyJsonToHtml } from '@/lib/plotly-utils';
import { resolveTheme } from '@/lib/chart-theme';
import { testSharePointConnectionAction } from './sharepoint';
import type { HtmlStyleOverrides } from '@/lib/html-style-utils';
import { generateHtmlStyleCss, applyHtmlStyleOverrides } from '@/lib/html-style-utils';
import { pythonFetch } from '@/lib/python-backend';

/**
 * Convert JavaScript-dependent HTML to static HTML for email embedding.
 * Email clients strip all <script> tags, so JS-rendered tables appear empty.
 * This function extracts data from scripts and generates static <tr> rows.
 */
function staticifyHtmlForEmail(html: string): string {
    // 1. Extract JSON data array from <script> blocks
    let jsonData: Record<string, any>[] | null = null;

    const scriptBlocks: string[] = [];
    html.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, (_m, content) => {
        scriptBlocks.push(content);
        return '';
    });

    for (const script of scriptBlocks) {
        // Look for: const/let/var IDENT = [{...}, ...];
        const assignMatch = script.match(/(?:const|let|var)\s+\w+\s*=\s*\[/);
        if (!assignMatch || assignMatch.index === undefined) continue;

        const startIdx = assignMatch.index + assignMatch[0].length - 1; // position of [
        let depth = 1;
        let i = startIdx + 1;
        while (i < script.length && depth > 0) {
            const ch = script[i];
            if (ch === '[') depth++;
            else if (ch === ']') depth--;
            else if (ch === '"' || ch === "'") {
                const quote = ch;
                i++;
                while (i < script.length && script[i] !== quote) {
                    if (script[i] === '\\') i++;
                    i++;
                }
            }
            i++;
        }

        if (depth === 0) {
            const jsonStr = script.substring(startIdx, i);
            try {
                const parsed = JSON.parse(jsonStr);
                if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object') {
                    jsonData = parsed;
                    break;
                }
            } catch { /* not valid JSON, try next */ }
        }
    }

    // 2. Extract column order from <thead>
    let columnKeys: string[] = [];
    const theadMatch = html.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i);
    if (theadMatch) {
        const thMatches = theadMatch[1].match(/<th[^>]*>([\s\S]*?)<\/th>/gi);
        if (thMatches) {
            columnKeys = thMatches.map(th => {
                // Strip HTML tags to get header text
                return th.replace(/<[^>]*>/g, '').trim();
            });
        }
    }

    // 3. If we have data, build static rows and inject into <tbody>
    if (jsonData && jsonData.length > 0) {
        // Map header text to data keys (case-insensitive, normalize spaces)
        const dataKeys = Object.keys(jsonData[0]);
        const keyMap: string[] = columnKeys.map(header => {
            const headerNorm = header.toLowerCase().replace(/\s+/g, ' ');
            // Exact match first
            const exact = dataKeys.find(k => k.toLowerCase().replace(/\s+/g, ' ') === headerNorm);
            if (exact) return exact;
            // Partial match
            const partial = dataKeys.find(k => k.toLowerCase().includes(headerNorm) || headerNorm.includes(k.toLowerCase()));
            return partial || header;
        });

        // If no thead or mapping failed, use data keys directly
        const effectiveKeys = keyMap.length > 0 ? keyMap : dataKeys;

        const escapeHtml = (val: any): string => {
            if (val === null || val === undefined) return '';
            return String(val).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        };

        const staticRows = jsonData.map(row => {
            const cells = effectiveKeys.map(key => `<td>${escapeHtml(row[key])}</td>`).join('');
            return `<tr>${cells}</tr>`;
        }).join('\n');

        // Replace <tbody> with static content
        html = html.replace(/<tbody[^>]*>[\s\S]*?<\/tbody>/gi, `<tbody>${staticRows}</tbody>`);

        // Update row count displays (e.g. "Totale: <span id="totalCount">0</span> righe")
        html = html.replace(
            /(<span[^>]*id\s*=\s*["'](?:totalCount|rowCount|total)[^"']*["'][^>]*>)\s*\d*\s*(<\/span>)/gi,
            `$1${jsonData.length}$2`
        );
        // Also handle plain text pattern "Totale: 0 righe"
        html = html.replace(/Totale:\s*(?:<[^>]+>)?\s*0\s*(?:<[^>]+>)?\s*righe/gi,
            `Totale: ${jsonData.length} righe`
        );
    }

    // 4. Strip all <script> tags (email clients do this anyway)
    html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

    // 5. Remove interactive elements that won't work in email
    html = html.replace(/<input[^>]*>/gi, '');
    html = html.replace(/<select[^>]*>[\s\S]*?<\/select>/gi, '');

    return html;
}

// ... (existing functions)

export async function getConnectorsAction() {
    const sessionUser = await getAuthenticatedUser();
    if (!sessionUser) return { error: 'Non autorizzato' };

    // Fetch fresh user data from DB to avoid staleness
    const user = await db.user.findUnique({ where: { id: sessionUser.id } });
    if (!user) return { error: 'Utente non trovato' };

    if (!user.companyId) {
        return { data: [] }; // Return empty list if no company
    }

    try {
        const connectors = await db.connector.findMany({
            where: { companyId: user.companyId },
            select: {
                id: true,
                name: true,
                type: true,
                config: true,
                companyId: true,
                databaseMapAt: true,
                createdAt: true,
                updatedAt: true,
                // ❌ NOT including databaseMap — can be 30-40 MB for huge DBs
            },
            orderBy: { createdAt: 'desc' }
        });
        return { data: connectors };
    } catch (e) {
        console.error("Get Connectors Error:", e);
        return { error: 'Errore durante il recupero connettori' };
    }
}

// Send test email with actual data from selected tables and Python outputs



export async function createConnectorAction(data: { name: string, type: string, config: string }) {
    const sessionUser = await getAuthenticatedUser();
    if (!sessionUser) return { error: 'Non autorizzato' };

    // Fetch fresh user data from DB to avoid staleness
    const user = await db.user.findUnique({ where: { id: sessionUser.id } });
    if (!user) return { error: 'Utente non trovato' };

    // Check if user has a company
    if (!user.companyId) {
        console.error("[CONNECTOR] User does not have a companyId:", user.email);
        return { error: 'Utente non associato a nessuna azienda. Contatta l\'amministratore.' };
    }

    try {
        console.log("[CONNECTOR] Creating connector:", { name: data.name, type: data.type, companyId: user.companyId });
        const connector = await db.connector.create({
            data: {
                ...data,
                companyId: user.companyId
            }
        });
        console.log("[CONNECTOR] Created successfully:", connector.id);
        return { data: connector };
    } catch (e: any) {
        console.error("Create Connector Error:", e);
        return { error: `Errore creazione connettore: ${e.message}` };
    }
}

export async function deleteConnectorAction(id: string) {
    const sessionUser = await getAuthenticatedUser();
    if (!sessionUser) return { error: 'Non autorizzato' };

    const user = await db.user.findUnique({ where: { id: sessionUser.id } });
    if (!user || !user.companyId) return { error: 'Non autorizzato' };

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
    const sessionUser = await getAuthenticatedUser();
    if (!sessionUser) return { error: 'Non autorizzato' };

    const user = await db.user.findUnique({ where: { id: sessionUser.id } });
    if (!user || !user.companyId) return { error: 'Non autorizzato' };

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

export async function executeSqlPreviewAction(query: string, connectorId: string, dependencies?: any[]) {
    const user = await getAuthenticatedUser();
    if (!user) return { error: 'Non autorizzato' };

    try {
        const connector = await db.connector.findUnique({
            where: { id: connectorId, companyId: user.companyId }
        });

        if (!connector || connector.type !== 'SQL') {
            return { error: 'Connettore non trovato o non valido' };
        }

        // Validate and parse connector config
        let conf: any = null;
        try {
            if (!connector.config || typeof connector.config !== 'string') {
                console.error("[CONNECTOR] Invalid connector config:", connector.config);
                return { error: 'Configurazione connettore non valida' };
            }

            conf = JSON.parse(connector.config);
        } catch (parseError: any) {
            console.error("[CONNECTOR] Failed to parse connector config:", parseError);
            return { error: `Errore nel parsing della configurazione: ${parseError.message}` };
        }
        const sqlConfig: any = {
            user: conf.user,
            password: conf.password,
            server: conf.host,
            database: conf.database,
            options: {
                encrypt: conf.host && conf.host.includes('database.windows.net'),
                trustServerCertificate: process.env.NODE_ENV !== 'production',
                connectTimeout: 15000
            }
        };

        if (conf.port) sqlConfig.port = parseInt(conf.port);

        const pool = new sql.ConnectionPool(sqlConfig);
        await pool.connect();

        try {
            const result = await pool.request().query(query);
            const data: any[] = result.recordset;
            console.log(`[SQL Preview] Query returned ${data?.length || 0} rows`);
            return { data, error: null };
        } finally {
            await pool.close();
        }
    } catch (e: any) {
        console.error("SQL Preview Error:", e);
        return { data: null, error: `Errore esecuzione query: ${e.message}` };
    }
}

export async function executeSqlAction(query: string, connectorId: string) {
    const user = await getAuthenticatedUser();
    if (!user) return { error: 'Non autorizzato' };

    try {
        const connector = await db.connector.findUnique({
            where: { id: connectorId, companyId: user.companyId }
        });

        if (!connector || connector.type !== 'SQL') {
            return { error: 'Connettore non trovato o non valido' };
        }

        const conf = JSON.parse(connector.config);
        const sqlConfig: any = {
            user: conf.user,
            password: conf.password,
            server: conf.host,
            database: conf.database,
            options: {
                encrypt: conf.host && conf.host.includes('database.windows.net'),
                trustServerCertificate: process.env.NODE_ENV !== 'production',
                connectTimeout: 15000
            }
        };

        if (conf.port) sqlConfig.port = parseInt(conf.port);

        const pool = new sql.ConnectionPool(sqlConfig);
        await pool.connect();

        try {
            const result = await pool.request().query(query);
            return {
                success: true,
                rowsAffected: result.rowsAffected,
                error: null
            };
        } finally {
            await pool.close();
        }
    } catch (e: any) {
        console.error("SQL Action Error:", e);
        return { success: false, error: `Errore esecuzione query: ${e.message}` };
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
                        trustServerCertificate: process.env.NODE_ENV !== 'production',
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
                        rejectUnauthorized: process.env.NODE_ENV === 'production'
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



        // ... (inside testConnectorAction)
        if (type === 'SHAREPOINT') {
            // Validate required fields
            if (!conf.tenantId || !conf.clientId) {
                return { success: false, message: 'Tenant ID e Client ID sono obbligatori' };
            }
            if (!conf.siteUrl || !conf.filePath) {
                return { success: false, message: 'URL Sito e Percorso File sono obbligatori' };
            }

            // Call SharePoint test action (imported statically)
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

        if (type === 'LEMLIST') {
            try {
                if (!conf.apiKey) {
                    return { success: false, message: 'API Key Lemlist obbligatoria' };
                }
                // Lemlist uses Basic auth: empty username, apiKey as password
                const basicAuth = Buffer.from(`:${conf.apiKey}`).toString('base64');
                const res = await fetch('https://api.lemlist.com/api/campaigns', {
                    headers: {
                        'Authorization': `Basic ${basicAuth}`,
                        'Content-Type': 'application/json',
                    },
                });
                if (res.ok) {
                    const campaigns = await res.json();
                    const count = Array.isArray(campaigns) ? campaigns.length : 0;
                    return { success: true, message: `Connessione Lemlist riuscita! ${count} campagne trovate.` };
                } else if (res.status === 401) {
                    return { success: false, message: 'API Key non valida.' };
                } else {
                    const err = await res.text();
                    return { success: false, message: `Errore Lemlist: ${res.status} - ${err}` };
                }
            } catch (err: any) {
                return { success: false, message: `Errore Network: ${err.message}` };
            }
        }

        if (type === 'WHATSAPP') {
            try {
                if (!conf.phoneNumberId || !conf.accessToken) {
                    return { success: false, message: 'Phone Number ID e Access Token sono obbligatori' };
                }
                const res = await fetch(
                    `https://graph.facebook.com/v22.0/${conf.phoneNumberId}`,
                    { headers: { 'Authorization': `Bearer ${conf.accessToken}` } }
                );
                if (res.ok) {
                    const data = await res.json();
                    return { success: true, message: `Connessione WhatsApp valida! Numero: ${data.display_phone_number || conf.phoneNumberId}` };
                } else {
                    const err = await res.json().catch(() => ({}));
                    return { success: false, message: `Errore Meta API: ${err?.error?.message || res.statusText}` };
                }
            } catch (err: any) {
                return { success: false, message: `Errore Network: ${err.message}` };
            }
        }

        return { success: false, message: 'Tipo connettore non supportato per il test' };

    } catch (e: any) {
        return { error: `Errore generico test: ${e.message}` };
    }
}

// Email sending action using SMTP connector
export async function sendEmailWithConnectorAction(params: {
    connectorId: string;
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    htmlBody: string;
    attachments?: Array<{
        filename: string;
        content: Buffer | string;
        contentType?: string;
    }>;
}) {
    const user = await getAuthenticatedUser();
    if (!user) return { error: 'Non autorizzato' };

    try {
        // Get the connector
        const connector = await db.connector.findFirst({
            where: { id: params.connectorId, companyId: user.companyId, type: 'SMTP' }
        });

        if (!connector) {
            return { success: false, error: 'Connettore SMTP non trovato' };
        }

        let conf;
        try {
            conf = JSON.parse(connector.config);
        } catch {
            return { success: false, error: 'Configurazione connettore non valida' };
        }

        // Create transporter
        const transporter = nodemailer.createTransport({
            host: conf.host,
            port: parseInt(conf.port) || 587,
            secure: (parseInt(conf.port) === 465),
            auth: {
                user: conf.user,
                pass: conf.password,
            },
            tls: {
                rejectUnauthorized: process.env.NODE_ENV === 'production'
            }
        });

        // Build mail options
        const mailOptions: any = {
            from: conf.from || conf.user,
            to: params.to,
            subject: params.subject,
            html: params.htmlBody,
        };

        if (params.cc) mailOptions.cc = params.cc;
        if (params.bcc) mailOptions.bcc = params.bcc;
        if (params.attachments && params.attachments.length > 0) {
            mailOptions.attachments = params.attachments;
        }

        // Send email
        const info = await transporter.sendMail(mailOptions);

        return {
            success: true,
            message: `Email inviata con successo a ${params.to}`,
            messageId: info.messageId
        };

    } catch (e: any) {
        console.error('Send Email Error:', e);
        return { success: false, error: `Errore invio email: ${e.message}` };
    }
}

// Send test email with actual data from selected tables and Python outputs
export async function sendTestEmailWithDataAction(params: {
    connectorId: string;  // SMTP connector
    sqlConnectorId: string; // SQL connector for queries
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    bodyHtml: string;
    selectedTables: Array<{
        name: string;
        displayName?: string;
        query: string;
        inBody: boolean;
        asExcel: boolean;
        pipelineDependencies?: Array<{ tableName: string; query?: string; isPython?: boolean; pythonCode?: string; connectorId?: string }>;
    }>;
    selectedPythonOutputs?: Array<{
        name: string;
        displayName?: string;
        code: string;
        outputType: 'table' | 'variable' | 'chart' | 'html';
        connectorId?: string;
        inBody: boolean;
        asAttachment: boolean;
        dependencies?: Array<{ tableName: string; connectorId?: string; query?: string; pipelineDependencies?: any[] }>;
        plotlyStyleOverrides?: any;
        htmlStyleOverrides?: HtmlStyleOverrides;
    }>;
    availableMedia?: MediaItem[];
    availableLinks?: LinkItem[];
    availableTriggers?: TriggerItem[];
    mediaAttachments?: string[];
    preCalculatedResults?: Record<string, any>;
    pipelineReport?: Array<{ name: string, type: string, status: 'success' | 'error' | 'skipped', error?: string, timestamp: string, nodePath?: string }>;
    htmlStyleOverrides?: HtmlStyleOverrides;
    _bypassAuth?: boolean; // INTERNAL USE ONLY: For scheduler
}) {
    console.log('[EMAIL DEBUG] sendTestEmailWithDataAction called with:', {
        connectorId: params.connectorId,
        sqlConnectorId: params.sqlConnectorId,
        to: params.to,
        subject: params.subject,
        selectedTablesCount: params.selectedTables?.length || 0,
        selectedPythonOutputsCount: params.selectedPythonOutputs?.length || 0,
        mediaAttachmentsCount: params.mediaAttachments?.length || 0,
        preCalculatedResultsCount: params.preCalculatedResults ? Object.keys(params.preCalculatedResults).length : 0,
        bypassAuth: params._bypassAuth
    });

    let user: any = null;

    if (params._bypassAuth) {
        // SYSTEM CONTEXT (Scheduler)
        // We need a dummy user object with companyId if possible, or fetch it from connector context?
        // Actually, we usually need companyId to find connectors. 
        // IF bypassAuth is true, we assume the CALLER (Scheduler) checked permissions or context.
        // BUT db queries filter by companyId.
        // We can fetch the connector WITHOUT companyId filter first to Identify the company?
        // OR Scheduler passes companyId?
        // Let's assume Scheduler passes companyId in a hidden way or we fetch connector ignoring companyId filter initially?
        // Better: Fetch connector by ID directly (globally unique usually) and derive companyId.

        // 1. Fetch SMTP connector to get companyId
        const smtpConnector = await db.connector.findUnique({ where: { id: params.connectorId } });
        if (!smtpConnector) return { success: false, error: 'Connettore SMTP non trovato (System Context)' };

        user = {
            id: 'system-scheduler',
            companyId: smtpConnector.companyId
        };
    } else {
        user = await getAuthenticatedUser();
        if (!user) return { error: 'Non autorizzato' };
    }

    // CHECK: se ci sono fallimenti nella pipeline, NON inviare l'email
    if (params.pipelineReport) {
        const allErrors = params.pipelineReport.filter(e => e.status === 'error');
        if (allErrors.length > 0) {
            const failedNodes = allErrors.map(e => `${e.name} (${e.type}): ${e.error || 'unknown'}`).join('; ');
            console.log(`[EMAIL DEBUG] ❌ Pipeline con ${allErrors.length} fallimento/i. Email bloccata. Nodi falliti: ${failedNodes}`);
            return { success: false, error: `Pipeline con ${allErrors.length} fallimento/i. Nodi falliti: ${failedNodes}. Email non inviata.` };
        }
    }

    try {
        // Get SMTP connector
        const smtpConnector = await db.connector.findFirst({
            where: { id: params.connectorId, companyId: user.companyId, type: 'SMTP' }
        });
        if (!smtpConnector) {
            return { success: false, error: 'Connettore SMTP non trovato' };
        }

        if (!smtpConnector) {
            return { success: false, error: 'Connettore SMTP non trovato' };
        }

        const smtpConf = JSON.parse(smtpConnector.config);

        // SQL Results Container
        const tableResults: { name: string; displayName?: string; data: any[]; inBody: boolean; asExcel: boolean }[] = [];;

        // --- SQL Execution Block (Optional) ---
        if (params.sqlConnectorId) {
            // Get SQL connector
            const sqlConnector = await db.connector.findFirst({
                where: { id: params.sqlConnectorId, companyId: user.companyId, type: 'SQL' }
            });

            if (!sqlConnector) {
                return { success: false, error: 'Connettore SQL non trovato' };
            }

            const sqlConf = JSON.parse(sqlConnector.config);

            // Connect to SQL
            const sqlConfig: any = {
                user: sqlConf.user,
                password: sqlConf.password,
                server: sqlConf.host,
                database: sqlConf.database,
                options: {
                    encrypt: sqlConf.host?.includes('database.windows.net'),
                    trustServerCertificate: process.env.NODE_ENV !== 'production',
                    connectTimeout: 30000,
                    requestTimeout: 120000
                }
            };
            if (sqlConf.port) sqlConfig.port = parseInt(sqlConf.port);

            const pool = new sql.ConnectionPool(sqlConfig);
            await pool.connect();

            // IMPORTANT: Use a Transaction to ensure ALL queries run on the SAME connection
            const transaction = new sql.Transaction(pool);
            await transaction.begin();
            const request = new sql.Request(transaction);

            try {
                const executedTables = new Set<string>(); // Track which tables have been executed

                console.log('[EMAIL DEBUG] Executing queries in order with temp table creation (using TRANSACTION for same connection)...');

                // Helper function to execute a query and create temp table
                const executeAndCreateTempTable = async (tableName: string, query: string): Promise<any[]> => {
                    if (executedTables.has(tableName)) {
                        console.log(`[EMAIL DEBUG] Table ${tableName} already executed, skipping`);
                        return [];
                    }

                    console.log(`[EMAIL DEBUG] Executing dependency query for ${tableName}: ${query.substring(0, 100)}...`);

                    try {
                        // Execute the original query
                        const result = await request.query(query);
                        const data = result.recordset || [];
                        executedTables.add(tableName);

                        // Create a temp table with the results so subsequent queries can reference it
                        if (data.length > 0) {
                            try {
                                const columns = Object.keys(data[0]);
                                const colDefs = columns.map(col => {
                                    const sampleVal = data[0][col];
                                    let sqlType = 'NVARCHAR(MAX)';
                                    if (typeof sampleVal === 'number') {
                                        sqlType = Number.isInteger(sampleVal) ? 'INT' : 'FLOAT';
                                    } else if (sampleVal instanceof Date) {
                                        sqlType = 'DATETIME';
                                    }
                                    return `[${col}] ${sqlType}`;
                                }).join(', ');

                                // Create table with exact name the queries expect (without # prefix)
                                const tempTableName = tableName; // Use exact name: HR1, HR2, etc.

                                // Create temp table using the SAME request (same connection)
                                // Drop if exists, then create
                                await request.query(`
                                    IF OBJECT_ID('${tempTableName}', 'U') IS NOT NULL DROP TABLE [${tempTableName}];
                                    CREATE TABLE [${tempTableName}] (${colDefs});
                                `);

                                // Insert data into temp table (in batches for performance)
                                const batchSize = 100;
                                for (let i = 0; i < data.length; i += batchSize) {
                                    const batch = data.slice(i, i + batchSize);
                                    const values = batch.map(row => {
                                        return '(' + columns.map(col => {
                                            const val = row[col];
                                            if (val === null || val === undefined) return 'NULL';
                                            if (typeof val === 'number') return val.toString();
                                            if (val instanceof Date) return `'${val.toISOString()}'`;
                                            return `N'${String(val).replace(/'/g, "''")}'`;
                                        }).join(', ') + ')';
                                    }).join(', ');
                                    await request.query(`INSERT INTO ${tempTableName} (${columns.map(c => `[${c}]`).join(', ')}) VALUES ${values}`);
                                }
                                console.log(`[EMAIL DEBUG] Created temp table ${tempTableName} with ${data.length} rows`);
                            } catch (tempErr: any) {
                                console.error(`[EMAIL DEBUG] Failed to create temp table for ${tableName}:`, tempErr.message);
                            }
                        }
                        return data;
                    } catch (err: any) {
                        console.error(`[EMAIL DEBUG] Error executing query for ${tableName}:`, err.message);
                        return [{ error: err.message }];
                    }
                };

                // Helper function to create temp table from data (for Python results)
                const createTempTableFromData = async (tableName: string, data: any[]): Promise<void> => {
                    if (executedTables.has(tableName) || data.length === 0) {
                        console.log(`[EMAIL DEBUG] Table ${tableName} already exists or has no data, skipping temp table creation`);
                        return;
                    }

                    try {
                        const columns = Object.keys(data[0]);
                        const colDefs = columns.map(col => {
                            const sampleVal = data[0][col];
                            let sqlType = 'NVARCHAR(MAX)';
                            if (typeof sampleVal === 'number') {
                                sqlType = Number.isInteger(sampleVal) ? 'INT' : 'FLOAT';
                            } else if (sampleVal instanceof Date) {
                                sqlType = 'DATETIME';
                            }
                            return `[${col}] ${sqlType}`;
                        }).join(', ');

                        // Drop if exists, then create
                        await request.query(`
                            IF OBJECT_ID('${tableName}', 'U') IS NOT NULL DROP TABLE [${tableName}];
                            CREATE TABLE [${tableName}] (${colDefs});
                        `);

                        // Insert data in batches
                        const batchSize = 100;
                        for (let i = 0; i < data.length; i += batchSize) {
                            const batch = data.slice(i, i + batchSize);
                            const values = batch.map(row => {
                                return '(' + columns.map(col => {
                                    const val = row[col];
                                    if (val === null || val === undefined) return 'NULL';
                                    if (typeof val === 'number') return val.toString();
                                    if (val instanceof Date) return `'${val.toISOString()}'`;
                                    return `N'${String(val).replace(/'/g, "''")}'`;
                                }).join(', ') + ')';
                            }).join(', ');
                            await request.query(`INSERT INTO ${tableName} (${columns.map(c => `[${c}]`).join(', ')}) VALUES ${values}`);
                        }
                        executedTables.add(tableName);
                        console.log(`[EMAIL DEBUG] Created temp table from Python data: ${tableName} with ${data.length} rows`);
                    } catch (tempErr: any) {
                        console.error(`[EMAIL DEBUG] Failed to create temp table for Python ${tableName}:`, tempErr.message);
                    }
                };

                // Inject pre-calculated results (ancestors) as temp tables FIRST
                if (params.preCalculatedResults) {
                    for (const [name, result] of Object.entries(params.preCalculatedResults)) {
                        if (executedTables.has(name)) continue;

                        // Check if result is valid data array (SQL or Python table result)
                        let data: any[] | null = null;
                        if (Array.isArray(result)) {
                            data = result;
                        } else if (result && typeof result === 'object' && Array.isArray(result.data)) {
                            // If it's a python result object with .data
                            data = result.data;
                        }

                        // Note: For Python outputs that are NOT tables (charts/vars), they might be in preCalculatedResults.
                        // We primarily care about injecting TABLE data for SQL dependencies here.
                        // But Python outputs might also be needed if subsequent SQL queries depend on them.

                        if (data && data.length > 0) {
                            console.log(`[EMAIL DEBUG] Injecting pre-calculated result for ${name} (${data.length} rows)`);
                            await createTempTableFromData(name, data);
                        }
                    }
                }

                // First, execute all pipelineDependencies from all selected tables (in order)
                // This includes BOTH Python and SQL dependencies
                const { executePythonPreviewAction } = await import('@/app/actions');

                for (const table of params.selectedTables) {
                    if (table.pipelineDependencies && table.pipelineDependencies.length > 0) {
                        console.log(`[EMAIL DEBUG] Executing ${table.pipelineDependencies.length} dependencies for ${table.name}`);
                        for (const dep of table.pipelineDependencies) {
                            // Check if already executed (this will now catch pre-calculated ones!)
                            if (executedTables.has(dep.tableName)) {
                                console.log(`[EMAIL DEBUG] Dependency ${dep.tableName} already executed (or pre-calculated), skipping`);
                                continue;
                            }

                            // Execute Python dependencies first
                            if (dep.isPython && dep.pythonCode) {
                                console.log(`[EMAIL DEBUG] Executing PYTHON dependency: ${dep.tableName}`);
                                try {
                                    // Recursively pass nested dependencies if any
                                    const nestedDeps = (dep as any).pipelineDependencies || [];
                                    // dfTarget = last nested dep with data (the direct parent)
                                    const nestedDfTarget = nestedDeps.length > 0 ? nestedDeps[nestedDeps.length - 1]?.tableName : undefined;
                                    const pythonResult = await executePythonPreviewAction(
                                        dep.pythonCode,
                                        'table', // Assume table output for dependencies
                                        {},
                                        nestedDeps,
                                        dep.connectorId,
                                        params._bypassAuth, // Pass bypass auth flag
                                        undefined, // selectedDocuments
                                        nestedDfTarget // Explicit df mapping
                                    );

                                    if (pythonResult.success && Array.isArray(pythonResult.data) && pythonResult.data.length > 0) {
                                        console.log(`[EMAIL DEBUG] Python ${dep.tableName} returned ${pythonResult.data.length} rows`);
                                        // Create temp SQL table from Python output
                                        await createTempTableFromData(dep.tableName, pythonResult.data);
                                    } else {
                                        console.error(`[EMAIL DEBUG] Python ${dep.tableName} failed or returned no data:`, pythonResult.error);
                                    }
                                } catch (pyErr: any) {
                                    console.error(`[EMAIL DEBUG] Error executing Python dependency ${dep.tableName}:`, pyErr.message);
                                }
                            }
                            // Execute SQL dependencies
                            else if (dep.query) {
                                await executeAndCreateTempTable(dep.tableName, dep.query);
                            }
                        }
                    }
                }

                // Now execute the selected tables and collect their results
                for (const table of params.selectedTables) {
                    // Check logic for pre-calculated execution
                    if (params.preCalculatedResults && params.preCalculatedResults[table.name]) {
                        const preRes = params.preCalculatedResults[table.name];
                        let data: any[] | null = null;
                        if (Array.isArray(preRes)) { data = preRes; }
                        else if (preRes && preRes.data) { data = preRes.data; }

                        if (data) {
                            console.log(`[EMAIL DEBUG] Using pre-calculated result for selected table ${table.name}`);
                            tableResults.push({
                                name: table.name,
                                data: data,
                                inBody: table.inBody,
                                asExcel: table.asExcel
                            });
                            continue; // Skip execution
                        }
                    }

                    try {
                        console.log(`[EMAIL DEBUG] Executing query for ${table.name}: ${table.query.substring(0, 100)}...`);

                        // Execute the query using the SAME request (same connection)
                        const result = await request.query(table.query);
                        const data = result.recordset || [];
                        executedTables.add(table.name);

                        tableResults.push({
                            name: table.name,
                            displayName: table.displayName,
                            data: data,
                            inBody: table.inBody,
                            asExcel: table.asExcel
                        });
                    } catch (err: any) {
                        console.error(`Error executing query for ${table.name}:`, err.message);
                        tableResults.push({
                            name: table.name,
                            displayName: table.displayName,
                            data: [{ error: err.message }],
                            inBody: table.inBody,
                            asExcel: table.asExcel
                        });
                    }
                }

                // Commit transaction
                await transaction.commit();

            } catch (sqlErr: any) {
                await transaction.rollback();
                throw sqlErr;
            } finally {
                await pool.close();
            }
        } else if (params.selectedTables && params.selectedTables.length > 0) {
            // If tables are selected but no SQL connector provided
            return { success: false, error: 'Per includere tabelle SQL è necessario selezionare un connettore SQL.' };
        }

        // Execute Python outputs if any
        const pythonResults: Array<{
            name: string;
            displayName?: string;
            inBody: boolean;
            asAttachment: boolean;
            data?: any[];
            chartBase64?: string;
            chartHtml?: string;
            plotlyJson?: any;
            plotlyStyleOverrides?: any;
            htmlStyleOverrides?: HtmlStyleOverrides;
            html?: string;
            variables?: Record<string, any>;
            type: 'table' | 'variable' | 'chart' | 'html';
        }> = [];

        if (params.selectedPythonOutputs && params.selectedPythonOutputs.length > 0) {
            console.log('[EMAIL DEBUG] Executing Python outputs:', params.selectedPythonOutputs.map(p => `${p.name} (type:${p.outputType}, inBody:${p.inBody}, asAttachment:${p.asAttachment}, hasStyleOverrides:${!!p.plotlyStyleOverrides})`));
            const { executePythonPreviewAction } = await import('@/app/actions');

            for (const pyOutput of params.selectedPythonOutputs) {
                try {
                    console.log(`[EMAIL DEBUG] Executing Python for ${pyOutput.name} (type: ${pyOutput.outputType}, inBody: ${pyOutput.inBody}, asAttachment: ${pyOutput.asAttachment})...`);

                    // Check for pre-calculated result
                    if (params.preCalculatedResults && params.preCalculatedResults[pyOutput.name]) {
                        const preRes = params.preCalculatedResults[pyOutput.name];
                        console.log(`[EMAIL DEBUG] Using pre-calculated result for Python ${pyOutput.name}: hasPlotlyJson=${!!preRes.plotlyJson}, hasChartBase64=${!!preRes.chartBase64}, hasChartHtml=${!!preRes.chartHtml}, keys=${Object.keys(preRes).join(',')}`);
                        pythonResults.push({
                            name: pyOutput.name,
                            displayName: pyOutput.displayName,
                            inBody: pyOutput.inBody,
                            asAttachment: pyOutput.asAttachment,
                            data: preRes.data || (Array.isArray(preRes) ? preRes : []),
                            chartBase64: preRes.chartBase64,
                            chartHtml: preRes.chartHtml,
                            plotlyJson: preRes.plotlyJson,
                            plotlyStyleOverrides: pyOutput.plotlyStyleOverrides,
                            htmlStyleOverrides: pyOutput.htmlStyleOverrides,
                            html: preRes.html,
                            variables: preRes.variables,
                            type: pyOutput.outputType
                        });
                        continue; // Skip execution
                    }

                    // Prepare inputData from preCalculatedResults
                    const inputData: Record<string, any[]> = {};
                    if (params.preCalculatedResults) {
                        for (const [key, val] of Object.entries(params.preCalculatedResults)) {
                            if (Array.isArray(val)) {
                                inputData[key] = val;
                            } else if (val && val.data && Array.isArray(val.data)) {
                                inputData[key] = val.data;
                            }
                        }
                    }

                    // Execute Python script — determine dfTarget from the last dependency
                    const pyDeps = pyOutput.dependencies || [];
                    const pyDfTarget = pyDeps.length > 0 ? pyDeps[pyDeps.length - 1]?.tableName : undefined;
                    const result = await executePythonPreviewAction(
                        pyOutput.code,
                        pyOutput.outputType,
                        inputData,
                        pyDeps,
                        pyOutput.connectorId,
                        params._bypassAuth, // Pass bypass auth flag
                        undefined, // selectedDocuments
                        pyDfTarget // Explicit df mapping: direct parent
                    );

                    if (result.success) {
                        pythonResults.push({
                            name: pyOutput.name,
                            displayName: pyOutput.displayName,
                            inBody: pyOutput.inBody,
                            asAttachment: pyOutput.asAttachment,
                            data: result.data,
                            chartBase64: result.chartBase64,
                            chartHtml: result.chartHtml,
                            plotlyJson: result.plotlyJson,
                            plotlyStyleOverrides: pyOutput.plotlyStyleOverrides,
                            htmlStyleOverrides: pyOutput.htmlStyleOverrides,
                            html: result.html,
                            variables: result.variables,
                            type: pyOutput.outputType
                        });
                        console.log(`[EMAIL DEBUG] Python ${pyOutput.name} executed successfully`);
                    } else {
                        console.error(`[EMAIL DEBUG] Python ${pyOutput.name} failed:`, result.error);
                        pythonResults.push({
                            name: pyOutput.name,
                            displayName: pyOutput.displayName,
                            inBody: pyOutput.inBody,
                            asAttachment: pyOutput.asAttachment,
                            data: [{ error: result.error }],
                            type: pyOutput.outputType
                        });
                    }
                } catch (err: any) {
                    console.error(`[EMAIL DEBUG] Error executing Python ${pyOutput.name}:`, err.message);
                    pythonResults.push({
                        name: pyOutput.name,
                        displayName: pyOutput.displayName,
                        inBody: pyOutput.inBody,
                        asAttachment: pyOutput.asAttachment,
                        data: [{ error: err.message }],
                        type: pyOutput.outputType
                    });
                }
            }
        }

        // Build HTML body with tables - use htmlStyleOverrides if provided, fallback to Python output overrides
        const effectiveHtmlOverrides = params.htmlStyleOverrides
            || params.selectedPythonOutputs?.find(p => p.htmlStyleOverrides && Object.keys(p.htmlStyleOverrides).length > 0)?.htmlStyleOverrides
            || {};
        const emailCss = generateHtmlStyleCss(effectiveHtmlOverrides);
        let fullHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        ${emailCss}
        .user-content { margin-bottom: 15px; line-height: 1.5; }
        .table-section { margin: 15px 0; }
        .table-title { font-size: 12px; font-weight: 600; color: #1f2937; margin-bottom: 6px; padding: 6px 10px; background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); border-radius: 4px; border-left: 3px solid #3b82f6; }
        .row-info { color: #6b7280; font-size: 9px; margin: 4px 0 8px 0; }
        .chart-container { text-align: center; padding: 10px; margin: 15px 0; }
    </style>
</head>
<body>
`;

        // Helper function to generate table HTML
        const generateTableHtml = (name: string, data: any[], maxRows = 50) => {
            if (!data || data.length === 0) return `<p><em>Nessun dato per ${name}</em></p>`;

            const totalRows = data.length;
            const displayRows = data.slice(0, maxRows);
            const columns = Object.keys(data[0]);

            let html = `<div class="table-section">`;
            html += `<div class="table-title">${name}</div>`;

            if (totalRows > maxRows) {
                html += `<p class="row-info">Mostrando prime ${maxRows} righe di ${totalRows.toLocaleString()} totali.</p>`;
            }

            html += `<table><thead><tr>`;
            columns.forEach(col => { html += `<th>${col}</th>`; });
            html += `</tr></thead><tbody>`;

            displayRows.forEach(row => {
                html += `<tr>`;
                columns.forEach(col => {
                    let val = row[col];
                    if (val === null || val === undefined) val = '';
                    else if (typeof val === 'object' && val instanceof Date) val = val.toLocaleString('it-IT');
                    else if (typeof val === 'object') val = JSON.stringify(val);
                    html += `<td>${val}</td>`;
                });
                html += `</tr>`;
            });
            html += `</tbody></table></div>`;
            return html;
        };

        // Process body HTML - replace placeholders with actual content
        let processedBody = params.bodyHtml || '';

        // Collect inline chart attachments for CID references
        const inlineAttachments: Array<{ filename: string; content: Buffer; contentType: string; cid: string }> = [];

        // Process inline media placeholders (Async)
        const mediaMatches = [...(params.bodyHtml || '').matchAll(/\{\{ALLEGATO:([^}]+)\}\}/g)];
        if (mediaMatches.length > 0 && params.availableMedia) {
            console.log(`[EMAIL DEBUG] Found ${mediaMatches.length} inline media placeholders`);
            for (const match of mediaMatches) {
                const mediaName = match[1];
                // Check if already processed (avoid duplicates)
                if (inlineAttachments.some(a => a.filename === mediaName)) continue;

                const mediaItem = params.availableMedia.find(m => (m.name || m.url.split('/').pop() || 'file') === mediaName);
                if (mediaItem) {
                    try {
                        let content: Buffer;
                        let contentType = 'application/octet-stream';
                        if (mediaItem.type === 'image' || mediaItem.url.match(/\.(jpg|jpeg|png|gif)$/i)) {
                            contentType = 'image/png'; // Default fall back, or generic image
                            if (mediaItem.url.endsWith('.jpg') || mediaItem.url.endsWith('.jpeg')) contentType = 'image/jpeg';
                            if (mediaItem.url.endsWith('.gif')) contentType = 'image/gif';
                        }

                        if (mediaItem.url.startsWith('http')) {
                            const res = await fetch(mediaItem.url);
                            const arrayBuffer = await res.arrayBuffer();
                            content = Buffer.from(arrayBuffer);
                        } else {
                            const filePath = path.join(process.cwd(), 'public', mediaItem.url.startsWith('/') ? mediaItem.url.substring(1) : mediaItem.url);
                            content = await fs.readFile(filePath);
                        }

                        const cid = `media_${mediaName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;
                        inlineAttachments.push({
                            filename: mediaName,
                            content: content,
                            contentType: contentType,
                            cid: cid
                        });
                        console.log(`[EMAIL DEBUG] Processed inline media: ${mediaName}`);
                    } catch (e: any) { console.error(`[EMAIL DEBUG] Failed to process inline media ${mediaName}:`, e.message); }
                }
            }
        }

        // Replace Media placeholders: {{ALLEGATO:nome}}
        processedBody = processedBody.replace(/\{\{ALLEGATO:([^}]+)\}\}/g, (match, mediaName) => {
            const attachment = inlineAttachments.find(a => a.filename === mediaName);
            if (attachment && attachment.contentType.startsWith('image/')) {
                return `<img src="cid:${attachment.cid}" style="max-width: 100%; height: auto;" alt="${mediaName}" />`;
            }
            // If not an image or failed, maybe link?
            return match;
        });

        // Replace Link placeholders: {{LINK:nome}}
        processedBody = processedBody.replace(/\{\{LINK:([^}]+)\}\}/g, (match, linkName) => {
            const link = params.availableLinks?.find(l => l.name === linkName);
            if (link) {
                return `<a href="${link.url}" target="_blank" style="color: #2563eb; text-decoration: underline;">${link.name}</a>`;
            }
            return match;
        });

        // Replace Trigger placeholders: {{TRIGGER:nome}}
        processedBody = processedBody.replace(/\{\{TRIGGER:([^}]+)\}\}/g, (match, triggerName) => {
            // Return a highlighted span for now
            return `<span style="background-color: #fffbeb; color: #d97706; padding: 2px 4px; border-radius: 4px; border: 1px solid #fcd34d; font-size: 0.9em;">⚡ ${triggerName}</span>`;
        });

        // Replace table placeholders: {{TABELLA:nome}}
        processedBody = processedBody.replace(/\{\{TABELLA:([^}]+)\}\}/g, (match, tableName) => {
            const tableData = tableResults.find(t => t.name === tableName);
            if (tableData && tableData.data.length > 0) {
                console.log(`[EMAIL DEBUG] Replacing placeholder {{TABELLA:${tableName}}} with table HTML`);
                return generateTableHtml(tableData.displayName || tableName, tableData.data);
            }
            return `<p><em>Tabella ${tableName} non trovata</em></p>`;
        });

        // Replace HTML placeholders: {{HTML:nome}}
        processedBody = processedBody.replace(/\{\{HTML:([^}]+)\}\}/g, (match, htmlName) => {
            const htmlResult = pythonResults.find(p => p.name === htmlName);

            // DEBUG LOGGING
            console.log(`[EMAIL DEBUG] Processing placeholder {{HTML:${htmlName}}}`);
            if (htmlResult) {
                console.log(`[EMAIL DEBUG] Found result for ${htmlName}:`, {
                    type: htmlResult.type,
                    hasHtml: !!htmlResult.html,
                    htmlLength: htmlResult.html?.length || 0,
                    keys: Object.keys(htmlResult)
                });
            } else {
                console.log(`[EMAIL DEBUG] No result found for ${htmlName}. Available results:`, pythonResults.map(p => p.name));
            }

            if (htmlResult && htmlResult.type === 'html' && htmlResult.html) {
                console.log(`[EMAIL DEBUG] Replacing placeholder {{HTML:${htmlName}}} with HTML content`);
                // Convert JS-dependent HTML to static HTML for email
                // (email clients strip <script> tags, leaving tables empty)
                const staticHtml = staticifyHtmlForEmail(htmlResult.html);
                return `<div class="html-section">${staticHtml}</div>`;
            }
            // Show a more helpful error: if the Python node ran but failed, show the error
            const errorDetail = htmlResult?.data?.[0]?.error;
            if (errorDetail) {
                return `<p style="color: #ef4444;"><em>⚠️ Errore nel nodo "${htmlName}": ${errorDetail}</em></p>`;
            }
            return `<p style="color: #ef4444;"><em>⚠️ HTML ${htmlName} non trovato o vuoto</em></p>`;
        });



        // Load company chart theme for Plotly re-rendering (colors, fonts, grid, etc.)
        let emailChartTheme: Record<string, any> | undefined;
        try {
            const company = await db.company.findUnique({
                where: { id: user.companyId },
                select: { chartTheme: true },
            });
            emailChartTheme = resolveTheme(company?.chartTheme as any);
            console.log(`[EMAIL DEBUG] Loaded chart theme for re-rendering: colors=${(emailChartTheme as any)?.colors?.slice(0, 3)}`);
        } catch (themeErr) {
            console.error(`[EMAIL DEBUG] Could not load chart theme (non-critical):`, themeErr);
        }

        // Pre-render Plotly charts to PNG for inline body usage
        // When a chart has plotlyJson, re-render PNG with styles applied (or base Plotly quality)
        // This ensures the email body matches the attachment quality
        for (const pyResult of pythonResults) {
            if (pyResult.type === 'chart' && pyResult.plotlyJson) {
                try {
                    const styledFigure = applyPlotlyOverrides(pyResult.plotlyJson, pyResult.plotlyStyleOverrides || {});
                    const styledFigureJson = JSON.stringify(styledFigure);
                    // Encode figure JSON as base64 to safely embed in Python code (no escaping issues)
                    const figureBase64 = Buffer.from(styledFigureJson, 'utf-8').toString('base64');
                    const hasOverrides = pyResult.plotlyStyleOverrides && Object.keys(pyResult.plotlyStyleOverrides).length > 0;
                    console.log(`[EMAIL DEBUG] Re-rendering PNG for "${pyResult.name}" (${hasOverrides ? 'with style overrides' : 'base Plotly quality'}, ${(styledFigureJson.length / 1024).toFixed(1)} KB figure, ${(figureBase64.length / 1024).toFixed(1)} KB base64)...`);

                    const renderScript = `
import plotly.io as pio
import json
import base64

# Decode figure JSON from base64 (safe transport, no escaping issues)
_fig_b64 = "${figureBase64}"
_fig_json_str = base64.b64decode(_fig_b64).decode("utf-8")
fig = pio.from_json(_fig_json_str)

fig_width = fig.layout.width if fig.layout.width else 1000
fig_height = fig.layout.height if fig.layout.height else 500
if fig_width > 1200:
    ratio = 1200 / fig_width
    fig_width = 1200
    fig_height = int(fig_height * ratio)
if fig_height > 6000:
    fig_height = 6000
scale = 2 if (fig_width * fig_height < 800000) else 1

print(f"Rendering PNG: {fig_width}x{fig_height} scale={scale}")
img_bytes = pio.to_image(fig, format="png", width=fig_width, height=fig_height, scale=scale)
result = base64.b64encode(img_bytes).decode("utf-8")
print(f"PNG generated: {len(result)} chars base64")
`.trim();

                    const renderRes = await pythonFetch('/execute', {
                        method: 'POST',
                        body: JSON.stringify({
                            code: renderScript,
                            outputType: 'variable',   // camelCase to match Python backend's data.get('outputType')
                            inputData: {},
                            dependencies: [],
                            chartTheme: emailChartTheme // Pass company theme so emerald template is configured
                        }),
                        signal: AbortSignal.timeout(60000)
                    });

                    if (renderRes.ok) {
                        const renderData = await renderRes.json();
                        if (renderData.success && renderData.variables?.result) {
                            pyResult.chartBase64 = renderData.variables.result;
                            console.log(`[EMAIL DEBUG] ✅ Styled PNG generated for "${pyResult.name}" (${(pyResult.chartBase64!.length / 1024).toFixed(1)} KB base64)`);
                        } else {
                            console.error(`[EMAIL DEBUG] ❌ Styled PNG render failed for "${pyResult.name}":`, renderData.error || 'unknown', 'stdout:', renderData.stdout || '');
                        }
                    } else {
                        const errText = await renderRes.text().catch(() => 'no body');
                        console.error(`[EMAIL DEBUG] ❌ Styled PNG HTTP ${renderRes.status} for "${pyResult.name}": ${errText}`);
                    }
                } catch (renderErr: any) {
                    console.error(`[EMAIL DEBUG] ❌ Could not re-render styled PNG for "${pyResult.name}": ${renderErr.message}`);
                }
            }
        }

        // Replace chart placeholders: {{GRAFICO:nome}}
        processedBody = processedBody.replace(/\{\{GRAFICO:([^}]+)\}\}/g, (match, chartName) => {
            const chartResult = pythonResults.find(p => p.name === chartName);
            if (chartResult && chartResult.type === 'chart' && chartResult.chartBase64) {
                const cid = `chart_${chartName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;
                console.log(`[EMAIL DEBUG] Replacing placeholder {{GRAFICO:${chartName}}} with CID image: ${cid}`);

                inlineAttachments.push({
                    filename: `${chartName}.png`,
                    content: Buffer.from(chartResult.chartBase64, 'base64'),
                    contentType: 'image/png',
                    cid: cid
                });

                return `<div class="chart-container"><div class="table-title">${chartResult.displayName || chartName}</div><img src="cid:${cid}" alt="${chartName}" style="max-width: 100%; height: auto;" /></div>`;
            }

            // Helpful error message for debugging
            let errorMsg = `Grafico ${chartName} non trovato`;
            if (chartResult && chartResult.data && chartResult.data.length > 0 && (chartResult.data[0] as any).error) {
                errorMsg += `: ${(chartResult.data[0] as any).error}`;
            } else if (chartResult && chartResult.type !== 'chart') {
                errorMsg += ` (Tipo errato: ${chartResult.type})`;
            }

            return `<p style="color: #ef4444; background: #fee2e2; padding: 10px; border-radius: 4px; border: 1px solid #fca5a5;"><em>⚠️ ${errorMsg}</em></p>`;
        });

        // Add the processed body to the HTML
        fullHtml += `<div class="user-content">${processedBody}</div>`;

        // Also add any tables/charts marked inBody but not inserted via placeholder
        // (backwards compatibility with old checkbox-based selection)
        for (const tr of tableResults) {
            // Only add if marked inBody AND not already inserted via placeholder
            if (tr.inBody && tr.data.length > 0 && !params.bodyHtml?.includes(`{{TABELLA:${tr.name}}}`)) {
                fullHtml += generateTableHtml(tr.displayName || tr.name, tr.data);
            }
        }

        // Add Python outputs marked inBody but not inserted via placeholder
        for (const pyResult of pythonResults) {
            if (pyResult.inBody) {
                // Check if already inserted via placeholder
                const isChartInserted = pyResult.type === 'chart' && params.bodyHtml?.includes(`{{GRAFICO:${pyResult.name}}`);
                const isHtmlInserted = pyResult.type === 'html' && params.bodyHtml?.includes(`{{HTML:${pyResult.name}}`);
                const isTableInserted = pyResult.type === 'table' && params.bodyHtml?.includes(`{{TABELLA:${pyResult.name}}`);

                if (isChartInserted || isHtmlInserted || isTableInserted) {
                    console.log(`[EMAIL DEBUG] Skipping auto-append for ${pyResult.name} (already in body via placeholder)`);
                    continue;
                }

                if (pyResult.type === 'chart' && pyResult.chartBase64) {
                    const cid = `chart_fallback_${pyResult.name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;
                    console.log(`[EMAIL DEBUG] Adding fallback chart ${pyResult.name} as CID: ${cid}`);

                    inlineAttachments.push({
                        filename: `${pyResult.name}.png`,
                        content: Buffer.from(pyResult.chartBase64, 'base64'),
                        contentType: 'image/png',
                        cid: cid
                    });

                    fullHtml += `<div class="chart-container"><div class="table-title">${pyResult.displayName || pyResult.name}</div><img src="cid:${cid}" alt="${pyResult.name}" style="max-width: 100%; height: auto;" /></div>`;
                } else if (pyResult.type === 'table' && pyResult.data && pyResult.data.length > 0) {
                    fullHtml += generateTableHtml(pyResult.displayName || pyResult.name, pyResult.data);
                } else if (pyResult.type === 'variable' && pyResult.variables) {
                    fullHtml += `<div class="table-section"><div class="table-title">${pyResult.displayName || pyResult.name}</div><pre style="background: #f8fafc; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 11px; border: 1px solid #e5e7eb;">${JSON.stringify(pyResult.variables, null, 2)}</pre></div>`;
                } else if (pyResult.type === 'html' && pyResult.html) {
                    fullHtml += `<div class="table-section"><div class="table-title">${pyResult.displayName || pyResult.name}</div><div style="margin: 10px 0;">${pyResult.html}</div></div>`;
                }
            }
        }

        // Add Pipeline Execution Report Footer (if provided)
        if (params.pipelineReport && params.pipelineReport.length > 0) {
            const svgAttrs = 'xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block;"';
            const pythonSvg = `<svg ${svgAttrs} stroke="#059669"><path d="M10 12.5 8 15l2 2.5"/><path d="m14 12.5 2 2.5-2 2.5"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/></svg>`;
            const sqlSvg = `<svg ${svgAttrs} stroke="#2563eb"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>`;
            const aiSvg = `<svg ${svgAttrs} stroke="#7c3aed"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg>`;
            const exportSvg = `<svg ${svgAttrs} stroke="#94a3b8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>`;
            const checkSvg = `<svg ${svgAttrs} stroke="#4ade80"><path d="M20 6 9 17l-5-5"/></svg>`;
            const xSvg = `<svg ${svgAttrs} stroke="#f87171"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;

            const buildRow = (entry: any, bgColor: string) => {
                const typeIcon = entry.type === 'Python' ? pythonSvg : entry.type === 'AI' ? aiSvg : entry.type === 'Export' ? exportSvg : sqlSvg;
                const time = new Date(entry.timestamp).toLocaleTimeString('it-IT');
                // Build readable node path: "root > A > B > C"
                const nodePath = entry.nodePath
                    ? entry.nodePath.replace(/\['\w+'\]/g, (m: string) => ' > ' + m.replace(/[\[\]']/g, '')).replace(/^\./, '').replace(/^root\./, 'root > ')
                    : '-';
                const isError = entry.status === 'error';
                return `
                    <tr style="border-bottom: 1px solid #334155; background: ${bgColor};">
                        <td style="padding: 6px 8px; color: #e2e8f0; font-weight: 500;">${entry.name}</td>
                        <td style="padding: 6px 8px; color: #64748b; font-size: 9px; max-width: 200px;">${nodePath}</td>
                        <td style="padding: 6px 8px; color: #94a3b8;">${typeIcon}&nbsp;${entry.type}</td>
                        ${isError ? `<td colspan="2" style="padding: 6px 8px; color: #fca5a5; font-size: 9px;">${xSvg}&nbsp;${entry.error || 'Errore sconosciuto'}</td>` : `<td style="padding: 6px 8px; color: #4ade80;">${checkSvg}&nbsp;ok</td><td style="padding: 6px 8px; color: #94a3b8;">${time}</td>`}
                    </tr>`;
            };

            const errorEntries = params.pipelineReport.filter(e => e.status === 'error');
            const successEntries = params.pipelineReport.filter(e => e.status !== 'error');

            const tableHeader = `
                <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
                    <thead>
                        <tr style="border-bottom: 1px solid #475569;">
                            <th style="text-align: left; padding: 6px 8px; color: #94a3b8;">Nome</th>
                            <th style="text-align: left; padding: 6px 8px; color: #94a3b8;">Nodo</th>
                            <th style="text-align: left; padding: 6px 8px; color: #94a3b8;">Tipo</th>
                            <th style="text-align: left; padding: 6px 8px; color: #94a3b8;" colspan="2">Dettaglio</th>
                        </tr>
                    </thead>`;

            let pipelineHtml = `<div style="margin-top: 30px; border-radius: 8px; overflow: hidden; font-size: 10px; border: 1px solid #334155;">`;

            // ── FAILURES section (shown only if there are errors) ──────────────────
            if (errorEntries.length > 0) {
                pipelineHtml += `
                <div style="padding: 10px 14px; background: linear-gradient(135deg, #450a0a 0%, #7f1d1d 100%); display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 13px;">❌</span>
                    <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #fca5a5;">Fallimenti (${errorEntries.length})</span>
                </div>
                ${tableHeader}<tbody>
                    ${errorEntries.map(e => buildRow(e, 'rgba(220,38,38,0.08)')).join('')}
                </tbody></table>`;
            }

            // ── SUCCESS section ────────────────────────────────────────────────────
            if (successEntries.length > 0) {
                pipelineHtml += `
                <div style="padding: 10px 14px; background: linear-gradient(135deg, #1e293b 0%, #334155 100%); display: flex; align-items: center; gap: 8px; ${errorEntries.length > 0 ? 'border-top: 1px solid #334155;' : ''}">
                    <span style="font-size: 13px;">✅</span>
                    <span style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8;">Completati (${successEntries.length})</span>
                </div>
                ${tableHeader}<tbody>
                    ${successEntries.map(e => buildRow(e, 'transparent')).join('')}
                </tbody></table>`;
            }

            pipelineHtml += `</div>`;
            fullHtml += pipelineHtml;
        }

        fullHtml += `</body></html>`;


        // Generate Excel attachments (with row limit to prevent size issues)
        let attachments: any[] = [...inlineAttachments]; // Start with inline chart attachments

        // Process Media Attachments
        if (params.mediaAttachments && params.mediaAttachments.length > 0 && params.availableMedia) {
            console.log(`[EMAIL DEBUG] Processing ${params.mediaAttachments.length} media attachments...`);
            for (const mediaName of params.mediaAttachments) {
                const mediaItem = params.availableMedia.find(m =>
                    (m.name || m.url.split('/').pop() || 'file') === mediaName
                );

                if (mediaItem) {
                    try {
                        let content: Buffer;
                        if (mediaItem.url.startsWith('http')) {
                            const res = await fetch(mediaItem.url);
                            const arrayBuffer = await res.arrayBuffer();
                            content = Buffer.from(arrayBuffer);
                        } else {
                            // Assume local path relative to public
                            const filePath = path.join(process.cwd(), 'public', mediaItem.url.startsWith('/') ? mediaItem.url.substring(1) : mediaItem.url);
                            content = await fs.readFile(filePath);
                        }

                        attachments.push({
                            filename: mediaItem.name || mediaItem.url.split('/').pop() || 'file',
                            content: content,
                        });
                        console.log(`[EMAIL DEBUG] Attached media: ${mediaName}`);
                    } catch (err: any) {
                        console.error(`[EMAIL DEBUG] Failed to attach media ${mediaName}:`, err.message);
                    }
                }
            }
        }
        const ExcelJS = (await import('exceljs')).default;
        const MAX_EXCEL_ROWS = 5000; // Limit Excel to 5K rows to keep file size reasonable

        console.log(`[EMAIL DEBUG] Inline chart attachments: ${inlineAttachments.length}`);
        console.log('[EMAIL DEBUG] Generating Excel attachments...');

        for (const tr of tableResults) {
            if (tr.asExcel && tr.data.length > 0) {
                console.log(`[EMAIL DEBUG] Creating Excel for ${tr.name} (${tr.data.length} total rows, limiting to ${MAX_EXCEL_ROWS})...`);

                const excelData = tr.data.slice(0, MAX_EXCEL_ROWS);
                const wb = new ExcelJS.Workbook();
                const ws = wb.addWorksheet(tr.name.substring(0, 31));
                if (excelData.length > 0) {
                    const headers = Object.keys(excelData[0] as Record<string, unknown>);
                    ws.columns = headers.map(h => ({ header: h, key: h }));
                    ws.addRows(excelData as Record<string, unknown>[]);
                }
                const buffer = Buffer.from(await wb.xlsx.writeBuffer());

                console.log(`[EMAIL DEBUG] Excel file ${tr.name}.xlsx size: ${(buffer.length / 1024).toFixed(2)} KB`);

                attachments.push({
                    filename: `${tr.name}.xlsx`,
                    content: buffer,
                    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                });
            }
        }

        // Add Python output attachments
        console.log(`[EMAIL DEBUG] Processing ${pythonResults.length} python results for attachments...`);
        for (const pyResult of pythonResults) {
            console.log(`[EMAIL DEBUG] Python result "${pyResult.name}": type=${pyResult.type}, inBody=${pyResult.inBody}, asAttachment=${pyResult.asAttachment}, hasPlotlyJson=${!!pyResult.plotlyJson}, hasChartBase64=${!!pyResult.chartBase64}, hasChartHtml=${!!pyResult.chartHtml}, hasStyleOverrides=${!!pyResult.plotlyStyleOverrides}, styleOverrides=${JSON.stringify(pyResult.plotlyStyleOverrides || null)}`);

            // AUTO-ATTACH: If a chart is inBody and has plotlyJson, also attach as interactive HTML with styles
            if (pyResult.inBody && pyResult.type === 'chart' && pyResult.plotlyJson && !pyResult.asAttachment) {
                const styledFigure = applyPlotlyOverrides(pyResult.plotlyJson, pyResult.plotlyStyleOverrides || {});
                const htmlContent = plotlyJsonToHtml(styledFigure);
                const buffer = Buffer.from(htmlContent, 'utf8');
                console.log(`[EMAIL DEBUG] Auto-attaching styled Plotly HTML for inBody chart ${pyResult.name}: ${(buffer.length / 1024).toFixed(2)} KB`);
                attachments.push({
                    filename: `${pyResult.name}.html`,
                    content: buffer,
                    contentType: 'text/html'
                });
            }

            if (pyResult.asAttachment) {
                if (pyResult.type === 'chart') {
                    if (pyResult.plotlyJson) {
                        // PRIORITY: Use Plotly JSON with style overrides for best quality
                        const styledFigure = applyPlotlyOverrides(pyResult.plotlyJson, pyResult.plotlyStyleOverrides || {});
                        const htmlContent = plotlyJsonToHtml(styledFigure);
                        const buffer = Buffer.from(htmlContent, 'utf8');
                        console.log(`[EMAIL DEBUG] Plotly styled HTML file ${pyResult.name}.html size: ${(buffer.length / 1024).toFixed(2)} KB`);

                        attachments.push({
                            filename: `${pyResult.name}.html`,
                            content: buffer,
                            contentType: 'text/html'
                        });
                    } else if (pyResult.chartHtml) {
                        // Fallback: Attach chart as interactive HTML file
                        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${pyResult.name}</title>
</head>
<body>
    <h1 style="font-family: Arial, sans-serif; color: #333;">${pyResult.name}</h1>
    ${pyResult.chartHtml}
</body>
</html>
                        `.trim();
                        const buffer = Buffer.from(htmlContent, 'utf8');
                        console.log(`[EMAIL DEBUG] Chart HTML file ${pyResult.name}.html size: ${(buffer.length / 1024).toFixed(2)} KB`);

                        attachments.push({
                            filename: `${pyResult.name}.html`,
                            content: buffer,
                            contentType: 'text/html'
                        });
                    } else if (pyResult.chartBase64) {
                        // Fallback: Attach as PNG if no HTML available
                        const buffer = Buffer.from(pyResult.chartBase64, 'base64');
                        console.log(`[EMAIL DEBUG] Chart PNG file ${pyResult.name}.png size: ${(buffer.length / 1024).toFixed(2)} KB`);

                        attachments.push({
                            filename: `${pyResult.name}.png`,
                            content: buffer,
                            contentType: 'image/png'
                        });
                    }
                } else if (pyResult.type === 'table' && pyResult.data && pyResult.data.length > 0) {
                    // Attach table as Excel
                    const ExcelJS = (await import('exceljs')).default;
                    const MAX_EXCEL_ROWS = 5000;
                    const excelData = pyResult.data.slice(0, MAX_EXCEL_ROWS);
                    const wb = new ExcelJS.Workbook();
                    const ws = wb.addWorksheet(pyResult.name.substring(0, 31));
                    if (excelData.length > 0) {
                        const headers = Object.keys(excelData[0] as Record<string, unknown>);
                        ws.columns = headers.map(h => ({ header: h, key: h }));
                        ws.addRows(excelData as Record<string, unknown>[]);
                    }
                    const buffer = Buffer.from(await wb.xlsx.writeBuffer());

                    console.log(`[EMAIL DEBUG] Python Excel file ${pyResult.name}.xlsx size: ${(buffer.length / 1024).toFixed(2)} KB`);

                    attachments.push({
                        filename: `${pyResult.name}.xlsx`,
                        content: buffer,
                        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                    });
                } else if (pyResult.type === 'html' && pyResult.html) {
                    // Attach HTML content as .html file - ALWAYS wrap with platform CSS
                    // Even without custom overrides the platform layout classes
                    // (.kpi-grid, .stat-card, .card, data-row-status colors, etc.) are needed
                    const attachOverrides = pyResult.htmlStyleOverrides || effectiveHtmlOverrides || {};
                    const styledHtml = applyHtmlStyleOverrides(pyResult.html, attachOverrides);
                    const buffer = Buffer.from(styledHtml, 'utf8');
                    console.log(`[EMAIL DEBUG] HTML file ${pyResult.name}.html size: ${(buffer.length / 1024).toFixed(2)} KB`);

                    attachments.push({
                        filename: `${pyResult.name}.html`,
                        content: buffer,
                        contentType: 'text/html'
                    });
                }
            }
        }

        // ZIP all attachments if total size exceeds 5MB
        const ZIP_THRESHOLD_BYTES = 5 * 1024 * 1024; // 5MB
        const totalAttachmentBytes = attachments.reduce((sum, att) => sum + att.content.length, 0);

        if (totalAttachmentBytes > ZIP_THRESHOLD_BYTES && attachments.length > 0) {
            console.log(`[EMAIL DEBUG] Total attachments ${(totalAttachmentBytes / 1024 / 1024).toFixed(2)} MB exceeds ${ZIP_THRESHOLD_BYTES / 1024 / 1024}MB threshold - creating ZIP...`);

            const archiver = (await import('archiver')).default;
            const { PassThrough } = await import('stream');

            const zipBuffer = await new Promise<Buffer>((resolve, reject) => {
                const chunks: Buffer[] = [];
                const passthrough = new PassThrough();
                passthrough.on('data', (chunk: Buffer) => chunks.push(chunk));
                passthrough.on('end', () => resolve(Buffer.concat(chunks)));
                passthrough.on('error', reject);

                const archive = archiver('zip', { zlib: { level: 9 } });
                archive.on('error', reject);
                archive.pipe(passthrough);

                for (const att of attachments) {
                    archive.append(att.content, { name: att.filename });
                }

                archive.finalize();
            });

            console.log(`[EMAIL DEBUG] ZIP created: ${(zipBuffer.length / 1024 / 1024).toFixed(2)} MB (was ${(totalAttachmentBytes / 1024 / 1024).toFixed(2)} MB, saved ${(((totalAttachmentBytes - zipBuffer.length) / totalAttachmentBytes) * 100).toFixed(0)}%)`);

            // Replace all attachments with single ZIP (keep inline attachments separate)
            const inlineOnly = attachments.filter(att => (att as any).cid);
            attachments = [
                ...inlineOnly,
                {
                    filename: `report-allegati.zip`,
                    content: zipBuffer,
                    contentType: 'application/zip'
                }
            ];
        }

        // Send email
        const transporter = nodemailer.createTransport({
            host: smtpConf.host,
            port: parseInt(smtpConf.port) || 587,
            secure: parseInt(smtpConf.port) === 465,
            auth: { user: smtpConf.user, pass: smtpConf.password },
            tls: { rejectUnauthorized: process.env.NODE_ENV === 'production' }
        });

        const mailOptions: any = {
            from: smtpConf.from || smtpConf.user,
            to: params.to,
            subject: params.subject,
            html: fullHtml,
            attachments
        };
        if (params.cc) mailOptions.cc = params.cc;
        if (params.bcc) mailOptions.bcc = params.bcc;

        // Log email size info
        const htmlSizeKB = (Buffer.byteLength(fullHtml, 'utf8') / 1024).toFixed(2);
        const totalAttachmentSizeKB = attachments.reduce((sum, att) => sum + att.content.length, 0) / 1024;
        const totalEmailSizeMB = ((Buffer.byteLength(fullHtml, 'utf8') + attachments.reduce((sum, att) => sum + att.content.length, 0)) / 1024 / 1024).toFixed(2);

        console.log('[EMAIL DEBUG] ===== EMAIL SIZE INFO =====');
        console.log(`[EMAIL DEBUG] HTML body size: ${htmlSizeKB} KB`);
        console.log(`[EMAIL DEBUG] Total attachments size: ${totalAttachmentSizeKB.toFixed(2)} KB`);
        console.log(`[EMAIL DEBUG] TOTAL email size: ${totalEmailSizeMB} MB`);
        console.log(`[EMAIL DEBUG] Number of attachments: ${attachments.length}`);
        console.log('[EMAIL DEBUG] Sending email now...');

        const info = await transporter.sendMail(mailOptions);

        console.log('[EMAIL DEBUG] ✅ Email sent successfully!');
        console.log(`[EMAIL DEBUG] MessageId: ${info.messageId}`);

        return {
            success: true,
            message: `Email inviata a ${params.to} con ${tableResults.length} tabelle SQL e ${pythonResults.length} output Python (${attachments.length} allegati)`,
            messageId: info.messageId
        };

    } catch (e: any) {
        console.error('Send Test Email With Data Error:', e);
        return { success: false, error: `Errore: ${e.message}` };
    }
}

// ─── WhatsApp: Send test message ─────────────────────────────────────────────
export async function sendWhatsAppTestMessageAction(
    connectorId: string,
    phoneNumber: string,
    message: string,
    useTemplate: boolean = false
): Promise<{ success: boolean; message?: string; error?: string }> {
    const user = await getAuthenticatedUser();
    if (!user) return { success: false, error: 'Non autorizzato' };

    try {
        const connector = await db.connector.findFirst({
            where: { id: connectorId, companyId: user.companyId, type: 'WHATSAPP' },
        });
        if (!connector) return { success: false, error: 'Connettore WhatsApp non trovato' };

        const conf = JSON.parse(connector.config);
        if (!conf.phoneNumberId || !conf.accessToken) {
            return { success: false, error: 'Phone Number ID e Access Token mancanti nella configurazione' };
        }

        // Clean phone number: remove spaces, dashes, leading +
        const cleanPhone = phoneNumber.replace(/[\s\-+]/g, '');
        if (!cleanPhone || cleanPhone.length < 8) {
            return { success: false, error: 'Numero di telefono non valido' };
        }

        if (useTemplate) {
            // Send template message (hello_world) — required to initiate conversations
            // in development mode or outside the 24h window
            const { sendWhatsAppTemplateMessage } = await import('@/lib/whatsapp-send');
            await sendWhatsAppTemplateMessage(conf.phoneNumberId, conf.accessToken, cleanPhone);
            // Log the sent template in the session
            await logTestMessage(connectorId, user.companyId, cleanPhone, '[Template: hello_world]', 'assistant');
            return { success: true, message: `Template "hello_world" inviato a ${phoneNumber}` };
        } else {
            const { sendWhatsAppMessage } = await import('@/lib/whatsapp-send');
            await sendWhatsAppMessage(conf.phoneNumberId, conf.accessToken, cleanPhone, message);
            // Log the sent message in the session
            await logTestMessage(connectorId, user.companyId, cleanPhone, message, 'assistant');
            return { success: true, message: `Messaggio inviato a ${phoneNumber}` };
        }
    } catch (e: any) {
        return { success: false, error: `Errore invio: ${e.message}` };
    }
}

// ─── WhatsApp: Log test message to session ───────────────────────────────────
async function logTestMessage(connectorId: string, companyId: string, phone: string, content: string, role: 'user' | 'assistant') {
    try {
        // Find or create session for this phone number
        const session = await db.whatsAppSession.findUnique({
            where: { phoneNumber_connectorId: { phoneNumber: phone, connectorId } },
        });

        const msgEntry = { role, content, timestamp: new Date().toISOString() };

        if (session) {
            const messages: any[] = Array.isArray(session.messages) ? session.messages : [];
            messages.push(msgEntry);
            await db.whatsAppSession.update({
                where: { id: session.id },
                data: { messages },
            });
        } else {
            await db.whatsAppSession.create({
                data: {
                    phoneNumber: phone,
                    connectorId,
                    companyId,
                    messages: [msgEntry],
                    collectedData: {},
                    status: 'collecting',
                },
            });
        }
    } catch (err) {
        // Don't fail the send if logging fails
        console.error('[WhatsApp] Failed to log test message:', err);
    }
}

// ─── WhatsApp: Get recent sessions/logs ──────────────────────────────────────
export async function getWhatsAppSessionsAction(
    connectorId: string
): Promise<{ success: boolean; sessions?: any[]; error?: string }> {
    const user = await getAuthenticatedUser();
    if (!user) return { success: false, error: 'Non autorizzato' };

    try {
        const connector = await db.connector.findFirst({
            where: { id: connectorId, companyId: user.companyId, type: 'WHATSAPP' },
        });
        if (!connector) return { success: false, error: 'Connettore WhatsApp non trovato' };

        const sessions = await db.whatsAppSession.findMany({
            where: { connectorId, companyId: user.companyId },
            orderBy: { updatedAt: 'desc' },
            select: {
                id: true,
                phoneNumber: true,
                status: true,
                messages: true,
                collectedData: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        // Load contacts to map phone -> name
        const contacts = await db.whatsAppContact.findMany({
            where: { companyId: user.companyId },
            select: { phoneNumber: true, name: true },
        });
        const contactMap = Object.fromEntries(contacts.map((c: any) => [c.phoneNumber, c.name]));

        // Enrich sessions with contact names
        const enriched = sessions.map((s: any) => ({
            ...s,
            contactName: contactMap[s.phoneNumber] || null,
        }));

        return { success: true, sessions: enriched };
    } catch (e: any) {
        return { success: false, error: `Errore caricamento log: ${e.message}` };
    }
}

// ─── WhatsApp: Rubrica contatti ───────────────────────────────────────────────

export async function getWhatsAppContactsAction(): Promise<{ success: boolean; contacts?: any[]; error?: string }> {
    const user = await getAuthenticatedUser();
    if (!user) return { success: false, error: 'Non autorizzato' };

    try {
        const contacts = await db.whatsAppContact.findMany({
            where: { companyId: user.companyId },
            orderBy: { name: 'asc' },
        });
        return { success: true, contacts };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function saveWhatsAppContactAction(
    phoneNumber: string,
    name: string,
    notes?: string
): Promise<{ success: boolean; error?: string }> {
    const user = await getAuthenticatedUser();
    if (!user) return { success: false, error: 'Non autorizzato' };

    if (!phoneNumber.trim() || !name.trim()) return { success: false, error: 'Nome e numero sono obbligatori' };

    // Normalize: remove spaces, dashes
    const normalized = phoneNumber.replace(/[\s\-()]/g, '');

    try {
        await db.whatsAppContact.upsert({
            where: { phoneNumber_companyId: { phoneNumber: normalized, companyId: user.companyId } },
            update: { name: name.trim(), notes: notes?.trim() || null },
            create: { phoneNumber: normalized, name: name.trim(), notes: notes?.trim() || null, companyId: user.companyId },
        });
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function deleteWhatsAppContactAction(
    phoneNumber: string
): Promise<{ success: boolean; error?: string }> {
    const user = await getAuthenticatedUser();
    if (!user) return { success: false, error: 'Non autorizzato' };

    try {
        await db.whatsAppContact.delete({
            where: { phoneNumber_companyId: { phoneNumber, companyId: user.companyId } },
        });
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}
