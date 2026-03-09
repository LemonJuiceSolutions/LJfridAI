'use server'

import { db } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/session';
import sql from 'mssql';
import type { DatabaseMap, TableInfo, ColumnInfo, RelationshipInfo, ColumnFingerprint, OverlapCandidate, DataSamplingState } from '@/lib/database-map-types';
import { getOpenRouterSettingsAction } from '@/actions/openrouter';
import { getCachedParsedMap, setCachedParsedMap, getParsedMapCacheEntry, recoverPartialJson } from '@/lib/database-map-cache';

// ─── Debounced save to avoid writing 30MB on every single field edit ─────────
let _debouncedSaveTimer: ReturnType<typeof setTimeout> | null = null;
let _debouncedSavePromise: Promise<void> | null = null;
let _debouncedSaveResolvers: (() => void)[] = [];
const DEBOUNCE_SAVE_MS = 2000;

async function saveDatabaseMapDebounced(connectorId: string, map: DatabaseMap): Promise<void> {
    // Always update the in-memory cache immediately
    setCachedParsedMap(connectorId, map);

    return new Promise<void>((resolve) => {
        _debouncedSaveResolvers.push(resolve);

        if (_debouncedSaveTimer) clearTimeout(_debouncedSaveTimer);

        _debouncedSaveTimer = setTimeout(async () => {
            _debouncedSaveTimer = null;
            const resolvers = [..._debouncedSaveResolvers];
            _debouncedSaveResolvers = [];

            try {
                await db.connector.update({
                    where: { id: connectorId },
                    data: { databaseMap: JSON.stringify(map), databaseMapAt: new Date() },
                });
            } catch (e) {
                console.error('[DB-MAP] Debounced save error:', e);
            }

            for (const r of resolvers) r();
        }, DEBOUNCE_SAVE_MS);
    });
}

// Force flush any pending debounced saves (call before reads that need consistency)
async function flushDebouncedSave(): Promise<void> {
    if (_debouncedSaveTimer) {
        clearTimeout(_debouncedSaveTimer);
        _debouncedSaveTimer = null;

        const cacheEntry = getParsedMapCacheEntry();
        if (cacheEntry) {
            const resolvers = [..._debouncedSaveResolvers];
            _debouncedSaveResolvers = [];
            try {
                await db.connector.update({
                    where: { id: cacheEntry.connectorId },
                    data: { databaseMap: JSON.stringify(cacheEntry.map), databaseMapAt: new Date() },
                });
            } catch (e) {
                console.error('[DB-MAP] Flush save error:', e);
            }
            for (const r of resolvers) r();
        }
    }
}

// ─── Helper: fetch free models dynamically from OpenRouter ──────────────────
let _freeModelsCache: { models: string[]; fetchedAt: number } | null = null;
const FREE_MODELS_CACHE_TTL = 1000 * 60 * 30; // 30 min

async function fetchFreeModels(apiKey: string): Promise<string[]> {
    // Return cache if fresh
    if (_freeModelsCache && Date.now() - _freeModelsCache.fetchedAt < FREE_MODELS_CACHE_TTL) {
        return _freeModelsCache.models;
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const res = await fetch('https://openrouter.ai/api/v1/models', {
            headers: { 'Authorization': `Bearer ${apiKey}` },
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) throw new Error(`OpenRouter models API: ${res.status}`);
        const json = await res.json();
        const data: any[] = json.data || [];

        // Filter: free (prompt=0, completion=0), text input+output, decent context
        const free = data.filter((m: any) => {
            const promptCost = parseFloat(m.pricing?.prompt || '1');
            const completionCost = parseFloat(m.pricing?.completion || '1');
            if (promptCost !== 0 || completionCost !== 0) return false;
            const inputMods: string[] = m.architecture?.input_modalities || [];
            const outputMods: string[] = m.architecture?.output_modalities || [];
            if (!inputMods.includes('text') || !outputMods.includes('text')) return false;
            if ((m.context_length || 0) < 4000) return false;
            return true;
        });

        // Sort by context_length desc (bigger models tend to be more capable)
        free.sort((a: any, b: any) => (b.context_length || 0) - (a.context_length || 0));

        // Take top 6 to have good coverage without too many parallel calls
        const models = free.slice(0, 6).map((m: any) => m.id as string);

        if (models.length > 0) {
            _freeModelsCache = { models, fetchedAt: Date.now() };
        }

        console.log(`[DATA-ANALYSIS] Found ${free.length} free models, using top ${models.length}:`, models);
        return models;
    } catch (err: any) {
        console.error('[DATA-ANALYSIS] Failed to fetch free models:', err.message);
        // Fallback to known free models if API fails
        return [
            'google/gemini-2.0-flash-exp:free',
            'meta-llama/llama-3.3-70b-instruct:free',
            'qwen/qwen-2.5-72b-instruct:free',
        ];
    }
}

// ─── Helper: build SQL config from connector ────────────────────────────────
function buildSqlConfig(conf: any, requestTimeoutMs = 120000) {
    const sqlConfig: any = {
        user: conf.user,
        password: conf.password,
        server: conf.host,
        database: conf.database,
        options: {
            encrypt: conf.host && conf.host.includes('database.windows.net'),
            trustServerCertificate: true,
            connectTimeout: 30000,
            requestTimeout: requestTimeoutMs,
        },
    };
    if (conf.port) sqlConfig.port = parseInt(conf.port);
    return sqlConfig;
}

// ─── Q1: All user tables with row counts ────────────────────────────────────
const TABLES_QUERY = `
SELECT
    s.name AS table_schema,
    t.name AS table_name,
    p.rows AS row_count,
    CAST(ep.value AS NVARCHAR(MAX)) AS table_description
FROM sys.tables t
INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
LEFT JOIN sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0, 1)
LEFT JOIN sys.extended_properties ep
    ON ep.major_id = t.object_id AND ep.minor_id = 0 AND ep.name = 'MS_Description'
WHERE t.is_ms_shipped = 0
ORDER BY s.name, t.name
`;

// ─── Q2: All columns with metadata (uses sys.columns for performance on large DBs) ─
const COLUMNS_QUERY = `
SELECT
    s.name AS TABLE_SCHEMA,
    t.name AS TABLE_NAME,
    c.name AS COLUMN_NAME,
    tp.name AS DATA_TYPE,
    c.max_length AS CHARACTER_MAXIMUM_LENGTH,
    CASE WHEN c.is_nullable = 1 THEN 'YES' ELSE 'NO' END AS IS_NULLABLE,
    dc.definition AS COLUMN_DEFAULT,
    CASE WHEN ic.column_id IS NOT NULL THEN 1 ELSE 0 END AS is_primary_key,
    CAST(ep.value AS NVARCHAR(MAX)) AS column_description
FROM sys.columns c
INNER JOIN sys.tables t ON c.object_id = t.object_id
INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
INNER JOIN sys.types tp ON c.user_type_id = tp.user_type_id
LEFT JOIN sys.default_constraints dc ON c.default_object_id = dc.object_id
LEFT JOIN sys.indexes i ON i.object_id = t.object_id AND i.is_primary_key = 1
LEFT JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.column_id = c.column_id
LEFT JOIN sys.extended_properties ep
    ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    AND ep.name = 'MS_Description'
WHERE t.is_ms_shipped = 0
ORDER BY s.name, t.name, c.column_id
`;

// ─── Q3: All foreign key relationships ──────────────────────────────────────
const FK_QUERY = `
SELECT
    fk.name AS constraint_name,
    sch1.name AS source_schema, tp.name AS source_table, cp.name AS source_column,
    sch2.name AS target_schema, tr.name AS target_table, cr.name AS target_column
FROM sys.foreign_keys fk
INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
INNER JOIN sys.tables tp ON fkc.parent_object_id = tp.object_id
INNER JOIN sys.schemas sch1 ON tp.schema_id = sch1.schema_id
INNER JOIN sys.columns cp ON fkc.parent_object_id = cp.object_id AND fkc.parent_column_id = cp.column_id
INNER JOIN sys.tables tr ON fkc.referenced_object_id = tr.object_id
INNER JOIN sys.schemas sch2 ON tr.schema_id = sch2.schema_id
INNER JOIN sys.columns cr ON fkc.referenced_object_id = cr.object_id AND fkc.referenced_column_id = cr.column_id
ORDER BY sch1.name, tp.name, fk.name
`;

// ─── Q4: VIEW definitions to extract JOIN relationships (limit to 500 to avoid timeout) ─
const VIEWS_QUERY = `
SELECT TOP 500
    s.name AS view_schema,
    v.name AS view_name,
    LEFT(m.definition, 8000) AS view_definition
FROM sys.views v
INNER JOIN sys.schemas s ON v.schema_id = s.schema_id
INNER JOIN sys.sql_modules m ON v.object_id = m.object_id
WHERE v.is_ms_shipped = 0
`;

// ─── Q5: Stored Procedure definitions to extract JOIN relationships (limit to 500) ─
const SP_QUERY = `
SELECT TOP 500
    s.name AS sp_schema,
    p.name AS sp_name,
    LEFT(m.definition, 8000) AS sp_definition
FROM sys.procedures p
INNER JOIN sys.schemas s ON p.schema_id = s.schema_id
INNER JOIN sys.sql_modules m ON p.object_id = m.object_id
WHERE p.is_ms_shipped = 0
`;

// ─── Parse JOIN/WHERE conditions from SQL text ──────────────────────────────
function parseJoinsFromSQL(
    sqlText: string,
    tableNames: Set<string>,         // lowercase table names
    tableByNameLower: Map<string, { schema: string; name: string; fullName: string }>,
): { sourceTable: string; sourceCol: string; targetTable: string; targetCol: string }[] {
    const results: { sourceTable: string; sourceCol: string; targetTable: string; targetCol: string }[] = [];
    const seen = new Set<string>();

    // Extract aliases: FROM tableName alias, JOIN tableName alias, FROM tableName AS alias
    // Also handle [schema].[tableName] alias and dbo.tableName alias
    const aliasMap = new Map<string, string>(); // alias (lowercase) → table name (original)
    const aliasRegex = /(?:FROM|JOIN)\s+(?:\[?(\w+)\]?\.)?(?:\[?(\w+)\]?)\s+(?:AS\s+)?(?:\[?(\w+)\]?)/gi;
    let aliasMatch;
    while ((aliasMatch = aliasRegex.exec(sqlText)) !== null) {
        const tableName = aliasMatch[2];
        const alias = aliasMatch[3];
        if (tableName && alias && tableName.toLowerCase() !== alias.toLowerCase()) {
            if (tableNames.has(tableName.toLowerCase())) {
                aliasMap.set(alias.toLowerCase(), tableName);
            }
        }
        // Also register the table name itself as an alias to itself
        if (tableName && tableNames.has(tableName.toLowerCase())) {
            aliasMap.set(tableName.toLowerCase(), tableName);
        }
    }

    // Extract equality conditions: table1.col1 = table2.col2
    // Works for both ON clauses and WHERE clauses
    const eqRegex = /(?:\[?(\w+)\]?)\.(?:\[?(\w+)\]?)\s*=\s*(?:\[?(\w+)\]?)\.(?:\[?(\w+)\]?)/gi;
    let match;
    while ((match = eqRegex.exec(sqlText)) !== null) {
        const leftRef = match[1];
        const leftCol = match[2];
        const rightRef = match[3];
        const rightCol = match[4];

        // Resolve aliases to table names
        const leftTable = aliasMap.get(leftRef.toLowerCase()) || leftRef;
        const rightTable = aliasMap.get(rightRef.toLowerCase()) || rightRef;

        // Check both are known tables
        const leftInfo = tableByNameLower.get(leftTable.toLowerCase());
        const rightInfo = tableByNameLower.get(rightTable.toLowerCase());

        if (leftInfo && rightInfo && leftInfo.fullName !== rightInfo.fullName) {
            const key = `${leftInfo.fullName}.${leftCol}-${rightInfo.fullName}.${rightCol}`.toLowerCase();
            const keyRev = `${rightInfo.fullName}.${rightCol}-${leftInfo.fullName}.${leftCol}`.toLowerCase();
            if (!seen.has(key) && !seen.has(keyRev)) {
                seen.add(key);
                results.push({
                    sourceTable: leftInfo.fullName,
                    sourceCol: leftCol,
                    targetTable: rightInfo.fullName,
                    targetCol: rightCol,
                });
            }
        }
    }

    return results;
}

// ─── Assign retroactive confidence to all relationships ─────────────────────
function assignConfidence(relationships: RelationshipInfo[]): void {
    for (const rel of relationships) {
        if (rel.confidence !== undefined) continue; // already assigned (e.g. data_analysis)
        if (!rel.inferred) {
            rel.confidence = 100;
            rel.inferenceMethod = 'formal_fk';
        } else if (rel.constraintName.startsWith('INFERRED_')) {
            rel.confidence = 75;
            rel.inferenceMethod = 'name_pattern';
        } else if (rel.constraintName.startsWith('PREFIX_')) {
            rel.confidence = 70;
            rel.inferenceMethod = 'prefix_suffix';
        } else if (rel.constraintName.startsWith('VIEW_') || rel.constraintName.startsWith('SP_')) {
            rel.confidence = 85;
            rel.inferenceMethod = 'view_sp';
        } else if (rel.constraintName.startsWith('AI_')) {
            rel.confidence = 60;
            rel.inferenceMethod = 'ai_schema';
        } else if (rel.constraintName.startsWith('DATA_')) {
            rel.confidence = rel.confidence ?? 50;
            rel.inferenceMethod = 'data_analysis';
        } else {
            rel.confidence = 100;
            rel.inferenceMethod = 'formal_fk';
        }
    }
}

// ─── getDatabaseMapAction ───────────────────────────────────────────────────
export async function getDatabaseMapAction(connectorId: string): Promise<{ data?: DatabaseMap; error?: string }> {
    const user = await getAuthenticatedUser();
    if (!user) return { error: 'Non autorizzato' };

    try {
        const connector = await db.connector.findUnique({
            where: { id: connectorId, companyId: user.companyId },
        });

        if (!connector || connector.type !== 'SQL') {
            return { error: 'Connettore SQL non trovato' };
        }

        let conf: any;
        try {
            conf = JSON.parse(connector.config);
        } catch {
            return { error: 'Configurazione connettore non valida' };
        }

        // Use longer request timeout for scan (5 min) – large DBs need it
        const sqlConfig = buildSqlConfig(conf, 300000);
        const pool = new sql.ConnectionPool(sqlConfig);
        await pool.connect();

        try {
            // Execute core queries first (tables, columns, FK) – these are essential
            const [tablesResult, columnsResult, fkResult] = await Promise.all([
                pool.request().query(TABLES_QUERY),
                pool.request().query(COLUMNS_QUERY),
                pool.request().query(FK_QUERY),
            ]);

            // VIEW/SP parsing is optional and slow on large DBs – skip if >800 tables
            const tableCount = tablesResult.recordset.length;
            let viewsResult: { recordset: any[] } = { recordset: [] };
            let spResult: { recordset: any[] } = { recordset: [] };

            if (tableCount <= 800) {
                // Run VIEW/SP queries with shorter timeout (60s)
                try {
                    const shortReq1 = pool.request();
                    (shortReq1 as any).timeout = 60000;
                    viewsResult = await shortReq1.query(VIEWS_QUERY).catch(() => ({ recordset: [] }));
                } catch { /* skip views */ }

                try {
                    const shortReq2 = pool.request();
                    (shortReq2 as any).timeout = 60000;
                    spResult = await shortReq2.query(SP_QUERY).catch(() => ({ recordset: [] }));
                } catch { /* skip SPs */ }
            }

            // Build relationships array
            const relationships: RelationshipInfo[] = fkResult.recordset.map((row: any) => ({
                constraintName: row.constraint_name,
                sourceSchema: row.source_schema,
                sourceTable: row.source_table,
                sourceColumn: row.source_column,
                targetSchema: row.target_schema,
                targetTable: row.target_table,
                targetColumn: row.target_column,
            }));

            // Build FK lookup for quick column matching
            const fkLookup = new Map<string, RelationshipInfo>();
            for (const rel of relationships) {
                fkLookup.set(`${rel.sourceSchema}.${rel.sourceTable}.${rel.sourceColumn}`, rel);
            }

            // Load existing map to preserve ALL descriptions (AI + user)
            let existingMap: DatabaseMap | null = null;
            if (connector.databaseMap) {
                try {
                    existingMap = JSON.parse(connector.databaseMap);
                } catch { /* ignore parse errors */ }
            }
            const existingTableDescs = new Map<string, { ai: string | null; user: string | null }>();
            const existingColDescs = new Map<string, { ai: string | null; user: string | null }>();
            if (existingMap) {
                for (const t of existingMap.tables) {
                    existingTableDescs.set(t.fullName, { ai: t.description, user: t.userDescription });
                    for (const c of t.columns) {
                        existingColDescs.set(`${t.fullName}.${c.name}`, { ai: c.description, user: c.userDescription });
                    }
                }
            }

            // Build tables map
            const tablesMap = new Map<string, TableInfo>();
            for (const row of tablesResult.recordset) {
                const fullName = `${row.table_schema}.${row.table_name}`;
                const prevDescs = existingTableDescs.get(fullName);
                tablesMap.set(fullName, {
                    schema: row.table_schema,
                    name: row.table_name,
                    fullName,
                    rowCount: parseInt(String(row.row_count)) || 0,
                    description: row.table_description || prevDescs?.ai || null,
                    userDescription: prevDescs?.user || null,
                    columns: [],
                    primaryKeyColumns: [],
                    foreignKeysOut: [],
                    foreignKeysIn: [],
                });
            }

            // Populate columns
            let totalColumns = 0;
            for (const row of columnsResult.recordset) {
                const fullName = `${row.TABLE_SCHEMA}.${row.TABLE_NAME}`;
                const table = tablesMap.get(fullName);
                if (!table) continue;

                const fkKey = `${row.TABLE_SCHEMA}.${row.TABLE_NAME}.${row.COLUMN_NAME}`;
                const fkRel = fkLookup.get(fkKey);

                const prevColDescs = existingColDescs.get(`${fullName}.${row.COLUMN_NAME}`);
                const col: ColumnInfo = {
                    name: row.COLUMN_NAME,
                    dataType: row.DATA_TYPE,
                    maxLength: row.CHARACTER_MAXIMUM_LENGTH,
                    isNullable: row.IS_NULLABLE === 'YES',
                    defaultValue: row.COLUMN_DEFAULT || null,
                    isPrimaryKey: row.is_primary_key === 1,
                    isForeignKey: !!fkRel,
                    foreignKeyTarget: fkRel
                        ? { schema: fkRel.targetSchema, table: fkRel.targetTable, column: fkRel.targetColumn }
                        : undefined,
                    description: row.column_description || prevColDescs?.ai || null,
                    userDescription: prevColDescs?.user || null,
                };

                table.columns.push(col);
                if (col.isPrimaryKey) table.primaryKeyColumns.push(col.name);
                totalColumns++;
            }

            // Cross-reference FK relationships on tables
            for (const rel of relationships) {
                const sourceKey = `${rel.sourceSchema}.${rel.sourceTable}`;
                const targetKey = `${rel.targetSchema}.${rel.targetTable}`;
                tablesMap.get(sourceKey)?.foreignKeysOut.push(rel);
                tablesMap.get(targetKey)?.foreignKeysIn.push(rel);
            }

            // ── Infer relationships from column naming conventions ──────
            // Catches cases where FK constraints aren't formally defined
            // Patterns: CustomerID → Customer.ID, customer_id → customer.id,
            //           IdCustomer → Customer.ID, fk_customer → customer
            const formalFKSet = new Set(relationships.map(r =>
                `${r.sourceSchema}.${r.sourceTable}.${r.sourceColumn}`.toLowerCase()
            ));

            // Build lookup: lowercase table name → TableInfo
            const tableByName = new Map<string, TableInfo>();
            for (const t of tablesMap.values()) {
                tableByName.set(t.name.toLowerCase(), t);
                // Also try without common prefixes like tbl_, tb_, t_
                const stripped = t.name.replace(/^(tbl_?|tb_?|t_)/i, '');
                if (stripped.toLowerCase() !== t.name.toLowerCase()) {
                    tableByName.set(stripped.toLowerCase(), t);
                }
            }

            // Build lookup: table → PK columns
            const tablePKs = new Map<string, string[]>();
            for (const t of tablesMap.values()) {
                tablePKs.set(t.fullName, t.primaryKeyColumns);
            }

            const inferredRelationships: RelationshipInfo[] = [];

            for (const sourceTable of tablesMap.values()) {
                for (const col of sourceTable.columns) {
                    // Skip if already a formal FK or is a PK
                    if (col.isForeignKey || col.isPrimaryKey) continue;
                    // Only consider int/bigint/uniqueidentifier columns (typical FK types)
                    const dtype = col.dataType.toLowerCase();
                    if (!['int', 'bigint', 'smallint', 'uniqueidentifier', 'nvarchar', 'varchar'].includes(dtype)) continue;

                    const colLower = col.name.toLowerCase();
                    const formalKey = `${sourceTable.schema}.${sourceTable.name}.${col.name}`.toLowerCase();
                    if (formalFKSet.has(formalKey)) continue;

                    // Try to extract a table name from the column name
                    let candidateTableName: string | null = null;
                    let candidatePKCol: string | null = null;

                    // Pattern 1: SomethingID or SomethingId → Something
                    const matchSuffix = col.name.match(/^(.+?)(?:_?[Ii][Dd])$/);
                    if (matchSuffix) {
                        candidateTableName = matchSuffix[1].replace(/_$/, '');
                    }

                    // Pattern 2: ID_Something or Id_Something or id_something → Something
                    if (!candidateTableName) {
                        const matchPrefix = col.name.match(/^(?:[Ii][Dd]|[Ff][Kk])_?(.+)$/);
                        if (matchPrefix) {
                            candidateTableName = matchPrefix[1];
                        }
                    }

                    if (!candidateTableName) continue;

                    // Don't match self-referencing same table
                    if (candidateTableName.toLowerCase() === sourceTable.name.toLowerCase()) continue;

                    // Try to find the target table
                    const targetTable = tableByName.get(candidateTableName.toLowerCase());
                    if (!targetTable) continue;

                    // Find the PK of the target table
                    const targetPKs = tablePKs.get(targetTable.fullName) || [];
                    if (targetPKs.length === 0) continue;

                    // Use the first PK column as the target
                    candidatePKCol = targetPKs[0];

                    const inferredRel: RelationshipInfo = {
                        constraintName: `INFERRED_${sourceTable.name}_${col.name}`,
                        sourceSchema: sourceTable.schema,
                        sourceTable: sourceTable.name,
                        sourceColumn: col.name,
                        targetSchema: targetTable.schema,
                        targetTable: targetTable.name,
                        targetColumn: candidatePKCol,
                        inferred: true,
                    };

                    inferredRelationships.push(inferredRel);
                    relationships.push(inferredRel);

                    // Update column info
                    col.isForeignKey = true;
                    col.foreignKeyTarget = {
                        schema: targetTable.schema,
                        table: targetTable.name,
                        column: candidatePKCol,
                    };

                    // Cross-reference on tables
                    sourceTable.foreignKeysOut.push(inferredRel);
                    targetTable.foreignKeysIn.push(inferredRel);
                }
            }

            // ── Infer relationships from table prefix + same PK name ────────
            // Pattern: F4_WFEntryDetail.ID → F4_WFEntry.ID (child table has same PK name)
            // Also: MA_AccBookAttachmentsDetail → MA_AccBookAttachments
            // Strategy: for each table, check if a "parent" table exists by stripping suffixes
            const allRelKeys = new Set<string>();
            for (const rel of relationships) {
                allRelKeys.add(`${rel.sourceSchema}.${rel.sourceTable}.${rel.sourceColumn}->${rel.targetSchema}.${rel.targetTable}.${rel.targetColumn}`.toLowerCase());
                allRelKeys.add(`${rel.targetSchema}.${rel.targetTable}.${rel.targetColumn}->${rel.sourceSchema}.${rel.sourceTable}.${rel.sourceColumn}`.toLowerCase());
            }

            // Common child suffixes in ERP/business databases
            const childSuffixes = ['Detail', 'Details', 'Line', 'Lines', 'Item', 'Items', 'Charge', 'Charges',
                'Shipping', 'Payment', 'Payments', 'Note', 'Notes', 'Attachment', 'Attachments',
                'Row', 'Rows', 'Sub', 'Ext', 'Extra', 'Hist', 'History', 'Log', 'Archive',
                'Leaf', 'Child', 'Dtl', 'Det', 'Hdr', '_Detail', '_Details', '_Line', '_Lines'];

            for (const childTable of tablesMap.values()) {
                const childNameLower = childTable.name.toLowerCase();

                // Try stripping suffixes to find parent
                for (const suffix of childSuffixes) {
                    if (!childNameLower.endsWith(suffix.toLowerCase())) continue;
                    const parentCandidate = childTable.name.slice(0, -suffix.length);
                    if (!parentCandidate || parentCandidate.length < 2) continue;

                    const parentTable = tableByName.get(parentCandidate.toLowerCase());
                    if (!parentTable || parentTable.fullName === childTable.fullName) continue;

                    // Find shared column names that are PK in parent
                    const parentPKs = new Set(parentTable.primaryKeyColumns.map(p => p.toLowerCase()));
                    if (parentPKs.size === 0) continue;

                    for (const col of childTable.columns) {
                        if (col.isForeignKey || col.isPrimaryKey) continue;
                        if (!parentPKs.has(col.name.toLowerCase())) continue;

                        // Found: child has a column with same name as parent's PK
                        const parentPKCol = parentTable.primaryKeyColumns.find(p => p.toLowerCase() === col.name.toLowerCase());
                        if (!parentPKCol) continue;

                        const key = `${childTable.schema}.${childTable.name}.${col.name}->${parentTable.schema}.${parentTable.name}.${parentPKCol}`.toLowerCase();
                        if (allRelKeys.has(key)) continue;

                        const prefixRel: RelationshipInfo = {
                            constraintName: `PREFIX_${childTable.name}_${col.name}_${parentTable.name}`,
                            sourceSchema: childTable.schema,
                            sourceTable: childTable.name,
                            sourceColumn: col.name,
                            targetSchema: parentTable.schema,
                            targetTable: parentTable.name,
                            targetColumn: parentPKCol,
                            inferred: true,
                        };

                        relationships.push(prefixRel);
                        allRelKeys.add(key);

                        col.isForeignKey = true;
                        col.foreignKeyTarget = { schema: parentTable.schema, table: parentTable.name, column: parentPKCol };
                        childTable.foreignKeysOut.push(prefixRel);
                        parentTable.foreignKeysIn.push(prefixRel);
                    }
                    break; // Found a parent, no need to try other suffixes
                }
            }

            // ── Infer relationships from VIEW definitions (JOIN parsing) ───
            // Build lookup for the parser
            const tableNamesLower = new Set<string>();
            const tableByNameLower = new Map<string, { schema: string; name: string; fullName: string }>();
            for (const t of tablesMap.values()) {
                tableNamesLower.add(t.name.toLowerCase());
                tableByNameLower.set(t.name.toLowerCase(), { schema: t.schema, name: t.name, fullName: t.fullName });
            }

            // Track already-known relationships to avoid duplicates
            const knownRelSet = new Set<string>();
            for (const rel of relationships) {
                knownRelSet.add(`${rel.sourceSchema}.${rel.sourceTable}.${rel.sourceColumn}->${rel.targetSchema}.${rel.targetTable}.${rel.targetColumn}`.toLowerCase());
                // Also add reverse direction
                knownRelSet.add(`${rel.targetSchema}.${rel.targetTable}.${rel.targetColumn}->${rel.sourceSchema}.${rel.sourceTable}.${rel.sourceColumn}`.toLowerCase());
            }

            // Process VIEWs and Stored Procedures with the same logic
            const sqlSources: { recordset: any[]; nameField: string; defField: string; prefix: string }[] = [
                { recordset: viewsResult.recordset, nameField: 'view_name', defField: 'view_definition', prefix: 'VIEW' },
                { recordset: spResult.recordset, nameField: 'sp_name', defField: 'sp_definition', prefix: 'SP' },
            ];

            for (const source of sqlSources) {
                for (const row of source.recordset) {
                    const definition = row[source.defField];
                    if (!definition) continue;
                    const joins = parseJoinsFromSQL(definition, tableNamesLower, tableByNameLower);

                    for (const join of joins) {
                        const key1 = `${join.sourceTable}.${join.sourceCol}->${join.targetTable}.${join.targetCol}`.toLowerCase();
                        const key2 = `${join.targetTable}.${join.targetCol}->${join.sourceTable}.${join.sourceCol}`.toLowerCase();
                        if (knownRelSet.has(key1) || knownRelSet.has(key2)) continue;

                        // Verify columns exist
                        const srcTable = tablesMap.get(join.sourceTable);
                        const tgtTable = tablesMap.get(join.targetTable);
                        if (!srcTable || !tgtTable) continue;

                        const srcCol = srcTable.columns.find(c => c.name.toLowerCase() === join.sourceCol.toLowerCase());
                        const tgtCol = tgtTable.columns.find(c => c.name.toLowerCase() === join.targetCol.toLowerCase());
                        if (!srcCol || !tgtCol) continue;

                        const objName = row[source.nameField] || 'unknown';
                        const sqlObjRel: RelationshipInfo = {
                            constraintName: `${source.prefix}_${objName}_${join.sourceCol}_${join.targetCol}`,
                            sourceSchema: srcTable.schema,
                            sourceTable: srcTable.name,
                            sourceColumn: srcCol.name,
                            targetSchema: tgtTable.schema,
                            targetTable: tgtTable.name,
                            targetColumn: tgtCol.name,
                            inferred: true,
                        };

                        relationships.push(sqlObjRel);
                        knownRelSet.add(key1);
                        knownRelSet.add(key2);

                        // Update column info if not already a FK
                        if (!srcCol.isForeignKey) {
                            srcCol.isForeignKey = true;
                            srcCol.foreignKeyTarget = { schema: tgtTable.schema, table: tgtTable.name, column: tgtCol.name };
                        }

                        srcTable.foreignKeysOut.push(sqlObjRel);
                        tgtTable.foreignKeysIn.push(sqlObjRel);
                    }
                }
            }

            const tables = Array.from(tablesMap.values());
            const totalRows = tables.reduce((sum, t) => sum + t.rowCount, 0);

            // Assign confidence retroactively to all relationships
            assignConfidence(relationships);

            const map: DatabaseMap = {
                connectorId: connector.id,
                connectorName: connector.name,
                databaseName: conf.database,
                tables,
                relationships,
                summary: {
                    totalTables: tables.length,
                    totalColumns: totalColumns,
                    totalRelationships: relationships.length,
                    totalRows,
                },
                generatedAt: new Date().toISOString(),
                descriptionsGeneratedAt: existingMap?.descriptionsGeneratedAt,
                nodePositions: existingMap?.nodePositions,
                dataSamplingState: existingMap?.dataSamplingState,
            };

            // Save to connector
            await db.connector.update({
                where: { id: connectorId },
                data: {
                    databaseMap: JSON.stringify(map),
                    databaseMapAt: new Date(),
                },
            });

            return { data: map };
        } finally {
            await pool.close();
        }
    } catch (e: any) {
        console.error('[DB-MAP] Error:', e);
        const msg = e.message || String(e);
        if (msg.includes('timeout') || msg.includes('Timeout') || e.code === 'ETIMEOUT') {
            return { error: `Timeout scansione database: il database ha troppe tabelle o la connessione è lenta. Riprova.` };
        }
        return { error: `Errore scansione database: ${msg}` };
    }
}

// ─── getCachedDatabaseMapAction ─────────────────────────────────────────────
export async function getCachedDatabaseMapAction(connectorId: string): Promise<{ data?: DatabaseMap; cachedAt?: string; error?: string }> {
    const user = await getAuthenticatedUser();
    if (!user) return { error: 'Non autorizzato' };

    try {
        // Check if in-memory cache is valid by comparing timestamps (avoids reading 30MB from DB)
        const cacheEntry = getParsedMapCacheEntry();
        if (cacheEntry && cacheEntry.connectorId === connectorId) {
            const meta = await db.connector.findUnique({
                where: { id: connectorId, companyId: user.companyId },
                select: { databaseMapAt: true },
            });
            if (!meta) return { error: 'Connettore non trovato' };
            if (!meta.databaseMapAt) return {};

            const dbTimestamp = meta.databaseMapAt.getTime();
            // If in-memory cache was updated after or at the same time as DB, use it
            if (cacheEntry.updatedAt >= dbTimestamp) {
                return { data: cacheEntry.map, cachedAt: meta.databaseMapAt.toISOString() };
            }
        }

        // Cache miss or stale: read full data from DB
        const connector = await db.connector.findUnique({
            where: { id: connectorId, companyId: user.companyId },
            select: { databaseMap: true, databaseMapAt: true },
        });

        if (!connector) return { error: 'Connettore non trovato' };
        if (!connector.databaseMap) return {};

        const map: DatabaseMap = getCachedParsedMap(connectorId, connector.databaseMap);
        return { data: map, cachedAt: connector.databaseMapAt?.toISOString() };
    } catch (e: any) {
        console.error('[DB-MAP] Cache read error:', e);
        return { error: `Errore lettura cache: ${e.message}` };
    }
}

// ─── updateTableDescriptionAction ───────────────────────────────────────────
export async function updateTableDescriptionAction(
    connectorId: string,
    tableFullName: string,
    description: string
): Promise<{ success?: boolean; error?: string }> {
    const user = await getAuthenticatedUser();
    if (!user) return { error: 'Non autorizzato' };

    try {
        const connector = await db.connector.findUnique({
            where: { id: connectorId, companyId: user.companyId },
            select: { databaseMap: true },
        });

        if (!connector?.databaseMap) return { error: 'Mappa non trovata' };

        const map: DatabaseMap = getCachedParsedMap(connectorId, connector.databaseMap);
        const table = map.tables.find(t => t.fullName === tableFullName);
        if (!table) return { error: 'Tabella non trovata' };

        table.userDescription = description || null;

        await saveDatabaseMapDebounced(connectorId, map);

        return { success: true };
    } catch (e: any) {
        return { error: `Errore aggiornamento: ${e.message}` };
    }
}

// ─── updateColumnDescriptionAction ──────────────────────────────────────────
export async function updateColumnDescriptionAction(
    connectorId: string,
    tableFullName: string,
    columnName: string,
    description: string
): Promise<{ success?: boolean; error?: string }> {
    const user = await getAuthenticatedUser();
    if (!user) return { error: 'Non autorizzato' };

    try {
        const connector = await db.connector.findUnique({
            where: { id: connectorId, companyId: user.companyId },
            select: { databaseMap: true },
        });

        if (!connector?.databaseMap) return { error: 'Mappa non trovata' };

        const map: DatabaseMap = getCachedParsedMap(connectorId, connector.databaseMap);
        const table = map.tables.find(t => t.fullName === tableFullName);
        if (!table) return { error: 'Tabella non trovata' };

        const column = table.columns.find(c => c.name === columnName);
        if (!column) return { error: 'Colonna non trovata' };

        column.userDescription = description || null;

        await saveDatabaseMapDebounced(connectorId, map);

        return { success: true };
    } catch (e: any) {
        return { error: `Errore aggiornamento: ${e.message}` };
    }
}

// ─── saveNodePositionsAction ─────────────────────────────────────────────────
export async function saveNodePositionsAction(
    connectorId: string,
    positions: Record<string, { x: number; y: number }>
): Promise<{ success?: boolean; error?: string }> {
    const user = await getAuthenticatedUser();
    if (!user) return { error: 'Non autorizzato' };

    try {
        const connector = await db.connector.findUnique({
            where: { id: connectorId, companyId: user.companyId },
            select: { databaseMap: true },
        });

        if (!connector?.databaseMap) return { error: 'Mappa non trovata' };

        const map: DatabaseMap = getCachedParsedMap(connectorId, connector.databaseMap);
        map.nodePositions = positions;

        await saveDatabaseMapDebounced(connectorId, map);

        return { success: true };
    } catch (e: any) {
        return { error: `Errore salvataggio posizioni: ${e.message}` };
    }
}

// ─── generateDescriptionBatchAction ──────────────────────────────────────────
// Processa UN singolo batch di tabelle. Il client chiama in loop per avere progress live.
// mode: 'all' = rigenera tutte | 'missing' = solo mancanti
// batchIndex: quale batch (0, 1, 2, ...)
const DESC_BATCH_SIZE_FREE = 8;      // tables per AI call for free models (small prompt)
const DESC_BATCH_SIZE_PAID = 25;     // tables per AI call for paid models (can handle larger prompts)
const DESC_PARALLEL_CALLS = 3;       // parallel AI calls
const DESC_SAVE_EVERY = 5;           // save to DB every N iterations

export async function generateDescriptionBatchAction(
    connectorId: string,
    mode: 'all' | 'missing',
    batchIndex: number,
    aiModel?: string // if provided, use this paid model; otherwise auto-rotate free models
): Promise<{
    batchProcessed: number;
    totalToProcess: number;
    totalTables: number;
    done: boolean;
    error?: string;
    failedTables?: number;
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number; costUsd: number };
}> {
    const user = await getAuthenticatedUser();
    if (!user) return { batchProcessed: 0, totalToProcess: 0, totalTables: 0, done: true, error: 'Non autorizzato' };

    const orSettings = await getOpenRouterSettingsAction();
    if (!orSettings.apiKey) return { batchProcessed: 0, totalToProcess: 0, totalTables: 0, done: true, error: 'Chiave API OpenRouter non configurata.' };

    const isPaidMode = !!aiModel;
    const freeModels = isPaidMode ? [] : await fetchFreeModels(orSettings.apiKey);
    const orModel = aiModel || freeModels[0] || orSettings.model || 'google/gemini-2.0-flash-001';
    console.log(`[DB-MAP] Using ${isPaidMode ? 'PAID' : 'FREE'} model(s): ${isPaidMode ? orModel : freeModels.slice(0, 3).join(', ')}`);

    try {
        const connector = await db.connector.findUnique({
            where: { id: connectorId, companyId: user.companyId },
            select: { databaseMap: true },
        });

        if (!connector?.databaseMap) return { batchProcessed: 0, totalToProcess: 0, totalTables: 0, done: true, error: 'Mappa non trovata' };

        const map: DatabaseMap = getCachedParsedMap(connectorId, connector.databaseMap);
        console.log(`[DB-MAP] generateDescriptionBatch: batch ${batchIndex}, mode ${mode}, ${map.tables.length} total tables`);

        // Filter tables based on mode
        let tablesToProcess: TableInfo[];
        if (mode === 'missing') {
            tablesToProcess = map.tables.filter(t => {
                const tableNeedsDesc = !t.description && !t.userDescription;
                const someColNeedsDesc = t.columns.some(c => !c.description && !c.userDescription);
                return tableNeedsDesc || someColNeedsDesc;
            });
        } else {
            tablesToProcess = [...map.tables];
        }

        const totalToProcess = tablesToProcess.length;
        const batchSize = isPaidMode ? DESC_BATCH_SIZE_PAID : DESC_BATCH_SIZE_FREE;
        const tablesPerIteration = DESC_PARALLEL_CALLS * batchSize;
        const startIdx = batchIndex * tablesPerIteration;

        // Check if done
        if (startIdx >= totalToProcess) {
            return { batchProcessed: 0, totalToProcess, totalTables: map.tables.length, done: true };
        }

        const iterationTables = tablesToProcess.slice(startIdx, startIdx + tablesPerIteration);

        // Split into parallel sub-batches
        const subBatches: TableInfo[][] = [];
        for (let i = 0; i < iterationTables.length; i += batchSize) {
            subBatches.push(iterationTables.slice(i, i + batchSize));
        }

        // Helper: process a single sub-batch with retry
        // Track temporarily rate-limited models (shared across sub-batches)
        const rateLimitedModels = new Set<string>();
        let batchUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0 };

        async function processSubBatch(batch: TableInfo[], subIdx: number): Promise<{ ok: boolean; tables: number }> {
            const tablesSummary = batch.map(t => {
                const needsTableDesc = mode === 'all' || (!t.description && !t.userDescription);
                const cols = t.columns
                    .filter(c => mode === 'all' || (!c.description && !c.userDescription))
                    .map(c => {
                        let colDesc = `  - ${c.name} (${c.dataType}`;
                        if (c.maxLength && c.maxLength > 0) colDesc += `(${c.maxLength})`;
                        colDesc += ')';
                        if (c.isPrimaryKey) colDesc += ' [PK]';
                        if (c.isForeignKey && c.foreignKeyTarget) {
                            colDesc += ` [FK → ${c.foreignKeyTarget.table}.${c.foreignKeyTarget.column}]`;
                        }
                        if (!c.isNullable) colDesc += ' NOT NULL';
                        return colDesc;
                    }).join('\n');

                let block = `TABELLA: ${t.fullName} (${t.rowCount} righe)`;
                if (!needsTableDesc) block += ' [DESCRIZIONE GIA\' PRESENTE - genera solo colonne mancanti]';
                block += `\nColonne:\n${cols}`;
                return block;
            }).join('\n\n---\n\n');

            const prompt = `Sei un esperto di database SQL Server. Analizza queste tabelle e genera descrizioni SINTETICHE in italiano:
- Per ogni TABELLA: 1 brevissima frase che ne spiega lo scopo.
- Per ogni COLONNA: max 5-6 parole (es. "Identificativo", "Data inserimento record").
Generare meno testo possibile per velocizzare il processo.

Rispondi SOLO in formato JSON con questa struttura esatta:
{
  "tables": {
    "schema.nomeTabella": {
      "description": "Descrizione dettagliata della tabella (2-3 frasi)",
      "columns": {
        "nomeColonna": "Descrizione del campo (1-2 frasi)"
      }
    }
  }
}

Ecco le tabelle da descrivere:

${tablesSummary}`;

            const AI_TIMEOUT = isPaidMode ? 90000 : 60000; // paid models get more time (bigger batches possible)
            const MAX_ATTEMPTS = isPaidMode ? 2 : Math.min(freeModels.length, 5);

            // Pick first non-rate-limited model, rotating by subIdx
            function pickModel(offset: number): string {
                if (isPaidMode) return orModel;
                for (let i = 0; i < freeModels.length; i++) {
                    const m = freeModels[(subIdx + offset + i) % freeModels.length];
                    if (!rateLimitedModels.has(m)) return m;
                }
                return freeModels[subIdx % freeModels.length];
            }

            console.log(`[DB-MAP] Sub-batch ${subIdx}: prompt ~${Math.round(prompt.length/1024)}KB`);
            for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
                const currentModel = pickModel(attempt);
                try {
                    if (attempt > 0) {
                        await new Promise(r => setTimeout(r, 800));
                        console.log(`[DB-MAP] Desc sub-batch ${subIdx}: retry ${attempt} with model=${currentModel}`);
                    }

                    console.log(`[DB-MAP] Desc sub-batch ${subIdx}: calling AI for ${batch.length} tables, model=${currentModel}`);
                    const fetchPromise = fetch('https://openrouter.ai/api/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${orSettings.apiKey}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            model: currentModel,
                            messages: [{ role: 'user', content: prompt }],
                            temperature: 0.3,
                        }),
                        signal: AbortSignal.timeout(AI_TIMEOUT),
                    });
                    const timeoutPromise = new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error('HARD_TIMEOUT')), AI_TIMEOUT + 2000)
                    );
                    const response = await Promise.race([fetchPromise, timeoutPromise]);
                    if (!response.ok) {
                        const errBody = await response.text();
                        if (response.status === 429) {
                            rateLimitedModels.add(currentModel);
                            console.warn(`[DB-MAP] Sub-batch ${subIdx}: ${currentModel} rate-limited (429), blacklisting & trying next`);
                            continue; // try next model immediately
                        }
                        console.error(`[DB-MAP] Desc sub-batch ${subIdx}: HTTP ${response.status} - ${errBody.slice(0, 200)}`);
                        continue;
                    }

                    const data = await response.json();
                    // Track usage/cost from OpenRouter response
                    // OpenRouter returns usage.prompt_tokens, usage.completion_tokens, usage.total_tokens
                    // Cost may be in usage.total_cost, usage.cost, or not present at all
                    const u = data.usage;
                    if (u) {
                        const pt = u.prompt_tokens || 0;
                        const ct = u.completion_tokens || 0;
                        batchUsage.promptTokens += pt;
                        batchUsage.completionTokens += ct;
                        batchUsage.totalTokens += u.total_tokens || (pt + ct);
                        batchUsage.costUsd += u.total_cost || u.cost || 0;
                    }
                    const text = data.choices?.[0]?.message?.content || '';
                    console.log(`[DB-MAP] Desc sub-batch ${subIdx}: ${text.length} chars from ${currentModel}, usage: in=${u?.prompt_tokens} out=${u?.completion_tokens} cost=${u?.total_cost ?? u?.cost ?? 'N/A'}`);

                    const parsed = recoverPartialJson(text);
                    if (parsed?.tables) {
                        applyDescriptions(parsed.tables, batch, mode);
                        return { ok: true, tables: batch.length };
                    }

                    // JSON completely unrecoverable — try halving the batch
                    if (batch.length > 3) {
                        console.log(`[DB-MAP] Sub-batch ${subIdx}: JSON unrecoverable, splitting ${batch.length} tables in half`);
                        const mid = Math.ceil(batch.length / 2);
                        const [r1, r2] = await Promise.all([
                            processSubBatch(batch.slice(0, mid), subIdx * 10 + 1),
                            processSubBatch(batch.slice(mid), subIdx * 10 + 2),
                        ]);
                        return { ok: r1.ok || r2.ok, tables: batch.length };
                    }
                    // Too small to split further
                    return { ok: true, tables: batch.length };
                } catch (err: any) {
                    const isTimeout = err.name === 'AbortError' || err.name === 'TimeoutError' || err.message?.includes('aborted') || err.message?.includes('HARD_TIMEOUT') || err.message?.includes('timed out');
                    console.error(`[DB-MAP] Desc sub-batch ${subIdx} error (${currentModel}, ${isTimeout ? 'TIMEOUT' : 'ERROR'}):`, err.message);
                    if (isTimeout) return { ok: false, tables: batch.length }; // timeout = give up
                    continue; // other errors = try next model
                }
            }
            return { ok: false, tables: batch.length };
        }

        // Helper: apply parsed descriptions to tables
        function applyDescriptions(tablesData: Record<string, any>, batch: TableInfo[], mode: 'all' | 'missing') {
            for (const table of batch) {
                const tableDescs = tablesData[table.fullName];
                if (!tableDescs) continue;

                if (tableDescs.description) {
                    if (mode === 'all' || (!table.description && !table.userDescription)) {
                        table.description = tableDescs.description;
                    }
                }
                if (tableDescs.columns) {
                    for (const col of table.columns) {
                        if (tableDescs.columns[col.name]) {
                            if (mode === 'all' || (!col.description && !col.userDescription)) {
                                col.description = tableDescs.columns[col.name];
                            }
                        }
                    }
                }
            }
        }

        // Process sub-batches in parallel with retry
        const results = await Promise.allSettled(subBatches.map((batch, subIdx) => processSubBatch(batch, subIdx)));

        let failedTables = 0;
        for (const r of results) {
            if (r.status === 'fulfilled' && !r.value.ok) failedTables += r.value.tables;
            else if (r.status === 'rejected') failedTables += batchSize;
        }

        // Save to DB using debounce (or flush on last batch)
        const nextDone = (startIdx + tablesPerIteration) >= totalToProcess;
        map.descriptionsGeneratedAt = new Date().toISOString();
        if (nextDone) {
            // Final batch: flush immediately
            await flushDebouncedSave();
            await db.connector.update({
                where: { id: connectorId },
                data: { databaseMap: JSON.stringify(map), databaseMapAt: new Date() },
            });
            setCachedParsedMap(connectorId, map);
        } else {
            await saveDatabaseMapDebounced(connectorId, map);
        }

        return { batchProcessed: iterationTables.length, totalToProcess, totalTables: map.tables.length, done: nextDone, failedTables, usage: batchUsage };
    } catch (e: any) {
        console.error('[DB-MAP] AI batch error:', e);
        return { batchProcessed: 0, totalToProcess: 0, totalTables: 0, done: true, error: `Errore: ${e.message}` };
    }
}

// ─── chatDatabaseMapAction ──────────────────────────────────────────────────
export async function chatDatabaseMapAction(
    connectorId: string,
    question: string,
    history: { role: 'user' | 'assistant'; content: string }[]
): Promise<{ answer?: string; error?: string }> {
    const user = await getAuthenticatedUser();
    if (!user) return { error: 'Non autorizzato' };

    const orSettings = await getOpenRouterSettingsAction();
    if (!orSettings.apiKey) return { error: 'Chiave API OpenRouter non configurata.' };
    const orModel = orSettings.model || 'google/gemini-2.0-flash-001';

    try {
        const connector = await db.connector.findUnique({
            where: { id: connectorId, companyId: user.companyId },
            select: { databaseMap: true, name: true },
        });

        if (!connector?.databaseMap) return { error: 'Mappa database non disponibile.' };

        const map: DatabaseMap = getCachedParsedMap(connectorId, connector.databaseMap);

        // Build a concise schema summary for the LLM context
        // Limit total size to avoid exceeding context window
        const MAX_SCHEMA_CHARS = 40000;
        let schemaSummary = '';
        let truncated = false;

        for (const t of map.tables) {
            const desc = t.userDescription || t.description || '';
            const pkCols = t.primaryKeyColumns.join(', ');
            const cols = t.columns.map(c => {
                let info = `${c.name} (${c.dataType})`;
                if (c.isPrimaryKey) info += ' [PK]';
                if (c.isForeignKey && c.foreignKeyTarget) info += ` [FK→${c.foreignKeyTarget.table}.${c.foreignKeyTarget.column}]`;
                return info;
            }).join('\n    ');
            const fkOut = t.foreignKeysOut.map(fk => `${fk.sourceColumn} → ${fk.targetSchema}.${fk.targetTable}.${fk.targetColumn}`).join(', ');

            let block = `TABELLA: ${t.fullName} (${t.rowCount} righe)`;
            if (desc) block += `\n  Descrizione: ${desc}`;
            if (pkCols) block += `\n  PK: ${pkCols}`;
            block += `\n  Colonne:\n    ${cols}`;
            if (fkOut) block += `\n  FK Uscita: ${fkOut}`;

            if (schemaSummary.length + block.length > MAX_SCHEMA_CHARS) {
                truncated = true;
                break;
            }
            schemaSummary += (schemaSummary ? '\n\n' : '') + block;
        }

        const truncNote = truncated ? `\n\n(Schema troncato per limiti di contesto. Mostrate ${schemaSummary.split('TABELLA:').length - 1} di ${map.summary.totalTables} tabelle.)` : '';

        const systemPrompt = `Sei un esperto di database. L'utente sta esplorando la mappa del database "${map.databaseName}" (connettore: ${connector.name}).

Ecco la struttura del database:

${schemaSummary}${truncNote}

Statistiche: ${map.summary.totalTables} tabelle, ${map.summary.totalColumns} colonne, ${map.summary.totalRelationships} relazioni FK, ${map.summary.totalRows.toLocaleString()} righe totali.

Rispondi in italiano, in modo chiaro e conciso. Se ti chiedono di tabelle o colonne specifiche, fornisci dettagli precisi dalla mappa. Se ti chiedono relazioni, spiega i collegamenti FK. Puoi suggerire query SQL se utile.`;

        const messages = [
            { role: 'system' as const, content: systemPrompt },
            ...history.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
            { role: 'user' as const, content: question },
        ];

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${orSettings.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: orModel,
                messages,
                temperature: 0.5,
            }),
        });

        if (!response.ok) {
            const errBody = await response.text();
            console.error('[DB-MAP-CHAT] OpenRouter error:', response.status, errBody);
            let detail = '';
            try {
                const errJson = JSON.parse(errBody);
                detail = errJson?.error?.message || errJson?.message || '';
            } catch { detail = errBody.slice(0, 200); }
            return { error: `Errore API (${response.status}): ${detail || 'Risposta non valida dal modello AI.'}` };
        }

        const data = await response.json();
        const answer = data.choices?.[0]?.message?.content;
        if (!answer) {
            console.error('[DB-MAP-CHAT] Empty response:', JSON.stringify(data).slice(0, 500));
            return { error: 'Il modello AI non ha generato una risposta. Riprova.' };
        }

        return { answer };
    } catch (e: any) {
        console.error('[DB-MAP-CHAT] Error:', e);
        return { error: `Errore: ${e.message}` };
    }
}

// ─── inferRelationshipsAIAction ──────────────────────────────────────────────
// Chiede all'AI di suggerire relazioni probabili analizzando nomi tabelle/colonne
const INFER_BATCH_SIZE = 100;        // total tables per iteration
const INFER_SUB_BATCH = 8;           // tables per single AI call (small prompt for free models)
const INFER_PARALLEL = 3;            // parallel AI calls

export async function inferRelationshipsAIAction(
    connectorId: string,
    batchIndex: number,
    aiModel?: string // if provided, use this paid model; otherwise auto-rotate free models
): Promise<{
    newRelationships: number;
    totalProcessed: number;
    totalTables: number;
    done: boolean;
    error?: string;
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number; costUsd: number };
}> {
    const user = await getAuthenticatedUser();
    if (!user) return { newRelationships: 0, totalProcessed: 0, totalTables: 0, done: true, error: 'Non autorizzato' };

    const orSettings = await getOpenRouterSettingsAction();
    if (!orSettings.apiKey) return { newRelationships: 0, totalProcessed: 0, totalTables: 0, done: true, error: 'Chiave API OpenRouter non configurata.' };
    const isPaidModeRel = !!aiModel;
    const freeModelsRel = isPaidModeRel ? [] : await fetchFreeModels(orSettings.apiKey);
    const orModel = aiModel || freeModelsRel[0] || orSettings.model || 'google/gemini-2.0-flash-001';

    try {
        const connector = await db.connector.findUnique({
            where: { id: connectorId, companyId: user.companyId },
            select: { databaseMap: true },
        });

        if (!connector?.databaseMap) return { newRelationships: 0, totalProcessed: 0, totalTables: 0, done: true, error: 'Mappa non trovata' };

        const map: DatabaseMap = getCachedParsedMap(connectorId, connector.databaseMap);
        const startIdx = batchIndex * INFER_BATCH_SIZE;

        if (startIdx >= map.tables.length) {
            return { newRelationships: 0, totalProcessed: map.tables.length, totalTables: map.tables.length, done: true };
        }

        const iterationTables = map.tables.slice(startIdx, startIdx + INFER_BATCH_SIZE);

        // Build existing relationships set for dedup
        const existingRels = new Set<string>();
        for (const rel of map.relationships) {
            existingRels.add(`${rel.sourceSchema}.${rel.sourceTable}.${rel.sourceColumn}->${rel.targetSchema}.${rel.targetTable}.${rel.targetColumn}`.toLowerCase());
        }

        // Build PK table list — per-sub-batch, only relevant target tables
        // This keeps prompts small enough for fast AI responses
        const allPkTables = map.tables.filter(t => t.primaryKeyColumns.length > 0);
        const pkTableMap = new Map(allPkTables.map(t => [t.fullName.toLowerCase(), t]));

        console.log(`[DB-MAP] Infer relationships batch ${batchIndex}: ${iterationTables.length} tables, ${allPkTables.length} PK tables`);

        // Build table lookup
        const tableByFullName = new Map(map.tables.map(t => [t.fullName.toLowerCase(), t]));

        // Split into sub-batches for parallel processing
        const subBatches: TableInfo[][] = [];
        for (let i = 0; i < iterationTables.length; i += INFER_SUB_BATCH) {
            subBatches.push(iterationTables.slice(i, i + INFER_SUB_BATCH));
        }

        let newCount = 0;
        let relUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0 };

        // Process sub-batches in parallel
        const rateLimitedRel = new Set<string>();
        console.log(`[DB-MAP] Processing ${subBatches.length} sub-batches of ~${INFER_SUB_BATCH} tables each`);
        await Promise.allSettled(subBatches.map(async (batch, sbIdx) => {
            // Build column list for this sub-batch
            const batchColNames = new Set<string>();
            const batchSummary = batch.map(t => {
                const cols = t.columns
                    .filter(c => !c.isForeignKey)
                    .map(c => {
                        batchColNames.add(c.name.toLowerCase());
                        let info = `  ${c.name}(${c.dataType})`;
                        if (c.isPrimaryKey) info += '[PK]';
                        return info;
                    }).join('\n');
                return `${t.fullName}\n${cols}`;
            }).join('\n\n');

            // Build a SMALL pkTableList: only tables whose name appears in batch column names
            const batchTableNames = new Set(batch.map(t => t.fullName.toLowerCase()));
            const relevantPkTables = allPkTables.filter(t => {
                if (batchTableNames.has(t.fullName.toLowerCase())) return false; // skip self
                const tName = t.name.toLowerCase();
                const tStripped = tName.replace(/^(tbl_?|tb_?|t_)/i, '');
                // Check if any column name contains the table name (or vice versa)
                for (const cn of batchColNames) {
                    const cnStripped = cn.replace(/(_?id|_?code|_?cod|_?ref|_?num|_?key|_?no)$/i, '');
                    if (cnStripped.length >= 3 && (tStripped.includes(cnStripped) || cnStripped.includes(tStripped))) return true;
                    if (cn.includes(tStripped) || tStripped.includes(cn)) return true;
                }
                return false;
            });

            // Cap relevant PK tables to max 80 to keep prompt under ~15KB
            const cappedPkTables = relevantPkTables.slice(0, 80);
            const localPkList = cappedPkTables.map(t => `${t.fullName}(${t.primaryKeyColumns.join(',')})`).join('; ');
            console.log(`[DB-MAP] Rel sub-batch ${sbIdx}: ${batch.length} tables, ${cappedPkTables.length}/${relevantPkTables.length} PK targets, prompt ~${(batchSummary.length + localPkList.length) / 1000 | 0}KB`);

            const prompt = `Esperto database SQL Server. Trova relazioni FK implicite (non dichiarate).

Cerca colonne il cui nome suggerisce un riferimento a un'altra tabella: prefissi Cod/Id/Num/Ref/FK_, suffissi _ID/_Code/_Key, nomi contenenti nomi di tabelle.
Sii GENEROSO: includi tutte le relazioni ragionevolmente probabili.

TABELLE TARGET POSSIBILI (con PK):
${localPkList || 'Nessuna corrispondenza trovata per nome'}

TABELLE DA ANALIZZARE:
${batchSummary}

JSON: {"relationships":[{"sourceTable":"s.t","sourceColumn":"c","targetTable":"s.t","targetColumn":"c"}]}
Se nessuna: {"relationships":[]}`;

            const REL_TIMEOUT = isPaidModeRel ? 90000 : 60000;
            const MAX_REL_ATTEMPTS = isPaidModeRel ? 2 : Math.min(freeModelsRel.length, 5);

            function pickRelModel(offset: number): string {
                if (isPaidModeRel) return orModel;
                for (let i = 0; i < freeModelsRel.length; i++) {
                    const m = freeModelsRel[(sbIdx + offset + i) % freeModelsRel.length];
                    if (!rateLimitedRel.has(m)) return m;
                }
                return freeModelsRel[sbIdx % freeModelsRel.length];
            }

            for (let attempt = 0; attempt < MAX_REL_ATTEMPTS; attempt++) {
            const currentRelModel = pickRelModel(attempt);
            try {
                if (attempt > 0) {
                    await new Promise(r => setTimeout(r, 800));
                    console.log(`[DB-MAP] Rel sub-batch ${sbIdx}: retry ${attempt} with model=${currentRelModel}`);
                }
                console.log(`[DB-MAP] Rel sub-batch ${sbIdx}: calling AI, model=${currentRelModel}`);

                const fetchP = fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${orSettings.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: currentRelModel,
                        messages: [{ role: 'user', content: prompt }],
                        temperature: 0.2,
                    }),
                    signal: AbortSignal.timeout(REL_TIMEOUT),
                });
                const hardTimeout = new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('HARD_TIMEOUT')), REL_TIMEOUT + 2000)
                );
                const response = await Promise.race([fetchP, hardTimeout]);

                if (!response.ok) {
                    const errBody = await response.text().catch(() => '');
                    if (response.status === 429) {
                        rateLimitedRel.add(currentRelModel);
                        console.warn(`[DB-MAP] Rel sub-batch ${sbIdx}: ${currentRelModel} rate-limited (429), trying next`);
                        continue;
                    }
                    console.error(`[DB-MAP] Rel sub-batch ${sbIdx}: HTTP ${response.status} - ${errBody.slice(0, 200)}`);
                    continue;
                }

                const data = await response.json();
                // Track usage/cost
                const ru = data.usage;
                if (ru) {
                    const pt = ru.prompt_tokens || 0;
                    const ct = ru.completion_tokens || 0;
                    relUsage.promptTokens += pt;
                    relUsage.completionTokens += ct;
                    relUsage.totalTokens += ru.total_tokens || (pt + ct);
                    relUsage.costUsd += ru.total_cost || ru.cost || 0;
                }
                const text = data.choices?.[0]?.message?.content || '';
                console.log(`[DB-MAP] Rel sub-batch ${sbIdx}: ${text.length} chars from ${currentRelModel}, usage: in=${ru?.prompt_tokens} out=${ru?.completion_tokens}`);

                const parsed = recoverPartialJson(text);
                if (parsed?.relationships && Array.isArray(parsed.relationships)) {
                    console.log(`[DB-MAP] Rel sub-batch ${sbIdx}: found ${parsed.relationships.length} candidate relationships`);
                    for (const rel of parsed.relationships) {
                        if (!rel.sourceTable || !rel.sourceColumn || !rel.targetTable || !rel.targetColumn) continue;

                        const srcTable = tableByFullName.get(rel.sourceTable.toLowerCase());
                        const tgtTable = tableByFullName.get(rel.targetTable.toLowerCase());
                        if (!srcTable || !tgtTable) continue;

                        const srcCol = srcTable.columns.find(c => c.name.toLowerCase() === rel.sourceColumn.toLowerCase());
                        const tgtCol = tgtTable.columns.find(c => c.name.toLowerCase() === rel.targetColumn.toLowerCase());
                        if (!srcCol || !tgtCol) continue;

                        const key = `${srcTable.schema}.${srcTable.name}.${srcCol.name}->${tgtTable.schema}.${tgtTable.name}.${tgtCol.name}`.toLowerCase();
                        const keyRev = `${tgtTable.schema}.${tgtTable.name}.${tgtCol.name}->${srcTable.schema}.${srcTable.name}.${srcCol.name}`.toLowerCase();
                        if (existingRels.has(key) || existingRels.has(keyRev)) continue;

                        const aiRel: RelationshipInfo = {
                            constraintName: `AI_${srcTable.name}_${srcCol.name}_${tgtTable.name}`,
                            sourceSchema: srcTable.schema,
                            sourceTable: srcTable.name,
                            sourceColumn: srcCol.name,
                            targetSchema: tgtTable.schema,
                            targetTable: tgtTable.name,
                            targetColumn: tgtCol.name,
                            inferred: true,
                        };

                        map.relationships.push(aiRel);
                        existingRels.add(key);

                        if (!srcCol.isForeignKey) {
                            srcCol.isForeignKey = true;
                            srcCol.foreignKeyTarget = { schema: tgtTable.schema, table: tgtTable.name, column: tgtCol.name };
                        }

                        srcTable.foreignKeysOut.push(aiRel);
                        tgtTable.foreignKeysIn.push(aiRel);
                        newCount++;
                    }
                    break; // success, exit retry loop
                }
                // parsed was null or had no relationships — try next model
                continue;
            } catch (err: any) {
                const isTimeout = err.name === 'AbortError' || err.name === 'TimeoutError' || err.message?.includes('aborted') || err.message?.includes('HARD_TIMEOUT') || err.message?.includes('timed out');
                console.error(`[DB-MAP] Rel sub-batch ${sbIdx} error (${currentRelModel}, ${isTimeout ? 'TIMEOUT' : 'ERROR'}):`, err.message);
                if (isTimeout) break;
                continue;
            }
            } // end retry loop
        }));

        // Update summary and save with debounce
        map.summary.totalRelationships = map.relationships.length;
        const nextDone = (startIdx + INFER_BATCH_SIZE) >= map.tables.length;
        if (nextDone) {
            await flushDebouncedSave();
            await db.connector.update({
                where: { id: connectorId },
                data: { databaseMap: JSON.stringify(map), databaseMapAt: new Date() },
            });
            setCachedParsedMap(connectorId, map);
        } else {
            await saveDatabaseMapDebounced(connectorId, map);
        }

        return { newRelationships: newCount, totalProcessed: startIdx + iterationTables.length, totalTables: map.tables.length, done: nextDone, usage: relUsage };
    } catch (e: any) {
        console.error('[DB-MAP] AI infer relationships error:', e);
        return { newRelationships: 0, totalProcessed: 0, totalTables: 0, done: true, error: `Errore: ${e.message}` };
    }
}

// ─── inferRelationshipsFromDataAction ────────────────────────────────────────
// 3-phase deep data analysis: fingerprinting → overlap → AI validation
// Called in a loop from the client. Reads dataSamplingState to know which phase.

const DATA_FINGERPRINT_BATCH = 15;  // tables per batch in phase 1
const DATA_AI_BATCH = 80;           // candidates per batch in phase 3
const DATA_SAMPLE_SIZE = 150;       // rows to sample per table
const DATA_VERIFY_BATCH = 50;       // candidates per batch in sql verification phase

// Type compatibility matrix for overlap analysis
const TYPE_COMPAT: Record<string, string[]> = {
    'int': ['int', 'bigint', 'smallint', 'tinyint'],
    'bigint': ['int', 'bigint', 'smallint'],
    'smallint': ['int', 'bigint', 'smallint', 'tinyint'],
    'tinyint': ['int', 'bigint', 'smallint', 'tinyint'],
    'uniqueidentifier': ['uniqueidentifier'],
    'varchar': ['varchar', 'nvarchar', 'char', 'nchar'],
    'nvarchar': ['varchar', 'nvarchar', 'char', 'nchar'],
    'char': ['varchar', 'nvarchar', 'char', 'nchar'],
    'nchar': ['varchar', 'nvarchar', 'char', 'nchar'],
    'decimal': ['decimal', 'numeric', 'int', 'bigint', 'money', 'smallmoney'],
    'numeric': ['decimal', 'numeric', 'int', 'bigint', 'money', 'smallmoney'],
    'money': ['money', 'smallmoney', 'decimal', 'numeric'],
    'smallmoney': ['money', 'smallmoney', 'decimal', 'numeric'],
};

function areTypesCompatible(type1: string, type2: string): boolean {
    const t1 = type1.toLowerCase();
    const t2 = type2.toLowerCase();
    if (t1 === t2) return true;
    return TYPE_COMPAT[t1]?.includes(t2) ?? false;
}

export async function inferRelationshipsFromDataAction(
    connectorId: string,
    batchIndex: number,
    sampleSize?: number
): Promise<{
    phase: string;
    progress: string;
    newRelationships: number;
    done: boolean;
    error?: string;
    progressPercent?: number;
    totalTables?: number;
    totalCandidates?: number;
}> {
    const user = await getAuthenticatedUser();
    if (!user) return { phase: '', progress: '', newRelationships: 0, done: true, error: 'Non autorizzato' };

    try {
        const connector = await db.connector.findUnique({
            where: { id: connectorId, companyId: user.companyId },
        });

        if (!connector || connector.type !== 'SQL') {
            return { phase: '', progress: '', newRelationships: 0, done: true, error: 'Connettore non trovato' };
        }

        if (!connector.databaseMap) {
            return { phase: '', progress: '', newRelationships: 0, done: true, error: 'Mappa database non trovata. Esegui prima una scansione.' };
        }

        const map: DatabaseMap = getCachedParsedMap(connectorId, connector.databaseMap);
        const effectiveSampleSize = sampleSize || DATA_SAMPLE_SIZE;

        // Initialize dataSamplingState if not present
        if (!map.dataSamplingState) {
            map.dataSamplingState = {
                phase: 'fingerprinting',
                fingerprintedTables: [],
                fingerprints: {},
            };
        }

        const state = map.dataSamplingState;

        // ────────────────────────────────────────────────────────────────
        // PHASE 1: FINGERPRINTING (sample data from tables)
        // ────────────────────────────────────────────────────────────────
        if (state.phase === 'fingerprinting') {
            // Determine which tables still need fingerprinting
            const fingerprintedSet = new Set(state.fingerprintedTables);
            const remainingTables = map.tables.filter(t => !fingerprintedSet.has(t.fullName) && t.rowCount > 0);

            const totalTablesCount = map.tables.filter(t => t.rowCount > 0).length;

            if (remainingTables.length === 0) {
                // All tables fingerprinted, move to overlap phase
                state.phase = 'overlap';
                await saveDatabaseMap(connectorId, map);
                return {
                    phase: 'overlap',
                    progress: `Fase 2/4: Calcolo overlap tra colonne...`,
                    newRelationships: 0,
                    done: false,
                    progressPercent: 25,
                    totalTables: totalTablesCount,
                };
            }

            const batch = remainingTables.slice(0, DATA_FINGERPRINT_BATCH);

            // Connect to SQL Server and sample data
            let conf: any;
            try { conf = JSON.parse(connector.config); } catch { return { phase: 'fingerprinting', progress: '', newRelationships: 0, done: true, error: 'Config non valida' }; }

            const sqlConfig = buildSqlConfig(conf, 30000); // 30s timeout per query
            const pool = new sql.ConnectionPool(sqlConfig);
            await pool.connect();

            try {
                // Process tables in parallel (up to 5 concurrent)
                const PARALLEL_FINGERPRINT = 5;
                const processTable = async (table: TableInfo) => {
                    try {
                        const query = `SELECT TOP ${effectiveSampleSize} * FROM [${table.schema}].[${table.name}]`;
                        const result = await pool.request().query(query);
                        const rows = result.recordset;

                        if (!rows || rows.length === 0) {
                            state.fingerprintedTables.push(table.fullName);
                            return;
                        }

                        // Build fingerprints for each column
                        const tableFingerprints: Record<string, ColumnFingerprint> = {};

                        for (const col of table.columns) {
                            const dtype = col.dataType.toLowerCase();

                            // Skip column types that are rarely FK candidates
                            if (['datetime', 'datetime2', 'date', 'time', 'datetimeoffset',
                                'bit', 'text', 'ntext', 'image', 'xml', 'varbinary',
                                'binary', 'geography', 'geometry', 'float', 'real',
                                'timestamp', 'rowversion'].includes(dtype)) {
                                continue;
                            }

                            // Extract values
                            const values: string[] = [];
                            let nullCount = 0;
                            const seen = new Set<string>();

                            for (const row of rows) {
                                const val = row[col.name];
                                if (val === null || val === undefined) {
                                    nullCount++;
                                    continue;
                                }
                                const strVal = String(val).trim();
                                if (strVal === '') {
                                    nullCount++;
                                    continue;
                                }
                                if (!seen.has(strVal) && seen.size < 200) {
                                    seen.add(strVal);
                                    values.push(strVal);
                                }
                            }

                            const nullRate = rows.length > 0 ? nullCount / rows.length : 0;

                            // Skip columns with too few distinct values (status codes, booleans)
                            if (values.length <= 3 && !col.isPrimaryKey) continue;
                            // Skip columns that are almost all null
                            if (nullRate > 0.9) continue;

                            tableFingerprints[col.name] = {
                                type: dtype,
                                values,
                                distinctCount: values.length,
                                nullRate,
                                isPK: col.isPrimaryKey,
                                isFK: col.isForeignKey,
                            };
                        }

                        // Detect unique single-column indexes (non-PK) as FK target candidates
                        try {
                            const uniqueResult = await pool.request().query(`
                                SELECT DISTINCT c.name AS column_name
                                FROM sys.indexes i
                                INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
                                INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                                WHERE i.object_id = OBJECT_ID('[${table.schema}].[${table.name}]')
                                  AND i.is_unique = 1
                                  AND i.is_primary_key = 0
                                  AND (SELECT COUNT(*) FROM sys.index_columns ic2
                                       WHERE ic2.object_id = i.object_id AND ic2.index_id = i.index_id) = 1
                            `);
                            for (const uqRow of uniqueResult.recordset) {
                                if (tableFingerprints[uqRow.column_name]) {
                                    tableFingerprints[uqRow.column_name].isUnique = true;
                                }
                            }
                        } catch {
                            // Ignore unique index detection errors
                        }

                        state.fingerprints[table.fullName] = tableFingerprints;
                        state.fingerprintedTables.push(table.fullName);
                    } catch (tableErr: any) {
                        console.error(`[DATA-ANALYSIS] Fingerprint error for ${table.fullName}:`, tableErr.message);
                        // Mark as done to avoid retrying forever
                        state.fingerprintedTables.push(table.fullName);
                    }
                };

                // Run in chunks of PARALLEL_FINGERPRINT
                for (let i = 0; i < batch.length; i += PARALLEL_FINGERPRINT) {
                    const chunk = batch.slice(i, i + PARALLEL_FINGERPRINT);
                    await Promise.allSettled(chunk.map(t => processTable(t)));
                }
            } finally {
                await pool.close();
            }

            await saveDatabaseMap(connectorId, map);

            return {
                phase: 'fingerprinting',
                progress: `Fase 1/4: Campionamento ${state.fingerprintedTables.length}/${totalTablesCount} tabelle`,
                newRelationships: 0,
                done: false,
                progressPercent: Math.round((state.fingerprintedTables.length / totalTablesCount) * 25),
                totalTables: totalTablesCount,
            };
        }

        // ────────────────────────────────────────────────────────────────
        // PHASE 2: OVERLAP ANALYSIS (pure JS, no SQL, no AI)
        // ────────────────────────────────────────────────────────────────
        if (state.phase === 'overlap') {
            const candidates: OverlapCandidate[] = [];

            // Build existing relationships set for dedup
            const existingRelKeys = new Set<string>();
            for (const rel of map.relationships) {
                existingRelKeys.add(`${rel.sourceSchema}.${rel.sourceTable}.${rel.sourceColumn}->${rel.targetSchema}.${rel.targetTable}.${rel.targetColumn}`.toLowerCase());
                existingRelKeys.add(`${rel.targetSchema}.${rel.targetTable}.${rel.targetColumn}->${rel.sourceSchema}.${rel.sourceTable}.${rel.sourceColumn}`.toLowerCase());
            }

            // Collect FK target columns: PK, UNIQUE, AND high-cardinality columns
            // Many databases lack formal PKs - use cardinality heuristics to find potential targets
            const pkTargets: { table: string; column: string; type: string; values: Set<string>; distinctCount: number; isPK: boolean }[] = [];
            for (const [tableName, colFingerprints] of Object.entries(state.fingerprints)) {
                const tableInfo = map.tables.find(t => t.fullName === tableName);
                for (const [colName, fp] of Object.entries(colFingerprints)) {
                    // PK and UNIQUE columns are always targets
                    if (fp.isPK || fp.isUnique) {
                        pkTargets.push({
                            table: tableName,
                            column: colName,
                            type: fp.type,
                            values: new Set(fp.values),
                            distinctCount: fp.distinctCount,
                            isPK: fp.isPK,
                        });
                    } else if (!fp.isFK && fp.distinctCount >= 30 && fp.nullRate < 0.1) {
                        // High-cardinality, non-null columns = likely identifiers even without PK constraint
                        // Also consider if column name suggests an ID
                        const nameLower = colName.toLowerCase();
                        const looksLikeId = nameLower.endsWith('id') || nameLower.endsWith('code') || nameLower.endsWith('cod') ||
                            nameLower.endsWith('key') || nameLower.endsWith('num') || nameLower.endsWith('numero') ||
                            nameLower === 'id' || nameLower.endsWith('_id') || nameLower.endsWith('ref');
                        // Include if: name looks like ID, OR very high cardinality in sample
                        const highCard = tableInfo ? fp.distinctCount >= Math.min(tableInfo.rowCount * 0.5, 100) : fp.distinctCount >= 100;
                        if (looksLikeId || highCard) {
                            pkTargets.push({
                                table: tableName,
                                column: colName,
                                type: fp.type,
                                values: new Set(fp.values),
                                distinctCount: fp.distinctCount,
                                isPK: false,
                            });
                        }
                    }
                }
            }

            // For each column, check overlap with target columns
            for (const [sourceTableName, colFingerprints] of Object.entries(state.fingerprints)) {
                for (const [sourceColName, sourceFP] of Object.entries(colFingerprints)) {
                    // Skip already-known FKs (but keep PKs - they can be FKs in 1:1 relationships)
                    if (sourceFP.isFK) continue;

                    for (const target of pkTargets) {
                        // Skip self-table
                        if (target.table === sourceTableName) continue;

                        // Skip incompatible types
                        if (!areTypesCompatible(sourceFP.type, target.type)) continue;

                        // Check if this relationship already exists
                        const sourceTable = map.tables.find(t => t.fullName === sourceTableName);
                        const targetTable = map.tables.find(t => t.fullName === target.table);
                        if (!sourceTable || !targetTable) continue;

                        const relKey = `${sourceTable.schema}.${sourceTable.name}.${sourceColName}->${targetTable.schema}.${targetTable.name}.${target.column}`.toLowerCase();
                        const relKeyRev = `${targetTable.schema}.${targetTable.name}.${target.column}->${sourceTable.schema}.${sourceTable.name}.${sourceColName}`.toLowerCase();
                        if (existingRelKeys.has(relKey) || existingRelKeys.has(relKeyRev)) continue;

                        // Calculate overlap
                        const sourceValues = sourceFP.values;
                        const matchingValues: string[] = [];
                        for (const val of sourceValues) {
                            if (target.values.has(val)) {
                                matchingValues.push(val);
                            }
                        }

                        const overlapCount = matchingValues.length;
                        const overlapRatio = sourceFP.distinctCount > 0 ? overlapCount / sourceFP.distinctCount : 0;

                        // Lower threshold: 8% overlap in sample (SQL verification will confirm with real data)
                        if (overlapRatio < 0.08) continue;

                        // Calculate composite score
                        let score = 0;

                        // Overlap score (max 50)
                        if (overlapRatio >= 0.8) score += 50;
                        else if (overlapRatio >= 0.5) score += 35;
                        else if (overlapRatio >= 0.3) score += 20;
                        else score += 10;

                        // Cardinality (max 15) - FK should have fewer distinct values than PK
                        if (sourceFP.distinctCount <= target.distinctCount) score += 15;
                        else if (sourceFP.distinctCount <= target.distinctCount * 1.5) score += 8;

                        // Type match (max 5)
                        if (sourceFP.type === target.type) score += 5;
                        else score += 3; // compatible but different

                        // Name hint (max 20)
                        const srcColLower = sourceColName.toLowerCase();
                        const tgtTableName = targetTable.name.toLowerCase();
                        const tgtTableStripped = tgtTableName.replace(/^(tbl_?|tb_?|t_)/i, '');
                        if (srcColLower.includes(tgtTableStripped) || srcColLower.includes(tgtTableName)) {
                            score += 20;
                        } else {
                            // Check partial match: e.g., "CustID" matches "Customer"
                            const stripped = srcColLower.replace(/(_?id|_?code|_?cod|_?ref|_?num|_?key)$/i, '');
                            if (stripped.length >= 3 && (tgtTableStripped.startsWith(stripped) || tgtTableStripped.includes(stripped))) {
                                score += 10;
                            }
                        }

                        // Penalties
                        if (sourceFP.distinctCount <= 5) score -= 15;   // too few values, likely coincidence
                        if (overlapCount < 3) score -= 10;              // overlap based on very few values

                        // GUID bonus: GUID overlap is almost certain
                        if (sourceFP.type === 'uniqueidentifier' && overlapRatio > 0.3) score += 15;

                        // Subset bonus (max 10): source values are a subset of target = classic FK pattern
                        if (overlapCount > 5 && overlapRatio > 0.5) {
                            const targetHasMore = target.distinctCount > sourceFP.distinctCount;
                            if (targetHasMore && overlapRatio >= 0.8) score += 10;
                            else if (targetHasMore && overlapRatio >= 0.5) score += 5;
                        }

                        // Cap score to 0-100 range
                        score = Math.min(100, Math.max(0, score));

                        // Minimum score threshold
                        if (score < 20) continue;

                        candidates.push({
                            sourceTable: sourceTableName,
                            sourceColumn: sourceColName,
                            targetTable: target.table,
                            targetColumn: target.column,
                            overlapCount,
                            overlapRatio,
                            sourceDistinct: sourceFP.distinctCount,
                            targetDistinct: target.distinctCount,
                            matchingSamples: matchingValues.slice(0, 5),
                            score,
                        });
                    }
                }
            }

            // Sort by score descending, take top 200
            candidates.sort((a, b) => b.score - a.score);
            const topCandidates = candidates.slice(0, 200);

            state.candidates = topCandidates;
            state.totalCandidates = topCandidates.length;
            state.validatedCount = 0;
            state.verifiedCount = 0;

            // Clean up fingerprint value arrays to reduce JSON size
            // (values are no longer needed - overlap is computed, metadata stays for AI context)
            for (const cols of Object.values(state.fingerprints)) {
                for (const fp of Object.values(cols)) {
                    fp.values = [];
                }
            }

            if (topCandidates.length === 0) {
                // No candidates found, we're done
                state.phase = 'done';
                await saveDatabaseMap(connectorId, map);
                return {
                    phase: 'done',
                    progress: 'Nessun candidato trovato dall\'analisi overlap.',
                    newRelationships: 0,
                    done: true,
                    progressPercent: 100,
                    totalCandidates: 0,
                };
            }

            state.phase = 'sql_verification';
            await saveDatabaseMap(connectorId, map);

            return {
                phase: 'sql_verification',
                progress: `Fase 2/4: Overlap completata. ${topCandidates.length} candidati → verifica SQL...`,
                newRelationships: 0,
                done: false,
                progressPercent: 25,
                totalCandidates: topCandidates.length,
            };
        }

        // ────────────────────────────────────────────────────────────────
        // PHASE 3: SQL VERIFICATION (verify overlap with real queries)
        // ────────────────────────────────────────────────────────────────
        if (state.phase === 'sql_verification') {
            const allCandidates = state.candidates || [];
            const verifiedSoFar = state.verifiedCount || 0;

            if (verifiedSoFar >= allCandidates.length) {
                // All verified → filter out low-quality candidates, move to AI
                state.candidates = allCandidates
                    .filter(c => {
                        if (!c.verified) return true; // keep unverified (SQL error)
                        return (c.verifiedOverlapRatio ?? 0) >= 0.15; // at least 15% real overlap
                    })
                    .sort((a, b) => b.score - a.score);
                state.totalCandidates = state.candidates.length;
                state.validatedCount = 0;

                if (state.candidates.length === 0) {
                    state.phase = 'done';
                    await saveDatabaseMap(connectorId, map);
                    return { phase: 'done', progress: 'Nessun candidato confermato dalla verifica SQL.', newRelationships: 0, done: true, progressPercent: 100, totalCandidates: 0 };
                }

                state.phase = 'ai_validation';
                await saveDatabaseMap(connectorId, map);
                return {
                    phase: 'ai_validation',
                    progress: `Fase 3/4: Verifica SQL completata. ${state.candidates.length} candidati confermati → validazione AI...`,
                    newRelationships: 0,
                    done: false,
                    progressPercent: 50,
                    totalCandidates: state.candidates.length,
                };
            }

            const batchCandidates = allCandidates.slice(verifiedSoFar, verifiedSoFar + DATA_VERIFY_BATCH);

            // Connect to SQL Server for verification queries
            let conf: any;
            try { conf = JSON.parse(connector.config); } catch { return { phase: 'sql_verification', progress: '', newRelationships: 0, done: true, error: 'Config non valida' }; }

            const sqlConfig = buildSqlConfig(conf, 30000); // 30s per query
            const pool = new sql.ConnectionPool(sqlConfig);
            await pool.connect();

            try {
                // Process verification queries in parallel (up to 5 concurrent)
                const VERIFY_PARALLEL = 5;
                const verifyCandidate = async (candidate: OverlapCandidate) => {
                    try {
                        const srcTable = map.tables.find(t => t.fullName === candidate.sourceTable);
                        const tgtTable = map.tables.find(t => t.fullName === candidate.targetTable);
                        if (!srcTable || !tgtTable) return;

                        // Real overlap verification via INTERSECT (with TOP limit to avoid full scans on huge tables)
                        const VERIFY_TOP = 50000;
                        const verifyQuery = `
                            SELECT
                              (SELECT COUNT(*) FROM (SELECT DISTINCT TOP (${VERIFY_TOP}) [${candidate.sourceColumn}] FROM [${srcTable.schema}].[${srcTable.name}] WHERE [${candidate.sourceColumn}] IS NOT NULL) s) AS src_distinct,
                              (SELECT COUNT(*) FROM (
                                SELECT DISTINCT [${candidate.sourceColumn}] AS val FROM (SELECT TOP (${VERIFY_TOP}) [${candidate.sourceColumn}] FROM [${srcTable.schema}].[${srcTable.name}] WHERE [${candidate.sourceColumn}] IS NOT NULL) s1
                                INTERSECT
                                SELECT DISTINCT [${candidate.targetColumn}] AS val FROM (SELECT TOP (${VERIFY_TOP}) [${candidate.targetColumn}] FROM [${tgtTable.schema}].[${tgtTable.name}] WHERE [${candidate.targetColumn}] IS NOT NULL) t1
                              ) x) AS overlap_count,
                              (SELECT COUNT(*) FROM (SELECT DISTINCT TOP (${VERIFY_TOP}) [${candidate.targetColumn}] FROM [${tgtTable.schema}].[${tgtTable.name}] WHERE [${candidate.targetColumn}] IS NOT NULL) t) AS tgt_distinct
                        `;

                        const result = await pool.request().query(verifyQuery);
                        const row = result.recordset[0];

                        if (row) {
                            candidate.verifiedSourceDistinct = row.src_distinct;
                            candidate.verifiedOverlapCount = row.overlap_count;
                            candidate.verifiedOverlapRatio = row.src_distinct > 0 ? row.overlap_count / row.src_distinct : 0;
                            candidate.verified = true;

                            // Recalculate score with verified real data (same bands as Phase 2)
                            let newScore = 0;
                            const vRatio = candidate.verifiedOverlapRatio;

                            // Verified overlap score (max 50) - aligned with Phase 2
                            if (vRatio >= 0.8) newScore += 50;
                            else if (vRatio >= 0.5) newScore += 35;
                            else if (vRatio >= 0.3) newScore += 20;
                            else if (vRatio >= 0.15) newScore += 15;
                            else newScore += 5;

                            // Cardinality (max 15) - FK should have ≤ distinct values than target
                            if (row.src_distinct <= row.tgt_distinct) newScore += 15;
                            else if (row.src_distinct <= row.tgt_distinct * 1.5) newScore += 8;

                            // Type match (max 5)
                            const srcFP = state.fingerprints[candidate.sourceTable]?.[candidate.sourceColumn];
                            const tgtFP = state.fingerprints[candidate.targetTable]?.[candidate.targetColumn];
                            if (srcFP && tgtFP) {
                                if (srcFP.type === tgtFP.type) newScore += 5;
                                else newScore += 3;
                            }

                            // Name hint (max 20)
                            const srcColLower = candidate.sourceColumn.toLowerCase();
                            const tgtTableLower = tgtTable.name.toLowerCase();
                            const tgtStripped = tgtTableLower.replace(/^(tbl_?|tb_?|t_)/i, '');
                            if (srcColLower.includes(tgtStripped) || srcColLower.includes(tgtTableLower)) {
                                newScore += 20;
                            } else {
                                const stripped = srcColLower.replace(/(_?id|_?code|_?cod|_?ref|_?num|_?key)$/i, '');
                                if (stripped.length >= 3 && (tgtStripped.startsWith(stripped) || tgtStripped.includes(stripped))) {
                                    newScore += 10;
                                }
                            }

                            // GUID bonus
                            if (srcFP?.type === 'uniqueidentifier' && vRatio > 0.3) newScore += 15;

                            // Subset bonus (max 10)
                            if (row.overlap_count > 5 && vRatio > 0.5) {
                                if (row.tgt_distinct > row.src_distinct && vRatio >= 0.8) newScore += 10;
                                else if (row.tgt_distinct > row.src_distinct && vRatio >= 0.5) newScore += 5;
                            }

                            // Penalties
                            if (row.src_distinct <= 5) newScore -= 15;
                            if (row.overlap_count < 3) newScore -= 10;

                            candidate.score = Math.min(100, Math.max(0, newScore));
                            candidate.sourceDistinct = row.src_distinct;
                            candidate.targetDistinct = row.tgt_distinct;
                            candidate.overlapCount = row.overlap_count;
                            candidate.overlapRatio = candidate.verifiedOverlapRatio;
                        }
                    } catch (verifyErr: any) {
                        console.error(`[DATA-ANALYSIS] SQL verify error for ${candidate.sourceTable}.${candidate.sourceColumn}:`, verifyErr.message);
                        // Keep sample-based data, don't mark as verified
                    }
                };

                // Run in parallel chunks
                for (let i = 0; i < batchCandidates.length; i += VERIFY_PARALLEL) {
                    const chunk = batchCandidates.slice(i, i + VERIFY_PARALLEL);
                    await Promise.allSettled(chunk.map(c => verifyCandidate(c)));
                }
            } finally {
                await pool.close();
            }

            state.verifiedCount = verifiedSoFar + batchCandidates.length;
            await saveDatabaseMap(connectorId, map);

            return {
                phase: 'sql_verification',
                progress: `Fase 3/4: Verifica SQL ${state.verifiedCount}/${allCandidates.length} candidati`,
                newRelationships: 0,
                done: false,
                progressPercent: Math.round(25 + (state.verifiedCount / allCandidates.length) * 25),
                totalCandidates: allCandidates.length,
            };
        }

        // ────────────────────────────────────────────────────────────────
        // PHASE 4: MULTI-MODEL AI VALIDATION (3 free models + consensus)
        // ────────────────────────────────────────────────────────────────
        if (state.phase === 'ai_validation') {
            const orSettings = await getOpenRouterSettingsAction();
            if (!orSettings.apiKey) return { phase: 'ai_validation', progress: '', newRelationships: 0, done: true, error: 'Chiave API OpenRouter non configurata.' };

            // Dynamically discover free models from OpenRouter API
            const FREE_MODELS = await fetchFreeModels(orSettings.apiKey);

            const allCandidates = state.candidates || [];
            const validatedSoFar = state.validatedCount || 0;

            if (validatedSoFar >= allCandidates.length) {
                // All validated, cleanup and finish
                return finishDataAnalysis(connectorId, map);
            }

            const batchCandidates = allCandidates.slice(validatedSoFar, validatedSoFar + DATA_AI_BATCH);

            // Build prompt with rich context (descriptions, row counts, verified overlap)
            const candidateDescriptions = batchCandidates.map((c, i) => {
                const srcTable = map.tables.find(t => t.fullName === c.sourceTable);
                const tgtTable = map.tables.find(t => t.fullName === c.targetTable);
                const srcCol = srcTable?.columns.find(col => col.name === c.sourceColumn);
                const tgtCol = tgtTable?.columns.find(col => col.name === c.targetColumn);
                const srcDesc = srcTable?.userDescription || srcTable?.description;
                const tgtDesc = tgtTable?.userDescription || tgtTable?.description;
                const tgtFP = state.fingerprints[c.targetTable]?.[c.targetColumn];
                const targetLabel = tgtFP?.isPK ? 'PK' : (tgtFP?.isUnique ? 'UNIQUE' : 'colonna');

                let desc = `CANDIDATO ${i + 1}:\n`;
                desc += `  Source: ${c.sourceTable}.${c.sourceColumn} (${srcCol?.dataType || '?'}, ${c.sourceDistinct} valori distinti`;
                if (srcTable) desc += `, ${srcTable.rowCount.toLocaleString('it-IT')} righe`;
                desc += `)\n`;
                if (srcDesc) desc += `    Desc: "${srcDesc}"\n`;
                desc += `  Target: ${c.targetTable}.${c.targetColumn} (${tgtCol?.dataType || '?'}, ${targetLabel}, ${c.targetDistinct} valori distinti`;
                if (tgtTable) desc += `, ${tgtTable.rowCount.toLocaleString('it-IT')} righe`;
                desc += `)\n`;
                if (tgtDesc) desc += `    Desc: "${tgtDesc}"\n`;

                if (c.verified) {
                    desc += `  Overlap VERIFICATO SQL: ${c.verifiedOverlapCount}/${c.verifiedSourceDistinct} (${((c.verifiedOverlapRatio || 0) * 100).toFixed(1)}%)\n`;
                } else {
                    desc += `  Overlap stimato (campione ${DATA_SAMPLE_SIZE} righe): ${c.overlapCount}/${c.sourceDistinct} (${(c.overlapRatio * 100).toFixed(1)}%)\n`;
                }

                desc += `  Valori in comune: [${c.matchingSamples.map(v => `"${v}"`).join(', ')}]\n`;
                desc += `  Punteggio: ${c.score}`;
                if (c.sourceDistinct <= 5) desc += `\n  (NOTA: pochi valori distinti - possibile falso positivo)`;
                return desc;
            }).join('\n\n');

            const prompt = `Sei un esperto DBA SQL Server. Analizza questi candidati di relazione FK scoperte dall'analisi dei dati reali del database "${map.databaseName}". Usa il nome del database per capire il dominio applicativo.

Per ogni candidato, valuta se rappresenta una vera relazione FK (Foreign Key) o se l'overlap dei valori e' una coincidenza. Considera:
- L'overlap dei valori (quelli marcati "VERIFICATO SQL" sono confermati da query reali su tutti i dati)
- La semantica dei nomi di tabelle e colonne
- La cardinalita' (la colonna FK dovrebbe avere meno o uguali valori distinti rispetto alla PK/UK target)
- Il contesto delle descrizioni delle tabelle
- Le dimensioni delle tabelle (numero righe)

ATTENZIONE: overlap di pochi valori interi bassi (1,2,3,4,5) tra colonne diverse e' quasi SEMPRE una coincidenza (codici status, tipi, flag), NON una FK. Segnalalo come falso positivo a meno che i nomi non suggeriscano chiaramente una relazione.

Per ogni candidato rispondi con:
- "confirmed": true/false
- "confidence": 0-100
- "reason": sintetica motivazione (max 10 parole)
- "evidence": sintesi valore chiave (max 10 parole)

Rispondi SOLO in formato JSON:
{
  "results": [
    {"confirmed": true, "confidence": 85, "reason": "Overlap del 98%, coerente", "evidence": "PRD001 compatibile"},
    {"confirmed": false, "confidence": 20, "reason": "Valori casuali comuni, non FK", "evidence": "valori status 1,2,3"}
  ]
}

${candidateDescriptions}`;

            // Call multiple free models in parallel for cross-validation
            const callModel = async (model: string): Promise<{ model: string; results: any[] } | null> => {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 30000);
                try {
                    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${orSettings.apiKey}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            model,
                            messages: [{ role: 'user', content: prompt }],
                            temperature: 0.2,
                        }),
                        signal: controller.signal,
                    });
                    clearTimeout(timeoutId);
                    if (!response.ok) {
                        console.error(`[DATA-ANALYSIS] Model ${model} returned ${response.status}`);
                        return null;
                    }
                    const data = await response.json();
                    const text = data.choices?.[0]?.message?.content || '';
                    const parsed = recoverPartialJson(text);
                    return { model, results: parsed?.results || [] };
                } catch (err: any) {
                    clearTimeout(timeoutId);
                    console.error(`[DATA-ANALYSIS] Model ${model} error:`, err.message);
                    return null;
                }
            };

            // Sospendo la cross-validation parallela su 7 modelli (genera pesanti colli di bottiglia e timeouts per modelli free)
            const configuredModel = orSettings.model || 'google/gemini-2.0-flash-001';
            const modelsToTry = [configuredModel];

            const modelResults = await Promise.allSettled(modelsToTry.map(m => callModel(m)));
            const validResults = modelResults
                .filter((r): r is PromiseFulfilledResult<{ model: string; results: any[] } | null> => r.status === 'fulfilled')
                .map(r => r.value)
                .filter((r): r is { model: string; results: any[] } => r !== null && r.results.length > 0);

            console.log(`[DATA-ANALYSIS] ${validResults.length}/${modelsToTry.length} modelli hanno risposto: ${validResults.map(r => r.model).join(', ')}`);

            let newCount = 0;

            if (validResults.length > 0) {
                // Build existing relationships set for dedup
                const existingRelKeys = new Set<string>();
                for (const rel of map.relationships) {
                    existingRelKeys.add(`${rel.sourceSchema}.${rel.sourceTable}.${rel.sourceColumn}->${rel.targetSchema}.${rel.targetTable}.${rel.targetColumn}`.toLowerCase());
                    existingRelKeys.add(`${rel.targetSchema}.${rel.targetTable}.${rel.targetColumn}->${rel.sourceSchema}.${rel.sourceTable}.${rel.sourceColumn}`.toLowerCase());
                }

                // Aggregate results across models with consensus voting
                for (let i = 0; i < batchCandidates.length; i++) {
                    const candidate = batchCandidates[i];
                    let confirmCount = 0;
                    let rejectCount = 0;
                    let totalConfidence = 0;
                    let bestReason = '';
                    let bestReasonConfidence = 0;
                    const allReasons: string[] = [];

                    for (const modelResult of validResults) {
                        const aiResult = modelResult.results[i];
                        if (!aiResult) continue;
                        if (aiResult.confirmed) {
                            confirmCount++;
                            totalConfidence += aiResult.confidence || 50;
                            const reasonText = aiResult.reason || '';
                            const evidenceText = aiResult.evidence || '';
                            const fullReason = evidenceText ? `${reasonText} [${evidenceText}]` : reasonText;
                            if (fullReason) allReasons.push(fullReason);
                            if ((aiResult.confidence || 0) > bestReasonConfidence) {
                                bestReasonConfidence = aiResult.confidence || 0;
                                bestReason = fullReason;
                            }
                        } else {
                            rejectCount++;
                        }
                    }

                    const modelsResponded = confirmCount + rejectCount;
                    if (modelsResponded === 0) continue;

                    // Robust consensus: require stronger agreement for reliability
                    let isConfirmed = false;
                    if (modelsResponded >= 3) {
                        isConfirmed = confirmCount >= 2;  // at least 2 out of 3+
                    } else if (modelsResponded === 2) {
                        isConfirmed = confirmCount > rejectCount;  // majority
                    } else {
                        // Only 1 model responded - require high AI confidence
                        const singleConf = confirmCount > 0 ? totalConfidence / confirmCount : 0;
                        isConfirmed = confirmCount === 1 && singleConf >= 70;
                    }
                    if (!isConfirmed) continue;

                    // Confidence formula: 40% statistical score + 40% avg AI confidence + 20% consensus bonus
                    const avgAiConfidence = confirmCount > 0 ? totalConfidence / confirmCount : 50;
                    const consensusBonus = (confirmCount / modelsResponded) * 100;
                    const finalConfidence = Math.min(100, Math.round(
                        (candidate.score * 0.4) + (avgAiConfidence * 0.4) + (consensusBonus * 0.2)
                    ));

                    // Build detailed reason with consensus info
                    const consensusLabel = `${confirmCount}/${modelsResponded} modelli AI concordano`;
                    const overlapInfo = candidate.verified
                        ? `Overlap verificato SQL: ${candidate.verifiedOverlapCount}/${candidate.verifiedSourceDistinct} (${((candidate.verifiedOverlapRatio || 0) * 100).toFixed(1)}%)`
                        : `Overlap campione: ${candidate.overlapCount}/${candidate.sourceDistinct} (${(candidate.overlapRatio * 100).toFixed(1)}%)`;
                    const detailedReason = `${consensusLabel}. ${overlapInfo}. ${bestReason}`;

                    const srcTable = map.tables.find(t => t.fullName === candidate.sourceTable);
                    const tgtTable = map.tables.find(t => t.fullName === candidate.targetTable);
                    if (!srcTable || !tgtTable) continue;

                    // Check for existing relationship that we might upgrade
                    const relKey = `${srcTable.schema}.${srcTable.name}.${candidate.sourceColumn}->${tgtTable.schema}.${tgtTable.name}.${candidate.targetColumn}`.toLowerCase();
                    const relKeyRev = `${tgtTable.schema}.${tgtTable.name}.${candidate.targetColumn}->${srcTable.schema}.${srcTable.name}.${candidate.sourceColumn}`.toLowerCase();

                    const existingRel = map.relationships.find(r => {
                        const k = `${r.sourceSchema}.${r.sourceTable}.${r.sourceColumn}->${r.targetSchema}.${r.targetTable}.${r.targetColumn}`.toLowerCase();
                        return k === relKey || k === relKeyRev;
                    });

                    if (existingRel) {
                        // Upgrade: take the higher value + corroboration bonus
                        if (existingRel.confidence !== undefined && existingRel.confidence < 100) {
                            existingRel.confidence = Math.min(100,
                                Math.max(existingRel.confidence, finalConfidence) + 5
                            );
                        }
                        // Update reason if data analysis has a richer one
                        if (detailedReason && (!existingRel.reason || detailedReason.length > existingRel.reason.length)) {
                            existingRel.reason = detailedReason;
                        }
                        continue;
                    }

                    if (existingRelKeys.has(relKey) || existingRelKeys.has(relKeyRev)) continue;

                    // Create new relationship with full reason
                    const dataRel: RelationshipInfo = {
                        constraintName: `DATA_${srcTable.name}_${candidate.sourceColumn}_${tgtTable.name}`,
                        sourceSchema: srcTable.schema,
                        sourceTable: srcTable.name,
                        sourceColumn: candidate.sourceColumn,
                        targetSchema: tgtTable.schema,
                        targetTable: tgtTable.name,
                        targetColumn: candidate.targetColumn,
                        inferred: true,
                        confidence: finalConfidence,
                        inferenceMethod: 'data_analysis',
                        reason: detailedReason,
                    };

                    map.relationships.push(dataRel);
                    existingRelKeys.add(relKey);

                    // Update column info
                    const srcCol = srcTable.columns.find(c => c.name === candidate.sourceColumn);
                    if (srcCol && !srcCol.isForeignKey) {
                        srcCol.isForeignKey = true;
                        srcCol.foreignKeyTarget = {
                            schema: tgtTable.schema,
                            table: tgtTable.name,
                            column: candidate.targetColumn,
                        };
                    }

                    srcTable.foreignKeysOut.push(dataRel);
                    tgtTable.foreignKeysIn.push(dataRel);
                    newCount++;
                }
            } else {
                console.error('[DATA-ANALYSIS] Nessun modello AI ha risposto con successo');
            }

            state.validatedCount = validatedSoFar + batchCandidates.length;
            map.summary.totalRelationships = map.relationships.length;

            // Check if all candidates validated
            if (state.validatedCount >= allCandidates.length) {
                return finishDataAnalysis(connectorId, map, newCount);
            }

            await saveDatabaseMap(connectorId, map);

            return {
                phase: 'ai_validation',
                progress: `Fase 4/4: Validazione AI ${state.validatedCount}/${allCandidates.length} candidati`,
                newRelationships: newCount,
                done: false,
                progressPercent: Math.round(50 + (state.validatedCount / allCandidates.length) * 50),
                totalCandidates: allCandidates.length,
            };
        }

        // Phase is 'done' or unknown
        return { phase: 'done', progress: 'Analisi completata.', newRelationships: 0, done: true };
    } catch (e: any) {
        console.error('[DATA-ANALYSIS] Error:', e);
        return { phase: '', progress: '', newRelationships: 0, done: true, error: `Errore: ${e.message}` };
    }
}

// Helper to save the map (also updates in-memory cache)
async function saveDatabaseMap(connectorId: string, map: DatabaseMap) {
    await db.connector.update({
        where: { id: connectorId },
        data: { databaseMap: JSON.stringify(map) },
    });
    setCachedParsedMap(connectorId, map);
}

// Helper to finish data analysis: cleanup state, assign confidence, save
async function finishDataAnalysis(connectorId: string, map: DatabaseMap, lastBatchNew: number = 0): Promise<{
    phase: string;
    progress: string;
    newRelationships: number;
    done: boolean;
    progressPercent?: number;
    totalTables?: number;
    totalCandidates?: number;
}> {
    // Count total new relationships added by data analysis
    const dataRels = map.relationships.filter(r => r.inferenceMethod === 'data_analysis').length;
    const totalTables = map.tables.filter(t => t.rowCount > 0).length;

    // Clean up sampling state (remove temporary data)
    delete map.dataSamplingState;

    // Re-assign confidence to ensure consistency
    assignConfidence(map.relationships);

    map.summary.totalRelationships = map.relationships.length;

    await saveDatabaseMap(connectorId, map);

    return {
        phase: 'done',
        progress: `Analisi completata. ${dataRels} relazioni scoperte dall'analisi dati.`,
        newRelationships: lastBatchNew,
        done: true,
        progressPercent: 100,
        totalTables,
        totalCandidates: 0,
    };
}

// ─── fetchTablePreviewAction: last N rows from a table ──────────────────────
export async function fetchTablePreviewAction(
    connectorId: string,
    tableSchema: string,
    tableName: string,
    rowCount: number = 5
): Promise<{ rows?: Record<string, unknown>[]; columns?: string[]; error?: string }> {
    const user = await getAuthenticatedUser();
    if (!user) return { error: 'Non autorizzato' };

    try {
        const connector = await db.connector.findUnique({
            where: { id: connectorId, companyId: user.companyId },
        });
        if (!connector || connector.type !== 'SQL') return { error: 'Connettore SQL non trovato' };

        let conf: any;
        try { conf = JSON.parse(connector.config); } catch { return { error: 'Configurazione non valida' }; }

        const sqlConfig = buildSqlConfig(conf);
        const pool = new sql.ConnectionPool(sqlConfig);
        await pool.connect();

        try {
            const limit = Math.min(Math.max(1, rowCount), 50);
            const result = await pool.request().query(
                `SELECT TOP (${limit}) * FROM [${tableSchema}].[${tableName}] ORDER BY (SELECT NULL)`
            );
            const columns = result.recordset.columns
                ? Object.keys(result.recordset.columns)
                : result.recordset.length > 0
                    ? Object.keys(result.recordset[0])
                    : [];
            const rows = result.recordset.map((row: any) => {
                const clean: Record<string, unknown> = {};
                for (const col of columns) {
                    const v = row[col];
                    clean[col] = v instanceof Date ? v.toISOString() : v;
                }
                return clean;
            });
            return { rows, columns };
        } finally {
            await pool.close();
        }
    } catch (err: any) {
        return { error: err.message || 'Errore nel caricamento anteprima' };
    }
}
