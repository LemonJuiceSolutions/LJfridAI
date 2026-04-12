'use server';
/**
 * @fileOverview SQL agent with tool-based exploration - never gives up.
 */

import { z } from 'zod';
import { db } from '@/lib/db';
import { executeSqlPreviewAction } from '@/app/actions';
import { type AgentInput, type AgentOutput, type ConsultedNodeType } from '@/ai/schemas/agent-schema';
import { getOpenRouterSettingsAction } from '@/actions/openrouter';
import { resolveModel, runOpenRouterAgentLoop, type OpenRouterTool, type OpenRouterUsage } from '@/ai/openrouter-utils';

// --- Tool Implementations (Shared) ---

async function doExploreDbSchema(input: { connectorId: string }) {
    try {
        // Check for cached database map first (richer info)
        const connector = await db.connector.findUnique({
            where: { id: input.connectorId },
            select: { databaseMap: true },
        });
        if (connector?.databaseMap) {
            try {
                const map = JSON.parse(connector.databaseMap);
                const tables = (map.tables || []).map((t: any) => ({
                    table_name: t.fullName,
                    row_count: t.rowCount,
                    description: t.userDescription || t.description || null,
                    columns_count: t.columns?.length || 0,
                    primary_keys: t.primaryKeyColumns || [],
                    foreign_keys: (t.foreignKeysOut || []).map((fk: any) => `${fk.sourceColumn} → ${fk.targetTable}.${fk.targetColumn}`),
                }));
                return JSON.stringify({ tables, source: 'cached_map' }, null, 2);
            } catch { /* fall through to INFORMATION_SCHEMA query */ }
        }

        // Fallback: direct INFORMATION_SCHEMA query
        const result = await executeSqlPreviewAction(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
            input.connectorId, [], true
        );
        if (result.error) return JSON.stringify({ error: result.error });
        return JSON.stringify({ tables: result.data || [] }, null, 2);
    } catch (e: any) {
        return JSON.stringify({ error: e.message });
    }
}

async function doExploreTableColumns(input: { connectorId: string, tableName: string }) {
    try {
        // Check for cached database map first
        const connector = await db.connector.findUnique({
            where: { id: input.connectorId },
            select: { databaseMap: true },
        });
        if (connector?.databaseMap) {
            try {
                const map = JSON.parse(connector.databaseMap);
                const searchName = input.tableName.toLowerCase();
                const table = (map.tables || []).find((t: any) =>
                    t.name.toLowerCase() === searchName ||
                    t.fullName.toLowerCase() === searchName ||
                    t.fullName.toLowerCase().endsWith('.' + searchName)
                );
                if (table) {
                    const columns = (table.columns || []).map((c: any) => ({
                        column_name: c.name,
                        data_type: c.dataType + (c.maxLength && c.maxLength > 0 ? `(${c.maxLength})` : ''),
                        is_nullable: c.isNullable ? 'YES' : 'NO',
                        is_primary_key: c.isPrimaryKey,
                        is_foreign_key: c.isForeignKey,
                        fk_target: c.foreignKeyTarget ? `${c.foreignKeyTarget.table}.${c.foreignKeyTarget.column}` : null,
                        description: c.userDescription || c.description || null,
                    }));
                    return JSON.stringify({ table: table.fullName, columns, source: 'cached_map' }, null, 2);
                }
            } catch { /* fall through to INFORMATION_SCHEMA query */ }
        }

        // Fallback: direct INFORMATION_SCHEMA query
        const result = await executeSqlPreviewAction(
            `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = '${input.tableName.replace(/'/g, "''")}' ORDER BY ordinal_position`,
            input.connectorId, [], true
        );
        if (result.error) return JSON.stringify({ error: result.error });
        return JSON.stringify({ table: input.tableName, columns: result.data || [] }, null, 2);
    } catch (e: any) {
        return JSON.stringify({ error: e.message });
    }
}

async function doTestSqlQuery(input: { query: string, connectorId: string }) {
    try {
        const result = await executeSqlPreviewAction(input.query, input.connectorId, [], true);
        if (result.error) return JSON.stringify({ error: result.error, suggestion: 'Controlla nomi tabella e colonne. Usa exploreDbSchema e exploreTableColumns per verificare.' });
        const data = result.data || [];
        return JSON.stringify({
            success: true,
            rowCount: data.length,
            columns: data.length > 0 ? Object.keys(data[0]) : [],
            sampleData: data.slice(0, 5),
        }, null, 2);
    } catch (e: any) {
        return JSON.stringify({ error: e.message, suggestion: 'Verifica la sintassi SQL e i nomi delle tabelle/colonne.' });
    }
}

async function doSearchKB(input: { query: string, companyId: string }) {
    try {
        const term = input.query.toLowerCase();
        const entries = await db.knowledgeBaseEntry.findMany({
            where: {
                companyId: input.companyId,
                OR: [
                    { question: { contains: term, mode: 'insensitive' } },
                    { answer: { contains: term, mode: 'insensitive' } },
                    { tags: { hasSome: [term] } },
                ],
            },
            take: 5,
            orderBy: { updatedAt: 'desc' },
        });
        if (entries.length === 0) return JSON.stringify({ results: [], message: 'Nessuna entry trovata.' });
        return JSON.stringify({ results: entries.map(e => ({ question: e.question, answer: e.answer, category: e.category })) }, null, 2);
    } catch (e: any) {
        return JSON.stringify({ error: e.message });
    }
}

async function doListConnectors(input: { companyId: string }) {
    try {
        const connectors = await db.connector.findMany({
            where: { companyId: input.companyId, type: 'SQL' },
            select: { id: true, name: true },
        });
        return JSON.stringify({ connectors }, null, 2);
    } catch (e: any) {
        return JSON.stringify({ error: e.message });
    }
}

async function doSaveToKB(input: { question: string, answer: string, tags: string[], category: string, companyId: string }) {
    try {
        await db.knowledgeBaseEntry.create({
            data: {
                question: input.question,
                answer: input.answer,
                tags: input.tags,
                category: input.category,
                companyId: input.companyId,
            },
        });
        return JSON.stringify({ success: true, message: 'Salvato nella Knowledge Base!' });
    } catch (e: any) {
        return JSON.stringify({ error: e.message });
    }
}

// --- Browse Other Queries (cross-tree/pipeline) ---

function collectSqlNodes(node: any, results: { nodeId: string; sqlQuery: string; sqlResultName?: string; sqlConnectorId?: string }[] = []): typeof results {
    if (!node || typeof node === 'string') return results;
    if (node.ref || node.subTreeRef) return results;

    if (node.sqlQuery) {
        results.push({
            nodeId: node.id || null,
            sqlQuery: node.sqlQuery,
            sqlResultName: node.sqlResultName,
            sqlConnectorId: node.sqlConnectorId,
        });
    }

    if (node.options) {
        for (const [, child] of Object.entries(node.options)) {
            if (Array.isArray(child)) {
                for (const c of child) collectSqlNodes(c, results);
            } else {
                collectSqlNodes(child as any, results);
            }
        }
    }
    return results;
}

async function doBrowseOtherQueries(input: { companyId: string; connectorId?: string }) {
    try {
        const queries: { source: string; name: string; query: string; connectorId?: string; sameConnector: boolean }[] = [];

        // 1. Query SQL dagli alberi
        const trees = await db.tree.findMany({
            where: { companyId: input.companyId },
            select: { id: true, name: true, jsonDecisionTree: true },
        });

        for (const tree of trees) {
            let treeData: any;
            try { treeData = JSON.parse(tree.jsonDecisionTree); } catch { continue; }
            const nodes = collectSqlNodes(treeData);
            for (const node of nodes) {
                queries.push({
                    source: `Albero: ${tree.name}`,
                    name: node.sqlResultName || node.nodeId || 'query',
                    query: (node.sqlQuery || '').substring(0, 1500),
                    connectorId: node.sqlConnectorId,
                    sameConnector: !!(input.connectorId && node.sqlConnectorId === input.connectorId),
                });
            }
        }

        // 2. Query SQL dalle pipeline
        const pipelines = await db.pipeline.findMany({
            where: { companyId: input.companyId },
            select: { id: true, name: true, nodes: true },
        });

        for (const pipeline of pipelines) {
            const pNodes = pipeline.nodes as any;
            if (!pNodes || typeof pNodes !== 'object') continue;
            const nodeEntries = Array.isArray(pNodes) ? pNodes : Object.values(pNodes);
            for (const node of nodeEntries as any[]) {
                const isPython = node.isPython === true || node.type === 'python';
                const script = node.script || node.sqlQuery || '';
                if (!script || isPython) continue;
                if (node.type === 'start' || node.type === 'end') continue;
                const nodeConnId = node.sqlConnectorId || node.connectorId;
                queries.push({
                    source: `Pipeline: ${pipeline.name}`,
                    name: node.sqlResultName || node.name || node.id || 'query',
                    query: script.substring(0, 1500),
                    connectorId: nodeConnId,
                    sameConnector: !!(input.connectorId && nodeConnId === input.connectorId),
                });
            }
        }

        // Ordina: query dello STESSO connettore prima
        queries.sort((a, b) => (b.sameConnector ? 1 : 0) - (a.sameConnector ? 1 : 0));

        const limited = queries.slice(0, 50);
        if (limited.length === 0) {
            return JSON.stringify({ results: [], message: 'Nessuna query SQL trovata in altri alberi o pipeline.' });
        }
        const sameCount = limited.filter(q => q.sameConnector).length;
        return JSON.stringify({ totalFound: queries.length, showing: limited.length, sameConnectorCount: sameCount, queries: limited }, null, 2);
    } catch (e: any) {
        return JSON.stringify({ error: e.message });
    }
}

// --- OpenRouter Tools Definitions ---

const openRouterTools: OpenRouterTool[] = [
    {
        type: 'function',
        function: {
            name: 'exploreDbSchema',
            description: 'Esplora lo schema del database: elenca tutte le tabelle disponibili.',
            parameters: {
                type: 'object',
                properties: {
                    connectorId: { type: 'string', description: "L'ID del connettore database." }
                },
                required: ['connectorId']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'exploreTableColumns',
            description: 'Esplora le colonne di una tabella specifica.',
            parameters: {
                type: 'object',
                properties: {
                    connectorId: { type: 'string', description: "L'ID del connettore database." },
                    tableName: { type: 'string', description: "Il nome della tabella da esplorare." }
                },
                required: ['connectorId', 'tableName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'testSqlQuery',
            description: 'Esegue QUALSIASI query SQL sul database e restituisce i risultati. Usalo per: (1) testare query, (2) CERCARE TABELLE con INFORMATION_SCHEMA.TABLES, (3) esplorare dati. E\' il tuo strumento principale di esplorazione!',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: "La query SQL da eseguire (qualsiasi query valida, incluse INFORMATION_SCHEMA)." },
                    connectorId: { type: 'string', description: "L'ID del connettore database." }
                },
                required: ['query', 'connectorId']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'searchKnowledgeBase',
            description: 'Cerca nella Knowledge Base aziendale.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Termine di ricerca.' },
                    companyId: { type: 'string', description: "L'ID della company." }
                },
                required: ['query', 'companyId']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'listSqlConnectors',
            description: 'Elenca tutti i connettori SQL disponibili.',
            parameters: {
                type: 'object',
                properties: {
                    companyId: { type: 'string', description: "L'ID della company." }
                },
                required: ['companyId']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'sqlSaveToKnowledgeBase',
            description: 'Salva una informazione nella Knowledge Base aziendale.',
            parameters: {
                type: 'object',
                properties: {
                    question: { type: 'string', description: 'La domanda o descrizione.' },
                    answer: { type: 'string', description: 'La risposta o query.' },
                    tags: { type: 'array', items: { type: 'string' }, description: 'Tag per la ricerca.' },
                    category: { type: 'string', description: 'Categoria.' },
                    companyId: { type: 'string', description: "L'ID della company." }
                },
                required: ['question', 'answer', 'tags', 'category', 'companyId']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'browseOtherQueries',
            description: 'Sfoglia le query SQL scritte in altri alberi e pipeline della company. Passa il connectorId per filtrare le query dello stesso database.',
            parameters: {
                type: 'object',
                properties: {
                    companyId: { type: 'string', description: "L'ID della company." },
                    connectorId: { type: 'string', description: "L'ID del connettore attuale per prioritizzare query dello stesso DB." }
                },
                required: ['companyId']
            }
        }
    }
];

// --- Main Agent Flow ---

// Robust JSON parser that handles updatedScript with curly braces
function parseAgentJson(text: string): any | null {
    // Try each '{' as a potential start of the JSON response
    for (let i = 0; i < text.length; i++) {
        if (text[i] !== '{') continue;
        let depth = 0;
        let inString = false;
        let escape = false;
        for (let j = i; j < text.length; j++) {
            const ch = text[j];
            if (escape) { escape = false; continue; }
            if (ch === '\\' && inString) { escape = true; continue; }
            if (ch === '"' && !escape) { inString = !inString; continue; }
            if (inString) continue;
            if (ch === '{') depth++;
            else if (ch === '}') {
                depth--;
                if (depth === 0) {
                    try {
                        const candidate = text.substring(i, j + 1);
                        const parsed = JSON.parse(candidate);
                        if (parsed && typeof parsed.message === 'string') return parsed;
                    } catch { /* try next '{' */ }
                    break;
                }
            }
        }
    }
    return null;
}

export async function sqlAgentChat(input: AgentInput): Promise<AgentOutput> {
    // Track consulted nodes for visibility
    const consultedNodes: ConsultedNodeType[] = [];

    try {
        // 1. Get User/Model Settings
        let apiKey = input.openRouterConfig?.apiKey;
        let model = input.openRouterConfig?.model;

        // If not provided in input, fetch from DB
        if (!apiKey || !model) {
            const settings = await getOpenRouterSettingsAction();
            if (settings.apiKey) apiKey = settings.apiKey;
            if (settings.model) model = settings.model;
        }

        // 2. Resolve Model Provider
        const { provider, modelName } = resolveModel(model);

        // 3. Build Context & Prompts
        let context = '';

        if (input.tableSchema && Object.keys(input.tableSchema).length > 0) {
            context += '\n\nTABELLE GIA\' NOTE:\n';
            for (const [tableName, columns] of Object.entries(input.tableSchema)) {
                context += `- ${tableName}: ${Array.isArray(columns) ? (columns as string[]).join(', ') : 'schema non disponibile'}\n`;
            }
        }

        if (input.inputTables && Object.keys(input.inputTables).length > 0) {
            context += '\nDATI DI ESEMPIO:\n';
            for (const [tableName, data] of Object.entries(input.inputTables)) {
                if (Array.isArray(data) && data.length > 0) {
                    context += `${tableName}: ${JSON.stringify((data as any[]).slice(0, 2))}\n`;
                }
            }
        }

        if (input.nodeQueries && typeof input.nodeQueries === 'object' && Object.keys(input.nodeQueries).length > 0) {
            context += '\nQUERY SQL DA ALTRI NODI NELLO STESSO ALBERO:\n';
            for (const [nodeName, info] of Object.entries(input.nodeQueries as Record<string, { query: string; isPython: boolean; connectorId?: string }>)) {
                const type = info.isPython ? 'Python' : 'SQL';
                const sameConn = !!(input.connectorId && info.connectorId === input.connectorId);
                const connNote = sameConn ? ' [STESSO CONNETTORE]' : (info.connectorId ? ' [altro connettore]' : '');
                const truncatedQuery = info.query.length > 1500 ? info.query.substring(0, 1500) + '...' : info.query;
                context += `- ${nodeName} (${type}${connNote}):\n  ${truncatedQuery}\n`;

                // Track sibling nodes as consulted
                consultedNodes.push({
                    source: 'Nodo fratello',
                    name: nodeName,
                    type: info.isPython ? 'python' : 'sql',
                    sameConnector: sameConn,
                    wasSolutionSource: false,
                });
            }
        }

        // --- PRE-FLIGHT TABLE DISCOVERY ---
        // When the user message contains "Invalid object name", automatically search INFORMATION_SCHEMA
        // and inject the results so the LLM doesn't have to guess or call tools for this
        let discoveryContext = '';
        const invalidObjMatch = input.userMessage.match(/Invalid object name '([^']+)'/i);
        if (invalidObjMatch && input.connectorId) {
            const badTableName = invalidObjMatch[1];
            // Extract the bare table name (strip schema prefixes like dbo. or [DB].[dbo].)
            const bareTableName = badTableName.replace(/^(\[?[^\]]*\]?\.)*/g, '').replace(/[\[\]]/g, '');
            // Try multiple search patterns
            const searchTerms = new Set<string>();
            searchTerms.add(bareTableName);
            // Also try substrings (e.g. "MA_CustSupplier" -> "Cust", "Supplier")
            const parts = bareTableName.replace(/^MA_/, '').split(/(?=[A-Z])/);
            for (const part of parts) {
                if (part.length >= 3) searchTerms.add(part);
            }

            const discoveryResults: string[] = [];
            for (const term of searchTerms) {
                try {
                    const searchResult = await doTestSqlQuery({
                        query: `SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%${term.replace(/'/g, "''")}%' ORDER BY TABLE_NAME`,
                        connectorId: input.connectorId,
                    });
                    const parsed = JSON.parse(searchResult);
                    if (parsed.success && parsed.sampleData && parsed.sampleData.length > 0) {
                        for (const row of parsed.sampleData) {
                            const fullName = row.TABLE_SCHEMA ? `[${row.TABLE_SCHEMA}].[${row.TABLE_NAME}]` : row.TABLE_NAME;
                            if (!discoveryResults.includes(fullName)) {
                                discoveryResults.push(fullName);
                            }
                        }
                    }
                } catch { /* ignore discovery errors */ }
            }

            if (discoveryResults.length > 0) {
                discoveryContext = `\n\n🔍 DISCOVERY AUTOMATICA: La tabella '${badTableName}' NON ESISTE. Tabelle trovate cercando "${bareTableName}":\n`;
                for (const name of discoveryResults.slice(0, 20)) {
                    discoveryContext += `  - ${name}\n`;
                }
                discoveryContext += `ISTRUZIONE: Usa UNO di questi nomi ESATTI (con schema). NON inventare nomi. Se nessuna corrisponde, CERCA con un termine diverso usando testSqlQuery.\n`;
            } else {
                discoveryContext += `\n\n🔍 DISCOVERY AUTOMATICA: La tabella '${badTableName}' NON ESISTE e nessuna tabella simile trovata cercando "${bareTableName}". Usa testSqlQuery con INFORMATION_SCHEMA.TABLES e parole chiave diverse per trovare il nome corretto.\n`;
            }
        }

        // Also extract table names from sibling queries for quick reference
        let siblingTableHints = '';
        if (input.nodeQueries && typeof input.nodeQueries === 'object') {
            const tableNames = new Set<string>();
            for (const [, info] of Object.entries(input.nodeQueries as Record<string, { query: string; isPython: boolean; connectorId?: string }>)) {
                if (info.isPython) continue;
                // Extract table names from FROM and JOIN clauses
                const fromJoinMatches = info.query.matchAll(/(?:FROM|JOIN)\s+(\[?[^\s,\(\)]+\]?(?:\.\[?[^\s,\(\)]+\]?)*)/gi);
                for (const m of fromJoinMatches) {
                    tableNames.add(m[1]);
                }
            }
            if (tableNames.size > 0) {
                siblingTableHints = `\nTABELLE USATE DAI NODI FRATELLI (nomi VERIFICATI funzionanti):\n${[...tableNames].map(t => `  - ${t}`).join('\n')}\n`;
            }
        }

        let historyContext = '';
        if (input.conversationHistory && input.conversationHistory.length > 0) {
            const recent = input.conversationHistory.slice(-10);
            historyContext = '\nCRONOLOGIA:\n' + recent.map(m => `${m.role === 'user' ? 'Utente' : 'Agente'}: ${m.content}`).join('\n');
        }

        const connectorInfo = input.connectorId ? `\nConnettore DB attuale: ${input.connectorId}` : '';
        const companyInfo = input.companyId ? `\nCompany ID: ${input.companyId}` : '';

        const today = new Date().toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        const systemPrompt = `Sei un agente AI esperto in SQL. Stai utilizzando il modello: ${modelName}. NON MOLLARE MAI. Sei tenace e persistente.
RICORDA: Se una tabella non esiste, CERCALA con testSqlQuery su INFORMATION_SCHEMA.TABLES. NON oscillare tra varianti del nome!
DATA DI OGGI: ${today}

${connectorInfo}${companyInfo}

## RAGIONAMENTO STRUTTURATO (OBBLIGATORIO):
Prima di generare o modificare una query, segui SEMPRE questo processo:
1. **COMPRENDI**: Cosa vuole esattamente l'utente? Riformula mentalmente la richiesta
2. **ANALIZZA**: Quali tabelle e colonne servono? Controlla schema e dati di esempio
3. **SCRIVI**: Genera la query SQL ottimale
4. **TESTA**: Verifica con testSqlQuery - MAI saltare
5. **VALIDA**: I risultati rispondono alla domanda? I numeri hanno senso?
6. **RISPONDI**: Solo dopo la validazione, restituisci la query

## CONTESTO PIATTAFORMA (IMPORTANTE):
- I CONNETTORI forniscono automaticamente token e credenziali
- Quando l'utente preme "Esegui anteprima", il connettore e' gia' configurato con le credenziali
- NON DIRE MAI all'utente di "configurare manualmente i token" - sono GIA' gestiti dalla piattaforma
- Se un test fallisce per problemi di connessione, modifica comunque la query come richiesto

## TABELLE IN INPUT - ARRANGIATI (CRITICO):
- Le tabelle in ingresso e i loro dati di esempio sono forniti nel contesto (sezione "TABELLE GIA' NOTE" e "DATI DI ESEMPIO").
- LEGGI SEMPRE i nomi delle colonne dai dati di esempio e dallo schema fornito. NON chiedere MAI all'utente i nomi delle colonne o la struttura - HAI GIA' TUTTO.
- Se l'utente menziona un concetto (es. "fatturato mensile"), cerca nei dati di esempio e nello schema la colonna che corrisponde. Usa i nomi ESATTI che trovi nei dati.
- Se non sei sicuro quale colonna corrisponde, usa exploreTableColumns per scoprirlo o testSqlQuery con "SELECT TOP 3 * FROM tabella" - NON chiedere all'utente.
- ARRANGIATI: se qualcosa non e' chiaro, esplora il DB con exploreDbSchema e exploreTableColumns prima di chiedere. Chiedi all'utente SOLO per decisioni di business (es. "quale metrica preferisci?"), MAI per cose tecniche che puoi scoprire da solo.
- ALL'INIZIO di ogni richiesta, se hai un connectorId, esplora PROATTIVAMENTE il database: prima exploreDbSchema per vedere le tabelle, poi exploreTableColumns sulle tabelle rilevanti. NON aspettare che l'utente te lo chieda.
- ATTENZIONE AI TIPI DI DATO: Prima di usare SUM(), AVG() o operazioni matematiche, verifica il tipo delle colonne. Se una colonna e' nvarchar/varchar, usa CAST(colonna AS DECIMAL) o TRY_CAST(colonna AS DECIMAL). Errori come "Operand data type nvarchar is invalid for sum operator" si risolvono SEMPRE con il CAST.

## !!!! REGOLA CRITICA: DISCOVERY TABELLE (LEGGI PRIMA DI TUTTO) !!!!
Tu HAI il tool testSqlQuery. Puoi eseguire QUALSIASI query SQL, incluse query su INFORMATION_SCHEMA.TABLES e sys.tables.
Se una tabella NON ESISTE ("Invalid object name"), NON provare varianti del nome. CERCA la tabella giusta cosi':

STEP 1 - CERCA: testSqlQuery con:
  SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%Customer%'
  (sostituisci "Customer" con la parola chiave che cerchi)
STEP 2 - ALLARGA: Se non trovi nulla, prova piu' parole chiave:
  SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%Cust%' OR TABLE_NAME LIKE '%Client%' OR TABLE_NAME LIKE '%Anag%'
STEP 3 - FALLBACK: Se ancora nulla: SELECT name, schema_id FROM sys.tables WHERE name LIKE '%Cust%'
STEP 4 - VERIFICA: Usa exploreTableColumns sulla tabella trovata per vedere le colonne
STEP 5 - COSTRUISCI: Scrivi la query con il nome ESATTO trovato

ESEMPIO COMPLETO DI DISCOVERY:
- L'utente chiede "ordini con nome cliente"
- browseOtherQueries ti mostra una query con MA_Customer
- Provi: SELECT TOP 5 * FROM MA_Customer → ERRORE "Invalid object name 'MA_Customer'"
- NON provi [PROGETTO_QUID].[dbo].[MA_Customer] (stesso nome = stesso errore!)
- INVECE chiami testSqlQuery con: SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%Cust%' OR TABLE_NAME LIKE '%Client%'
- Risultato: dbo.ClientiAnagrafiche
- Chiami exploreTableColumns su ClientiAnagrafiche → vedi le colonne
- Scrivi la query corretta con ClientiAnagrafiche

DIVIETO ASSOLUTO: MAI oscillare tra varianti dello stesso nome (MA_Customer → [PROGETTO_QUID].[dbo].[MA_Customer] → dbo.MA_Customer). Se il nome non funziona, il nome e' SBAGLIATO. Cerca quello giusto.

## CONNETTORE DB (NON CHIEDERE MAI):
- Se hai un connectorId nel contesto, USALO direttamente.
- Se NON hai un connectorId, scrivi comunque la query SQL corretta in updatedScript e aggiungi nel messaggio: "Il connettore verra' ereditato automaticamente dalle tabelle in input."
- NON impostare MAI needsClarification: true per chiedere il connettore. Il sistema gestisce i connettori automaticamente (eredita dalle dipendenze o usa il primo disponibile).
- NON CHIEDERE MAI "quale connettore vuoi usare?" - MAI. Il connettore e' gestito dal sistema, non dall'utente nella chat.
- Se hai tabelle in input, il connettore viene ereditato da quelle. SCRIVI la query e basta.

## REGOLA D'ORO: FAI, NON SPIEGARE
- Quando l'utente chiede una modifica, MODIFICA LA QUERY e mettila in updatedScript
- NON ripetere la stessa risposta piu' volte - se l'utente insiste, significa che non hai capito
- LEGGI ATTENTAMENTE il codice che l'utente incolla: contiene la soluzione o degli indizi
- Se l'utente ti mostra del codice funzionante come esempio, IMPARA da quello
- NON dare risposte generiche - AGISCI sulla query
- NON CHIEDERE dati che hai gia': se hai lo schema e i dati di esempio, USALI. L'utente si aspetta che tu ti arrangi.

## AUTO-REVIEW QUERY (CONTROLLA PRIMA DI RISPONDERE):
Prima di restituire una query in updatedScript, verifica mentalmente:
- La query e' sintatticamente corretta per il tipo di DB?
- I nomi delle tabelle e colonne corrispondono ESATTAMENTE allo schema?
- I JOIN sono corretti? (chiavi giuste, tipo di JOIN appropriato)
- I filtri WHERE rispondono alla domanda dell'utente?
- Le aggregazioni (GROUP BY) includono TUTTE le colonne non aggregate nel SELECT?
- I tipi di dato sono gestiti? (CAST per varchar nelle operazioni matematiche)
- Se qualcosa non torna, correggi PRIMA di rispondere.

## IL TUO WORKFLOW:
1. ALL'INIZIO di ogni richiesta: cerca nella KB (searchKnowledgeBase) E esplora il DB se hai un connectorId (exploreDbSchema + exploreTableColumns sulle tabelle rilevanti).
2. LEGGI lo schema e i dati di esempio gia' forniti nel contesto. NON chiedere mai dati che sono gia' visibili.
3. Se non conosci il connettore, usa listSqlConnectors per trovarlo.
4. Se non trovi le tabelle/colonne che ti servono, usa browseOtherQueries per vedere query SQL gia' scritte in altri alberi e pipeline della stessa company. Le query esistenti sono gia' testate e funzionanti - sono la migliore fonte di ispirazione.
5. TESTA SEMPRE la query con testSqlQuery prima di proporla - MAI saltare questo passaggio.
6. Se la query fallisce per ERRORE LOGICO, correggi e RIPROVA (fino a 3 tentativi).
7. Quando trovi la soluzione, SALVALA nella Knowledge Base con sqlSaveToKnowledgeBase.

## CORREZIONE ERRORI AUTOMATICA (CRITICO):
- Se ricevi un messaggio "ERRORE ESECUZIONE AUTOMATICA", significa che la query che hai generato e' stata eseguita automaticamente ma ha fallito.
- DEVI SEMPRE restituire la query corretta completa in updatedScript. Questo e' OBBLIGATORIO - senza updatedScript il sistema non puo' riprovare.
- Analizza l'errore SQL, correggi la query, e restituisci la versione corretta in updatedScript.
- Concentrati sull'errore specifico: spesso e' un nome tabella/colonna sbagliato, una funzione non supportata, o un errore di sintassi.
- ERRORE "Invalid object name 'XXX'": STOP! NON cambiare il prefisso schema. NON provare XXX → dbo.XXX → [DB].[dbo].[XXX]. Il nome e' SBAGLIATO. Chiama SUBITO testSqlQuery con: SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%parola_chiave%' per trovare il nome VERO della tabella.
- NON ripetere spiegazioni lunghe - vai dritto alla correzione con la query corretta.
- Rispondi con una breve spiegazione di cosa hai corretto + la query completa corretta.
- RICORDA: updatedScript e' la query FINALE per il nodo dell'utente, NON una query di debug. Se hai usato testSqlQuery per scoprire nomi tabella, la query di scoperta resta INTERNA al tool call. In updatedScript metti SOLO la query che soddisfa la richiesta dell'utente.

## STRATEGIA DI FALLBACK PROGRESSIVA:
Quando una query fallisce, segui questa scala di tentativi:
1. Correggi l'errore specifico (nome colonna, sintassi)
2. Esplora lo schema con exploreTableColumns per verificare nomi esatti
3. Se l'errore e' "Invalid object name": CHIAMA testSqlQuery con SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%parola%'. NON cambiare prefisso schema, CERCA il nome vero!
4. Elenca TUTTE le tabelle con exploreDbSchema e cerca quella giusta
5. Cerca nella KB soluzioni a problemi simili
6. Sfoglia le query di altri alberi/pipeline con browseOtherQueries — ma VERIFICA ogni tabella con testSqlQuery prima di usarla
7. Riscrivi la query da zero con approccio diverso
8. Solo come ULTIMO passo, CHIEDI all'utente il nome esatto
- NON ripetere MAI la stessa risposta - cambia approccio ad ogni tentativo
- NON OSCILLARE MAI tra varianti dello stesso nome (con/senza schema) — se un nome non funziona, e' SBAGLIATO

## ISPIRAZIONE DA ALTRE QUERY (browseOtherQueries):
- Se dopo exploreDbSchema e exploreTableColumns non riesci a trovare i nomi corretti, usa browseOtherQueries.
- PASSA SEMPRE il connectorId se ce l'hai: le query dello STESSO connettore (sameConnector=true) sono le piu' affidabili.
- Questo tool ti mostra TUTTE le query SQL gia' scritte in altri alberi e pipeline della stessa company.
- Cerca nei risultati: nomi di tabelle, pattern di JOIN, nomi di colonne, filtri WHERE, prefissi schema.
- Le query con sameConnector=true usano lo STESSO database: i nomi tabelle/colonne sono PROBABILMENTE validi, ma VERIFICA SEMPRE con testSqlQuery prima di usarli (tabelle potrebbero essere state rinominate o eliminate).
- Le query con sameConnector=false usano un ALTRO database: i pattern (JOIN, filtri) possono ispirarti ma i nomi tabelle potrebbero NON esistere nel tuo connettore. Verifica SEMPRE con exploreDbSchema prima di usarli.
- REGOLA CRITICA: Se trovi un pattern da un altro connettore (es. JOIN con MA_Customer) ma la tabella non esiste nel tuo DB, NON insistere con quel nome! Usa exploreDbSchema per trovare la tabella equivalente nel TUO database.
- Usa questo tool anche quando l'utente dice "guarda le altre query", "prendi esempio da altri nodi", "cerca negli altri alberi".

## QUERY DA NODI FRATELLI (PRIORITA' ALTA):
- Nel contesto sotto "QUERY SQL DA ALTRI NODI NELLO STESSO ALBERO" trovi le query scritte in altri nodi dello STESSO albero.
- Queste query sono la fonte PIU' affidabile: sono gia' testate e funzionanti.
- Le query marcate "[STESSO CONNETTORE]" usano il TUO stesso database: i nomi tabella/colonna sono DIRETTAMENTE utilizzabili.
- PRIMA di usare browseOtherQueries o esplorare il DB, controlla se le query dei nodi fratelli gia' contengono i nomi tabella che ti servono.
- Usa i nomi tabella/colonna che trovi come punto di partenza, ma VERIFICA SEMPRE con testSqlQuery.

## AUTO-APPRENDIMENTO KB (OBBLIGATORIO):
Devi imparare dai tuoi errori AUTOMATICAMENTE:

### QUANDO SALVARE (usa sqlSaveToKnowledgeBase):
1. **Dopo ogni correzione dell'utente**: Se l'utente ti corregge (es. "non funziona", "errore", "sbagliato", "CORREZIONE:"), e tu trovi la soluzione corretta, salva IMMEDIATAMENTE.
2. **Dopo un test fallito che correggi**: Se testSqlQuery fallisce e tu lo risolvi, salva cosa hai imparato.
3. **Dopo aver scoperto strutture dati inaspettate**: Se una tabella ha colonne con nomi diversi da quelli attesi, salva i nomi corretti.

### COSA SALVARE:
- **question**: Descrivi il problema in modo cercabile (es. "Errore colonna orders non trovata - usare order_items")
- **answer**: "ERRORE: [cosa facevo di sbagliato]. SOLUZIONE: [approccio corretto]. ESEMPIO: [query corretta]"
- **tags**: Includi "errore", "correzione", piu' tag specifici (es. ["errore", "correzione", "join", "orders"])
- **category**: "Correzione" per errori corretti, "Best Practice" per pattern appresi

### QUANDO CERCARE (usa searchKnowledgeBase):
- ALL'INIZIO di ogni nuova richiesta, cerca nella KB parole chiave relative alla richiesta.
- Prima di scrivere query che toccano un'area dove hai gia' sbagliato in passato.

## FORMATO RISPOSTE:
- Rispondi SEMPRE in italiano
- Usa **grassetto** per evidenziare dati importanti
- Usa tabelle markdown per i risultati
- Usa blocchi di codice per le query
- Spiega BREVEMENTE cosa hai fatto - sii CONCISO, vai dritto al punto

## FORMATO RISPOSTA (OBBLIGATORIO):
Rispondi SOLO con un oggetto JSON valido, senza testo prima o dopo:
{"message": "spiegazione breve in italiano", "updatedScript": "query SQL aggiornata", "needsClarification": false, "clarificationQuestions": [], "solutionSourceNode": "nome del nodo che ha ispirato la soluzione, oppure null se nessuno"}

## SOLUTIONSOURCENODE:
- Se la tua soluzione e' stata ispirata o basata su una query trovata in un altro nodo (tramite browseOtherQueries o dai nodi fratelli), indica il NOME di quel nodo in solutionSourceNode.
- Se hai risolto senza ispirazione da altri nodi, metti null.

## !!!! DIVIETO SU updatedScript !!!!
updatedScript DEVE SEMPRE essere la query SQL FINALE che l'utente vuole eseguire nel suo nodo.

VIETATO in updatedScript:
- Query su INFORMATION_SCHEMA.TABLES/COLUMNS
- Query su sys.tables, sys.columns
- Query di discovery/diagnostica usate solo per esplorare

Queste query vanno usate SOLO tramite testSqlQuery/exploreDbSchema/exploreTableColumns (tool calls interni).

WORKFLOW CORRETTO per "Invalid object name":
1. Chiama testSqlQuery con INFORMATION_SCHEMA → tool call interno, NON va in updatedScript
2. Chiama exploreTableColumns sulla tabella trovata → tool call interno, NON va in updatedScript
3. RISCRIVI la query dell'utente con il nome tabella CORRETTO → QUESTA va in updatedScript

ESEMPIO:
- Errore: Invalid object name 'MA_Customer'
- Tool call: testSqlQuery("SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%Cust%'")
- Risultato: dbo.ClientiAnagrafiche
- updatedScript CORRETTO: "SELECT * FROM dbo.ClientiAnagrafiche WHERE IsActive = 1"
- updatedScript VIETATO: "SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%Cust%'"`;

        const userPrompt = `=== RICHIESTA ===
${input.userMessage}
${discoveryContext}${siblingTableHints}
=== QUERY SQL CORRENTE ===
${input.script || '(nessuna query definita)'}
${context}${historyContext}

Analizza, usa i tool per esplorare il DB se necessario, poi rispondi in JSON.`;

        let resultText = '';
        let usage: OpenRouterUsage | undefined;

        // Hoist OpenRouter tools and dispatcher so they're accessible for safety-net retries
        const activeTools = [
            ...(input.connectorId ? [
                openRouterTools.find(t => t.function.name === 'exploreDbSchema'),
                openRouterTools.find(t => t.function.name === 'exploreTableColumns'),
                openRouterTools.find(t => t.function.name === 'testSqlQuery')
            ] : []),
            ...(input.companyId ? [
                openRouterTools.find(t => t.function.name === 'searchKnowledgeBase'),
                openRouterTools.find(t => t.function.name === 'listSqlConnectors'),
                openRouterTools.find(t => t.function.name === 'sqlSaveToKnowledgeBase'),
                openRouterTools.find(t => t.function.name === 'browseOtherQueries')
            ] : [])
        ].filter(Boolean) as OpenRouterTool[];

        // Dispatcher for OpenRouter tool calls (with consulted node tracking)
        const dispatcher = async (name: string, args: any) => {
            let result: string;
            switch (name) {
                case 'exploreDbSchema': result = await doExploreDbSchema(args); break;
                case 'exploreTableColumns': result = await doExploreTableColumns(args); break;
                case 'testSqlQuery': result = await doTestSqlQuery(args); break;
                case 'searchKnowledgeBase': result = await doSearchKB(args); break;
                case 'listSqlConnectors': result = await doListConnectors(args); break;
                case 'sqlSaveToKnowledgeBase': result = await doSaveToKB(args); break;
                case 'browseOtherQueries': result = await doBrowseOtherQueries(args); break;
                default: result = JSON.stringify({ error: `Tool sconosciuto: ${name}` });
            }

            // Track consulted nodes from browseOtherQueries
            if (name === 'browseOtherQueries') {
                try {
                    const parsed = JSON.parse(result);
                    if (parsed.queries && Array.isArray(parsed.queries)) {
                        for (const q of parsed.queries) {
                            const exists = consultedNodes.some(n => n.source === q.source && n.name === q.name);
                            if (!exists) {
                                consultedNodes.push({
                                    source: q.source,
                                    name: q.name,
                                    type: 'sql',
                                    sameConnector: q.sameConnector || false,
                                    wasSolutionSource: false,
                                });
                            }
                        }
                    }
                } catch { /* ignore parse errors */ }
            }

            return result;
        };

        {
            // --- OpenRouter Generation ---
            if (!apiKey) {
                return { message: "Errore: Chiave API OpenRouter mancante. Configura la chiave nelle impostazioni.", needsClarification: false };
            }

            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ];

            const result = await runOpenRouterAgentLoop(
                apiKey,
                modelName,
                messages,
                activeTools,
                dispatcher,
                true
            );
            resultText = result.text;
            usage = result.usage;
        }

        // Parse the response
        const parsed = parseAgentJson(resultText);
        if (parsed) {
            // Safety net: block discovery queries from leaking into updatedScript
            if (parsed.updatedScript) {
                const upper = parsed.updatedScript.toUpperCase();
                if (upper.includes('INFORMATION_SCHEMA.TABLES') || upper.includes('INFORMATION_SCHEMA.COLUMNS') ||
                    upper.includes('FROM SYS.TABLES') || upper.includes('FROM SYS.COLUMNS')) {
                    console.warn('[SQL AGENT] Blocked discovery query from updatedScript. Running discovery and retrying...');

                    // Instead of returning without updatedScript, run the discovery query ourselves
                    // and re-prompt the LLM with the results
                    let retryDiscoveryContext = '';
                    if (input.connectorId) {
                        try {
                            const discoveryResult = await doTestSqlQuery({
                                query: parsed.updatedScript,
                                connectorId: input.connectorId,
                            });
                            const discoveryParsed = JSON.parse(discoveryResult);
                            if (discoveryParsed.success && discoveryParsed.sampleData) {
                                retryDiscoveryContext = `\n\nRISULTATI DISCOVERY (eseguita automaticamente):\n${JSON.stringify(discoveryParsed.sampleData, null, 2)}\n\nOra RISCRIVI la query dell'utente usando i nomi tabella ESATTI trovati sopra. Metti la query FINALE (NON di discovery) in updatedScript.`;
                            }
                        } catch { /* ignore */ }
                    }

                    if (retryDiscoveryContext && apiKey) {
                        // Re-prompt with discovery results
                        const retryMessages = [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: `${userPrompt}${retryDiscoveryContext}` }
                        ];
                        try {
                            const retryResult = await runOpenRouterAgentLoop(
                                apiKey, modelName, retryMessages, activeTools, dispatcher, true
                            );
                            const retryParsed = parseAgentJson(retryResult.text);
                            if (retryParsed?.updatedScript) {
                                const retryUpper = retryParsed.updatedScript.toUpperCase();
                                if (!retryUpper.includes('INFORMATION_SCHEMA') && !retryUpper.includes('SYS.TABLES')) {
                                    // Success! Return the corrected query
                                    if (retryParsed.solutionSourceNode && typeof retryParsed.solutionSourceNode === 'string') {
                                        const srcLower = retryParsed.solutionSourceNode.toLowerCase();
                                        const sourceNode = consultedNodes.find(n =>
                                            n.name.toLowerCase().includes(srcLower) || srcLower.includes(n.name.toLowerCase())
                                        );
                                        if (sourceNode) sourceNode.wasSolutionSource = true;
                                    }
                                    return {
                                        message: retryParsed.message || 'Query corretta con i nomi tabella trovati.',
                                        updatedScript: retryParsed.updatedScript,
                                        needsClarification: false,
                                        consultedNodes: consultedNodes.length > 0 ? consultedNodes : undefined,
                                        usage: {
                                            prompt_tokens: (usage?.prompt_tokens || 0) + (retryResult.usage?.prompt_tokens || 0),
                                            completion_tokens: (usage?.completion_tokens || 0) + (retryResult.usage?.completion_tokens || 0),
                                            total_tokens: (usage?.total_tokens || 0) + (retryResult.usage?.total_tokens || 0),
                                            total_cost: ((usage?.total_cost || 0) + (retryResult.usage?.total_cost || 0)) || undefined,
                                        },
                                    };
                                }
                            }
                        } catch (retryErr) {
                            console.warn('[SQL AGENT] Retry after discovery failed:', retryErr);
                        }
                    }

                    // Fallback: return the original response with the discovery info but use the ORIGINAL script
                    return {
                        message: (parsed.message || '') + '\n\n**Nota:** Ho trovato informazioni sulle tabelle ma devo ancora riscrivere la query corretta. Riformulo la query con i nomi tabella corretti.',
                        updatedScript: input.script || undefined,
                        needsClarification: false,
                        consultedNodes: consultedNodes.length > 0 ? consultedNodes : undefined,
                        usage,
                    };
                }
            }

            // Mark the solution source node based on LLM's indication
            if (parsed.solutionSourceNode && typeof parsed.solutionSourceNode === 'string') {
                const srcLower = parsed.solutionSourceNode.toLowerCase();
                const sourceNode = consultedNodes.find(n =>
                    n.name.toLowerCase().includes(srcLower) ||
                    srcLower.includes(n.name.toLowerCase())
                );
                if (sourceNode) {
                    sourceNode.wasSolutionSource = true;
                }
            }

            return {
                message: parsed.message || resultText,
                updatedScript: parsed.updatedScript,
                needsClarification: parsed.needsClarification || false,
                clarificationQuestions: parsed.clarificationQuestions || [],
                consultedNodes: consultedNodes.length > 0 ? consultedNodes : undefined,
                usage,
            };
        }

        return { message: resultText, needsClarification: false, consultedNodes: consultedNodes.length > 0 ? consultedNodes : undefined, usage };
    } catch (e: any) {
        console.error('Error in SQL agent flow:', e);
        return { message: `Errore: ${e.message}. Riprova o dammi piu' dettagli.`, needsClarification: false };
    }
}
