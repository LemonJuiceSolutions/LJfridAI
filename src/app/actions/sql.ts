'use server';

import sql from 'mssql';
import { db } from '@/lib/db';
import { pythonFetch } from '@/lib/python-backend';
import { getAuthenticatedUser } from './auth';
import { resolveTheme } from '@/lib/chart-theme';

// ---------------------------------------------------------------------------
// executeSqlPreviewAction
// ---------------------------------------------------------------------------

export async function executeSqlPreviewAction(
    query: string,
    connectorId: string,
    pipelineDependencies: { tableName: string, query?: string, isPython?: boolean, pythonCode?: string, connectorId?: string, pipelineDependencies?: any[], data?: any[] }[] = [],
    _bypassAuth?: boolean
): Promise<{ data: any[] | null; error: string | null }> {
    let pool: sql.ConnectionPool | null = null;
    let transaction: sql.Transaction | null = null;
    const createdTempTables: string[] = [];

    try {
        let user: { id: string; companyId: string } | null = null;

        if (_bypassAuth) {
            // SYSTEM CONTEXT (scheduler/worker): companyId MUST be resolvable from the
            // connector. Never fall back to an undefined/global filter, or a scheduled
            // run with no connector would read data across every tenant.
            if (connectorId) {
                const conn = await db.connector.findUnique({ where: { id: connectorId } });
                if (conn) {
                    user = { id: 'system-scheduler', companyId: conn.companyId };
                }
            }
            if (!user) {
                // Try to resolve from pipeline dependencies
                const findInheritedConnectorId = (deps: any[]): string | undefined => {
                    for (const dep of deps) {
                        if (dep.query && dep.connectorId) return dep.connectorId;
                        if (dep.pipelineDependencies?.length > 0) {
                            const nested = findInheritedConnectorId(dep.pipelineDependencies);
                            if (nested) return nested;
                        }
                    }
                    return undefined;
                };
                const inheritedId = findInheritedConnectorId(pipelineDependencies || []);
                if (inheritedId) {
                    const conn = await db.connector.findUnique({ where: { id: inheritedId } });
                    if (conn) user = { id: 'system-scheduler', companyId: conn.companyId };
                }
            }
            if (!user) {
                return {
                    data: null,
                    error: '[Security] Scheduler/worker cannot resolve companyId — no valid connector in node or dependencies. Refusing to run without a tenant scope.',
                };
            }
        } else {
            user = await getAuthenticatedUser();
            if (!user) return { data: null, error: 'Non autorizzato.' };
        }

        let connector;
        if (connectorId) {
            connector = await db.connector.findFirst({
                where: {
                    id: connectorId,
                    companyId: user.companyId,
                    type: 'SQL'
                }
            });
        } else {
            const findInheritedConnectorId = (deps: any[]): string | undefined => {
                for (const dep of deps) {
                    if (dep.query && dep.connectorId) return dep.connectorId;
                    if (dep.pipelineDependencies?.length > 0) {
                        const nested = findInheritedConnectorId(dep.pipelineDependencies);
                        if (nested) return nested;
                    }
                }
                return undefined;
            };

            const inheritedId = findInheritedConnectorId(pipelineDependencies || []);

            if (inheritedId) {
                console.log(`[PIPELINE] Inheriting connector ${inheritedId} from dependencies`);
                connector = await db.connector.findFirst({
                    where: {
                        id: inheritedId,
                        companyId: user.companyId,
                        type: 'SQL'
                    }
                });
            }

            if (!connector) {
                connector = await db.connector.findFirst({
                    where: {
                        companyId: user.companyId,
                        type: 'SQL'
                    }
                });
            }
        }

        if (!connector) {
            return { data: null, error: "Connettore SQL non trovato o non configurato." };
        }

        let conf;
        try {
            conf = JSON.parse(connector.config);
        } catch {
            return { data: null, error: "Configurazione connettore non valida." };
        }

        const sqlConfig: any = {
            user: conf.user,
            password: conf.password,
            server: conf.host,
            database: conf.database,
            options: {
                encrypt: conf.host && conf.host.includes('database.windows.net'),
                trustServerCertificate: process.env.NODE_ENV !== 'production',
                connectTimeout: 60000,
                requestTimeout: 600000
            }
        };

        if (conf.port) {
            const parsedPort = parseInt(conf.port);
            if (!isNaN(parsedPort)) {
                sqlConfig.port = parsedPort;
            }
        }

        pool = new sql.ConnectionPool(sqlConfig);
        await pool.connect();

        transaction = new sql.Transaction(pool);
        await transaction.begin();
        const request = new sql.Request(transaction);

        const flattenDependencies = (deps: any[], result: any[] = [], seen: Set<string> = new Set()): any[] => {
            for (const dep of deps) {
                if (dep.pipelineDependencies && dep.pipelineDependencies.length > 0) {
                    flattenDependencies(dep.pipelineDependencies, result, seen);
                }
                if (!seen.has(dep.tableName)) {
                    seen.add(dep.tableName);
                    result.push(dep);
                }
            }
            return result;
        };

        const allDeps = pipelineDependencies ? flattenDependencies(pipelineDependencies) : [];

        const nameMap = new Map<string, string>();
        const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const knownSchemas = new Set(['dbo', 'sys', 'information_schema', 'guest', 'db_owner']);

        const replaceTableRef = (sqlText: string, originalName: string, tempName: string) => {
            const escaped = escapeRegExp(originalName);

            const isTableAliasPrefix = (prefix: string | undefined): boolean => {
                if (!prefix) return false;
                const clean = prefix.replace(/[\.\[\]]/g, '').trim();
                if (!clean) return false;
                if (knownSchemas.has(clean.toLowerCase())) return false;
                return clean.length <= 5;
            };

            // Allow up to 2 leading qualifiers ([db].[schema].[name]) — temp
            // tables can't be referenced cross-database, so we strip the prefix.
            const bracketPattern = `((?:(?:\\[[^\\]]+\\]|\\w+)\\.){0,2})\\[${escaped}\\]`;
            const bracketRegex = new RegExp(bracketPattern, 'gi');

            const unbracketedPattern = `((?:(?:\\[[^\\]]+\\]|\\w+)\\.){0,2})\\b${escaped}\\b`;
            const unbracketedRegex = new RegExp(unbracketedPattern, 'gi');

            const innerPrefix = (prefix: string | undefined): string | undefined => {
                if (!prefix) return undefined;
                const segs = prefix.split('.').filter(Boolean);
                return segs[segs.length - 1];
            };

            let newText = sqlText;

            newText = newText.replace(bracketRegex, (match, prefix) => {
                if (isTableAliasPrefix(innerPrefix(prefix))) return match;
                return tempName;
            });

            newText = newText.replace(unbracketedRegex, (match, prefix) => {
                if (isTableAliasPrefix(innerPrefix(prefix))) return match;
                return tempName;
            });

            return newText;
        };

        let schemaSourceTable: string | null = null;
        const depWarnings: string[] = [];

        if (allDeps.length > 0) {
            console.log(`[PIPELINE SERVER] Executing ${allDeps.length} flattened dependencies:`, allDeps.map(d => ({
                name: d.tableName,
                hasData: !!d.data,
                dataIsArray: Array.isArray(d.data),
                dataLen: Array.isArray(d.data) ? d.data.length : 'N/A',
                hasQuery: !!d.query,
                isPython: !!d.isPython,
                hasPythonCode: !!d.pythonCode
            })));

            for (const dep of allDeps) {
                const uniqueId = new Date().getTime().toString().slice(-6) + Math.floor(Math.random() * 1000).toString();
                const sanitizedName = dep.tableName.replace(/[^a-zA-Z0-9_]/g, '_');
                const tempTableName = `##${sanitizedName}_${uniqueId}`;
                nameMap.set(dep.tableName, tempTableName);

                const MIN_ALIAS_LENGTH = 8;
                if (dep.nodeName && dep.nodeName !== dep.tableName && !nameMap.has(dep.nodeName)) {
                    if (dep.nodeName.length >= MIN_ALIAS_LENGTH) {
                        nameMap.set(dep.nodeName, tempTableName);
                        console.log(`[PIPELINE] Registered alias (nodeName): "${dep.nodeName}" -> ${tempTableName}`);
                    } else {
                        console.log(`[PIPELINE] Skipped short alias (nodeName): "${dep.nodeName}" (len=${dep.nodeName.length} < ${MIN_ALIAS_LENGTH})`);
                    }
                }
                if (dep.displayName && dep.displayName !== dep.tableName && dep.displayName !== dep.nodeName && !nameMap.has(dep.displayName)) {
                    if (dep.displayName.length >= MIN_ALIAS_LENGTH) {
                        nameMap.set(dep.displayName, tempTableName);
                        console.log(`[PIPELINE] Registered alias (displayName): "${dep.displayName}" -> ${tempTableName}`);
                    } else {
                        console.log(`[PIPELINE] Skipped short alias (displayName): "${dep.displayName}" (len=${dep.displayName.length} < ${MIN_ALIAS_LENGTH})`);
                    }
                }

                console.log(`[PIPELINE] Materializing: ${tempTableName} (isPython: ${dep.isPython}, hasPythonCode: ${!!dep.pythonCode}, hasQuery: ${!!dep.query})`);

                try {
                    await request.query(`IF OBJECT_ID('tempdb..${tempTableName}') IS NOT NULL DROP TABLE ${tempTableName};`);

                    let rowsToInsert: any[] = [];
                    let columns: string[] = [];

                    console.log(`[PIPELINE SERVER] Processing dep "${dep.tableName}": data=${!!dep.data} (type=${typeof dep.data}, isArray=${Array.isArray(dep.data)}, len=${Array.isArray(dep.data) ? dep.data.length : 'N/A'}), query=${!!dep.query}, isPy=${!!dep.isPython}, pyCode=${!!dep.pythonCode}`);

                    if (dep.data && Array.isArray(dep.data)) {
                        console.log(`[PIPELINE] >>> USING PRE-CALCULATED DATA for ${dep.tableName}`);
                        rowsToInsert = dep.data;
                        if (rowsToInsert.length > 0) {
                            columns = Object.keys(rowsToInsert[0]);
                        } else if (dep.columns && Array.isArray(dep.columns) && dep.columns.length > 0) {
                            // Empty data but we know the column schema — use it for temp table creation
                            columns = dep.columns;
                            console.warn(`[PIPELINE] Pre-calculated data for ${dep.tableName} is empty but has column schema: [${columns.join(', ')}]`);
                        } else {
                            console.warn(`[PIPELINE] Pre-calculated data for ${dep.tableName} is empty (no column schema).`);
                        }

                    } else if (dep.isPython && dep.pythonCode) {
                        console.log(`[PIPELINE] >>> ENTERING PYTHON BRANCH for ${dep.tableName}`);
                        console.log(`[PIPELINE] Executing Python dependency for ${dep.tableName}...`);

                        const pythonResult = await executePythonPreviewAction(
                            dep.pythonCode,
                            'table',
                            {},
                            dep.pipelineDependencies,
                            dep.connectorId,
                            _bypassAuth
                        );

                        if (!pythonResult.success) {
                            throw new Error(`Python dependency error: ${pythonResult.error}`);
                        }

                        if (pythonResult.data && Array.isArray(pythonResult.data) && pythonResult.data.length > 0) {
                            rowsToInsert = pythonResult.data;
                            columns = Object.keys(rowsToInsert[0]);
                        } else if (pythonResult.columns && Array.isArray(pythonResult.columns) && pythonResult.columns.length > 0) {
                            // Python returned 0 rows but has column schema
                            columns = pythonResult.columns;
                            console.warn(`[PIPELINE] Python dependency ${dep.tableName} returned 0 rows but has columns: [${columns.join(', ')}]`);
                        } else {
                            console.warn(`[PIPELINE] Python dependency ${dep.tableName} returned no data.`);
                        }

                    } else if (dep.query) {
                        console.log(`[PIPELINE] >>> ENTERING SQL BRANCH for ${dep.tableName}`);
                        let sourceQuery = dep.query.trim();

                        for (const [orig, temp] of nameMap.entries()) {
                            if (orig === dep.tableName) continue;
                            sourceQuery = replaceTableRef(sourceQuery, orig, temp);
                        }

                        console.log(`[PIPELINE] Executing SQL query for ${dep.tableName} (using transaction request)...`);
                        const result = await request.query(sourceQuery);
                        console.log(`[PIPELINE] SQL query completed for ${dep.tableName}, rows: ${result.recordset?.length || 0}`);
                        if (result.recordset && result.recordset.length > 0) {
                            rowsToInsert = result.recordset;
                            columns = Object.keys(rowsToInsert[0]);
                        } else {
                            // Try to extract column schema from result metadata even with 0 rows
                            if (result.recordset && result.recordset.columns) {
                                columns = Object.keys(result.recordset.columns);
                                console.warn(`[PIPELINE] SQL Source query for ${dep.tableName} returned 0 rows but has columns: [${columns.join(', ')}]`);
                            } else {
                                console.warn(`[PIPELINE] SQL Source query for ${dep.tableName} returned no data.`);
                            }
                        }
                    } else {
                        console.error(`[PIPELINE] WARNING: ${dep.tableName} has isPython=${dep.isPython} but NO pythonCode and NO query!`);
                    }

                    if (rowsToInsert.length > 0) {
                        const colDefs = columns.map(col => `[${col}] NVARCHAR(MAX)`).join(', ');

                        await request.query(`CREATE TABLE ${tempTableName} (${colDefs});`);
                        console.log(`[PIPELINE] Created ${tempTableName} (${columns.length} cols)`);
                        createdTempTables.push(tempTableName);
                        if (!schemaSourceTable) schemaSourceTable = tempTableName;

                        const batchSize = 100;
                        for (let i = 0; i < rowsToInsert.length; i += batchSize) {
                            const batch = rowsToInsert.slice(i, i + batchSize);
                            const values = batch.map(row => {
                                const vals = columns.map(col => {
                                    const v = row[col];
                                    if (v === null || v === undefined) return 'NULL';
                                    if (typeof v === 'number') return v.toString();
                                    if (typeof v === 'boolean') return v ? '1' : '0';
                                    if (v instanceof Date) return `'${v.toISOString()}'`;
                                    return `N'${String(v).replace(/'/g, "''")}'`;
                                }).join(', ');
                                return `(${vals})`;
                            }).join(', ');

                            if (values.length > 0) {
                                try {
                                    await request.query(`INSERT INTO ${tempTableName} VALUES ${values};`);
                                } catch (err: any) {
                                    console.error(`[PIPELINE ERROR] Failed to insert batch into ${tempTableName}:`, err);
                                    console.log(`[PIPELINE DEBUG] First value in failing batch: ${values.substring(0, 200)}...`);
                                    throw err;
                                }
                            }
                        }

                        console.log(`[PIPELINE] Created ${tempTableName} with ${rowsToInsert.length} rows`);
                    } else {
                        if (columns.length > 0) {
                            // We have column schema from upstream (e.g. Python returned columns but 0 rows)
                            const colDefs = columns.map(col => `[${col}] NVARCHAR(MAX)`).join(', ');
                            console.log(`[PIPELINE] Creating EMPTY temp table ${tempTableName} with known schema (${columns.length} cols: ${columns.slice(0, 5).join(', ')}${columns.length > 5 ? '...' : ''})`);
                            await request.query(`CREATE TABLE ${tempTableName} (${colDefs});`);
                            if (!schemaSourceTable) schemaSourceTable = tempTableName;
                        } else if (schemaSourceTable) {
                            console.log(`[PIPELINE] Creating EMPTY temp table ${tempTableName} (schema cloned from ${schemaSourceTable})`);
                            await request.query(`SELECT TOP 0 * INTO ${tempTableName} FROM ${schemaSourceTable};`);
                        } else {
                            console.log(`[PIPELINE] Creating EMPTY temp table ${tempTableName} (no data, no schema source — using placeholder)`);
                            await request.query(`CREATE TABLE ${tempTableName} ([_empty_placeholder] NVARCHAR(1));`);
                        }
                        createdTempTables.push(tempTableName);
                    }

                } catch (depError) {
                    const depErrMsg = depError instanceof Error ? depError.message : 'Errore sconosciuto';
                    console.error(`[PIPELINE] Error materializing ${dep.tableName}: ${depErrMsg}`);
                    // Non-blocking: create an empty placeholder table so downstream SQL doesn't crash on missing table
                    try {
                        await request.query(`IF OBJECT_ID('tempdb..${tempTableName}') IS NULL CREATE TABLE ${tempTableName} ([_empty_placeholder] NVARCHAR(1));`);
                        createdTempTables.push(tempTableName);
                        console.warn(`[PIPELINE] Created empty placeholder for failed dep ${dep.tableName} — pipeline will continue with 0 rows.`);
                        depWarnings.push(`Dipendenza "${dep.tableName}": ${depErrMsg}`);
                    } catch (placeholderErr) {
                        console.error(`[PIPELINE] Could not create placeholder for ${dep.tableName}:`, placeholderErr);
                        throw new Error(`Errore nell'esecuzione della dipendenza "${dep.tableName}": ${depErrMsg}`);
                    }
                }
            }
        }

        let finalQuery = query.trim();

        console.log(`[PIPELINE SERVER] nameMap entries: ${nameMap.size}`, Array.from(nameMap.entries()).map(([k, v]) => `"${k}" -> "${v}"`));
        console.log(`[PIPELINE SERVER] Original query: "${finalQuery.substring(0, 200)}"`);

        const normalizeConfusable = (s: string) => s.replace(/[Il1]/g, 'l').replace(/[O0]/g, '0').toLowerCase();

        if (nameMap.size > 0) {
            for (const [originalName, tempName] of nameMap.entries()) {
                const before = finalQuery;
                finalQuery = replaceTableRef(finalQuery, originalName, tempName);
                if (before === finalQuery) {
                    console.warn(`[PIPELINE SERVER] replaceTableRef did NOT match "${originalName}" in query. Trying fuzzy match...`);
                    const tableRefPattern = /(?:FROM|JOIN)\s+(?:\[?(\w+)\]?\.)?(?:\[?(\w+)\]?)/gi;
                    let m;
                    const normalizedOriginal = normalizeConfusable(originalName);
                    while ((m = tableRefPattern.exec(finalQuery)) !== null) {
                        const queryTableName = m[2] || m[1];
                        if (queryTableName && normalizeConfusable(queryTableName) === normalizedOriginal) {
                            console.log(`[PIPELINE SERVER] Fuzzy match: "${queryTableName}" in query ~= "${originalName}". Replacing with "${tempName}"`);
                            finalQuery = replaceTableRef(finalQuery, queryTableName, tempName);
                            nameMap.set(queryTableName, tempName);
                            break;
                        }
                    }
                } else {
                    console.log(`[PIPELINE SERVER] Replaced "${originalName}" -> "${tempName}" in query`);
                }
            }
        }
        console.log(`[PIPELINE SERVER] Final query after replacement: "${finalQuery.substring(0, 200)}"`);

        if (user) {
            const knownNames = new Set([...nameMap.keys(), ...nameMap.values()].map(n => n.toUpperCase()));
            const tableRefRegex = /(?:FROM|JOIN)\s+(?:\[?(\w+)\]?\.)?(?:\[?(\w+)\]?)/gi;
            let match;
            const unresolvedNames: string[] = [];
            while ((match = tableRefRegex.exec(finalQuery)) !== null) {
                const tableName = match[2] || match[1];
                if (tableName && !knownNames.has(tableName.toUpperCase()) && !tableName.startsWith('##') && !tableName.startsWith('tempdb')) {
                    unresolvedNames.push(tableName);
                }
            }

            if (unresolvedNames.length > 0) {
                console.log(`[PIPELINE] Found unresolved table references: ${unresolvedNames.join(', ')}. Searching all trees...`);
                try {
                    const allTreeRecords = await db.tree.findMany({
                        where: { companyId: user.companyId },
                        select: { jsonDecisionTree: true }
                    });

                    const flattenTreeNodes = (node: any, results: any[] = []): any[] => {
                        if (!node || typeof node !== 'object') return results;
                        if (node.sqlResultName || node.pythonResultName || node.sqlQuery || node.pythonCode || node.aiConfig?.outputName) {
                            results.push(node);
                        }
                        if (node.options) {
                            Object.values(node.options).forEach((child: any) => {
                                if (Array.isArray(child)) {
                                    child.forEach(c => flattenTreeNodes(c, results));
                                } else {
                                    flattenTreeNodes(child, results);
                                }
                            });
                        }
                        return results;
                    };

                    const allNodes: any[] = [];
                    for (const treeRecord of allTreeRecords) {
                        try {
                            const treeJson = typeof treeRecord.jsonDecisionTree === 'string'
                                ? JSON.parse(treeRecord.jsonDecisionTree) : treeRecord.jsonDecisionTree;
                            flattenTreeNodes(treeJson, allNodes);
                        } catch { /* skip malformed trees */ }
                    }

                    for (const unresolvedName of unresolvedNames) {
                        const matchingNode = allNodes.find(n =>
                            n.sqlResultName === unresolvedName || n.pythonResultName === unresolvedName || n.aiConfig?.outputName === unresolvedName
                        );

                        if (matchingNode) {
                            console.log(`[PIPELINE] Found cross-tree node for "${unresolvedName}"`);

                            const uniqueId = Date.now().toString().slice(-6) + Math.floor(Math.random() * 1000);
                            const sanitizedName = unresolvedName.replace(/[^a-zA-Z0-9_]/g, '_');
                            const tempTableName = `##${sanitizedName}_${uniqueId}`;

                            let rowsToInsert: any[] = [];
                            let columns: string[] = [];

                            if (matchingNode.pythonCode) {
                                const pyRes = await executePythonPreviewAction(
                                    matchingNode.pythonCode, 'table', {},
                                    matchingNode.pipelineDependencies || [],
                                    matchingNode.connectorId || matchingNode.pythonConnectorId,
                                    _bypassAuth
                                );
                                if (pyRes.success && pyRes.data && Array.isArray(pyRes.data) && pyRes.data.length > 0) {
                                    rowsToInsert = pyRes.data;
                                    columns = Object.keys(rowsToInsert[0]);
                                }
                            } else if (matchingNode.sqlQuery) {
                                let sourceQuery = matchingNode.sqlQuery.trim();
                                for (const [orig, temp] of nameMap.entries()) {
                                    sourceQuery = replaceTableRef(sourceQuery, orig, temp);
                                }
                                const srcResult = await request.query(sourceQuery);
                                if (srcResult.recordset && srcResult.recordset.length > 0) {
                                    rowsToInsert = srcResult.recordset;
                                    columns = Object.keys(rowsToInsert[0]);
                                }
                            }

                            if (rowsToInsert.length > 0) {
                                const colDefs = columns.map(col => `[${col}] NVARCHAR(MAX)`).join(', ');
                                await request.query(`CREATE TABLE ${tempTableName} (${colDefs});`);
                                createdTempTables.push(tempTableName);
                                if (!schemaSourceTable) schemaSourceTable = tempTableName;

                                const batchSize = 100;
                                for (let i = 0; i < rowsToInsert.length; i += batchSize) {
                                    const batch = rowsToInsert.slice(i, i + batchSize);
                                    const values = batch.map(row => {
                                        const vals = columns.map(col => {
                                            const v = row[col];
                                            if (v === null || v === undefined) return 'NULL';
                                            if (typeof v === 'number') return v.toString();
                                            if (typeof v === 'boolean') return v ? '1' : '0';
                                            if (v instanceof Date) return `'${v.toISOString()}'`;
                                            return `N'${String(v).replace(/'/g, "''")}'`;
                                        }).join(', ');
                                        return `(${vals})`;
                                    }).join(', ');
                                    if (values.length > 0) {
                                        await request.query(`INSERT INTO ${tempTableName} VALUES ${values};`);
                                    }
                                }
                                console.log(`[PIPELINE] Cross-tree resolved: ${unresolvedName} -> ${tempTableName} (${rowsToInsert.length} rows)`);
                                nameMap.set(unresolvedName, tempTableName);
                                finalQuery = replaceTableRef(finalQuery, unresolvedName, tempTableName);
                            } else {
                                console.log(`[PIPELINE] Cross-tree node "${unresolvedName}" found but returned no data`);
                                if (schemaSourceTable) {
                                    await request.query(`SELECT TOP 0 * INTO ${tempTableName} FROM ${schemaSourceTable};`);
                                } else {
                                    await request.query(`CREATE TABLE ${tempTableName} ([_empty] NVARCHAR(1));`);
                                }
                                createdTempTables.push(tempTableName);
                                nameMap.set(unresolvedName, tempTableName);
                                finalQuery = replaceTableRef(finalQuery, unresolvedName, tempTableName);
                            }
                        } else {
                            console.warn(`[PIPELINE] No node found for unresolved table "${unresolvedName}"`);
                        }
                    }
                } catch (crossTreeError) {
                    console.error(`[PIPELINE] Cross-tree resolution error:`, crossTreeError);
                }
            }
        }

        console.log(`[PIPELINE] Executing main query (nameMap: ${JSON.stringify(Object.fromEntries(nameMap))}):\n${finalQuery.substring(0, 500)}`);
        const result = await request.query(finalQuery);

        await transaction.commit();

        const data: any[] = result.recordset;
        console.log(`[PIPELINE] Query returned ${data?.length || 0} rows`);

        const returnObj: any = { data, error: null };
        if (depWarnings.length > 0) {
            returnObj._depWarnings = depWarnings;
            console.warn(`[PIPELINE] Completed with ${depWarnings.length} dependency warnings:`, depWarnings);
        }
        return returnObj;

    } catch (e) {
        const error = e instanceof Error ? e.message : "Errore durante l'esecuzione della query.";
        console.error("Execute SQL Preview Error:", e);

        if (transaction) {
            try {
                await transaction.rollback();
            } catch (rbError) {
                console.warn("Rollback error:", rbError);
            }
        }
        return { data: null, error };
    } finally {
        if (pool && createdTempTables.length > 0) {
            try {
                for (const tableName of createdTempTables) {
                    await pool.request().query(`IF OBJECT_ID('tempdb..${tableName}') IS NOT NULL DROP TABLE ${tableName};`);
                    console.log(`[PIPELINE] Dropped ${tableName}`);
                }
            } catch (cleanupError) {
                console.warn("[PIPELINE] Cleanup error:", cleanupError);
            }
        }

        if (pool) {
            try {
                await pool.close();
            } catch (closeError) {
                console.warn("[PIPELINE] Pool close error:", closeError);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// fetchTableSchemaAction
// ---------------------------------------------------------------------------

export async function fetchTableSchemaAction(connectorId: string, tableNames: string[]): Promise<{ schemaContext: string | null; tables?: Record<string, string[]>; error: string | null }> {
    let pool: sql.ConnectionPool | null = null;
    try {
        const user = await getAuthenticatedUser();

        const connector = await db.connector.findFirst({
            where: { id: connectorId, companyId: user.companyId, type: 'SQL' }
        });

        if (!connector) return { schemaContext: null, error: "Connector not found" };

        let schemaDesc = "";

        try {
            const config = JSON.parse(connector.config as string);
            pool = new sql.ConnectionPool({
                user: config.user,
                password: config.password,
                server: config.server,
                database: config.database,
                port: parseInt(config.port || '1433'),
                options: {
                    encrypt: config.encrypt === 'true',
                    trustServerCertificate: config.trustServerCertificate === 'true',
                    connectTimeout: 15000
                }
            });
            await pool.connect();

            const sanitizedTables = tableNames.map(t => `'${t.replace(/'/g, "''")}'`).join(',');

            const schemaQuery = `
                SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME IN (${sanitizedTables})
                ORDER BY TABLE_NAME, ORDINAL_POSITION
            `;

            const result = await pool.request().query(schemaQuery);

            if (result.recordset.length > 0) {
                const tablesSchema: Record<string, string[]> = {};
                result.recordset.forEach(row => {
                    if (!tablesSchema[row.TABLE_NAME]) {
                        tablesSchema[row.TABLE_NAME] = [];
                    }
                    tablesSchema[row.TABLE_NAME].push(`${row.COLUMN_NAME} (${row.DATA_TYPE})`);
                });

                schemaDesc = "Database Schema:\n";
                for (const [table, cols] of Object.entries(tablesSchema)) {
                    schemaDesc += `- Table '${table}': ${cols.join(', ')}\n`;
                }
                return { schemaContext: schemaDesc, tables: tablesSchema, error: null };
            } else {
                schemaDesc = "No columns found for the selected tables (they might not exist or permissions issue).";
            }

            return { schemaContext: schemaDesc, tables: {}, error: null };

        } catch (dbErr: any) {
            console.error("[FETCH-SCHEMA] DB Error:", dbErr);
            return { schemaContext: null, error: `Database Error: ${dbErr.message}` };
        } finally {
            if (pool) await pool.close();
        }

        return { schemaContext: schemaDesc, error: null };

    } catch (err: any) {
        console.error("[FETCH-SCHEMA] Action Error:", err);
        return { schemaContext: null, error: err.message };
    }
}

// ---------------------------------------------------------------------------
// exportTableToSqlAction
// ---------------------------------------------------------------------------

export async function exportTableToSqlAction(
    targetConnectorId: string,
    targetTableName: string,
    sourceData: any[],
    createTableIfNotExists: boolean = true,
    truncate: boolean = true,
    isSystem: boolean = false
): Promise<{ success: boolean; error?: string; rowsInserted?: number }> {
    let pool: sql.ConnectionPool | null = null;

    try {
        let user: any = null;
        if (!isSystem) {
            user = await getAuthenticatedUser();
            if (!user) {
                return { success: false, error: 'Unauthorized' };
            }
        }

        if (!targetConnectorId || !targetTableName) {
            return { success: false, error: 'Connettore e nome tabella sono obbligatori.' };
        }

        if (!sourceData || sourceData.length === 0) {
            return { success: false, error: 'Nessun dato da esportare.' };
        }

        const whereClause: any = { id: targetConnectorId, type: 'SQL' };
        if (user) {
            whereClause.companyId = user.companyId;
        }

        const connector = await db.connector.findFirst({ where: whereClause });

        if (!connector || !connector.config) {
            return { success: false, error: 'Connettore SQL non trovato o non configurato.' };
        }

        let conf: any = connector.config;
        if (typeof conf === 'string') {
            try {
                conf = JSON.parse(conf);
            } catch (e) {
                return { success: false, error: 'Configurazione connettore non valida.' };
            }
        }

        const sqlConfig: sql.config = {
            user: conf.user || conf.username,
            password: conf.password,
            server: conf.host || conf.server,
            database: conf.database,
            options: {
                encrypt: conf.host && conf.host.includes('database.windows.net'),
                trustServerCertificate: process.env.NODE_ENV !== 'production',
                connectTimeout: 30000,
                requestTimeout: 120000
            }
        };

        if (conf.port) {
            const parsedPort = parseInt(conf.port);
            if (!isNaN(parsedPort)) {
                sqlConfig.port = parsedPort;
            }
        }

        pool = new sql.ConnectionPool(sqlConfig);
        await pool.connect();

        const columns = Object.keys(sourceData[0]);
        const sanitizedTableName = targetTableName.replace(/[^a-zA-Z0-9_]/g, '_');

        if (createTableIfNotExists) {
            const columnDefs = columns.map(col => {
                const sanitizedCol = col.trim().replace(/[^a-zA-Z0-9_ ]+/g, "");
                return `[${sanitizedCol}] NVARCHAR(MAX)`;
            }).join(', ');

            const dropTableSql = `
                IF OBJECT_ID('[${sanitizedTableName}]', 'U') IS NOT NULL
                    DROP TABLE [${sanitizedTableName}]
            `;
            await pool.request().query(dropTableSql);

            const createTableSql = `CREATE TABLE [${sanitizedTableName}] (${columnDefs})`;
            await pool.request().query(createTableSql);
            console.log(`[SQL-EXPORT] Table ${sanitizedTableName} recreated.`);
        }

        const MAX_PARAMS = 2000;
        const numColumns = columns.length;
        const calculatedBatchSize = Math.floor(MAX_PARAMS / (numColumns || 1));
        const BATCH_SIZE = Math.max(1, Math.min(1000, calculatedBatchSize));

        console.log(`[SQL-EXPORT] Dynamic Batch Size: ${BATCH_SIZE} (Columns: ${numColumns})`);

        let totalInserted = 0;

        for (let i = 0; i < sourceData.length; i += BATCH_SIZE) {
            const batch = sourceData.slice(i, i + BATCH_SIZE);
            const sqlRequest = pool.request();

            const valueRows: string[] = [];

            batch.forEach((row, batchIdx) => {
                const rowValues: string[] = [];
                columns.forEach((col, colIdx) => {
                    const paramName = `p${batchIdx}_${colIdx}`;
                    const value = row[col];
                    sqlRequest.input(paramName, value === null || value === undefined ? null : String(value));
                    rowValues.push(`@${paramName}`);
                });
                valueRows.push(`(${rowValues.join(', ')})`);
            });

            const sanitizedColumns = columns.map(c => {
                const safe = c.trim().replace(/[^a-zA-Z0-9_ ]+/g, "");
                return `[${safe}]`;
            }).join(', ');
            const insertSql = `INSERT INTO [${sanitizedTableName}] (${sanitizedColumns}) VALUES ${valueRows.join(', ')}`;

            await sqlRequest.query(insertSql);
            totalInserted += batch.length;
            console.log(`[SQL-EXPORT] Inserted batch ${Math.floor(i / BATCH_SIZE) + 1}, total: ${totalInserted}`);
        }

        return { success: true, rowsInserted: totalInserted };

    } catch (e) {
        const error = e instanceof Error ? e.message : "Errore durante l'esportazione.";
        console.error("[SQL-EXPORT] Error:", e);
        return { success: false, error };
    } finally {
        if (pool) {
            try {
                await pool.close();
            } catch (closeError) {
                console.warn("[SQL-EXPORT] Pool close error:", closeError);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// generateSqlAction
// ---------------------------------------------------------------------------

export async function generateSqlAction(
    userDescription: string,
    openRouterConfig?: { apiKey: string, model: string },
    connectorId?: string,
    schemaContextArgs?: string,
    history: { role: string, content: string }[] = []
): Promise<{ sql: string | null; error: string | null }> {
    try {
        const user = await getAuthenticatedUser();

        let schemaContext = schemaContextArgs || "No specific schema provided. Assume standard SQL naming conventions.";

        if (!schemaContextArgs) {
            let connector;
            if (connectorId) {
                connector = await db.connector.findFirst({
                    where: { id: connectorId, companyId: user.companyId, type: 'SQL' }
                });
            } else {
                connector = await db.connector.findFirst({
                    where: { companyId: user.companyId, type: 'SQL' }
                });
            }

            if (connector) {
                schemaContext = "Target Database: SQL Server (T-SQL). No specific table schema provided.";
            }
        }

        const systemPrompt = `You are an expert SQL Data Analyst.
Task: precise T-SQL query generation based on user request.
Context: ${schemaContext}
Rules:
1. Return ONLY the raw SQL query. No markdown, no explanations.
2. If the user asks for "clients", assume a table like 'Clients' or 'Customers'.
3. Always use 'TOP 10' if checking data, unless specified otherwise.
4. Output must be valid T-SQL.`;

        const messages = [
            { role: "system", content: systemPrompt },
            ...history,
            { role: "user", content: `Generate a SQL query for: ${userDescription}` }
        ];

        // SECURITY: resolve masked/missing key from DB server-side
        const { resolveOpenRouterConfig: resolveSqlCfg } = await import('@/lib/openrouter-credentials');
        const effectiveSqlCfg = await resolveSqlCfg(openRouterConfig);

        if (effectiveSqlCfg) {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${effectiveSqlCfg.apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: effectiveSqlCfg.model,
                    messages: messages
                })
            });

            if (!response.ok) throw new Error("OpenRouter API Error");

            const json = await response.json();
            const content = json.choices[0].message.content;

            const codeBlockRegex = /```(?:sql|tsql|mssql)?\s*([\s\S]*?)```/i;
            const match = content.match(codeBlockRegex);

            let cleanSql = '';
            if (match && match[1]) {
                cleanSql = match[1].trim();
            } else {
                cleanSql = content.replace(/```/g, '').trim();
            }
            return { sql: cleanSql, error: null };

        } else {
            return { sql: null, error: "OpenRouter configuration missing." };
        }

    } catch (e) {
        const error = e instanceof Error ? e.message : "Errore generazione SQL.";
        return { sql: null, error };
    }
}

// ---------------------------------------------------------------------------
// fetchTableDataAction
// ---------------------------------------------------------------------------

export async function fetchTableDataAction(tableName: string, connectorId: string = '') {
    try {
        const user = await getAuthenticatedUser();
        if (!user) {
            return { data: null, error: "Unauthorized" };
        }

        const sanitizedTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '');
        const query = `SELECT * FROM "${sanitizedTableName}" LIMIT 1000`;

        return await executeSqlPreviewAction(query, connectorId);
    } catch (error) {
        console.error('Error fetching table data:', error);
        return { data: null, error: 'Failed to fetch table data' };
    }
}

// ---------------------------------------------------------------------------
// generatePythonAction
// ---------------------------------------------------------------------------

export async function generatePythonAction(
    userDescription: string,
    openRouterConfig?: { apiKey: string, model: string },
    outputType: 'table' | 'variable' | 'chart' | 'html' = 'table',
    availableDataframes: string[] = [],
    history: { role: string, content: string }[] = [],
    context?: {
        availableTables?: {
            name: string;
            columns?: string[];
            preview?: any[];
            isDataFrame?: boolean;
        }[];
        currentCode?: string;
        selectedDocuments?: string[];
    }
): Promise<{ code: string | null; error: string | null }> {
    try {
        if (!openRouterConfig?.apiKey) {
            return { code: null, error: "OpenRouter API Key is required." };
        }

        const outputInstructions: Record<string, string> = {
            table: `Return a Pandas DataFrame. The last line of the script MUST be the DataFrame variable (e.g., just 'df' on its own line).
Example: df = pd.DataFrame({'col1': [1,2,3], 'col2': ['a','b','c']})
df`,
            variable: `Return a dictionary containing one or more variables. The last line MUST be the dictionary variable (e.g., just 'result' on its own line).
Example: result = {'total': 100, 'average': 50.5, 'status': 'complete'}
result`,
            chart: `Create a Plotly or Matplotlib chart. For an interactive "Next.js style" experience, STRONGLY PREFER Plotly (px or go).
IMPORTANT: Do NOT call plt.show(). Instead, the last line MUST be the figure object (e.g., just 'fig' on its own line).

Example with Plotly (PREFERRED):
fig = px.bar(data, x='Category', y='Value', title='Interattivo', color_discrete_sequence=['#059669'])
fig

Example with Matplotlib (STATIC):
fig, ax = plt.subplots()
ax.bar(data['Category'], data['Value'], color='#059669')
fig`,
            html: `Return a raw HTML string. The last line MUST be the string variable (e.g., just 'html' on its own line).
Example: html = "<div><h1>Title</h1><p>Content</p></div>"
html`
        };

        let contextInfo = "";
        if (context?.availableTables && context.availableTables.length > 0) {
            contextInfo += "\n\n### Available Tables & DataFrames Context:\n";
            context.availableTables.forEach(t => {
                contextInfo += `- Name: ${t.name}\n`;
                if (t.columns && t.columns.length > 0) {
                    contextInfo += `  Columns: ${t.columns.join(", ")}\n`;
                }
                if (t.isDataFrame) {
                    contextInfo += `  Type: DataFrame (Pre-loaded)\n`;
                }
            });
        }

        console.log('[generatePythonAction] context.selectedDocuments:', context?.selectedDocuments);

        if (context?.selectedDocuments && context.selectedDocuments.length > 0) {
            contextInfo += `\n\n### IMPORTANT — Available Document Files (INPUT DATA):\nThese files are ALREADY available on the local filesystem. You MUST use them as input data. Do NOT ask where they are — they are pre-configured.\n\nHow to access:\n\`\`\`python\nimport os\ndocs_dir = os.environ['DOCUMENTS_DIR']\nselected = os.environ['SELECTED_DOCUMENTS'].split(',')\nfor filename in selected:\n    filepath = os.path.join(docs_dir, filename)\n    # read the file...\n\`\`\`\n\nSelected files:\n`;
            context.selectedDocuments.forEach(name => {
                const ext = name.split('.').pop()?.toLowerCase() || '';
                let hint = '';
                if (ext === 'xbrl' || ext === 'xml') hint = ' (XML/XBRL — use xml.etree.ElementTree to parse)';
                else if (ext === 'xlsx' || ext === 'xls') hint = ' (Excel — use pd.read_excel(filepath))';
                else if (ext === 'csv') hint = ' (CSV — use pd.read_csv(filepath))';
                else if (ext === 'json') hint = ' (JSON — use json.load(open(filepath)))';
                contextInfo += `- ${name}${hint}\n`;
            });
            contextInfo += `\nDo NOT ask the user where these files are. They are already configured and accessible via os.environ.\n`;
        }

        if (context?.currentCode) {
            contextInfo += `\n\n### Current Draft Code:\n\`\`\`python\n${context.currentCode}\n\`\`\`\n`;
        }

        const systemPrompt = `You are a Python code generator. Generate ONLY Python code that accomplishes the user's request.
${outputInstructions[outputType]}

Available libraries: pandas (pd), numpy (np), matplotlib.pyplot (plt), plotly.express (px), plotly.graph_objects (go), os, json, xml.etree.ElementTree (ET), openpyxl.

Available Dataframes: ${availableDataframes.length > 0 ? availableDataframes.join(', ') : 'None'}.
${contextInfo}

STRICT RULES:
1. Output ONLY the Python code, no explanations.
2. Wrap code in \`\`\`python ... \`\`\` code block.
3. The LAST line must be the result variable only (no assignment, no print).
4. Do NOT include print statements.
5. All code must be safe to execute in a sandboxed environment.
6. **STRICT VARIABLE USAGE**: Use ONLY the variable names listed in 'Available Dataframes' (${availableDataframes.join(', ')}).
   - **DO NOT** use generic names like 'df1', 'df2', or 'data' unless they are in the available list.
   - **DO NOT** create mock data. Assume the variables are already loaded and available.
7. **ALWAYS USE PLOTLY** (plotly.express or plotly.graph_objects) for charts unless specifically told otherwise.
8. **ROBUST DATE PARSING**: When converting columns to datetime, ALWAYS use \`pd.to_datetime(..., dayfirst=True, errors='coerce')\`.
9. **ASK FOR CLARIFICATION**: If you are unsure about column names or if the user's request is ambiguous, ask the user for clarification instead of guessing.
10. **DOCUMENT FILES**: When document files are listed in "Available Document Files" section, NEVER ask the user where the files are. They are ALREADY available.`;

        const messages = [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: `Generate Python code for: ${userDescription}` }
        ];

        // SECURITY: resolve masked/missing key from DB server-side
        const { resolveOpenRouterConfig: resolvePyCfg } = await import('@/lib/openrouter-credentials');
        const effectivePyCfg = await resolvePyCfg(openRouterConfig);
        if (!effectivePyCfg) throw new Error('API key OpenRouter mancante. Configurala nelle impostazioni.');

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${effectivePyCfg.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: effectivePyCfg.model,
                messages: messages
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData?.error?.message || `HTTP ${response.status}`);
        }

        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content || '';

        const codeBlockRegex = /```(?:python|py)?\s*([\s\S]*?)```/i;
        const match = content.match(codeBlockRegex);

        let cleanCode = '';
        if (match && match[1]) {
            cleanCode = match[1].trim();
        } else {
            cleanCode = content.replace(/```/g, '').trim();
        }

        return { code: cleanCode, error: null };

    } catch (e) {
        const error = e instanceof Error ? e.message : "Error generating Python code.";
        return { code: null, error };
    }
}

// ---------------------------------------------------------------------------
// executePythonPreviewAction
// ---------------------------------------------------------------------------

export async function executePythonPreviewAction(
    code: string,
    outputType: 'table' | 'variable' | 'chart' | 'html',
    inputData: Record<string, any[]> = {},
    dependencies?: { tableName: string; query?: string; isPython?: boolean; pythonCode?: string; connectorId?: string; pipelineDependencies?: any[]; selectedDocuments?: string[] }[],
    connectorId?: string,
    _bypassAuth?: boolean,
    selectedDocuments?: string[],
    dfTarget?: string
): Promise<{ success: boolean; data?: any[]; columns?: string[]; variables?: Record<string, any>; chartBase64?: string; chartHtml?: string; html?: string; rechartsConfig?: any; rechartsData?: any[]; rechartsStyle?: any; plotlyJson?: any; error?: string; rowCount?: number; stdout?: string; debugLogs?: string[] }> {
    const debugLogs: string[] = [];
    const tStart = performance.now();

    try {
        let user: { id: string; companyId: string } | null = null;
        if (_bypassAuth) {
            // SYSTEM CONTEXT (scheduler/worker): companyId must come from the connector.
            // If we can't resolve it, refuse to run rather than read every tenant's data.
            if (connectorId && connectorId !== 'none') {
                const conn = await db.connector.findUnique({ where: { id: connectorId } });
                if (conn) {
                    user = { id: 'system-scheduler', companyId: conn.companyId };
                }
            }
            if (!user && dependencies && dependencies.length > 0) {
                const findInheritedConnectorId = (deps: any[]): string | undefined => {
                    for (const dep of deps) {
                        if (dep.connectorId && dep.connectorId !== 'none') return dep.connectorId;
                        if (dep.pipelineDependencies?.length > 0) {
                            const nested = findInheritedConnectorId(dep.pipelineDependencies);
                            if (nested) return nested;
                        }
                    }
                    return undefined;
                };
                const inherited = findInheritedConnectorId(dependencies);
                if (inherited) {
                    const conn = await db.connector.findUnique({ where: { id: inherited } });
                    if (conn) user = { id: 'system-scheduler', companyId: conn.companyId };
                }
            }
            if (!user) {
                return {
                    success: false,
                    error: '[Security] Scheduler/worker cannot resolve companyId for Python execution — no valid connector. Refusing to run without a tenant scope.',
                    debugLogs,
                };
            }
        } else {
            user = await getAuthenticatedUser();
            if (!user) return { success: false, error: 'Non autorizzato.', debugLogs };
        }
        const envVars: Record<string, string> = {};

        if (connectorId && connectorId !== 'none') {
            const connector = await db.connector.findUnique({
                where: { id: connectorId, companyId: user.companyId }
            });
            if (connector && connector.config) {
                let config: any = connector.config;
                if (typeof config === 'string') {
                    try {
                        config = JSON.parse(config);
                    } catch (e) {
                        console.error('[Python] Failed to parse connector config JSON:', e);
                        config = {};
                    }
                }
                if (config.accessToken) envVars['HUBSPOT_TOKEN'] = config.accessToken;
                if (config.token) envVars['HUBSPOT_TOKEN'] = config.token;
                if (config.apiKey) envVars['HUBSPOT_API_KEY'] = config.apiKey;
                if (config.password) envVars['DB_PASSWORD'] = config.password;
                if (config.username) envVars['DB_USERNAME'] = config.username;

                if (connector.type === 'LEMLIST') {
                    if (config.apiKey) {
                        envVars['LEMLIST_API_KEY'] = config.apiKey;
                        envVars['LEMLIST_BASE_URL'] = 'https://api.lemlist.com/api';
                    }
                }

                if (connector.type === 'SHAREPOINT') {
                    const tenantId = config.tenantId || "0089ad7d-e10f-49b4-bf68-60e706423382";
                    const clientId = config.clientId || "7ff50e8a-eb8c-4bf8-9fa6-f4068c6fe82b";

                    const { getCachedSharePointTokenAction } = await import('./sharepoint');
                    const authResult = await getCachedSharePointTokenAction(tenantId, clientId, config.clientSecret || undefined, user.companyId);

                    if (authResult.accessToken) {
                        envVars['SHAREPOINT_TOKEN'] = authResult.accessToken;
                        if (config._siteId) envVars['SHAREPOINT_SITE_ID'] = config._siteId;
                        if (config._driveId) envVars['SHAREPOINT_DRIVE_ID'] = config._driveId;
                        if (config._fileId) envVars['SHAREPOINT_FILE_ID'] = config._fileId;
                        if (config.siteUrl) envVars['SHAREPOINT_SITE_URL'] = config.siteUrl;
                        if (config.filePath) envVars['SHAREPOINT_FILE_PATH'] = config.filePath;
                        if (config.sheetName) envVars['SHAREPOINT_SHEET_NAME'] = config.sheetName;
                        console.log(`[Python] Injected SharePoint token and context`);
                    } else {
                        console.warn(`[Python] Failed to Retrieve SharePoint Token for connector ${connector.name} (ID: ${connectorId})`);
                    }
                }

                console.log(`[Python] Injected env vars from connector ${connector.name} (ID: ${connectorId})`);
            }
        }

        if (!envVars['SHAREPOINT_TOKEN'] && user?.companyId) {
            try {
                const spConnector = await db.connector.findFirst({
                    where: { companyId: user.companyId, type: 'SHAREPOINT' }
                });
                if (spConnector && spConnector.config) {
                    let spConfig: any = spConnector.config;
                    if (typeof spConfig === 'string') {
                        try { spConfig = JSON.parse(spConfig); } catch { spConfig = {}; }
                    }
                    const spTenantId = spConfig.tenantId || "0089ad7d-e10f-49b4-bf68-60e706423382";
                    const spClientId = spConfig.clientId || "7ff50e8a-eb8c-4bf8-9fa6-f4068c6fe82b";

                    const { getCachedSharePointTokenAction } = await import('./sharepoint');
                    const authResult = await getCachedSharePointTokenAction(spTenantId, spClientId, spConfig.clientSecret || undefined, user.companyId);

                    if (authResult.accessToken) {
                        envVars['SHAREPOINT_TOKEN'] = authResult.accessToken;
                        if (spConfig._siteId) envVars['SHAREPOINT_SITE_ID'] = spConfig._siteId;
                        if (spConfig._driveId) envVars['SHAREPOINT_DRIVE_ID'] = spConfig._driveId;
                        if (spConfig._fileId) envVars['SHAREPOINT_FILE_ID'] = spConfig._fileId;
                        if (spConfig.siteUrl) envVars['SHAREPOINT_SITE_URL'] = spConfig.siteUrl;
                        if (spConfig.filePath) envVars['SHAREPOINT_FILE_PATH'] = spConfig.filePath;
                        if (spConfig.sheetName) envVars['SHAREPOINT_SHEET_NAME'] = spConfig.sheetName;
                        console.log(`[Python] SharePoint token injected via company-wide fallback (connector: ${spConnector.name})`);
                    }
                }
            } catch (spErr: any) {
                console.warn(`[Python] SharePoint company-wide fallback exception: ${spErr.message}`);
            }
        }

        if (selectedDocuments && selectedDocuments.length > 0) {
            const { getDataLakePath } = await import('@/lib/data-lake');
            const docsDir = getDataLakePath();
            envVars['DOCUMENTS_DIR'] = docsDir;
            envVars['SELECTED_DOCUMENTS'] = selectedDocuments.join(',');
            console.log(`[Python] Injected DOCUMENTS_DIR=${docsDir}, SELECTED_DOCUMENTS=${selectedDocuments.join(',')}`);
            debugLogs.push(`[${new Date().toLocaleTimeString()}] Documenti selezionati: ${selectedDocuments.join(', ')}`);
        }

        // Inject query_db() support: connector ID from this node or inherited from dependencies
        let effectiveConnectorId = connectorId;
        if ((!effectiveConnectorId || effectiveConnectorId === 'none') && dependencies && dependencies.length > 0) {
            // Inherit connector from dependencies (recursive search)
            const findInheritedConnectorId = (deps: any[]): string | undefined => {
                for (const dep of deps) {
                    if (dep.connectorId && dep.connectorId !== 'none') return dep.connectorId;
                    if (dep.pipelineDependencies?.length > 0) {
                        const nested = findInheritedConnectorId(dep.pipelineDependencies);
                        if (nested) return nested;
                    }
                }
                return undefined;
            };
            effectiveConnectorId = findInheritedConnectorId(dependencies);
            if (effectiveConnectorId) {
                console.log(`[Python] Inherited connectorId ${effectiveConnectorId} from dependencies (node had no connector)`);
            }
        }
        // If still no connector, try to find ANY SQL connector for this company as fallback
        if ((!effectiveConnectorId || effectiveConnectorId === 'none') && user?.companyId) {
            try {
                const fallbackConnector = await db.connector.findFirst({
                    where: { companyId: user.companyId, type: 'SQL' },
                    select: { id: true, name: true }
                });
                if (fallbackConnector) {
                    effectiveConnectorId = fallbackConnector.id;
                    console.log(`[Python] Fallback: using company SQL connector "${fallbackConnector.name}" (${fallbackConnector.id}) for query_db()`);
                }
            } catch (e) {
                console.warn(`[Python] Fallback connector lookup failed:`, e);
            }
        }
        if (effectiveConnectorId && effectiveConnectorId !== 'none') {
            const port = process.env.PORT || '9002';
            envVars['QUERY_DB_ENDPOINT'] = `http://localhost:${port}/api/internal/query-db`;
            envVars['QUERY_DB_CONNECTOR_ID'] = effectiveConnectorId;
            if (!process.env.INTERNAL_QUERY_TOKEN) {
                throw new Error('Missing required env var: INTERNAL_QUERY_TOKEN');
            }
            envVars['QUERY_DB_TOKEN'] = process.env.INTERNAL_QUERY_TOKEN;
            envVars['QUERY_DB_COMPANY_ID'] = user?.companyId || '';
            console.log(`[Python] query_db() enabled with connector ${effectiveConnectorId}`);
        } else {
            console.warn(`[Python] WARNING: No SQL connector available — query_db() will NOT work in this script`);
        }

        if (dependencies && dependencies.length > 0) {
            console.log(`[Python] Fetching ${dependencies.length} dependencies:`, dependencies.map(d => d.tableName).join(', '));
            debugLogs.push(`[${new Date().toLocaleTimeString()}] Start fetching ${dependencies.length} dependencies`);

            for (const dep of dependencies) {
                const tDepStart = performance.now();
                const depConnectorId = dep.connectorId || 'default (none provided)';
                console.log(`[Python DEBUG] Processing dependency: ${dep.tableName}`);

                debugLogs.push(`[${new Date().toLocaleTimeString()}] Fetching SQL for table '${dep.tableName}' (Connector: ${depConnectorId})...`);

                let queryResults: any[] = [];

                if (inputData[dep.tableName]) {
                    console.log(`[Python] Dependency ${dep.tableName} already provided in inputData. Skipping fetch.`);
                    debugLogs.push(`[${new Date().toLocaleTimeString()}] Dependency '${dep.tableName}' provided by client. Skipping fetch.`);
                    continue;
                }

                if (dep.query) {
                    try {
                        if (dep.query) {
                            debugLogs.push(`[${new Date().toLocaleTimeString()}] Executing SQL query for '${dep.tableName}'...`);

                            let isSqlConnector = true;
                            if (dep.connectorId) {
                                const connector = await db.connector.findUnique({
                                    where: { id: dep.connectorId, companyId: user.companyId }
                                });
                                isSqlConnector = !connector || (connector.type === 'mssql' || connector.type === 'sql' || connector.type === 'SQL');

                                if (!isSqlConnector) {
                                    console.warn(`[Python] Dependency ${dep.tableName} has connector type ${connector?.type}`);
                                    debugLogs.push(`[WARN] Unsupported connector type for ${dep.tableName}: ${connector?.type}`);
                                }
                            }

                            if (isSqlConnector) {
                                const res = await executeSqlPreviewAction(
                                    dep.query,
                                    dep.connectorId || '',
                                    dep.pipelineDependencies,
                                    _bypassAuth
                                );
                                if (res.data) {
                                    queryResults = res.data;
                                } else {
                                    console.error(`[Python] Error fetching dependent SQL data for ${dep.tableName}: ${res.error}`);
                                    debugLogs.push(`[ERROR] Fetch failed for ${dep.tableName}: ${res.error}`);
                                    return {
                                        success: false,
                                        error: `Failed to fetch data for dependency '${dep.tableName}': ${res.error}`,
                                        debugLogs
                                    };
                                }
                            }
                        }

                        inputData[dep.tableName] = queryResults;
                        const tDepEnd = performance.now();
                        const dur = ((tDepEnd - tDepStart) / 1000).toFixed(2);
                        console.log(`[Python] Fetched ${queryResults.length} rows for ${dep.tableName} in ${dur}s`);
                        debugLogs.push(`[${new Date().toLocaleTimeString()}] Fetched ${queryResults.length} rows for '${dep.tableName}' in ${dur}s`);

                    } catch (err: any) {
                        console.error(`[Python] Execute SQL Preview Error:`, err);
                        debugLogs.push(`[ERROR] Exception fetching ${dep.tableName}: ${err.message}`);
                    }
                } else if (dep.isPython && dep.pythonCode) {
                    console.log(`[Python] Recursively executing Python dependency: ${dep.tableName}`);
                    debugLogs.push(`[${new Date().toLocaleTimeString()}] Recursively executing Python dependency: '${dep.tableName}'...`);

                    try {
                        const recursiveRes = await executePythonPreviewAction(
                            dep.pythonCode,
                            'table',
                            {},
                            dep.pipelineDependencies,
                            dep.connectorId,
                            _bypassAuth,
                            (dep.selectedDocuments && dep.selectedDocuments.length > 0) ? dep.selectedDocuments : undefined
                        );

                        if (recursiveRes.success && recursiveRes.data) {
                            inputData[dep.tableName] = recursiveRes.data;
                            console.log(`[Python] Fetched ${recursiveRes.data.length} rows for ${dep.tableName} (Recursive)`);
                            debugLogs.push(`[${new Date().toLocaleTimeString()}] Fetched ${recursiveRes.data.length} rows for '${dep.tableName}' (Recursive Python)`);
                        } else {
                            console.error(`[Python] Error in recursive execution for ${dep.tableName}: ${recursiveRes.error}`);
                            debugLogs.push(`[ERROR] Recursive execution failed for ${dep.tableName}: ${recursiveRes.error}`);
                        }

                    } catch (err: any) {
                        console.error(`[Python] Recursive Execution Exception:`, err);
                        debugLogs.push(`[ERROR] Exception in recursive execution for ${dep.tableName}: ${err.message}`);
                    }
                } else {
                    console.warn(`[Python] Skipping dependency ${dep.tableName} because query is missing.`);
                    debugLogs.push(`[WARN] Skipping dependency ${dep.tableName} because query is missing.`);
                }
            }
        }

        let chartThemeData: Record<string, any> | undefined;
        try {
            const companyId = user?.companyId;
            if (companyId) {
                const company = await db.company.findUnique({
                    where: { id: companyId },
                    select: { chartTheme: true },
                });
                chartThemeData = resolveTheme(company?.chartTheme as any);
            }
        } catch (e) {
            console.error(`[ChartTheme] Error loading theme:`, e);
        }

        const MAX_RETRIES = 3;
        const RETRY_DELAYS = [1000, 2000, 4000];

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 300000);

            try {
                const inputDataKeys = Object.keys(inputData);
                const inputDataSizes = inputDataKeys.map(k => `${k}:${inputData[k]?.length ?? 0}`).join(', ');
                console.log(`[executePythonPreviewAction] Calling Python backend (attempt ${attempt + 1}/${MAX_RETRIES + 1}), outputType=${outputType}, connectorId=${connectorId || 'NONE'}, inputData=[${inputDataSizes}], envKeys=[${Object.keys(envVars).join(',')}]`);
                debugLogs.push(`[${new Date().toLocaleTimeString()}] Sending data to Python backend${attempt > 0 ? ` (retry ${attempt})` : ''} — outputType=${outputType}, inputs=[${inputDataSizes}]`);

                if (dfTarget) {
                    console.log(`[executePythonPreviewAction] dfTarget explicitly set to '${dfTarget}'`);
                }
                const response = await pythonFetch('/execute', {
                    method: 'POST',
                    body: JSON.stringify({
                        code,
                        outputType,
                        inputData,
                        env: envVars,
                        chartTheme: chartThemeData,
                        ...(dfTarget ? { dfTable: dfTarget } : {}),
                    }),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    const errText = await response.text();
                    debugLogs.push(`[ERROR] Python backend HTTP ${response.status}: ${errText}`);
                    throw new Error(`Python backend error (${response.status}): ${errText}`);
                }

                const result = await response.json();
                const elapsed = ((performance.now() - tStart) / 1000).toFixed(1);

                // Log key result fields for pipeline debugging
                console.log(`[executePythonPreviewAction] Result: success=${result.success}, dataLen=${result.data?.length ?? 'N/A'}, htmlLen=${result.html?.length ?? 0}, autoSwitch=${result._autoSwitchedOutputType || 'none'}, warning=${result._warning || 'none'}, cols=${result.columns?.slice(0, 5)?.join(',') || 'N/A'}`);

                if (!result.success) {
                    if (result.stdout) {
                        debugLogs.push(`[Python stdout]\n${result.stdout}`);
                    }
                    debugLogs.push(`[${new Date().toLocaleTimeString()}] FALLITO dopo ${elapsed}s: ${result.error || 'Errore sconosciuto'}`);
                    return {
                        success: false,
                        error: result.error || 'Unknown error from Python backend',
                        stdout: result.stdout,
                        debugLogs,
                    };
                }

                if (result.stdout) {
                    debugLogs.push(`[Python stdout]\n${result.stdout}`);
                }

                const dataLen = result.data?.length ?? 0;
                const htmlLen = result.html?.length ?? 0;
                const hasChart = !!(result.chartBase64 || result.chartHtml || result.rechartsConfig || result.plotlyJson);
                debugLogs.push(`[${new Date().toLocaleTimeString()}] Completato in ${elapsed}s — dati: ${dataLen} righe, html: ${htmlLen} car, grafico: ${hasChart ? 'sì' : 'no'}`);
                if (dataLen === 0 && htmlLen < 200 && !hasChart) {
                    debugLogs.push(`ATTENZIONE: il risultato sembra vuoto. Verifica che lo script produca dati.`);
                }

                if (outputType === 'table') {
                    if (result._autoSwitchedOutputType === 'html' && result.html) {
                        return { success: true, html: result.html, stdout: result.stdout, debugLogs, _autoSwitchedOutputType: 'html' } as any;
                    }
                    return { success: true, data: result.data, columns: result.columns, rowCount: result.rowCount, stdout: result.stdout, debugLogs };
                } else if (outputType === 'variable') {
                    return { success: true, variables: result.variables, stdout: result.stdout, debugLogs };
                } else if (outputType === 'chart') {
                    return {
                        success: true,
                        chartBase64: result.chartBase64,
                        chartHtml: result.chartHtml,
                        rechartsConfig: result.rechartsConfig,
                        rechartsData: result.rechartsData,
                        rechartsStyle: result.rechartsStyle,
                        plotlyJson: result.plotlyJson,
                        stdout: result.stdout,
                        debugLogs,
                    };
                } else if (outputType === 'html') {
                    return { success: true, html: result.html, stdout: result.stdout, debugLogs };
                }

                return { success: false, error: 'Unknown output type' };

            } catch (fetchError: any) {
                clearTimeout(timeoutId);

                if (fetchError.name === 'AbortError') {
                    return {
                        success: false,
                        error: 'Timeout: Il calcolo Python ha impiegato troppo tempo (>5 minuti). Verifica il codice per eventuali loop infiniti.'
                    };
                }

                const error = fetchError instanceof Error ? fetchError.message : "Error calling Python backend.";
                const isConnectionError = error.includes('ECONNREFUSED') || error.includes('fetch failed');

                console.error(`[executePythonPreviewAction] Fetch error: "${error}"`);

                if (isConnectionError && attempt < MAX_RETRIES) {
                    const delay = RETRY_DELAYS[attempt] || 4000;
                    console.log(`[executePythonPreviewAction] Connection failed, retrying in ${delay}ms...`);
                    debugLogs.push(`[${new Date().toLocaleTimeString()}] Backend non raggiungibile, retry tra ${delay / 1000}s...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                if (isConnectionError) {
                    return {
                        success: false,
                        error: 'Python backend non raggiungibile. Assicurati che sia in esecuzione su porta 5005.'
                    };
                }

                return { success: false, error };
            }
        }

        return { success: false, error: 'Python backend non raggiungibile. Assicurati che sia in esecuzione su porta 5005.' };

    } catch (e) {
        const error = e instanceof Error ? e.message : "Error executing Python code.";

        if (error.includes('ECONNREFUSED') || error.includes('fetch failed')) {
            return {
                success: false,
                error: 'Python backend non raggiungibile. Assicurati che sia in esecuzione su porta 5005.'
            };
        }

        return { success: false, error };
    }
}

// ---------------------------------------------------------------------------
// resolveDependencyChainAction / resolveAncestorResourcesAction
// ---------------------------------------------------------------------------

function findNodeByResultName(node: any, targetName: string): any {
    if (!node) return null;
    const targetLower = targetName.toLowerCase();

    if (Array.isArray(node)) {
        for (const item of node) {
            const found = findNodeByResultName(item, targetName);
            if (found) return found;
        }
        return null;
    }

    if (typeof node === 'object') {
        if ('pythonResultName' in node && typeof node.pythonResultName === 'string' && node.pythonResultName.toLowerCase() === targetLower) return node;
        if ('sqlResultName' in node && typeof node.sqlResultName === 'string' && node.sqlResultName.toLowerCase() === targetLower) return node;

        if ('options' in node && node.options) {
            for (const key in node.options) {
                const found = findNodeByResultName(node.options[key], targetName);
                if (found) return found;
            }
        }
    }

    return null;
}

export async function resolveDependencyChainAction(targetName: string): Promise<{ data: any[] | null, error: string | null }> {
    try {
        const user = await getAuthenticatedUser();

        const allTrees = await db.tree.findMany({
            where: { companyId: user.companyId },
            select: { id: true, jsonDecisionTree: true, name: true }
        });

        const parsedTrees: { id: string; name: string; json: any }[] = [];
        for (const tree of allTrees) {
            try {
                const json = JSON.parse(tree.jsonDecisionTree);
                parsedTrees.push({ id: tree.id, name: tree.name, json });
            } catch (e) {
                continue;
            }
        }

        const findNodeInDb = (name: string) => {
            for (const tree of parsedTrees) {
                const node = findNodeByResultName(tree.json, name);
                if (node) return node;
            }
            return null;
        };

        const chain: any[] = [];
        const visited = new Set<string>();
        const resolving = new Set<string>();

        const buildChain = (currentName: string) => {
            if (visited.has(currentName.toLowerCase())) return;
            if (resolving.has(currentName.toLowerCase())) {
                console.warn(`Circular dependency detected for ${currentName}. Breaking cycle.`);
                return;
            }
            if (['print', 'len', 'range', 'list', 'dict', 'set', 'str', 'int', 'float', 'import', 'from', 'def', 'return', 'none', 'true', 'false', 'self'].includes(currentName.toLowerCase())) return;

            resolving.add(currentName.toLowerCase());

            const node = findNodeInDb(currentName);

            if (node) {
                let potentialDeps: string[] = [];
                if (node.pythonCode) {
                    const matches = node.pythonCode.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
                    potentialDeps = Array.from(new Set(matches));
                }

                for (const dep of potentialDeps) {
                    if (dep.length > 2 && dep !== currentName) {
                        buildChain(dep);
                    }
                }

                if (!visited.has(currentName.toLowerCase())) {
                    chain.push(node);
                    visited.add(currentName.toLowerCase());
                }
            }

            resolving.delete(currentName.toLowerCase());
        };

        buildChain(targetName);

        if (chain.length > 0) {
            return { data: chain, error: null };
        }

        if (targetName.includes('.')) {
            const simpleName = targetName.split('.').pop();
            if (simpleName && simpleName !== targetName) {
                console.log(`[resolveDependencyChainAction] No chain found for "${targetName}". Retrying with simple name "${simpleName}"...`);
                buildChain(simpleName);

                if (chain.length > 0) {
                    return { data: chain, error: null };
                }
            }
        }

        return { data: null, error: 'Nessuna dipendenza trovata.' };

    } catch (e) {
        console.error("Error in resolveDependencyChainAction:", e);
        return { data: null, error: e instanceof Error ? e.message : "Errore durante la risoluzione delle dipendenze." };
    }
}

export async function resolveAncestorResourcesAction(targetNodeId: string): Promise<{
    data: { media: any[], links: any[], triggers: any[] } | null,
    error: string | null
}> {
    try {
        const user = await getAuthenticatedUser();

        const findAncestorsWithResources = (tree: any, targetId: string): { media: any[], links: any[], triggers: any[] } => {
            const result = { media: [] as any[], links: [] as any[], triggers: [] as any[] };

            const search = (node: any, ancestorMedia: any[], ancestorLinks: any[], ancestorTriggers: any[]): boolean => {
                if (!node) return false;

                const currentMedia = (node.media && Array.isArray(node.media)) ? node.media : [];
                const currentLinks = (node.links && Array.isArray(node.links)) ? node.links : [];
                const currentTriggers = (node.triggers && Array.isArray(node.triggers)) ? node.triggers : [];

                const allMedia = [...ancestorMedia, ...currentMedia];
                const allLinks = [...ancestorLinks, ...currentLinks];
                const allTriggers = [...ancestorTriggers, ...currentTriggers];

                if (node.id === targetId) {
                    result.media = allMedia;
                    result.links = allLinks;
                    result.triggers = allTriggers;
                    return true;
                }

                if (Array.isArray(node)) {
                    for (const item of node) {
                        if (search(item, ancestorMedia, ancestorLinks, ancestorTriggers)) return true;
                    }
                    return false;
                }

                if (typeof node === 'object' && node.options) {
                    for (const key in node.options) {
                        if (search(node.options[key], allMedia, allLinks, allTriggers)) return true;
                    }
                }

                return false;
            };

            search(tree, [], [], []);
            return result;
        };

        const candidates = await db.tree.findMany({
            where: {
                companyId: user.companyId,
                jsonDecisionTree: { contains: targetNodeId }
            },
            select: { id: true, jsonDecisionTree: true, name: true }
        });

        for (const tree of candidates) {
            try {
                const json = JSON.parse(tree.jsonDecisionTree);
                const resources = findAncestorsWithResources(json, targetNodeId);

                if (resources.media.length > 0 || resources.links.length > 0 || resources.triggers.length > 0) {
                    console.log(`[resolveAncestorResourcesAction] Found resources for node ${targetNodeId}: ${resources.media.length} media, ${resources.links.length} links, ${resources.triggers.length} triggers`);
                    return { data: resources, error: null };
                }
            } catch (e) {
                continue;
            }
        }

        return { data: { media: [], links: [], triggers: [] }, error: null };

    } catch (e) {
        console.error("Error in resolveAncestorResourcesAction:", e);
        return { data: null, error: e instanceof Error ? e.message : "Errore durante la risoluzione delle risorse ancestor." };
    }
}
