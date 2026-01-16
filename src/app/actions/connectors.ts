'use server'

import { db } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/session';
import sql from 'mssql';
import nodemailer from 'nodemailer';
import fs from 'fs/promises';
import path from 'path';
import type { MediaItem, LinkItem, TriggerItem } from '@/lib/types';
import { testSharePointConnectionAction } from './sharepoint';

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
                rejectUnauthorized: false
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
        query: string;
        inBody: boolean;
        asExcel: boolean;
        pipelineDependencies?: Array<{ tableName: string; query?: string; isPython?: boolean; pythonCode?: string; connectorId?: string }>;
    }>;
    selectedPythonOutputs?: Array<{
        name: string;
        code: string;
        outputType: 'table' | 'variable' | 'chart';
        connectorId?: string;
        inBody: boolean;
        asAttachment: boolean;
        dependencies?: Array<{ tableName: string; connectorId?: string; query?: string; pipelineDependencies?: any[] }>;
    }>;
    availableMedia?: MediaItem[];
    availableLinks?: LinkItem[];
    availableTriggers?: TriggerItem[];
    mediaAttachments?: string[];
}) {
    console.log('[EMAIL DEBUG] sendTestEmailWithDataAction called with:', {
        connectorId: params.connectorId,
        sqlConnectorId: params.sqlConnectorId,
        to: params.to,
        subject: params.subject,
        selectedTablesCount: params.selectedTables?.length || 0,
        selectedPythonOutputsCount: params.selectedPythonOutputs?.length || 0,
        mediaAttachmentsCount: params.mediaAttachments?.length || 0
    });

    const user = await getAuthenticatedUser();
    if (!user) return { error: 'Non autorizzato' };

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
        const tableResults: { name: string; data: any[]; inBody: boolean; asExcel: boolean }[] = [];

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
                    trustServerCertificate: true,
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

                // First, execute all pipelineDependencies from all selected tables (in order)
                // This includes BOTH Python and SQL dependencies
                const { executePythonPreviewAction } = await import('@/app/actions');

                for (const table of params.selectedTables) {
                    if (table.pipelineDependencies && table.pipelineDependencies.length > 0) {
                        console.log(`[EMAIL DEBUG] Executing ${table.pipelineDependencies.length} dependencies for ${table.name}`);
                        for (const dep of table.pipelineDependencies) {
                            // Check if already executed
                            if (executedTables.has(dep.tableName)) {
                                console.log(`[EMAIL DEBUG] Dependency ${dep.tableName} already executed, skipping`);
                                continue;
                            }

                            // Execute Python dependencies first
                            if (dep.isPython && dep.pythonCode) {
                                console.log(`[EMAIL DEBUG] Executing PYTHON dependency: ${dep.tableName}`);
                                try {
                                    // Recursively pass nested dependencies if any
                                    const nestedDeps = (dep as any).pipelineDependencies || [];
                                    const pythonResult = await executePythonPreviewAction(
                                        dep.pythonCode,
                                        'table', // Assume table output for dependencies
                                        {},
                                        nestedDeps,
                                        dep.connectorId
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
                    try {
                        console.log(`[EMAIL DEBUG] Executing query for ${table.name}: ${table.query.substring(0, 100)}...`);

                        // Execute the query using the SAME request (same connection)
                        const result = await request.query(table.query);
                        const data = result.recordset || [];
                        executedTables.add(table.name);

                        tableResults.push({
                            name: table.name,
                            data: data,
                            inBody: table.inBody,
                            asExcel: table.asExcel
                        });
                    } catch (err: any) {
                        console.error(`Error executing query for ${table.name}:`, err.message);
                        tableResults.push({
                            name: table.name,
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
            inBody: boolean;
            asAttachment: boolean;
            data?: any[];
            chartBase64?: string;
            chartHtml?: string;
            variables?: Record<string, any>;
            type: 'table' | 'variable' | 'chart';
        }> = [];

        if (params.selectedPythonOutputs && params.selectedPythonOutputs.length > 0) {
            console.log('[EMAIL DEBUG] Executing Python outputs...');
            const { executePythonPreviewAction } = await import('@/app/actions');

            for (const pyOutput of params.selectedPythonOutputs) {
                try {
                    console.log(`[EMAIL DEBUG] Executing Python for ${pyOutput.name} (type: ${pyOutput.outputType})...`);

                    // Execute Python script
                    const result = await executePythonPreviewAction(
                        pyOutput.code,
                        pyOutput.outputType,
                        {},
                        pyOutput.dependencies || []
                    );

                    if (result.success) {
                        pythonResults.push({
                            name: pyOutput.name,
                            inBody: pyOutput.inBody,
                            asAttachment: pyOutput.asAttachment,
                            data: result.data,
                            chartBase64: result.chartBase64,
                            chartHtml: result.chartHtml,
                            variables: result.variables,
                            type: pyOutput.outputType
                        });
                        console.log(`[EMAIL DEBUG] Python ${pyOutput.name} executed successfully`);
                    } else {
                        console.error(`[EMAIL DEBUG] Python ${pyOutput.name} failed:`, result.error);
                        pythonResults.push({
                            name: pyOutput.name,
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
                        inBody: pyOutput.inBody,
                        asAttachment: pyOutput.asAttachment,
                        data: [{ error: err.message }],
                        type: pyOutput.outputType
                    });
                }
            }
        }

        // Build HTML body with tables
        let fullHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 950px; margin: 0 auto; padding: 15px; color: #374151; font-size: 12px; }
        .user-content { margin-bottom: 15px; line-height: 1.5; }
        .table-section { margin: 15px 0; }
        .table-title { font-size: 12px; font-weight: 600; color: #1f2937; margin-bottom: 6px; padding: 6px 10px; background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); border-radius: 4px; border-left: 3px solid #3b82f6; }
        .row-info { color: #6b7280; font-size: 9px; margin: 4px 0 8px 0; }
        table { border-collapse: collapse; width: 100%; font-size: 10px; border: 1px solid #d1d5db; }
        th { background: linear-gradient(135deg, #1e293b 0%, #334155 100%); color: #f1f5f9; padding: 5px 7px; text-align: left; font-weight: 500; font-size: 9px; text-transform: uppercase; letter-spacing: 0.3px; border: 1px solid #475569; white-space: nowrap; }
        td { padding: 4px 7px; border: 1px solid #d1d5db; color: #374151; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        tr:nth-child(even) { background-color: #f9fafb; }
        tr:hover { background-color: #f3f4f6; }
        .chart-container { text-align: center; padding: 10px; margin: 15px 0; }
        h1, h2, h3 { color: #1f2937; margin: 10px 0; }
        p { line-height: 1.5; margin: 8px 0; }
        a { color: #2563eb; }
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
                return generateTableHtml(tableName, tableData.data);
            }
            return `<p><em>Tabella ${tableName} non trovata</em></p>`;
        });



        // Replace chart placeholders: {{GRAFICO:nome}}
        processedBody = processedBody.replace(/\{\{GRAFICO:([^}]+)\}\}/g, (match, chartName) => {
            const chartResult = pythonResults.find(p => p.name === chartName && p.type === 'chart');
            if (chartResult && chartResult.chartBase64) {
                const cid = `chart_${chartName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;
                console.log(`[EMAIL DEBUG] Replacing placeholder {{GRAFICO:${chartName}}} with CID image: ${cid}`);

                inlineAttachments.push({
                    filename: `${chartName}.png`,
                    content: Buffer.from(chartResult.chartBase64, 'base64'),
                    contentType: 'image/png',
                    cid: cid
                });

                return `<div class="chart-container"><div class="table-title">${chartName}</div><img src="cid:${cid}" alt="${chartName}" style="max-width: 100%; height: auto;" /></div>`;
            }
            return `<p><em>Grafico ${chartName} non trovato</em></p>`;
        });

        // Add the processed body to the HTML
        fullHtml += `<div class="user-content">${processedBody}</div>`;

        // Also add any tables/charts marked inBody but not inserted via placeholder
        // (backwards compatibility with old checkbox-based selection)
        for (const tr of tableResults) {
            // Only add if marked inBody AND not already inserted via placeholder
            if (tr.inBody && tr.data.length > 0 && !params.bodyHtml?.includes(`{{TABELLA:${tr.name}}}`)) {
                fullHtml += generateTableHtml(tr.name, tr.data);
            }
        }

        // Add Python outputs marked inBody but not inserted via placeholder
        for (const pyResult of pythonResults) {
            if (pyResult.inBody && !params.bodyHtml?.includes(`{{GRAFICO:${pyResult.name}}}`)) {
                if (pyResult.type === 'chart' && pyResult.chartBase64) {
                    const cid = `chart_fallback_${pyResult.name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;
                    console.log(`[EMAIL DEBUG] Adding fallback chart ${pyResult.name} as CID: ${cid}`);

                    inlineAttachments.push({
                        filename: `${pyResult.name}.png`,
                        content: Buffer.from(pyResult.chartBase64, 'base64'),
                        contentType: 'image/png',
                        cid: cid
                    });

                    fullHtml += `<div class="chart-container"><div class="table-title">${pyResult.name}</div><img src="cid:${cid}" alt="${pyResult.name}" style="max-width: 100%; height: auto;" /></div>`;
                } else if (pyResult.type === 'table' && pyResult.data && pyResult.data.length > 0) {
                    fullHtml += generateTableHtml(pyResult.name, pyResult.data);
                } else if (pyResult.type === 'variable' && pyResult.variables) {
                    fullHtml += `<div class="table-section"><div class="table-title">${pyResult.name}</div><pre style="background: #f8fafc; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 11px; border: 1px solid #e5e7eb;">${JSON.stringify(pyResult.variables, null, 2)}</pre></div>`;
                }
            }
        }

        fullHtml += `</body></html>`;

        // Generate Excel attachments (with row limit to prevent size issues)
        const attachments: any[] = [...inlineAttachments]; // Start with inline chart attachments

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
        const XLSX = await import('xlsx');
        const MAX_EXCEL_ROWS = 5000; // Limit Excel to 5K rows to keep file size reasonable

        console.log(`[EMAIL DEBUG] Inline chart attachments: ${inlineAttachments.length}`);
        console.log('[EMAIL DEBUG] Generating Excel attachments...');

        for (const tr of tableResults) {
            if (tr.asExcel && tr.data.length > 0) {
                console.log(`[EMAIL DEBUG] Creating Excel for ${tr.name} (${tr.data.length} total rows, limiting to ${MAX_EXCEL_ROWS})...`);

                // Limit Excel data to prevent huge files
                const excelData = tr.data.slice(0, MAX_EXCEL_ROWS);
                const ws = XLSX.utils.json_to_sheet(excelData);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, tr.name.substring(0, 31)); // Excel sheet name max 31 chars
                const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

                console.log(`[EMAIL DEBUG] Excel file ${tr.name}.xlsx size: ${(buffer.length / 1024).toFixed(2)} KB`);

                attachments.push({
                    filename: `${tr.name}.xlsx`,
                    content: buffer,
                    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                });
            }
        }

        // Add Python output attachments
        for (const pyResult of pythonResults) {
            if (pyResult.asAttachment) {
                if (pyResult.type === 'chart') {
                    if (pyResult.chartHtml) {
                        // Attach chart as interactive HTML file
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
                    const MAX_EXCEL_ROWS = 5000;
                    const excelData = pyResult.data.slice(0, MAX_EXCEL_ROWS);
                    const ws = XLSX.utils.json_to_sheet(excelData);
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, pyResult.name.substring(0, 31));
                    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

                    console.log(`[EMAIL DEBUG] Python Excel file ${pyResult.name}.xlsx size: ${(buffer.length / 1024).toFixed(2)} KB`);

                    attachments.push({
                        filename: `${pyResult.name}.xlsx`,
                        content: buffer,
                        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                    });
                }
            }
        }

        // Send email
        const transporter = nodemailer.createTransport({
            host: smtpConf.host,
            port: parseInt(smtpConf.port) || 587,
            secure: parseInt(smtpConf.port) === 465,
            auth: { user: smtpConf.user, pass: smtpConf.password },
            tls: { rejectUnauthorized: false }
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
