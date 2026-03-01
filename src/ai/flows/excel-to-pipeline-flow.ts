import { nanoid } from 'nanoid';

export interface ExcelPipelineStep {
    id: string;
    name: string;
    type: 'sql' | 'python';
    description: string;
    sqlQuery?: string;
    sqlResultName?: string;
    pythonCode?: string;
    pythonOutputType?: 'table' | 'variable' | 'chart' | 'html';
    pythonResultName?: string;
    dependencies: string[];
    sourceSheet?: string;
}

export interface ExcelAnalysis {
    filename: string;
    sheets: Array<{
        name: string;
        dimensions: string;
        maxRow: number;
        maxCol: number;
        formulas: Array<{ cell: string; formula: string }>;
        formulaSamples?: Array<{ cell: string; formula: string; pattern?: string }>;
        functionsUsed?: Array<{ name: string; count: number }>;
        sampleData: Array<Record<string, string | null>>;
        columnHeaders: Array<{ column: string; value: string }>;
        charts: number;
        mergedCells: string[];
        sheetRole?: string;
        referencedSheets?: string[];
    }>;
    crossSheetReferences: Array<{
        fromSheet: string;
        toSheet: string;
        cell: string;
        formula: string;
    }>;
    namedRanges: Array<{ name: string; value: string }>;
    dataFlowGraph: Record<string, string[]>;
    etlSummary?: {
        dataSources: string[];
        transformations: string[];
        reports: string[];
        charts: string[];
        configs: string[];
        totalFormulas: number;
        totalSheets: number;
    };
}

export interface DatabaseSchemaInfo {
    tables: Array<{
        fullName: string;
        rowCount: number;
        description: string | null;
        columns: Array<{
            name: string;
            dataType: string;
            isNullable: boolean;
            isPrimaryKey: boolean;
            isForeignKey: boolean;
            foreignKeyTarget?: { schema: string; table: string; column: string };
        }>;
    }>;
    relationships: Array<{
        sourceTable: string;
        sourceColumn: string;
        targetTable: string;
        targetColumn: string;
    }>;
}

export function buildExcelAnalysisPrompt(
    analysis: ExcelAnalysis,
    dbSchema?: DatabaseSchemaInfo
): { systemPrompt: string; userPrompt: string } {

    const hasDbSchema = dbSchema && dbSchema.tables && dbSchema.tables.length > 0;

    const systemPrompt = `Sei un esperto di ETL e analisi dati. Il tuo compito e' reverse-engineerare il flusso ETL contenuto in un file Excel e ricostruirlo come pipeline automatizzata con query SQL reali.

Il file Excel rappresenta un processo ETL: i dati vengono estratti da un database, trasformati tramite formule, e presentati come report/grafici.

${hasDbSchema ? `HAI A DISPOSIZIONE LO SCHEMA DEL DATABASE REALE. Devi mappare le colonne Excel alle tabelle e colonne reali del database per generare query SQL funzionanti.` : `Non hai lo schema del database. Genera query SQL basandoti sui nomi delle colonne Excel come best-guess per i nomi delle tabelle/colonne reali. L'utente le corregera'.`}

COMPITO:
1. Analizza ogni foglio Excel per capire COSA rappresenta (dati grezzi, trasformazione, riepilogo, grafico)
2. Per i fogli con dati grezzi: genera query SQL SELECT che estraggono quei dati dal database reale${hasDbSchema ? ', mappando le intestazioni Excel alle colonne del database' : ''}
3. Per i fogli con formule/aggregazioni: genera query SQL che replicano la logica delle formule (JOIN, GROUP BY, CASE WHEN, ecc.)
4. Per i fogli con grafici o output visivi: genera nodi Python con Plotly

TIPI DI NODO:

1. **SQL nodes** (type: "sql"): Per estrarre e trasformare dati dal database.
   - Sintassi MSSQL: usa parentesi quadre SEPARATE per schema e tabella: [schema].[tabella] (es: [dbo].[NomeTabella]). NON usare [dbo.NomeTabella] (sbagliato!).
   - TOP invece di LIMIT, ISNULL() invece di COALESCE, GETDATE() invece di NOW().
   - ${hasDbSchema ? 'USA I NOMI REALI delle tabelle e colonne dal database schema fornito. I nomi sono nel formato schema.tabella (es: dbo.NomeTabella) e nelle query SQL devi scriverli come [dbo].[NomeTabella].' : 'Usa nomi plausibili basati sulle intestazioni Excel.'}
   - Le formule Excel come SOMMA, MEDIA, CONTA diventano SUM(), AVG(), COUNT() con GROUP BY.
   - I CERCA.VERT (VLOOKUP) diventano JOIN tra tabelle.
   - I riferimenti cross-sheet indicano che i dati di un foglio dipendono da un altro → usa i resultName come dipendenze.

2. **Python nodes** (type: "python"): Per visualizzazioni e calcoli complessi.
   - Grafici Plotly: crea la figura e assegnala a "fig", poi chiama fig.show(). pythonOutputType: "chart"
   - Tabelle HTML: assegna la stringa HTML a "result". pythonOutputType: "html"
   - I dati arrivano come DataFrame "df" dalle dipendenze.

3. **Dependencies**: Ogni nodo specifica da quali nodi precedenti dipende tramite lista di resultName.

REGOLE:
- Ricostruisci l'intero flusso ETL dell'Excel come pipeline.
- I nodi sorgente estraggono dati reali dal database con query SQL funzionanti.
- Le formule Excel diventano logica SQL (JOIN, GROUP BY, CASE, subquery).
- VLOOKUP/CERCA.VERT = JOIN. SUMIF/SOMMA.SE = SUM() + WHERE/GROUP BY. IF/SE = CASE WHEN.
- Ogni nodo ha un resultName univoco in snake_case.
- Nomi e descrizioni in italiano.

FORMATO RISPOSTA (JSON):
{
  "pipelineName": "Nome suggerito per la pipeline",
  "steps": [
    {
      "name": "Nome del passaggio (italiano)",
      "type": "sql" oppure "python",
      "description": "Cosa fa - quale parte del flusso ETL replica",
      "resultName": "nome_univoco_risultato",
      "sqlQuery": "LA QUERY SQL COMPLETA E FUNZIONANTE - OBBLIGATORIO se type=sql. Esempio: SELECT [col1], [col2], SUM([importo]) AS totale FROM [dbo].[Tabella] GROUP BY [col1], [col2]",
      "pythonCode": "IL CODICE PYTHON COMPLETO - OBBLIGATORIO se type=python. Esempio: import plotly.express as px\\nfig = px.bar(df, x='mese', y='totale')\\nfig.show()",
      "pythonOutputType": "table|chart|html (solo se type=python)",
      "dependencies": ["resultName_del_nodo_precedente"],
      "sourceSheet": "Nome del foglio Excel di riferimento"
    }
  ]
}

IMPORTANTE:
- Ogni step di type "sql" DEVE avere il campo "sqlQuery" con una query SQL COMPLETA e funzionante, NON vuota.
- Ogni step di type "python" DEVE avere il campo "pythonCode" con codice Python COMPLETO, NON vuoto.
- Non generare step senza query/codice. Se non sai cosa mettere, genera una query SELECT di base sulla tabella piu' pertinente.`;

    // Build user prompt with Excel analysis details
    // ETL summary if available
    let etlOverview = '';
    if ((analysis as any).etlSummary) {
        const etl = (analysis as any).etlSummary;
        etlOverview = `\n## Struttura ETL rilevata:
- Sorgenti dati (${etl.dataSources.length}): ${etl.dataSources.join(', ') || 'nessuna'}
- Trasformazioni (${etl.transformations.length}): ${etl.transformations.join(', ') || 'nessuna'}
- Report (${etl.reports.length}): ${etl.reports.join(', ') || 'nessuno'}
- Grafici (${etl.charts.length}): ${etl.charts.join(', ') || 'nessuno'}
- Config/Mappatura (${(etl.configs || []).length}): ${(etl.configs || []).join(', ') || 'nessuna'}
- Formule totali: ${etl.totalFormulas}\n`;
    }

    let sheetsInfo = '';
    for (const sheet of analysis.sheets) {
        const role = (sheet as any).sheetRole || 'unknown';
        if (role === 'separator') continue; // Skip separator sheets

        const funcsList = (sheet as any).functionsUsed;
        const formulaSamples = (sheet as any).formulaSamples;
        const refSheets = (sheet as any).referencedSheets;
        const columnMapping = (sheet as any).columnMapping; // {"A": "CodConto", ...}

        sheetsInfo += `\n### Foglio: "${sheet.name}" [${role}]
- Dimensioni: ${sheet.maxRow} righe x ${sheet.maxCol || 0} colonne
- Colonne: ${sheet.columnHeaders.map((h: any) => `${h.column}=${h.value}`).join(', ')}`;

        if (funcsList && funcsList.length > 0) {
            sheetsInfo += `\n- Funzioni Excel usate: ${funcsList.map((f: any) => `${f.name}(${f.count}x)`).join(', ')}`;
        }

        const formulaCount = (sheet as any).formulaCount || sheet.formulas.length;
        if (formulaSamples && formulaSamples.length > 0) {
            sheetsInfo += `\n- Logica (${formulaCount} formule totali) - tradotte con nomi colonna:`;
            for (const f of formulaSamples.slice(0, 10)) {
                // Prefer translated formula (with column names), show original as reference
                const translated = f.translated || f.formula;
                if (translated !== f.formula) {
                    sheetsInfo += `\n  ${translated}`;
                } else {
                    sheetsInfo += `\n  ${f.cell}: ${f.formula}`;
                }
            }
        } else if (formulaCount > 0 && sheet.formulas.length > 0) {
            sheetsInfo += `\n- Formule (${formulaCount}): ${sheet.formulas.slice(0, 10).map((f: any) => `${f.cell}: ${f.formula}`).join('; ')}`;
        } else if (role === 'data_source') {
            sheetsInfo += `\n- Dati grezzi senza formule (${sheet.maxRow} righe) - RICHIEDE query SQL SELECT per estrazione`;
        } else if (formulaCount > 0) {
            sheetsInfo += `\n- Formule: ${formulaCount} (nessun esempio disponibile)`;
        }

        if (refSheets && refSheets.length > 0) {
            sheetsInfo += `\n- Legge dati da: ${refSheets.join(', ')}`;
        }

        if (sheet.charts > 0) sheetsInfo += `\n- Grafici: ${sheet.charts}`;

        if (sheet.sampleData && sheet.sampleData.length > 0) {
            sheetsInfo += `\n- Dati esempio: ${JSON.stringify(sheet.sampleData.slice(0, 2))}`;
        }
        sheetsInfo += '\n';
    }

    let crossRefs = '';
    if (analysis.crossSheetReferences.length > 0) {
        const uniqueRefs = new Map<string, string[]>();
        for (const ref of analysis.crossSheetReferences) {
            const key = `${ref.fromSheet} -> ${ref.toSheet}`;
            if (!uniqueRefs.has(key)) uniqueRefs.set(key, []);
            if (uniqueRefs.get(key)!.length < 3) {
                // Prefer translated formula with column names
                const display = (ref as any).translated || `${ref.cell}: ${ref.formula}`;
                uniqueRefs.get(key)!.push(display);
            }
        }
        crossRefs = '\n## Flusso dati tra fogli (con nomi colonna):\n';
        for (const [key, formulas] of uniqueRefs.entries()) {
            crossRefs += `- ${key}: ${formulas.join('; ')}\n`;
        }
    }

    let namedRanges = '';
    if (analysis.namedRanges.length > 0) {
        namedRanges = '\n## Named Ranges:\n' + analysis.namedRanges.slice(0, 20).map((nr: any) => `- ${nr.name}: ${nr.value}`).join('\n');
    }

    const dataFlow = '\n## Grafo flusso dati:\n' +
        Object.entries(analysis.dataFlowGraph)
            .filter(([_, refs]) => (refs as string[]).length > 0)
            .map(([sheet, refs]) => `- ${sheet} <- ${(refs as string[]).join(', ')}`)
            .join('\n');

    // Build database schema section
    let dbSchemaSection = '';
    if (hasDbSchema) {
        dbSchemaSection = '\n\n## SCHEMA DATABASE REALE:\nNota: i nomi sono nel formato schema.tabella. Nelle query SQL usa SEMPRE [schema].[tabella], es: dbo.Clienti -> [dbo].[Clienti]\n';
        for (const table of dbSchema!.tables.slice(0, 50)) {
            // Convert dbo.TableName to [dbo].[TableName] format for the prompt
            const parts = table.fullName.split('.');
            const sqlName = parts.length === 2 ? `[${parts[0]}].[${parts[1]}]` : `[${table.fullName}]`;
            const cols = table.columns.map(c => {
                let col = `[${c.name}] (${c.dataType}`;
                if (c.isPrimaryKey) col += ', PK';
                if (c.isForeignKey && c.foreignKeyTarget) col += `, FK->[${c.foreignKeyTarget.table}].[${c.foreignKeyTarget.column}]`;
                col += ')';
                return col;
            }).join(', ');
            dbSchemaSection += `- **${sqlName}** (${table.rowCount} righe${table.description ? `, ${table.description}` : ''}): ${cols}\n`;
        }
        if (dbSchema!.relationships.length > 0) {
            dbSchemaSection += '\n### Relazioni:\n';
            for (const rel of dbSchema!.relationships.slice(0, 30)) {
                const srcParts = rel.sourceTable.split('.');
                const tgtParts = rel.targetTable.split('.');
                const srcSql = srcParts.length === 2 ? `[${srcParts[0]}].[${srcParts[1]}]` : rel.sourceTable;
                const tgtSql = tgtParts.length === 2 ? `[${tgtParts[0]}].[${tgtParts[1]}]` : rel.targetTable;
                dbSchemaSection += `- ${srcSql}.[${rel.sourceColumn}] -> ${tgtSql}.[${rel.targetColumn}]\n`;
            }
        }
    }

    const userPrompt = `Reverse-engineera il flusso ETL di questo file Excel e ricostruiscilo come pipeline con query SQL reali.
Ogni step DEVE contenere sqlQuery o pythonCode COMPLETO e FUNZIONANTE.

## File: ${analysis.filename}
${etlOverview}
${sheetsInfo}
${crossRefs}
${namedRanges}
${dataFlow}
${dbSchemaSection}`;

    return { systemPrompt, userPrompt };
}

export function buildPipelineTreeFromSteps(steps: ExcelPipelineStep[], connectorId?: string): any {
    if (steps.length === 0) {
        return { question: "Pipeline vuota", options: { "Fine": { decision: "Nessun step trovato nel file Excel." } } };
    }

    // Derive filename from the first source step's sourceSheet or fallback
    const firstSource = steps.find(s => s.sourceSheet && s.dependencies.length === 0);
    const rootLabel = firstSource
        ? `Caricamento file Excel`
        : 'Pipeline ETL';

    // ROOT: single node representing the Excel file
    const root: any = {
        id: nanoid(10),
        question: rootLabel,
        options: {} as Record<string, any>,
    };

    // ALL steps become direct leaves of the root
    for (const step of steps) {
        const node: any = {
            id: step.id || nanoid(10),
            question: step.name,
            pythonCode: step.pythonCode || '',
            pythonOutputType: step.pythonOutputType || 'table',
            pythonResultName: step.pythonResultName || step.name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase(),
        };

        if (connectorId) node.pythonConnectorId = connectorId;

        // Dependencies: reference sibling nodes by resultName
        if (step.dependencies.length > 0) {
            node.pythonSelectedPipelines = step.dependencies;
        }

        // Each leaf terminates with "Fine"
        node.options = { "Fine": { id: nanoid(10), decision: step.description || step.name } };

        root.options[step.name] = node;
    }

    return root;
}

export function parseAIResponseToSteps(aiResponse: any): ExcelPipelineStep[] {
    const steps: ExcelPipelineStep[] = [];

    if (!aiResponse || !aiResponse.steps || !Array.isArray(aiResponse.steps)) {
        return steps;
    }

    for (const step of aiResponse.steps) {
        steps.push({
            id: nanoid(10),
            name: step.name || 'Step senza nome',
            type: step.type === 'python' ? 'python' : 'sql',
            description: step.description || '',
            sqlQuery: step.sqlQuery,
            sqlResultName: step.type === 'sql' ? (step.resultName || step.name?.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()) : undefined,
            pythonCode: step.pythonCode,
            pythonOutputType: step.pythonOutputType,
            pythonResultName: step.type === 'python' ? (step.resultName || step.name?.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()) : undefined,
            dependencies: Array.isArray(step.dependencies) ? step.dependencies : [],
            sourceSheet: step.sourceSheet,
        });
    }

    return steps;
}
