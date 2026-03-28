/**
 * @fileOverview Python Agent tools for Vercel AI SDK.
 * Mirrors sql-agent-tools.ts but for the Python agent.
 */

import { z } from 'zod';
import { tool } from 'ai';
import { db } from '@/lib/db';
import { executeSqlPreviewAction, executePythonPreviewAction } from '@/app/actions';
import { getCachedParsedMap } from '@/lib/database-map-cache';

// ─── Tool Implementation Functions ───────────────────────────────────────────

export async function doPyExploreDbSchema(input: { connectorId: string }) {
    try {
        // Python agent uses simpler schema exploration (no cached databaseMap)
        const connector = await db.connector.findUnique({
            where: { id: input.connectorId },
            select: { databaseMap: true },
        });
        if (connector?.databaseMap) {
            try {
                const map = getCachedParsedMap(input.connectorId, connector.databaseMap);
                const tables = (map.tables || []).map((t: any) => ({
                    table_name: t.fullName,
                    row_count: t.rowCount,
                    description: t.userDescription || t.description || null,
                    columns_count: t.columns?.length || 0,
                }));
                return JSON.stringify({ tables, source: 'cached_map' }, null, 2);
            } catch { /* fall through */ }
        }
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

export async function doPyExploreTableColumns(input: { connectorId: string; tableName: string }) {
    try {
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

export async function doPyTestSqlQuery(input: { query: string; connectorId: string }) {
    try {
        const result = await executeSqlPreviewAction(input.query, input.connectorId, [], true);
        if (result.error) return JSON.stringify({ error: result.error, suggestion: 'Controlla nomi tabella e colonne.' });
        const data = result.data || [];
        return JSON.stringify({
            success: true,
            rowCount: data.length,
            columns: data.length > 0 ? Object.keys(data[0]) : [],
            sampleData: data.slice(0, 5),
        }, null, 2);
    } catch (e: any) {
        return JSON.stringify({ error: e.message });
    }
}

export async function doPyTestCode(input: { code: string; outputType: string; connectorId?: string; sqlQuery?: string }) {
    try {
        let inputData: Record<string, any[]> = {};

        // If sqlQuery is provided, pre-fetch data from the database so that `df` is populated
        if (input.sqlQuery && input.connectorId) {
            try {
                const sqlResult = await executeSqlPreviewAction(input.sqlQuery, input.connectorId, [], true);
                if (sqlResult.data && sqlResult.data.length > 0) {
                    // Use 'df' as key so it maps directly to the df variable in Python
                    inputData['df'] = sqlResult.data;
                }
            } catch (sqlErr: any) {
                console.warn('[pyTestCode] SQL pre-fetch failed:', sqlErr.message);
                // Continue without data - the Python code will get an empty df
            }
        }

        const result = await executePythonPreviewAction(input.code, input.outputType as any, inputData, [], input.connectorId, true);
        if (!result.success) return JSON.stringify({ error: result.error || 'Errore esecuzione' });
        return JSON.stringify({
            success: true,
            data: result.data?.slice(0, 5),
            variables: result.variables,
            columns: result.columns,
            rowCount: result.rowCount,
            html: result.html ? `(HTML output, ${result.html.length} chars)` : undefined,
            stdout: result.stdout,
        }, null, 2);
    } catch (e: any) {
        return JSON.stringify({ error: e.message });
    }
}

export async function doPySearchKB(input: { query: string; companyId: string }) {
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

export async function doPyListConnectors(input: { companyId: string }) {
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

export async function doPySaveToKB(input: { question: string; answer: string; tags: string[]; category: string; companyId: string }) {
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

// ─── Edit Script (find-and-replace) ─────────────────────────────────────────

export async function doEditScript(input: { oldString: string; newString: string; currentScript: string; replaceAll?: boolean }) {
    try {
        const { oldString, newString, currentScript, replaceAll } = input;

        if (!currentScript) {
            return JSON.stringify({ error: 'Nessuno script corrente da modificare. Carica prima uno script con loadScriptFromFile o scrivine uno.' });
        }

        if (!currentScript.includes(oldString)) {
            // Try to find a close match for helpful error
            const lines = oldString.split('\n');
            const firstLine = lines[0].trim();
            const matchingLines = currentScript.split('\n')
                .map((l, i) => ({ line: l, num: i + 1 }))
                .filter(({ line }) => line.includes(firstLine));

            let hint = '';
            if (matchingLines.length > 0) {
                hint = ` Trovate righe simili a: ${matchingLines.slice(0, 3).map(m => `riga ${m.num}`).join(', ')}. Usa readScriptLines per vedere il contesto esatto.`;
            }
            return JSON.stringify({ error: `Stringa da sostituire non trovata nello script corrente.${hint}` });
        }

        const occurrences = currentScript.split(oldString).length - 1;
        if (occurrences > 1 && !replaceAll) {
            return JSON.stringify({
                error: `Trovate ${occurrences} occorrenze di oldString. Usa replaceAll=true per sostituirle tutte, oppure fornisci più contesto per rendere la stringa unica.`,
                occurrences,
            });
        }

        const updatedScript = replaceAll
            ? currentScript.split(oldString).join(newString)
            : currentScript.replace(oldString, newString);

        const lineCount = updatedScript.split('\n').length;
        const sizeKB = Math.round(Buffer.byteLength(updatedScript, 'utf-8') / 1024);

        return JSON.stringify({
            success: true,
            updatedScript,
            lineCount,
            sizeKB,
            replacements: replaceAll ? occurrences : 1,
        });
    } catch (e: any) {
        return JSON.stringify({ error: e.message });
    }
}

// ─── Read Script Lines ──────────────────────────────────────────────────────

export async function doReadScriptLines(input: { currentScript: string; startLine?: number; endLine?: number; searchPattern?: string }) {
    try {
        const { currentScript, startLine, endLine, searchPattern } = input;

        if (!currentScript) {
            return JSON.stringify({ error: 'Nessuno script corrente.' });
        }

        const allLines = currentScript.split('\n');
        const totalLines = allLines.length;

        // If searchPattern, find matching lines with context
        if (searchPattern) {
            const matches: { lineNum: number; line: string; context: string[] }[] = [];
            const regex = new RegExp(searchPattern, 'gi');
            for (let i = 0; i < allLines.length; i++) {
                if (regex.test(allLines[i])) {
                    const ctxStart = Math.max(0, i - 2);
                    const ctxEnd = Math.min(allLines.length, i + 3);
                    matches.push({
                        lineNum: i + 1,
                        line: allLines[i],
                        context: allLines.slice(ctxStart, ctxEnd).map((l, j) => `${ctxStart + j + 1}: ${l}`),
                    });
                }
                if (matches.length >= 20) break;
            }
            return JSON.stringify({ totalLines, matchCount: matches.length, matches });
        }

        // Read specific range
        const start = Math.max(1, startLine || 1);
        const end = Math.min(totalLines, endLine || Math.min(start + 99, totalLines));
        const lines = allLines.slice(start - 1, end).map((l, i) => `${start + i}: ${l}`);

        return JSON.stringify({ totalLines, range: `${start}-${end}`, lines });
    } catch (e: any) {
        return JSON.stringify({ error: e.message });
    }
}

// ─── Load Script From File ──────────────────────────────────────────────────

const ALLOWED_EXTENSIONS = ['.py', '.txt', '.sql', '.json', '.csv', '.js', '.ts'];
const MAX_FILE_SIZE_KB = 500;

export async function doLoadScriptFromFile(input: { filePath: string }) {
    try {
        const fs = await import('fs/promises');
        const path = await import('path');

        const resolved = path.resolve(input.filePath);

        // Security: only allow files under project root or common data directories
        const projectRoot = process.cwd();
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        const allowedPrefixes = [projectRoot];
        if (homeDir) {
            allowedPrefixes.push(path.join(homeDir, 'Desktop'));
            allowedPrefixes.push(path.join(homeDir, 'Documents'));
            allowedPrefixes.push(path.join(homeDir, 'Downloads'));
        }

        const isAllowed = allowedPrefixes.some(prefix => resolved.startsWith(prefix));
        if (!isAllowed) {
            return JSON.stringify({ error: `Percorso non consentito. File consentiti solo sotto: ${allowedPrefixes.join(', ')}` });
        }

        // Check extension
        const ext = path.extname(resolved).toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            return JSON.stringify({ error: `Estensione "${ext}" non consentita. Estensioni valide: ${ALLOWED_EXTENSIONS.join(', ')}` });
        }

        // Check existence and size
        const stat = await fs.stat(resolved);
        const sizeKB = Math.round(stat.size / 1024);
        if (sizeKB > MAX_FILE_SIZE_KB) {
            return JSON.stringify({ error: `File troppo grande: ${sizeKB}KB (max ${MAX_FILE_SIZE_KB}KB)` });
        }

        const content = await (fs.readFile as any)(resolved, 'utf-8');
        const lineCount = content.split('\n').length;

        return JSON.stringify({
            success: true,
            content,
            fileName: path.basename(resolved),
            sizeKB,
            lineCount,
        });
    } catch (e: any) {
        if (e.code === 'ENOENT') {
            return JSON.stringify({ error: `File non trovato: ${input.filePath}` });
        }
        return JSON.stringify({ error: e.message });
    }
}

// ─── Browse Other Scripts (cross-tree/pipeline) ─────────────────────────────

function collectScriptNodes(node: any, results: { nodeId: string; sqlQuery?: string; pythonCode?: string; resultName?: string; connectorId?: string; type: string }[] = []): typeof results {
    if (!node || typeof node === 'string') return results;
    if (node.ref || node.subTreeRef) return results;

    if (node.sqlQuery) {
        results.push({
            nodeId: node.id || null,
            sqlQuery: node.sqlQuery,
            resultName: node.sqlResultName,
            connectorId: node.sqlConnectorId,
            type: 'sql',
        });
    }
    if (node.pythonCode) {
        results.push({
            nodeId: node.id || null,
            pythonCode: node.pythonCode,
            resultName: node.pythonResultName,
            connectorId: node.pythonConnectorId,
            type: 'python',
        });
    }

    if (node.options) {
        for (const [, child] of Object.entries(node.options)) {
            if (Array.isArray(child)) {
                for (const c of child) collectScriptNodes(c, results);
            } else {
                collectScriptNodes(child as any, results);
            }
        }
    }
    return results;
}

export async function doPyBrowseOtherScripts(input: { companyId: string; connectorId?: string }) {
    try {
        const scripts: { source: string; name: string; code: string; type: string; connectorId?: string; sameConnector: boolean }[] = [];

        const trees = await db.tree.findMany({
            where: { companyId: input.companyId },
            select: { id: true, name: true, jsonDecisionTree: true },
        });

        for (const tree of trees) {
            let treeData: any;
            try { treeData = JSON.parse(tree.jsonDecisionTree); } catch { continue; }
            const nodes = collectScriptNodes(treeData);
            for (const node of nodes) {
                scripts.push({
                    source: `Albero: ${tree.name}`,
                    name: node.resultName || node.nodeId || 'script',
                    code: ((node.sqlQuery || node.pythonCode) || '').substring(0, 1500),
                    type: node.type,
                    connectorId: node.connectorId,
                    sameConnector: !!(input.connectorId && node.connectorId === input.connectorId),
                });
            }
        }

        const pipelines = await db.pipeline.findMany({
            where: { companyId: input.companyId },
            select: { id: true, name: true, nodes: true },
        });

        for (const pipeline of pipelines) {
            const pNodes = pipeline.nodes as any;
            if (!pNodes || typeof pNodes !== 'object') continue;
            const nodeEntries = Array.isArray(pNodes) ? pNodes : Object.values(pNodes);
            for (const node of nodeEntries as any[]) {
                const script = node.script || node.sqlQuery || node.pythonCode || '';
                if (!script) continue;
                if (node.type === 'start' || node.type === 'end') continue;
                const isPython = node.isPython === true || node.type === 'python';
                const nodeConnId = node.sqlConnectorId || node.pythonConnectorId || node.connectorId;
                scripts.push({
                    source: `Pipeline: ${pipeline.name}`,
                    name: node.sqlResultName || node.pythonResultName || node.name || node.id || 'script',
                    code: script.substring(0, 1500),
                    type: isPython ? 'python' : 'sql',
                    connectorId: nodeConnId,
                    sameConnector: !!(input.connectorId && nodeConnId === input.connectorId),
                });
            }
        }

        scripts.sort((a, b) => (b.sameConnector ? 1 : 0) - (a.sameConnector ? 1 : 0));

        const limited = scripts.slice(0, 50);
        if (limited.length === 0) {
            return JSON.stringify({ results: [], message: 'Nessuno script trovato in altri alberi o pipeline.' });
        }
        const sameCount = limited.filter(s => s.sameConnector).length;
        return JSON.stringify({ totalFound: scripts.length, showing: limited.length, sameConnectorCount: sameCount, scripts: limited }, null, 2);
    } catch (e: any) {
        return JSON.stringify({ error: e.message });
    }
}

// ─── Vercel AI SDK Tool Definitions ──────────────────────────────────────────

/**
 * Creates the Python agent tools for Vercel AI SDK.
 * Closures capture connectorId and companyId so tools auto-inject them.
 */
export function createPythonAgentTools(opts: {
    connectorId?: string;
    companyId?: string;
    /** Current script in the node editor — used by editScript/readScriptLines tools */
    currentScript?: string;
}) {
    const cid = opts.connectorId || '';
    const cpid = opts.companyId || '';
    // Mutable ref so editScript can chain multiple edits on the latest version
    let liveScript = opts.currentScript || '';

    const tools: Record<string, any> = {};

    // ── think — internal reasoning tool (like Claude Code's thinking) ────────
    tools.think = tool({
        description: "Usa questo tool per RAGIONARE internamente prima di agire. Pianifica il prossimo passo, analizza errori, valuta alternative. Il contenuto NON viene mostrato all'utente. Usalo SEMPRE quando: (1) devi decidere tra più approcci, (2) un tool call è fallita e devi capire perché, (3) il task è complesso e serve un piano.",
        inputSchema: z.object({
            reasoning: z.string().describe("Il tuo ragionamento interno: analisi del problema, piano d'azione, valutazione alternative."),
        }),
        execute: async ({ reasoning }) => JSON.stringify({ ok: true }),
    });

    // pyTestCode is ALWAYS available — it's the core Python tool
    tools.pyTestCode = tool({
        description: "Esegue codice Python di test per verificare che funzioni. Restituisce dati, variabili, stdout. E' il tuo strumento PRINCIPALE per testare il codice! Se passi sqlQuery, i dati vengono pre-caricati dal database e iniettati come df nel codice Python.",
        inputSchema: z.object({
            code: z.string().describe('Il codice Python da eseguire.'),
            outputType: z.enum(['table', 'variable', 'chart', 'html']).describe("Tipo di output atteso: 'table' per DataFrame, 'chart' per grafici Plotly, 'variable' per dizionari, 'html' per HTML."),
            sqlQuery: z.string().optional().describe("Query SQL opzionale per pre-caricare i dati dal database. Se specificata, il risultato viene iniettato come df nel codice Python. Esempio: 'SELECT * FROM dbo.NomeTabella'. Usa SEMPRE questo parametro quando testi codice che lavora su una tabella del DB."),
        }),
        execute: async ({ code, outputType, sqlQuery }) => doPyTestCode({ code, outputType, connectorId: cid || undefined, sqlQuery }),
    });

    if (opts.connectorId) {
        tools.pyExploreDbSchema = tool({
            description: 'Esplora lo schema del database: elenca tutte le tabelle disponibili. Utile per capire i dati che arriveranno in input.',
            inputSchema: z.object({
                connectorId: z.string().describe("L'ID del connettore database."),
            }),
            execute: async ({ connectorId }) => doPyExploreDbSchema({ connectorId: connectorId || cid }),
        });

        tools.pyExploreTableColumns = tool({
            description: 'Esplora le colonne di una tabella specifica con tipo di dato.',
            inputSchema: z.object({
                connectorId: z.string().describe("L'ID del connettore database."),
                tableName: z.string().describe('Il nome della tabella da esplorare.'),
            }),
            execute: async ({ connectorId, tableName }) => doPyExploreTableColumns({ connectorId: connectorId || cid, tableName }),
        });

        tools.pyTestSqlQuery = tool({
            description: "Esegue una query SQL di test per capire la struttura dei dati che il codice Python ricevera' in input.",
            inputSchema: z.object({
                query: z.string().describe('La query SQL da testare.'),
                connectorId: z.string().describe("L'ID del connettore database."),
            }),
            execute: async ({ query, connectorId }) => doPyTestSqlQuery({ query, connectorId: connectorId || cid }),
        });
    }

    if (opts.companyId) {
        tools.pySearchKnowledgeBase = tool({
            description: 'Cerca nella Knowledge Base aziendale script Python simili e correzioni precedenti.',
            inputSchema: z.object({
                query: z.string().describe('Termine di ricerca.'),
                companyId: z.string().describe("L'ID della company."),
            }),
            execute: async ({ query, companyId }) => doPySearchKB({ query, companyId: companyId || cpid }),
        });

        tools.pyListSqlConnectors = tool({
            description: 'Elenca tutti i connettori SQL (database) disponibili.',
            inputSchema: z.object({
                companyId: z.string().describe("L'ID della company."),
            }),
            execute: async ({ companyId }) => doPyListConnectors({ companyId: companyId || cpid }),
        });

        tools.pySaveToKnowledgeBase = tool({
            description: "Salva una informazione nella Knowledge Base aziendale. Usa dopo aver trovato uno script corretto.",
            inputSchema: z.object({
                question: z.string().describe('La domanda o descrizione.'),
                answer: z.string().describe('La risposta o codice.'),
                tags: z.array(z.string()).describe('Tag per la ricerca.'),
                category: z.string().describe('Categoria.'),
            }),
            execute: async ({ question, answer, tags, category }) =>
                doPySaveToKB({ question, answer, tags, category, companyId: cpid }),
        });

        tools.pyBrowseOtherScripts = tool({
            description: 'Sfoglia le query SQL e gli script Python scritti in altri alberi e pipeline della company. Passa il connectorId per filtrare gli script dello stesso database.',
            inputSchema: z.object({
                companyId: z.string().describe("L'ID della company."),
                connectorId: z.string().optional().describe("L'ID del connettore attuale per prioritizzare script dello stesso DB."),
            }),
            execute: async ({ companyId, connectorId }) => doPyBrowseOtherScripts({ companyId: companyId || cpid, connectorId: connectorId || cid || undefined }),
        });
    }

    // ── getStyleGuide — on-demand HTML design guide (avoids bloating system prompt) ─
    tools.getStyleGuide = tool({
        description: "Ottieni la guida design HTML completa con template, classi CSS, componenti premium e regole di composizione. Chiama QUESTO tool PRIMA di generare HTML per la prima volta in questa conversazione. Include template per: dashboard KPI, report, form CRUD, schede dettaglio, timeline, chat, simulazioni.",
        inputSchema: z.object({}),
        execute: async () => {
            const { getHtmlDesignGuide } = await import('@/ai/html-design-guide');
            return getHtmlDesignGuide();
        },
    });

    // editScript — find-and-replace on the current script (works like Claude Code's Edit tool)
    tools.editScript = tool({
        description: "Modifica lo script corrente con find-and-replace. Usa QUESTO tool per modificare script grandi invece di riscriverli. Fornisci la stringa esatta da trovare (oldString) e la sostituzione (newString). Se oldString non e' unica, fornisci piu' contesto o usa replaceAll. Il risultato include lo script aggiornato che viene automaticamente applicato al nodo.",
        inputSchema: z.object({
            oldString: z.string().describe("La stringa ESATTA da trovare nello script corrente. Deve corrispondere carattere per carattere, inclusi spazi e indentazione."),
            newString: z.string().describe("La stringa sostitutiva."),
            replaceAll: z.boolean().optional().describe("Se true, sostituisce TUTTE le occorrenze. Default: false (sostituisce solo la prima)."),
        }),
        execute: async ({ oldString, newString, replaceAll }) => {
            const result = await doEditScript({ oldString, newString, currentScript: liveScript, replaceAll });
            // Update liveScript if edit succeeded, so chained edits work
            try {
                const parsed = JSON.parse(result);
                if (parsed.success && parsed.updatedScript) {
                    liveScript = parsed.updatedScript;
                }
            } catch { /* ignore */ }
            return result;
        },
    });

    // readScriptLines — read specific lines or search within the current script
    tools.readScriptLines = tool({
        description: "Leggi righe specifiche o cerca pattern nello script corrente. Utile per script grandi: prima cerca/leggi la sezione da modificare, poi usa editScript. Se searchPattern e' fornito, trova le righe corrispondenti con contesto.",
        inputSchema: z.object({
            startLine: z.number().optional().describe("Riga iniziale da leggere (1-based). Default: 1."),
            endLine: z.number().optional().describe("Riga finale da leggere. Default: startLine + 99."),
            searchPattern: z.string().optional().describe("Pattern regex da cercare nello script. Restituisce le righe corrispondenti con contesto."),
        }),
        execute: async ({ startLine, endLine, searchPattern }) =>
            doReadScriptLines({ currentScript: liveScript, startLine, endLine, searchPattern }),
    });

    // loadScriptFromFile is ALWAYS available — lets the agent import large scripts from disk
    tools.loadScriptFromFile = tool({
        description: "Carica un file Python (.py) o di testo dal disco e restituisce il contenuto. Usa questo tool quando l'utente chiede di importare, caricare o usare uno script da un file. Il contenuto viene automaticamente impostato come codice del nodo. NON ripetere il contenuto nel messaggio — e' troppo grande. Dì solo 'Script caricato da [nome file] (X righe, YKB)'.",
        inputSchema: z.object({
            filePath: z.string().describe("Il percorso assoluto del file da caricare. Es: /Users/.../script.py"),
        }),
        execute: async ({ filePath }) => {
            const result = await doLoadScriptFromFile({ filePath });
            // Update liveScript so editScript/readScriptLines work on loaded content
            try {
                const parsed = JSON.parse(result);
                if (parsed.success && parsed.content) {
                    liveScript = parsed.content;
                }
            } catch { /* ignore */ }
            return result;
        },
    });

    return tools;
}
