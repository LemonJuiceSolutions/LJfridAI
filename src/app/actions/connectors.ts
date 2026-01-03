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
        pipelineDependencies?: Array<{ tableName: string; query: string }>;
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
}) {
    console.log('[EMAIL DEBUG] sendTestEmailWithDataAction called with:', {
        connectorId: params.connectorId,
        sqlConnectorId: params.sqlConnectorId,
        to: params.to,
        subject: params.subject,
        selectedTablesCount: params.selectedTables?.length || 0,
        selectedPythonOutputsCount: params.selectedPythonOutputs?.length || 0,
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

        // Get SQL connector
        const sqlConnector = await db.connector.findFirst({
            where: { id: params.sqlConnectorId, companyId: user.companyId, type: 'SQL' }
        });
        if (!sqlConnector) {
            return { success: false, error: 'Connettore SQL non trovato' };
        }

        const smtpConf = JSON.parse(smtpConnector.config);
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
        // This is required for temp tables to be visible across multiple queries
        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        const request = new sql.Request(transaction);

        // Execute queries and collect results
        // First, we need to execute ALL dependencies in order to create temp tables
        // This allows queries to reference previous query results (e.g., HR2 references HR1)
        const tableResults: { name: string; data: any[]; inBody: boolean; asExcel: boolean }[] = [];
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

        // First, execute all pipelineDependencies from all selected tables (in order)
        for (const table of params.selectedTables) {
            if (table.pipelineDependencies && table.pipelineDependencies.length > 0) {
                console.log(`[EMAIL DEBUG] Executing ${table.pipelineDependencies.length} dependencies for ${table.name}`);
                for (const dep of table.pipelineDependencies) {
                    await executeAndCreateTempTable(dep.tableName, dep.query);
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

        // Commit the transaction before closing
        await transaction.commit();
        await pool.close();

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
        body { font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; }
        .user-content { margin-bottom: 30px; }
        .table-section { margin: 20px 0; }
        .table-title { font-size: 16px; font-weight: bold; color: #333; margin-bottom: 10px; background: #f0f0f0; padding: 8px; border-radius: 4px; }
        table { border-collapse: collapse; width: 100%; font-size: 12px; }
        th { background-color: #4a5568; color: white; padding: 8px; text-align: left; }
        td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
        tr:nth-child(even) { background-color: #f7fafc; }
        tr:hover { background-color: #edf2f7; }
    </style>
</head>
<body>
    <div class="user-content">${params.bodyHtml || ''}</div>
`;

        // Add tables to body
        for (const tr of tableResults) {
            if (tr.inBody && tr.data.length > 0) {
                fullHtml += `<div class="table-section">`;
                fullHtml += `<div class="table-title">📊 ${tr.name}</div>`;

                // Limit rows in email body to prevent size limit errors
                const MAX_ROWS_IN_EMAIL = 100;
                const totalRows = tr.data.length;
                const displayRows = tr.data.slice(0, MAX_ROWS_IN_EMAIL);

                if (totalRows > MAX_ROWS_IN_EMAIL) {
                    fullHtml += `<p style="color: #666; font-size: 11px; margin: 5px 0;">Mostrando prime ${MAX_ROWS_IN_EMAIL} righe di ${totalRows.toLocaleString()} totali. Vedi allegato Excel per dati completi.</p>`;
                }

                fullHtml += `<table><thead><tr>`;

                const columns = Object.keys(tr.data[0]);
                columns.forEach(col => {
                    fullHtml += `<th>${col}</th>`;
                });
                fullHtml += `</tr></thead><tbody>`;

                displayRows.forEach(row => {
                    fullHtml += `<tr>`;
                    columns.forEach(col => {
                        let val = row[col];
                        if (val === null || val === undefined) val = '';
                        else if (typeof val === 'object' && val instanceof Date) val = val.toLocaleString('it-IT');
                        else if (typeof val === 'object') val = JSON.stringify(val);
                        fullHtml += `<td>${val}</td>`;
                    });
                    fullHtml += `</tr>`;
                });
                fullHtml += `</tbody></table></div>`;
            }
        }

        // Add Python outputs to body
        for (const pyResult of pythonResults) {
            if (pyResult.inBody) {
                fullHtml += `<div class="table-section">`;
                fullHtml += `<div class="table-title">🐍 ${pyResult.name}</div>`;

                if (pyResult.type === 'chart') {
                    // Embed interactive HTML chart
                    if (pyResult.chartHtml) {
                        fullHtml += `<div style="padding: 20px;">`;
                        fullHtml += pyResult.chartHtml; // Directly embed the HTML chart
                        fullHtml += `</div>`;
                    } else if (pyResult.chartBase64) {
                        // Fallback to base64 image if no HTML available
                        fullHtml += `<div style="text-align: center; padding: 20px;">`;
                        fullHtml += `<img src="data:image/png;base64,${pyResult.chartBase64}" alt="${pyResult.name}" style="max-width: 100%; height: auto;" />`;
                        fullHtml += `</div>`;
                    }
                } else if (pyResult.type === 'table' && pyResult.data && pyResult.data.length > 0) {
                    // Render table
                    const MAX_ROWS_IN_EMAIL = 100;
                    const totalRows = pyResult.data.length;
                    const displayRows = pyResult.data.slice(0, MAX_ROWS_IN_EMAIL);

                    if (totalRows > MAX_ROWS_IN_EMAIL) {
                        fullHtml += `<p style="color: #666; font-size: 11px; margin: 5px 0;">Mostrando prime ${MAX_ROWS_IN_EMAIL} righe di ${totalRows.toLocaleString()} totali.</p>`;
                    }

                    fullHtml += `<table><thead><tr>`;
                    const columns = Object.keys(pyResult.data[0]);
                    columns.forEach(col => {
                        fullHtml += `<th>${col}</th>`;
                    });
                    fullHtml += `</tr></thead><tbody>`;

                    displayRows.forEach(row => {
                        fullHtml += `<tr>`;
                        columns.forEach(col => {
                            let val = row[col];
                            if (val === null || val === undefined) val = '';
                            else if (typeof val === 'object' && val instanceof Date) val = val.toLocaleString('it-IT');
                            else if (typeof val === 'object') val = JSON.stringify(val);
                            fullHtml += `<td>${val}</td>`;
                        });
                        fullHtml += `</tr>`;
                    });
                    fullHtml += `</tbody></table>`;
                } else if (pyResult.type === 'variable' && pyResult.variables) {
                    // Render variables as JSON
                    fullHtml += `<pre style="background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto;">${JSON.stringify(pyResult.variables, null, 2)}</pre>`;
                }

                fullHtml += `</div>`;
            }
        }

        fullHtml += `</body></html>`;

        // Generate Excel attachments (with row limit to prevent size issues)
        const attachments: any[] = [];
        const XLSX = await import('xlsx');
        const MAX_EXCEL_ROWS = 5000; // Limit Excel to 5K rows to keep file size reasonable

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
