'use server';

import { db } from '@/lib/db';
import { getAuthenticatedUser } from './auth';
import { callOpenRouterJSON } from './openrouter';

export async function processExcelToPipelineAction(
    excelAnalysis: any,
    openRouterConfig?: { apiKey: string, model: string },
    connectorId?: string
): Promise<{ data: any | null; error: string | null }> {
    try {
        const sessionUser = await getAuthenticatedUser();
        if (!sessionUser) {
            return { data: null, error: 'Non autorizzato.' };
        }

        const user = await db.user.findUnique({ where: { id: sessionUser.id } });
        if (!user || !user.companyId) {
            return { data: null, error: 'Utente non associato a nessuna azienda.' };
        }

        const { buildExcelAnalysisPrompt, parseAIResponseToSteps, buildPipelineTreeFromSteps } = await import('@/ai/flows/excel-to-pipeline-flow');
        type DatabaseSchemaInfo = import('@/ai/flows/excel-to-pipeline-flow').DatabaseSchemaInfo;

        if (!openRouterConfig || !openRouterConfig.apiKey) {
            return { data: null, error: 'Configurazione OpenRouter necessaria per questa funzione. Vai nelle impostazioni per configurare la chiave API.' };
        }

        let dbSchema: DatabaseSchemaInfo | undefined;
        let dbSchemaText = '';
        if (connectorId) {
            const connector = await db.connector.findUnique({
                where: { id: connectorId, companyId: user.companyId },
                select: { databaseMap: true },
            });
            if (connector?.databaseMap) {
                const map = JSON.parse(connector.databaseMap);
                dbSchema = {
                    tables: (map.tables || []).map((t: any) => ({
                        fullName: t.fullName,
                        rowCount: t.rowCount || 0,
                        description: t.description || t.userDescription || null,
                        columns: (t.columns || []).map((c: any) => ({
                            name: c.name,
                            dataType: c.dataType,
                            isNullable: c.isNullable ?? true,
                            isPrimaryKey: c.isPrimaryKey ?? false,
                            isForeignKey: c.isForeignKey ?? false,
                            foreignKeyTarget: c.foreignKeyTarget,
                        })),
                    })),
                    relationships: (map.relationships || []).map((r: any) => ({
                        sourceTable: `${r.sourceSchema}.${r.sourceTable}`,
                        sourceColumn: r.sourceColumn,
                        targetTable: `${r.targetSchema}.${r.targetTable}`,
                        targetColumn: r.targetColumn,
                    })),
                };
                dbSchemaText = dbSchema.tables.slice(0, 50).map(t => {
                    const parts = t.fullName.split('.');
                    const sqlName = parts.length === 2 ? `[${parts[0]}].[${parts[1]}]` : `[${t.fullName}]`;
                    const cols = t.columns.map(c => `[${c.name}] (${c.dataType}${c.isPrimaryKey ? ', PK' : ''}${c.isForeignKey && c.foreignKeyTarget ? `, FK->[${c.foreignKeyTarget.table}].[${c.foreignKeyTarget.column}]` : ''})`).join(', ');
                    return `${sqlName}: ${cols}`;
                }).join('\n');
            }
        }

        const FREE_MODELS = [
            'openrouter/free',
            'stepfun/step-3.5-flash:free',
            'arcee-ai/trinity-large-preview:free',
            'upstage/solar-pro-3:free',
            'nvidia/nemotron-3-nano-30b-a3b:free',
        ];

        const apiKey = openRouterConfig.apiKey;
        const userModel = openRouterConfig.model;

        async function callWithFallback(prompt: string, sysPrompt: string, maxTokens: number): Promise<any> {
            const modelsToTry = [userModel, ...FREE_MODELS];
            let lastError = '';
            for (const model of modelsToTry) {
                try {
                    console.log(`[EXCEL-PIPELINE] Trying model: ${model}`);
                    const result = await callOpenRouterJSON(apiKey, model, prompt, sysPrompt, maxTokens);
                    console.log(`[EXCEL-PIPELINE] Model ${model} succeeded`);
                    return result;
                } catch (e: any) {
                    lastError = e.message || String(e);
                    console.warn(`[EXCEL-PIPELINE] Model ${model} failed: ${lastError}`);
                    continue;
                }
            }
            throw new Error(`Tutti i modelli AI hanno fallito. Ultimo errore: ${lastError}`);
        }

        console.log('[EXCEL-PIPELINE] Phase 1: Planning pipeline steps...');
        console.log(`[EXCEL-PIPELINE] User model: ${userModel}, API key: ${apiKey ? apiKey.substring(0, 8) + '...' : 'MISSING'}`);

        const { systemPrompt: planSystem, userPrompt: planUser } = buildExcelAnalysisPrompt(excelAnalysis, dbSchema);
        console.log(`[EXCEL-PIPELINE] Prompt sizes: system=${planSystem.length} chars, user=${planUser.length} chars`);

        const excelFilepath = excelAnalysis.filepath || '';

        const planOnlySystem = planSystem.replace(
            /FORMATO RISPOSTA[\s\S]*$/,
            `FORMATO RISPOSTA (JSON):
{
  "pipelineName": "Nome suggerito per la pipeline",
  "steps": [
    {
      "name": "Nome DESCRITTIVO dell'operazione (italiano). Es: 'Caricamento Piano dei Conti', 'Calcolo CE Sintetico', 'Grafico Ricavi vs Costi'",
      "type": "python",
      "pythonOutputType": "table" oppure "chart" oppure "html",
      "description": "Descrizione DETTAGLIATA dell'operazione",
      "resultName": "nome_univoco_snake_case",
      "dependencies": ["resultName dei nodi da cui riceve dati"],
      "sourceSheet": "Nome ESATTO del foglio Excel di riferimento"
    }
  ]
}

STRATEGIA - TUTTI I NODI SONO PYTHON:
1. Fogli DATA SOURCE (dati grezzi senza formule) → step di CARICAMENTO:
   - type="python", pythonOutputType="table", dependencies=[]
   - Il "name" deve iniziare con "Caricamento ..." (es: "Caricamento Dati Contabili")
   - "sourceSheet" DEVE essere il nome ESATTO del foglio Excel

2. Fogli TRASFORMAZIONE → step di ELABORAZIONE:
   - type="python", pythonOutputType="table"
   - Replicano la logica Excel con pandas: groupby, merge, pivot_table

3. Fogli GRAFICO → step di VISUALIZZAZIONE:
   - type="python", pythonOutputType="chart"

REGOLE NOMI:
- "name" = COSA fa, non il nome del foglio.
- "resultName" = snake_case univoco

REGOLE DIPENDENZE:
- I nodi CARICAMENTO NON hanno dipendenze: dependencies=[]
- I nodi elaborazione dipendono dai nodi che forniscono i dati

NON generare pythonCode - verrà generato separatamente per ogni step.`
        );

        const planResponse = await callWithFallback(planUser, planOnlySystem, 4096);
        console.log('[EXCEL-PIPELINE] Phase 1 result:', JSON.stringify(planResponse, null, 2).substring(0, 2000));

        if (!planResponse?.steps || !Array.isArray(planResponse.steps) || planResponse.steps.length === 0) {
            return { data: null, error: 'L\'AI non ha trovato passaggi significativi nel file Excel. Prova con un file più strutturato.' };
        }

        for (const step of planResponse.steps) {
            step.type = 'python';
            if (!step.pythonOutputType) step.pythonOutputType = 'table';
        }

        console.log(`[EXCEL-PIPELINE] Phase 2: Generating code for ${planResponse.steps.length} steps...`);

        const pythonCodeGenSystem = `Sei un esperto Python/pandas/Plotly. Genera SOLO codice Python in formato JSON.

REGOLE IMPORTANTI:
- I dati di input arrivano come DataFrame "df" (se c'è una sola dipendenza) o come dizionario di DataFrame (se più dipendenze)
- Per output tipo "table": il risultato deve essere un DataFrame chiamato "result"
- Per output tipo "chart": crea figura Plotly come "fig" e chiama fig.show()
- Per output tipo "html": assegna stringa HTML a "result"
- Usa pandas per replicare la logica Excel: groupby, merge, pivot_table, apply
- Scrivi codice COMPLETO e FUNZIONANTE, non pseudo-codice

DIVIETI ASSOLUTI - NON usare MAI:
- pd.read_excel() - i dati arrivano SOLO come DataFrame "df" dalla pipeline
- pd.read_csv() - stessa ragione
- open() per leggere file - non ci sono file
I dati sono GIA' nel DataFrame "df" passato dalla pipeline.`;

        const codePromises = planResponse.steps.map(async (step: any, idx: number) => {
            const depsList = (step.dependencies || []).join(', ') || 'nessuna';
            const isSourceNode = (!step.dependencies || step.dependencies.length === 0) && step.sourceSheet;

            const sourceSheet = excelAnalysis.sheets?.find((s: any) => s.name === step.sourceSheet);
            const sheetColumns = sourceSheet?.columnHeaders?.map((h: any) => h.value).join(', ') || '';
            const sheetFormulas = sourceSheet?.formulaSamples?.slice(0, 5)?.map((f: any) => f.translated || f.formula).join('\n  ') || '';

            if (isSourceNode) {
                const sheetName = step.sourceSheet;
                const code = `import pandas as pd

# Caricamento dati dal foglio "${sheetName}" del file Excel
result = pd.read_excel(r"${excelFilepath}", sheet_name="${sheetName}")

# Pulizia colonne: rimuovi spazi e normalizza nomi
result.columns = result.columns.str.strip()

print(f"Caricato foglio '${sheetName}': {result.shape[0]} righe, {result.shape[1]} colonne")
print(f"Colonne: {list(result.columns)}")`;

                console.log(`[EXCEL-PIPELINE] Step ${idx} "${step.name}" (SOURCE/${sheetName}) — pd.read_excel() generato direttamente`);
                return { ...step, type: 'python', pythonCode: code, pythonOutputType: 'table' };
            } else {
                const outputType = step.pythonOutputType || 'table';
                const prompt = `Genera codice Python per questa operazione della pipeline ETL.

Operazione: "${step.name}"
Descrizione: ${step.description}
Foglio Excel di riferimento: ${step.sourceSheet || 'N/A'}
${sheetColumns ? `Colonne attese nel DataFrame: ${sheetColumns}` : ''}
${sheetFormulas ? `Logica Excel da replicare in pandas:\n  ${sheetFormulas}` : ''}
Dati in input: i DataFrame "${depsList}" sono GIA' disponibili come variabile "df"
Tipo output: ${outputType}

RICORDA: i dati sono GIA' nel DataFrame "df". NON usare pd.read_excel() o pd.read_csv().
${outputType === 'chart' ? 'Crea grafico Plotly: fig = px.bar/line/pie(df, ...) poi fig.show()' : ''}
${outputType === 'table' ? 'Salva risultato: result = df... (DataFrame)' : ''}
${outputType === 'html' ? 'Salva risultato: result = "<html>..." (stringa HTML)' : ''}

Rispondi con JSON: {"pythonCode": "codice completo", "pythonOutputType": "${outputType}"}`;

                try {
                    const res = await callWithFallback(prompt, pythonCodeGenSystem, 2048);
                    const code = res.pythonCode || res.python_code || res.code || res.python || '';
                    console.log(`[EXCEL-PIPELINE] Step ${idx} "${step.name}" (python/${outputType}) code: ${code.length} chars`);
                    return { ...step, type: 'python', pythonCode: code, pythonOutputType: res.pythonOutputType || outputType };
                } catch (e: any) {
                    console.warn(`[EXCEL-PIPELINE] Code gen failed for step ${idx}: ${e.message}`);
                    return {
                        ...step, type: 'python',
                        pythonCode: `# Errore generazione: ${e.message}\nimport pandas as pd\nresult = pd.DataFrame({"errore": ["Generazione codice fallita"]})`,
                        pythonOutputType: 'table'
                    };
                }
            }
        });

        const completedSteps = await Promise.all(codePromises);

        console.log('[EXCEL-PIPELINE] Phase 2 results:');
        for (const s of completedSteps) {
            const isSource = (!s.dependencies || s.dependencies.length === 0) && s.sourceSheet;
            console.log(`  - "${s.name}" [Python/${s.pythonOutputType}${isSource ? '/SOURCE' : ''}]: ${s.pythonCode ? s.pythonCode.length + ' chars' : 'VUOTO!'}`);
        }

        const steps = parseAIResponseToSteps({ steps: completedSteps });

        if (steps.length === 0) {
            return { data: null, error: 'Nessuno step generato con successo.' };
        }

        const treeJson = buildPipelineTreeFromSteps(steps, connectorId);

        const pipelineName = planResponse.pipelineName || `Excel Pipeline: ${excelAnalysis.filename}`;
        const description = `Pipeline generata dal file Excel "${excelAnalysis.filename}" con ${excelAnalysis.sheets?.length || 0} fogli. Passaggi: ${steps.map((s: any) => s.name).join(' -> ')}`;

        const finalTreeData = {
            naturalLanguageDecisionTree: description,
            jsonDecisionTree: JSON.stringify(treeJson),
            questionsScript: JSON.stringify({
                steps: steps.map((s: any) => ({
                    name: s.name,
                    type: s.type,
                    description: s.description
                }))
            }),
        };

        const createdTree = await db.tree.create({
            data: {
                name: pipelineName,
                description,
                ...finalTreeData,
                createdAt: new Date(),
                type: 'PIPELINE',
                companyId: user.companyId,
            }
        });

        return { data: { ...createdTree, createdAt: createdTree.createdAt.toISOString() }, error: null };

    } catch (e) {
        const error = e instanceof Error ? e.message : 'Errore durante la conversione Excel in Pipeline.';
        console.error('Error in processExcelToPipelineAction:', e);
        return { data: null, error };
    }
}
