

'use server';

import { revalidatePath } from 'next/cache';
import { extractVariables } from '@/ai/flows/extract-variables';
import { generateDecisionTree } from '@/ai/flows/generate-decision-tree';
import { rephraseQuestion } from '@/ai/flows/rephrase-question';
import { diagnoseProblem, type DiagnoseProblemInput, type DiagnoseProblemOutput as FlowOutput } from '@/ai/flows/diagnose-problem';
import { detaiFlow, type DetaiInput } from '@/ai/flows/detai-flow';
import type { DecisionNode, StoredTree, Variable, ConsolidationProposal, VariableOption, DecisionLeaf, TriggerItem, MediaItem, LinkItem, DiagnosticNode, DiagnoseProblemOutput } from '@/lib/types';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import sql from 'mssql';

import _ from 'lodash';
import { nanoid } from 'nanoid';
import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

import { getAuthenticatedUser as getAuthUserSession } from "@/lib/session";
import { serverCache, invalidateServerTreeCache } from "@/lib/server-cache";
import { resolveTheme } from "@/lib/chart-theme";

export async function getAuthenticatedUser() {
    const user = await getAuthUserSession();
    if (!user) {
        throw new Error("Non autorizzato. Effettua il login.");
    }
    return user;
}

export async function executeEmailAction(
    connectorId: string,
    to: string,
    subject: string,
    body: string
): Promise<{ success: boolean; message: string }> {
    console.log(`[Email Simulation] Sending email via connector ${connectorId}`);
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body (truncated): ${body.substring(0, 50)}...`);

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    return {
        success: true,
        message: `Email inviata con successo a ${to}`
    };
}

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

function findNodeByQuestion(node: DecisionNode | DecisionLeaf | string | { ref: string } | { subTreeRef: string } | any, questionOrDecision: string): DecisionNode | DecisionLeaf | null {
    if (!node) return null;
    if (typeof node === 'string') return null;

    // Handle array nodes
    if (Array.isArray(node)) {
        for (const item of node) {
            const found = findNodeByQuestion(item, questionOrDecision);
            if (found) return found;
        }
        return null;
    }

    if ('ref' in node || 'subTreeRef' in node) return null;

    // Check if this node matches
    if ('question' in node && node.question === questionOrDecision) return node as DecisionNode;
    if ('decision' in node && node.decision === questionOrDecision) return node as DecisionLeaf;

    // Recurse into options
    if ('options' in node && node.options) {
        for (const key in node.options) {
            const child = node.options[key];
            const found = findNodeByQuestion(child, questionOrDecision);
            if (found) return found;
        }
    }
    return null;
}

function getLastAssistantQuestion(history: string | undefined): string | null {
    if (!history) return null;
    const lines = history.split('\n').map(s => s.trim());
    for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].toLowerCase().startsWith('assistant:')) {
            return lines[i].slice('assistant:'.length).trim();
        }
    }
    return null;
}

function findNodeById(node: any, id: string): any | null {
    if (!node) return null;
    if (typeof node === 'string') return null;

    if (Array.isArray(node)) {
        for (const item of node) {
            const found = findNodeById(item, id);
            if (found) return found;
        }
        return null;
    }

    if ('ref' in node || 'subTreeRef' in node) return null;

    if (node.id === id) return node;

    if ('options' in node && node.options) {
        for (const key in node.options) {
            const child = node.options[key];
            const found = findNodeById(child, id);
            if (found) return found;
        }
    }
    return null;
}



function formatVariablesToTable(variables: Variable[]): string {
    if (!variables || variables.length === 0) {
        return 'Nessuna variabile estratta.';
    }
    let table = 'Nome Variabile | Tipo | Valori Possibili\n';
    table += '--- | --- | ---\n';
    variables.forEach((v) => {
        const valuesString = (v.possibleValues || []).map(opt => `${opt.name} (${opt.abbreviation}, ${opt.value})`).join('; ');
        table += `${v.name} | ${v.type} | ${valuesString}\n`;
    });
    return table;
}

// Helper to sanitize JSON string by escaping control characters inside strings
function sanitizeJSONString(str: string): string {
    let result = '';
    let inString = false;
    let escaped = false;

    for (let i = 0; i < str.length; i++) {
        const char = str[i];

        if (inString) {
            if (char === '\\' && !escaped) {
                escaped = true;
                result += char;
            } else if (char === '"' && !escaped) {
                inString = false;
                result += char;
            } else {
                if (escaped) {
                    escaped = false;
                    result += char;
                } else {
                    // Check for control characters
                    const code = char.charCodeAt(0);
                    if (code <= 0x1F) {
                        if (char === '\n') result += '\\n';
                        else if (char === '\r') result += '\\r';
                        else if (char === '\t') result += '\\t';
                        else {
                            // Replace other control characters with space to avoid errors
                            result += ' ';
                        }
                    } else {
                        result += char;
                    }
                }
            }
        } else {
            if (char === '"') {
                inString = true;
            }
            result += char;
        }
    }
    return result;
}

// Helper function to extract first valid JSON from string
function extractFirstJSON(str: string): any {
    const firstOpen = str.indexOf('{');
    const firstArrayOpen = str.indexOf('[');

    if (firstOpen === -1 && firstArrayOpen === -1) return null;

    let startIndex = -1;
    if (firstOpen !== -1 && (firstArrayOpen === -1 || firstOpen < firstArrayOpen)) {
        startIndex = firstOpen;
    } else {
        startIndex = firstArrayOpen;
    }

    let braceCount = 0;
    let inString = false;
    let escaped = false;

    for (let i = startIndex; i < str.length; i++) {
        const char = str[i];

        if (inString) {
            if (char === '\\' && !escaped) {
                escaped = true;
            } else if (char === '"' && !escaped) {
                inString = false;
            } else {
                escaped = false;
            }
        } else {
            if (char === '"') {
                inString = true;
            } else if (char === '{' || char === '[') {
                braceCount++;
            } else if (char === '}' || char === ']') {
                braceCount--;
                if (braceCount === 0) {
                    const potentialJson = str.substring(startIndex, i + 1);
                    try {
                        return JSON.parse(potentialJson);
                    } catch (e) {
                        // Try to sanitize and parse again
                        try {
                            const sanitized = sanitizeJSONString(potentialJson);
                            return JSON.parse(sanitized);
                        } catch (e2) {
                            return null;
                        }
                    }
                }
            }
        }
    }
    return null;
}

// Helper for OpenRouter JSON calls
async function callOpenRouterJSON(apiKey: string, model: string, prompt: string, systemPrompt: string, maxTokens?: number): Promise<any> {
    const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
    ];

    // Try with JSON mode first
    let body: any = {
        model: model,
        messages,
        response_format: { type: "json_object" },
    };
    if (maxTokens) body.max_tokens = maxTokens;

    let response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body)
    });

    // If JSON mode fails (some models don't support it), retry without
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errMsg = errorData.error?.message || response.statusText || '';
        if (errMsg.toLowerCase().includes('json') || errMsg.toLowerCase().includes('response_format') || errMsg.toLowerCase().includes('not supported')) {
            console.warn(`[callOpenRouterJSON] JSON mode not supported by ${model}, retrying without response_format`);
            body = { model, messages };
            if (maxTokens) body.max_tokens = maxTokens;
            response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body)
            });
            if (!response.ok) {
                const errorData2 = await response.json().catch(() => ({}));
                throw new Error(`OpenRouter Error: ${errorData2.error?.message || response.statusText}`);
            }
        } else {
            throw new Error(`OpenRouter Error: ${errMsg}`);
        }
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
        throw new Error(`OpenRouter: risposta vuota dal modello ${model}`);
    }
    try {
        return JSON.parse(content);
    } catch (e) {
        // Fallback: try to extract JSON from markdown code block if present
        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[1]);
            } catch (e2) {
                // Try robust extraction on the match content
                const extracted = extractFirstJSON(jsonMatch[1]);
                if (extracted) return extracted;
            }
        }

        // Try robust extraction on the whole content
        const extracted = extractFirstJSON(content);
        if (extracted) return extracted;

        // Last resort: simple regex match (greedy) - kept for backward compatibility but risky
        const simpleMatch = content.match(/{[\s\S]*}/);
        if (simpleMatch) {
            try {
                return JSON.parse(simpleMatch[0]);
            } catch (e3) {
                // If simple match fails, it might be due to trailing garbage caught by greedy match
                // Try to extract from the matched string using robust method
                const extractedFromMatch = extractFirstJSON(simpleMatch[0]);
                if (extractedFromMatch) return extractedFromMatch;
            }
        }

        throw new Error(`Failed to parse JSON response from AI: ${e instanceof Error ? e.message : String(e)}`);
    }
}

async function processDescriptionWithOpenRouter(textDescription: string, config: { apiKey: string, model: string }) {
    // Step 1: Extract Variables
    const extractVarsSystemPrompt = `You are a highly intelligent entity tasked with parsing natural language descriptions of processes and extracting key variables. Your output MUST be in Italian.

TASK:
From the user's descriptive text provided below, identify all the distinct variables that influence the outcomes. For each variable, determine its type and list all its possible values mentioned in the text.

Follow these rules strictly:
1.  **Analyze the text**: Read the entire text to understand the logic and conditions.
2.  **Identify Variables**: A variable is a factor that can change and affects the decision-making process (e.g., "warranty status", "error code presence", "pressure level"). An 'enumeration' type variable is typically a question followed by a clear list of choices or distinct branches in the text.
3.  **Determine Type**:
    *   'boolean': For variables with two opposite states (e.g., yes/no, true/false, on/off).
    *   'enumeration': For variables with a specific, limited list of text-based options (e.g., "red", "green", "blue").
    *   'numeric': For variables representing a number.
    *   'text': For open-ended text inputs.
4.  **Structure 'possibleValues'**: For each variable, you MUST create a structured object for each possible value.
    *   'name': The name of the option (e.g., "In Garanzia").
    *   'value': Assign a progressive integer, starting from 0 for each variable's options.
    *   'abbreviation': Create a short, 3-letter abbreviation in uppercase (e.g., "GAR").
    *   **DO NOT include an 'id' field.**
5.  **CRITICAL RULE - Discard Irrelevant Variables**: You MUST ignore and discard any potential "variable" that is too generic, does not have clear, distinct options, or simply represents a final action or decision.
6.  **CRITICAL RULE - Empty Array**: If no variables are found, return \`{"variables": []}\`.
7.  **OUTPUT FORMAT**: Return ONLY a valid JSON object with the key "variables". Do not use markdown blocks.`;

    const varsResult = await callOpenRouterJSON(config.apiKey, config.model, textDescription, extractVarsSystemPrompt);

    // Add IDs to variables (client-side logic replicated)
    const variables = (varsResult.variables || []).map((v: any) => ({
        ...v,
        possibleValues: (v.possibleValues || []).map((opt: any) => ({ ...opt, id: nanoid(8) }))
    }));

    // Step 2: Generate Tree
    const variablesTable = formatVariablesToTable(variables);

    const generateTreeSystemPrompt = `You are a Business Rules Engine with natural language interpretation capabilities.
Your output, including all text in the natural language description, the JSON content (questions and decisions), and the question script, MUST be in Italian.

Task:
1. Use the variables and values from the variables table to construct a detailed and highly-branched decision tree.
2. Each node must have a 'question' and 'options'. The 'options' should lead to another node or a final 'decision'.
3. Each leaf of the tree must be a 'decision' string, or an object with a 'decision' key.
4. Provide FOUR outputs:
   a) "suggestedName": A short, descriptive name (2-5 words) for this pipeline/tree based on its main topic (e.g., "Garanzia Dispositivi", "Triage Supporto Tecnico", "Valutazione Rischio Creditizio").
   b) "naturalLanguageDecisionTree": A version in natural language.
   c) "jsonDecisionTree": A structured JSON representation (stringified or object).
   d) "questionsScript": A script of questions.

**CRITICAL RULE FOR 'jsonDecisionTree'**:
The value for the 'jsonDecisionTree' field MUST be a valid JSON structure (not a stringified JSON string inside JSON, but the actual object).

Example of 'jsonDecisionTree' structure:
{
  "question": "Is the device under warranty?",
  "options": {
    "Yes": {
      "question": "Is there accidental damage?",
      "options": { ... }
    },
    "No": { "decision": "Charge for repair." }
  }
}

**OUTPUT FORMAT**: Return ONLY a valid JSON object with keys: "suggestedName", "naturalLanguageDecisionTree", "jsonDecisionTree", "questionsScript".`;

    const treePrompt = `Input Text:
${textDescription}

Variables Table:
${variablesTable}`;

    const treeResult = await callOpenRouterJSON(config.apiKey, config.model, treePrompt, generateTreeSystemPrompt);

    // Ensure all string fields are actually strings for storage
    let jsonDecisionTreeStr = treeResult.jsonDecisionTree;
    if (typeof jsonDecisionTreeStr !== 'string') {
        jsonDecisionTreeStr = JSON.stringify(jsonDecisionTreeStr);
    }

    let naturalLanguageTreeStr = treeResult.naturalLanguageDecisionTree;
    if (typeof naturalLanguageTreeStr !== 'string') {
        naturalLanguageTreeStr = JSON.stringify(naturalLanguageTreeStr);
    }

    let questionsScriptStr = treeResult.questionsScript;
    if (typeof questionsScriptStr !== 'string') {
        questionsScriptStr = JSON.stringify(questionsScriptStr);
    }

    return {
        variables,
        suggestedName: treeResult.suggestedName || '',
        naturalLanguageDecisionTree: naturalLanguageTreeStr,
        jsonDecisionTree: jsonDecisionTreeStr,
        questionsScript: questionsScriptStr,
        debug: {
            model: config.model,
            extractVarsInput: {
                system: extractVarsSystemPrompt,
                user: textDescription
            },
            extractVarsOutput: varsResult,
            generateTreeInput: {
                system: generateTreeSystemPrompt,
                user: treePrompt
            },
            generateTreeOutput: treeResult
        }
    };
}

export async function processDescriptionAction(
    textDescription: string,
    name: string,
    type: 'RULE' | 'PIPELINE' = 'RULE',
    openRouterConfig?: { apiKey: string, model: string }
): Promise<{ data: any | null; error: string | null }> {
    try {
        const sessionUser = await getAuthenticatedUser();
        if (!sessionUser) {
            return { data: null, error: 'Non autorizzato.' };
        }

        // Fetch fresh user data from DB to avoid staleness
        const user = await db.user.findUnique({ where: { id: sessionUser.id } });
        if (!user || !user.companyId) {
            return { data: null, error: 'Utente non associato a nessuna azienda.' };
        }
        let decisionTreeResult;
        let extractedVariables = [];
        let debugInfo = null;
        let suggestedName = '';

        if (openRouterConfig && openRouterConfig.apiKey) {
            const result = await processDescriptionWithOpenRouter(textDescription, openRouterConfig);
            extractedVariables = result.variables;
            suggestedName = result.suggestedName || '';
            decisionTreeResult = {
                naturalLanguageDecisionTree: result.naturalLanguageDecisionTree,
                jsonDecisionTree: result.jsonDecisionTree,
                questionsScript: result.questionsScript
            };
            debugInfo = result.debug;

            console.log("--- DEBUG ACTION START ---");
            console.log(`Model Used: ${debugInfo.model}`);
            console.log("--- Extract Variables Input ---");
            console.log("System:", debugInfo.extractVarsInput.system);
            console.log("User:", debugInfo.extractVarsInput.user);
            console.log("--- Extract Variables Output ---");
            console.log(JSON.stringify(debugInfo.extractVarsOutput, null, 2));
            console.log("--- Generate Tree Input ---");
            console.log("System:", debugInfo.generateTreeInput.system);
            console.log("User:", debugInfo.generateTreeInput.user);
            console.log("--- Generate Tree Output ---");
            console.log(JSON.stringify(debugInfo.generateTreeOutput, null, 2));
            console.log("--- DEBUG ACTION END ---");

        } else {
            // Legacy flow (Google GenAI)
            const { variables } = await extractVariables(textDescription);
            extractedVariables = variables;
            const variablesTable = formatVariablesToTable(variables);
            decisionTreeResult = await generateDecisionTree({
                textDescription,
                variablesTable,
            });
        }

        // Final safety check: ensure all required fields are strings before Prisma
        const finalTreeData = {
            naturalLanguageDecisionTree: String(decisionTreeResult.naturalLanguageDecisionTree || ''),
            jsonDecisionTree: typeof decisionTreeResult.jsonDecisionTree === 'string'
                ? decisionTreeResult.jsonDecisionTree
                : JSON.stringify(decisionTreeResult.jsonDecisionTree || {}),
            questionsScript: typeof decisionTreeResult.questionsScript === 'string'
                ? decisionTreeResult.questionsScript
                : JSON.stringify(decisionTreeResult.questionsScript || ''),
        };

        try {
            JSON.parse(finalTreeData.jsonDecisionTree);
        } catch (e) {
            console.error("JSON non valido ricevuto dall'IA (controllo finale):", finalTreeData.jsonDecisionTree);
            return { data: null, error: "L'IA ha generato un albero decisionale JSON non valido. Prova a riformulare la tua input o a riprovare." };
        }

        // Use AI-suggested name if available, otherwise fallback to generic
        const name = suggestedName
            ? suggestedName
            : `Pipeline-${Date.now().toString().slice(-6)}`;

        const newTreeData = {
            name,
            description: textDescription,
            ...finalTreeData,
            ...finalTreeData,
            createdAt: new Date(),
            type: type,
            companyId: user.companyId
        }

        const createdTree = await db.tree.create({
            data: newTreeData
        });

        const data = { ...createdTree, createdAt: createdTree.createdAt.toISOString(), debug: debugInfo };

        return { data, error: null };

    } catch (e) {
        const error = e instanceof Error ? e.message : 'Si è verificato un errore imprevisto durante l\'analisi.';
        console.error('Error in processDescriptionAction:', e);
        return { data: null, error };
    }
}

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

        // Use OpenRouter if configured, otherwise error (this feature requires AI)
        if (!openRouterConfig || !openRouterConfig.apiKey) {
            return { data: null, error: 'Configurazione OpenRouter necessaria per questa funzione. Vai nelle impostazioni per configurare la chiave API.' };
        }

        // Load database schema if connectorId is provided
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
                // Pre-build schema text for step-level prompts
                dbSchemaText = dbSchema.tables.slice(0, 50).map(t => {
                    const parts = t.fullName.split('.');
                    const sqlName = parts.length === 2 ? `[${parts[0]}].[${parts[1]}]` : `[${t.fullName}]`;
                    const cols = t.columns.map(c => `[${c.name}] (${c.dataType}${c.isPrimaryKey ? ', PK' : ''}${c.isForeignKey && c.foreignKeyTarget ? `, FK->[${c.foreignKeyTarget.table}].[${c.foreignKeyTarget.column}]` : ''})`).join(', ');
                    return `${sqlName}: ${cols}`;
                }).join('\n');
            }
        }

        // --- FREE MODELS STRATEGY: Multi-phase approach ---
        // openrouter/free auto-selects the best available free model
        const FREE_MODELS = [
            'openrouter/free',
            'stepfun/step-3.5-flash:free',
            'arcee-ai/trinity-large-preview:free',
            'upstage/solar-pro-3:free',
            'nvidia/nemotron-3-nano-30b-a3b:free',
        ];

        const apiKey = openRouterConfig.apiKey;
        const userModel = openRouterConfig.model;

        // Helper: call AI with fallback through free models
        async function callWithFallback(prompt: string, sysPrompt: string, maxTokens: number): Promise<any> {
            // Try user's configured model first, then cycle through free models
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

        // ========== PHASE 1: Plan the pipeline steps ==========
        console.log('[EXCEL-PIPELINE] Phase 1: Planning pipeline steps...');
        console.log(`[EXCEL-PIPELINE] User model: ${userModel}, API key: ${apiKey ? apiKey.substring(0, 8) + '...' : 'MISSING'}`);

        const { systemPrompt: planSystem, userPrompt: planUser } = buildExcelAnalysisPrompt(excelAnalysis, dbSchema);
        console.log(`[EXCEL-PIPELINE] Prompt sizes: system=${planSystem.length} chars, user=${planUser.length} chars`);

        // Override: ask ONLY for the plan, not the full SQL/Python code
        // Strategy: ALL nodes are Python.
        //   - data_source sheets → Python pd.read_excel() to load the sheet
        //   - transformation/report sheets → Python pandas operations
        //   - chart sheets → Python Plotly
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
   - Questi nodi caricano i dati dal foglio Excel come DataFrame
   - Il "name" deve iniziare con "Caricamento ..." (es: "Caricamento Dati Contabili")
   - "sourceSheet" DEVE essere il nome ESATTO del foglio Excel

2. Fogli TRASFORMAZIONE → step di ELABORAZIONE:
   - type="python", pythonOutputType="table"
   - Replicano la logica Excel con pandas: groupby, merge, pivot_table
   - dependencies = i resultName dei nodi da cui prendono dati

3. Fogli GRAFICO → step di VISUALIZZAZIONE:
   - type="python", pythonOutputType="chart"
   - Creano grafici con Plotly Express

REGOLE NOMI:
- "name" = COSA fa, non il nome del foglio. Es: "Caricamento Movimenti Contabili", "Aggregazione CE per Voce", "Grafico Trend Mensile"
- "resultName" = snake_case univoco: "dati_contabili", "ce_sintetico", "grafico_trend"

REGOLE DIPENDENZE:
- I nodi CARICAMENTO NON hanno dipendenze: dependencies=[]
- I nodi elaborazione dipendono dai nodi che forniscono i dati
- I nodi grafico dipendono dalla elaborazione

NON generare pythonCode - verrà generato separatamente per ogni step.`
        );

        const planResponse = await callWithFallback(planUser, planOnlySystem, 4096);
        console.log('[EXCEL-PIPELINE] Phase 1 result:', JSON.stringify(planResponse, null, 2).substring(0, 2000));

        if (!planResponse?.steps || !Array.isArray(planResponse.steps) || planResponse.steps.length === 0) {
            return { data: null, error: 'L\'AI non ha trovato passaggi significativi nel file Excel. Prova con un file piu\' strutturato.' };
        }

        // Force all steps to Python (safety)
        for (const step of planResponse.steps) {
            step.type = 'python';
            if (!step.pythonOutputType) step.pythonOutputType = 'table';
        }

        // ========== PHASE 2: Generate Python code for each step ==========
        console.log(`[EXCEL-PIPELINE] Phase 2: Generating code for ${planResponse.steps.length} steps...`);
        console.log(`[EXCEL-PIPELINE] Excel filepath for source nodes: ${excelFilepath}`);

        const pythonCodeGenSystem = `Sei un esperto Python/pandas/Plotly. Genera SOLO codice Python in formato JSON.

REGOLE IMPORTANTI:
- I dati di input arrivano come DataFrame "df" (se c'è una sola dipendenza) o come dizionario di DataFrame (se più dipendenze)
- Per accedere a una dipendenza specifica: usa il nome della dipendenza come variabile (sarà disponibile come DataFrame)
- Per output tipo "table": il risultato deve essere un DataFrame chiamato "result"
- Per output tipo "chart": crea figura Plotly come "fig" e chiama fig.show()
- Per output tipo "html": assegna stringa HTML a "result"
- Usa pandas per replicare la logica Excel: groupby, merge, pivot_table, apply
- Scrivi codice COMPLETO e FUNZIONANTE, non pseudo-codice

DIVIETI ASSOLUTI - NON usare MAI:
- pd.read_excel() - i dati arrivano SOLO come DataFrame "df" dalla pipeline
- pd.read_csv() - stessa ragione
- open() per leggere file - non ci sono file
- Qualsiasi accesso al filesystem
I dati sono GIA' nel DataFrame "df" passato dalla pipeline. Lavora SOLO su quello.`;

        const codePromises = planResponse.steps.map(async (step: any, idx: number) => {
            const depsList = (step.dependencies || []).join(', ') || 'nessuna';
            const isSourceNode = (!step.dependencies || step.dependencies.length === 0) && step.sourceSheet;

            // Find source sheet info for context
            const sourceSheet = excelAnalysis.sheets?.find((s: any) => s.name === step.sourceSheet);
            const sheetColumns = sourceSheet?.columnHeaders?.map((h: any) => h.value).join(', ') || '';
            const sheetFormulas = sourceSheet?.formulaSamples?.slice(0, 5)?.map((f: any) => f.translated || f.formula).join('\n  ') || '';

            if (isSourceNode) {
                // SOURCE NODE: Generate pd.read_excel() code directly — no AI call needed
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
                // TRANSFORMATION/CHART NODE: Call AI to generate pandas/plotly code
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

export async function rephraseQuestionAction(question: string, context: string, openRouterConfig?: { apiKey: string, model: string }): Promise<{ data: string | null, error: string | null }> {
    try {
        if (openRouterConfig && openRouterConfig.apiKey) {
            const systemPrompt = `You are an AI assistant designed to rephrase questions for clarity or suggest related options.
  You MUST respond in Italian.
  
  Please provide a rephrased question that is easier to understand or suggest a few related options that the user can choose from.
  Ensure the rephrased question or suggested options are clear and concise.
  Output should be a single string in a JSON object with key "rephrasedQuestion".`;

            const prompt = `Original Question: ${question}\nContext: ${context}`;

            const result = await callOpenRouterJSON(openRouterConfig.apiKey, openRouterConfig.model, prompt, systemPrompt);
            return { data: result.rephrasedQuestion, error: null };
        } else {
            const result = await rephraseQuestion({ question, context });
            return { data: result.rephrasedQuestion, error: null };
        }
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Si è verificato un errore imprevisto durante la riformulazione.';
        console.error('Error in rephraseQuestionAction:', e);
        return { data: null, error };
    }
}

export async function getTreesAction(ids?: string[], type?: string, lightweight?: boolean): Promise<{ data: StoredTree[] | null; error: string | null; }> {
    try {
        const user = await getAuthenticatedUser();
        const now = Date.now();

        // Check cache first (only for full queries without filters)
        if (!ids && !type && !lightweight && serverCache.trees && (now - serverCache.treesTimestamp) < serverCache.CACHE_DURATION) {
            return { data: serverCache.trees, error: null };
        }

        const whereClause: any = { companyId: user.companyId };
        if (type) whereClause.type = type;

        // Lightweight mode: only fetch fields needed for listing (excludes heavy JSON/text fields)
        const selectClause = lightweight ? {
            id: true, name: true, description: true, type: true, createdAt: true, companyId: true,
        } : undefined;

        let treesData;

        if (ids && ids.length > 0) {
            treesData = await db.tree.findMany({
                where: { id: { in: ids }, companyId: user.companyId },
                orderBy: { createdAt: 'desc' },
                ...(selectClause && { select: selectClause }),
            });
        } else {
            treesData = await db.tree.findMany({
                where: whereClause,
                orderBy: { createdAt: 'desc' },
                ...(selectClause && { select: selectClause }),
            });
        }

        const trees: StoredTree[] = treesData.map(t => ({
            ...t,
            // Fill in empty strings for fields excluded by lightweight select
            jsonDecisionTree: (t as any).jsonDecisionTree ?? '',
            naturalLanguageDecisionTree: (t as any).naturalLanguageDecisionTree ?? '',
            questionsScript: (t as any).questionsScript ?? '',
            createdAt: t.createdAt.toISOString()
        }));

        // Update cache only for full (non-lightweight) queries without filters
        if (!ids && !type && !lightweight) {
            serverCache.trees = trees;
            serverCache.treesTimestamp = now;
        }

        return { data: trees, error: null };
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Si è verificato un errore imprevisto durante il recupero degli alberi.';
        console.error("Error in getTreesAction: ", e);
        return { data: null, error };
    }
}

export async function getTreeAction(id: string, forceRefresh = false): Promise<{ data: StoredTree | null; error: string | null; }> {
    try {
        const user = await getAuthenticatedUser();
        if (typeof id !== 'string' || !id) {
            return { data: null, error: 'ID albero non valido fornito.' };
        }

        // Check per-tree cache first (avoids N+1 queries from multiple widget renderers)
        const now = Date.now();
        if (!forceRefresh) {
            const cached = serverCache.treeById.get(id);
            if (cached && (now - cached.timestamp) < serverCache.CACHE_DURATION) {
                return { data: cached.data, error: null };
            }
        }

        const treeData = await db.tree.findFirst({
            where: {
                id,
                companyId: user.companyId
            }
        });

        if (!treeData) {
            return { data: null, error: 'Albero decisionale non trovato.' };
        }

        const tree: StoredTree = {
            ...treeData,
            type: (treeData as any).type || 'RULE',
            createdAt: treeData.createdAt.toISOString()
        };

        // Cache this tree
        serverCache.treeById.set(id, { data: tree, timestamp: now });

        return { data: tree, error: null };
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Si è verificato un errore imprevisto.';
        console.error("Error in getTreeAction: ", e);
        return { data: null, error };
    }
}


export async function updateTreeNodeAction({
    treeId,
    nodePath,
    nodeData,
}: {
    treeId: string;
    nodePath: string;
    nodeData: string;
}): Promise<{ success: boolean; error: string | null; data?: StoredTree }> {
    try {
        const user = await getAuthenticatedUser();
        console.log("updateTreeNodeAction called:", { treeId, nodePath, nodeData: nodeData?.substring(0, 50) });
        if (!treeId || !nodePath) {
            throw new Error("Dati mancanti per l'aggiornamento del nodo.");
        }

        // Only fetch the fields we need for the update (skip heavy description/questionsScript)
        const treeToUpdate = await db.tree.findFirst({
            where: {
                id: treeId,
                companyId: user.companyId
            },
            select: { id: true, jsonDecisionTree: true, name: true }
        });

        if (!treeToUpdate) {
            throw new Error("Albero non trovato.");
        }

        let jsonTree = JSON.parse(treeToUpdate.jsonDecisionTree);

        const lodashPath = nodePath.replace(/^root\.?/, '');

        let parsedNodeData: any;
        try {
            parsedNodeData = nodeData ? JSON.parse(nodeData) : null;
        } catch (e) {
            throw new Error("I dati del nodo forniti non sono un JSON valido.");
        }

        if (nodePath === 'root') {
            if (parsedNodeData && typeof parsedNodeData === 'object' && !Array.isArray(parsedNodeData) && 'name' in parsedNodeData) {
                // Name-only update: lightweight select to avoid returning heavy fields
                const updated = await db.tree.update({
                    where: { id: treeId },
                    data: { name: parsedNodeData.name },
                    select: { id: true, name: true, description: true, type: true, createdAt: true, companyId: true, naturalLanguageDecisionTree: true, questionsScript: true, jsonDecisionTree: true }
                });
                invalidateServerTreeCache(treeId);
                const updatedTree: StoredTree = { ...updated, type: (updated as any).type || 'RULE', createdAt: updated.createdAt.toISOString() };
                return { success: true, error: null, data: updatedTree };
            }
            jsonTree = { ...jsonTree, ...parsedNodeData };
        } else {
            if (parsedNodeData === null) { // Deletion case
                _.unset(jsonTree, lodashPath);
            } else {
                // Circular Dependency Check
                const newRefs = extractSubTreeRefs(parsedNodeData);
                if (newRefs.length > 0) {
                    try {
                        // Check all introduced references
                        for (const ref of newRefs) {
                            await checkSubTreeCycle(treeId, ref);
                        }
                    } catch (e) {
                        const error = e instanceof Error ? e.message : "Rilevato ciclo di dipendenze.";
                        return { success: false, error: error };
                    }
                }
                _.set(jsonTree, lodashPath, parsedNodeData);
            }
        }

        const updatedJsonStr = JSON.stringify(jsonTree);

        // Use select to only return lightweight fields from RETURNING clause
        // This avoids PostgreSQL re-reading heavy TOAST'd columns
        const updated = await db.tree.update({
            where: { id: treeId },
            data: {
                jsonDecisionTree: updatedJsonStr,
            },
            select: { id: true, name: true, description: true, type: true, createdAt: true, companyId: true, naturalLanguageDecisionTree: true, questionsScript: true }
        });

        // Invalidate server-side tree cache so widgets get fresh data
        invalidateServerTreeCache(treeId);

        // Reconstruct StoredTree with the jsonDecisionTree we already have in memory
        // (avoids re-reading the large JSON from DB via RETURNING)
        const updatedTree: StoredTree = {
            ...updated,
            jsonDecisionTree: updatedJsonStr,
            type: (updated as any).type || 'RULE',
            createdAt: updated.createdAt.toISOString()
        };

        return { success: true, error: null, data: updatedTree };

    } catch (e) {
        const error = e instanceof Error ? e.message : "Si è verificato un errore imprevisto durante l'aggiornamento.";
        console.error("Error in updateTreeNodeAction: ", e);
        return { success: false, error: error.toString() };
    }
}

// Helper to check for circular dependencies in sub-trees
async function checkSubTreeCycle(originalTreeId: string, treeIdToCheck: string, visited: Set<string> = new Set()) {
    if (treeIdToCheck === originalTreeId) {
        throw new Error("Errore: Rilevato riferimento circolare. L'albero non può contenere se stesso (direttamente o indirettamente).");
    }

    if (visited.has(treeIdToCheck)) return;
    visited.add(treeIdToCheck);

    const treeData = await db.tree.findUnique({ where: { id: treeIdToCheck } });
    if (!treeData) return;

    if (!treeData.jsonDecisionTree) return;

    let jsonTree;
    try {
        jsonTree = JSON.parse(treeData.jsonDecisionTree);
    } catch {
        return;
    }

    // Use the improved extractor to traverse the fetched tree
    const subRefs = extractSubTreeRefs(jsonTree);
    for (const ref of subRefs) {
        await checkSubTreeCycle(originalTreeId, ref, visited);
    }
}

function extractSubTreeRefs(node: any): string[] {
    let refs: string[] = [];
    if (!node || typeof node !== 'object') return refs;

    // Handle arrays (e.g. multiple actions or children)
    if (Array.isArray(node)) {
        node.forEach(child => {
            refs = [...refs, ...extractSubTreeRefs(child)];
        });
        return refs;
    }

    if (node.subTreeRef) {
        refs.push(node.subTreeRef);
    }

    if (node.options) {
        Object.values(node.options).forEach(child => {
            refs = [...refs, ...extractSubTreeRefs(child)];
        });
    }
    return refs;
}

// Action to regenerate the natural language description from a JSON decision tree
export async function regenerateNaturalLanguageAction(
    treeId: string,
    openRouterConfig?: { apiKey: string, model: string }
): Promise<{ success: boolean; error: string | null; data?: string }> {
    try {
        if (!treeId) {
            throw new Error("ID albero mancante.");
        }

        const treeDoc = await db.tree.findUnique({ where: { id: treeId } });
        if (!treeDoc) {
            throw new Error("Albero non trovato.");
        }

        const treeData = treeDoc;
        const jsonDecisionTree = treeData.jsonDecisionTree;

        const systemPrompt = `Sei un assistente che deve creare una descrizione testuale in linguaggio naturale di un albero decisionale.

**REGOLE IMPORTANTI**:
1. Leggi attentamente il JSON dell'albero decisionale fornito.
2. Scrivi una descrizione FLUIDA e DISCORSIVA in italiano che spiega il processo decisionale.
3. **CRITICO**: Ogni volta che menzioni il TESTO ESATTO di una domanda o di una decisione proveniente dall'albero, devi racchiuderlo tra marcatori [[node:...]] così:
   - Per domande: "Prima si chiede [[node:Il dispositivo è in garanzia?]]"
   - Per decisioni: "La soluzione è [[node:Sostituire il componente]]"
   - Per opzioni: "Se l'utente risponde [[node:Sì]]"
4. Il testo descrittivo/connettivo (es. "Prima si verifica", "poi si procede", "in questo caso") deve restare SENZA marcatori.
5. Sii completo: copri TUTTI i percorsi dell'albero.
6. Mantieni un tono professionale e chiaro.

**OUTPUT**: Restituisci SOLO un oggetto JSON con la chiave "naturalLanguageDecisionTree" contenente la descrizione.`;

        const userPrompt = `Ecco l'albero decisionale da descrivere:

${jsonDecisionTree}

Genera la descrizione in linguaggio naturale seguendo le regole sopra.`;

        let newDescription: string;

        if (openRouterConfig && openRouterConfig.apiKey) {
            const result = await callOpenRouterJSON(
                openRouterConfig.apiKey,
                openRouterConfig.model,
                userPrompt,
                systemPrompt
            );
            newDescription = result.naturalLanguageDecisionTree || result.description || "";
        } else {
            // Use Genkit/Gemini
            const { output } = await ai.generate({
                model: 'googleai/gemini-1.5-flash-latest',
                prompt: userPrompt,
                system: systemPrompt,
                output: {
                    schema: z.object({
                        naturalLanguageDecisionTree: z.string().describe("La descrizione in linguaggio naturale dell'albero decisionale.")
                    })
                }
            });
            newDescription = output?.naturalLanguageDecisionTree || "";
        }

        if (!newDescription) {
            throw new Error("L'IA non ha generato una descrizione valida.");
        }

        // Update the tree with the new description
        await db.tree.update({
            where: { id: treeId },
            data: {
                naturalLanguageDecisionTree: newDescription
            }
        });

        return { success: true, error: null, data: newDescription };

    } catch (e) {
        const error = e instanceof Error ? e.message : "Si è verificato un errore imprevisto durante la rigenerazione.";
        console.error("Error in regenerateNaturalLanguageAction: ", e);
        return { success: false, error: error.toString() };
    }
}

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


// --- AI DIAGNOSIS ACTION ---
export interface DiagnoseProblemActionInput {
    id: string;
    decisionTree: StoredTree;
    userState: Record<string, any>;
    userProblem?: string;
    currentAnswer?: string;
    history: string | { speaker: 'user' | 'bot', text: string }[];
}

export async function diagnoseProblemAction(input: Omit<DiagnoseProblemActionInput, 'decisionTree'> & { specificTreeId?: string; previousNodeId?: string }, openRouterConfig?: { apiKey: string, model: string }): Promise<{ data: DiagnoseProblemOutput | null; error: string | null; }> {
    try {
        const allTreesResult = await getTreesAction(); // Fetch ALL trees for diagnosis context

        if (allTreesResult.error || !allTreesResult.data) {
            throw new Error(allTreesResult.error || 'Nessun albero decisionale disponibile per la diagnosi.');
        }

        const user = await getAuthenticatedUser();
        const trees = allTreesResult.data;

        // Construct a richer prompt with ALL trees available
        let treesContext = "";
        trees.forEach(t => {
            treesContext += `Tree Name: ${t.name} (ID: ${t.id})\nDescription: ${t.description}\nNatural Language Logic: ${t.naturalLanguageDecisionTree}\n\n`;
        });

        const systemPrompt = `Sei un esperto operatore di supporto italiano. Il tuo compito è diagnosticare il problema dell'utente utilizzando le logiche decisionali fornite.
Obiettivo: Identificare la causa del problema o guidare l'utente alla soluzione/decisione corretta facendo UNA domanda alla volta basata sugli alberi decisionali.

LOGICHE DECISIONALI DISPONIBILI:
${treesContext}

REGOLE GUIDA:
1. Analizza la richiesta dell'utente e la cronologia.
2. Identifica quale albero decisionale è più pertinente (se non è chiaro, chiedi chiarimenti).
3. Se l'utente è all'inizio, fai la prima domanda dell'albero pertinente.
4. Se l'utente ha già risposto, segui la logica dell'albero verso il nodo successivo.
5. Se arrivi a una decisione/soluzione finale, presentala chiaramente.
6. Se servono dati esterni (non ancora implementati), chiedi all'utente di controllarli.
7. Sii cortese, professionale e conciso. Rispondi in Italiano.

FORMATO RISPOSTA (JSON):
{
  "question": "La domanda da porre all'utente o la soluzione finale",
  "options": ["Opzione 1", "Opzione 2"], // Opzionale, se ci sono scelte predefinite
  "isFinalDecision": boolean, // true se è una soluzione/decisione finale, false se è una domanda
  "treeName": "Nome dell'albero usato (opzionale)"
}`;

        // Handle both string and array history
        const formattedHistory = Array.isArray(input.history)
            ? input.history.map(h => `${h.speaker.toUpperCase()}: ${h.text}`).join('\n')
            : input.history;

        const userPrompt = `Stato Utente: ${JSON.stringify(input.userState || {})}
Problema Iniziale: ${input.userProblem || ''}
Risposta Corrente: ${input.currentAnswer || ''}
Cronologia Chat:
${formattedHistory}

Diagnostica il prossimo passo.`;


        let diagnosisOutput: DiagnoseProblemOutput | null = null;

        if (openRouterConfig && openRouterConfig.apiKey) {
            const result = await callOpenRouterJSON(
                openRouterConfig.apiKey,
                openRouterConfig.model,
                userPrompt,
                systemPrompt
            );
            // Best effort mapping from generic JSON to our specific output structure
            if (result) {
                diagnosisOutput = {
                    question: result.question || result.text || "Non ho capito, puoi ripetere?",
                    options: result.options,
                    isFinalDecision: result.isFinalDecision || false,
                    treeName: result.treeName
                }
            }
        } else {
            // Use Genkit/Gemini
            const { output } = await ai.generate({
                model: 'googleai/gemini-1.5-flash-latest',
                prompt: userPrompt,
                system: systemPrompt,
                output: {
                    schema: z.object({
                        question: z.string(),
                        options: z.array(z.string()).optional(),
                        isFinalDecision: z.boolean(),
                        treeName: z.string().optional()
                    })
                }
            });
            diagnosisOutput = output as DiagnoseProblemOutput;
        }

        if (!diagnosisOutput || (!diagnosisOutput.question)) {
            return { data: null, error: "L'IA non ha generato una risposta valida." };
        }

        return { data: diagnosisOutput, error: null };

    } catch (e) {
        const error = e instanceof Error ? e.message : "Si è verificato un errore imprevisto durante la diagnosi.";
        console.error("Error in diagnoseProblemAction: ", e);
        return { data: null, error: error.toString() };
    }
}



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
        let user: any = null;

        if (_bypassAuth) {
            // System Context: Infer company from connector
            if (connectorId) {
                const conn = await db.connector.findUnique({ where: { id: connectorId } });
                if (conn) {
                    user = { id: 'system-scheduler', companyId: conn.companyId };
                }
            }
            // If connectorId is missing or not found, we might have issues finding company-scoped resources.
            // But we'll proceed and let the findFirst below handle it (or return null).
            if (!user) user = { id: 'system-scheduler', companyId: 'system-override' };
        } else {
            user = await getAuthenticatedUser();
        }

        let connector;
        if (connectorId) {
            connector = await db.connector.findFirst({
                where: {
                    id: connectorId,
                    companyId: user.companyId !== 'system-override' ? user.companyId : undefined,
                    type: 'SQL'
                }
            });
        } else {
            // --- CONNECTOR INHERITANCE ---
            // If no connector is specified, try to inherit one from a SQL dependency
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
                        companyId: user.companyId !== 'system-override' ? user.companyId : undefined,
                        type: 'SQL'
                    }
                });
            }

            if (!connector) {
                // Fallback to first available SQL connector
                connector = await db.connector.findFirst({
                    where: {
                        companyId: user.companyId !== 'system-override' ? user.companyId : undefined,
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
                trustServerCertificate: true,
                connectTimeout: 60000,  // 1 minute to connect
                requestTimeout: 600000  // 10 minutes for very complex queries with CTE/XML
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

        // Use a Transaction to keep the session alive for Global Temp Tables (##)
        // This ensures they are not dropped prematurely and are visible to Python scripts
        transaction = new sql.Transaction(pool);
        await transaction.begin();
        const request = new sql.Request(transaction);

        // Flatten all dependencies (including nested ones) to ensure all temp tables are created
        const flattenDependencies = (deps: any[], result: any[] = [], seen: Set<string> = new Set()): any[] => {
            for (const dep of deps) {
                // First process nested dependencies (they need to be created BEFORE the current one)
                if (dep.pipelineDependencies && dep.pipelineDependencies.length > 0) {
                    flattenDependencies(dep.pipelineDependencies, result, seen);
                }
                // Add current dep if not already seen
                if (!seen.has(dep.tableName)) {
                    seen.add(dep.tableName);
                    result.push(dep);
                }
            }
            return result;
        };

        // Flatten and deduplicate all dependencies
        const allDeps = pipelineDependencies ? flattenDependencies(pipelineDependencies) : [];

        // Execute Pipeline Dependencies in order
        const nameMap = new Map<string, string>();
        const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // Robust table replacement that handles:
        // 1. Bracketed names: [Name] (ignores schema like dbo.[Name])
        // 2. Unbracketed names: Name (with word boundaries)
        // 3. Any context (FROM, JOIN, comma lists, etc.)
        const replaceTableRef = (sqlText: string, originalName: string, tempName: string) => {
            const escaped = escapeRegExp(originalName);

            // Regex for [Name] (consuming optional schema prefix)
            // Matches: [dbo].[Name], dbo.[Name], [Name]
            const bracketPattern = `((?:\\[[^\\]]+\\]|\\w+)\\.)?\\[${escaped}\\]`;
            const bracketRegex = new RegExp(bracketPattern, 'gi');

            // Regex for Name (consuming optional schema prefix)
            // Matches: dbo.Name, Name
            // Note: \\b is crucial for unbracketed names
            const unbracketedPattern = `((?:\\[[^\\]]+\\]|\\w+)\\.)?\\b${escaped}\\b`;
            const unbracketedRegex = new RegExp(unbracketedPattern, 'gi');

            let newText = sqlText;

            // Replace bracketed first (most specific)
            newText = newText.replace(bracketRegex, tempName);

            // Replace unbracketed
            newText = newText.replace(unbracketedRegex, tempName);

            return newText;
        };

        if (allDeps.length > 0) {
            console.log(`[PIPELINE] Executing ${allDeps.length} flattened dependencies: ${allDeps.map(d => d.tableName).join(', ')}`);


            for (const dep of allDeps) {
                // Use unique naming to prevent collisions
                const uniqueId = new Date().getTime().toString().slice(-6) + Math.floor(Math.random() * 1000).toString(); // Add random for extra safety
                const sanitizedName = dep.tableName.replace(/[^a-zA-Z0-9_]/g, '_');
                const tempTableName = `##${sanitizedName}_${uniqueId}`;
                nameMap.set(dep.tableName, tempTableName);

                // FIX: Register all possible name variants as aliases
                // Nodes can be referenced by: tableName (pythonResultName/sqlResultName), 
                // nodeName (question/decision), or displayName (node.name)
                // e.g. node "Pipeline Prodotto" has pythonResultName "PIPELINEUP", question "UP"
                // SQL queries may reference any of these names
                if (dep.nodeName && dep.nodeName !== dep.tableName && !nameMap.has(dep.nodeName)) {
                    nameMap.set(dep.nodeName, tempTableName);
                    console.log(`[PIPELINE] Registered alias (nodeName): "${dep.nodeName}" -> ${tempTableName}`);
                }
                if (dep.displayName && dep.displayName !== dep.tableName && dep.displayName !== dep.nodeName && !nameMap.has(dep.displayName)) {
                    nameMap.set(dep.displayName, tempTableName);
                    console.log(`[PIPELINE] Registered alias (displayName): "${dep.displayName}" -> ${tempTableName}`);
                }

                console.log(`[PIPELINE] Materializing: ${tempTableName} (isPython: ${dep.isPython}, hasPythonCode: ${!!dep.pythonCode}, hasQuery: ${!!dep.query})`);

                try {
                    // Drop if exists (paranoid check) - Execute on Transaction
                    await request.query(`IF OBJECT_ID('tempdb..${tempTableName}') IS NOT NULL DROP TABLE ${tempTableName};`);

                    let rowsToInsert: any[] = [];
                    let columns: string[] = [];

                    if (dep.data && Array.isArray(dep.data)) {
                        // --- PRE-CALCULATED DATA (OPTIMIZATION) ---
                        console.log(`[PIPELINE] >>> USING PRE-CALCULATED DATA for ${dep.tableName}`);
                        rowsToInsert = dep.data;
                        if (rowsToInsert.length > 0) {
                            columns = Object.keys(rowsToInsert[0]);
                        } else {
                            console.warn(`[PIPELINE] Pre-calculated data for ${dep.tableName} is empty.`);
                        }

                    } else if (dep.isPython && dep.pythonCode) {
                        // --- PYTHON DEPENDENCY ---
                        console.log(`[PIPELINE] >>> ENTERING PYTHON BRANCH for ${dep.tableName}`);
                        console.log(`[PIPELINE] Executing Python dependency for ${dep.tableName}...`);

                        // We need to pass dependencies TO the Python script too?
                        // visual-tree.tsx constructs 'pipelineDependencies' for each node, containing its ancestors.
                        // So we pass that recursively.
                        const pythonResult = await executePythonPreviewAction(
                            dep.pythonCode,
                            'table',
                            {}, // inputData (handled inside by dependencies?) No, executePythonPreviewAction handles dependencies param
                            dep.pipelineDependencies, // Recursive dependencies
                            dep.connectorId // Pass connector ID for HubSpot/other API tokens
                        );

                        if (!pythonResult.success) {
                            throw new Error(`Python dependency error: ${pythonResult.error}`);
                        }

                        if (pythonResult.data && Array.isArray(pythonResult.data) && pythonResult.data.length > 0) {
                            rowsToInsert = pythonResult.data;
                            columns = Object.keys(rowsToInsert[0]);
                        } else {
                            console.warn(`[PIPELINE] Python dependency ${dep.tableName} returned no data.`);
                        }

                    } else if (dep.query) {
                        // --- SQL DEPENDENCY ---
                        console.log(`[PIPELINE] >>> ENTERING SQL BRANCH for ${dep.tableName}`);
                        // Execute the source query and capture into temp table
                        // For complex scripts with dynamic SQL, we wrap differently
                        let sourceQuery = dep.query.trim();

                        // Replace usage of PREVIOUS dependencies with their unique temp names
                        for (const [orig, temp] of nameMap.entries()) {
                            // Avoid replacing itself if recursive (shouldn't happen in DAG)
                            if (orig === dep.tableName) continue;

                            sourceQuery = replaceTableRef(sourceQuery, orig, temp);
                        }

                        // 🔥 FIX: Use transaction request instead of pool.request() 
                        // This ensures temp tables created in the transaction are visible
                        console.log(`[PIPELINE] Executing SQL query for ${dep.tableName} (using transaction request)...`);
                        const result = await request.query(sourceQuery);
                        console.log(`[PIPELINE] SQL query completed for ${dep.tableName}, rows: ${result.recordset?.length || 0}`);
                        if (result.recordset && result.recordset.length > 0) {
                            rowsToInsert = result.recordset;
                            columns = Object.keys(rowsToInsert[0]);
                        } else {
                            console.warn(`[PIPELINE] SQL Source query for ${dep.tableName} returned no data.`);
                        }
                    } else {
                        // --- NEITHER PYTHON NOR SQL ---
                        console.error(`[PIPELINE] ⚠️ WARNING: ${dep.tableName} has isPython=${dep.isPython} but NO pythonCode and NO query! This node will produce no data.`);
                    }

                    // --- MATERIALIZE INTO TEMP TABLE ---
                    // Execute on TRANSACTION to keep checks alive
                    if (rowsToInsert.length > 0) {
                        // Build CREATE TABLE statement from actual data
                        // Build CREATE TABLE statement from actual data
                        // FIX: Scan up to 100 rows to determine type more reliably
                        // because first row might be null or have a different type than subsequent rows
                        const colDefs = columns.map(col => {
                            let determinedType = 'NVARCHAR(MAX)';
                            // FAIL-SAFE STRATEGY: 
                            // Always use NVARCHAR(MAX) for Python/External data previews.
                            // Trying to infer types (BIGINT/FLOAT) causes "Arithmetic overflow" or "Conversion failed" 
                            // too often with dirty data (common in Excel/SharePoint).
                            // Users can explicitly CAST() in their SQL query if they need math.
                            // e.g. SELECT CAST(Price AS FLOAT) * 2 FROM ...

                            determinedType = 'NVARCHAR(MAX)';

                            return `[${col}] ${determinedType}`;
                        }).join(', ');

                        await request.query(`CREATE TABLE ${tempTableName} (${colDefs});`);
                        console.log(`[PIPELINE] Created ${tempTableName} (${columns.length} cols)`);
                        createdTempTables.push(tempTableName);

                        // Insert data in batches to avoid query size limits
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
                                    // Escape single quotes for SQL
                                    return `N'${String(v).replace(/'/g, "''")}'`;
                                }).join(', ');
                                return `(${vals})`;
                            }).join(', ');

                            // T-SQL INSERT can handle multiple values
                            if (values.length > 0) {
                                try {
                                    await request.query(`INSERT INTO ${tempTableName} VALUES ${values};`);
                                } catch (err: any) {
                                    console.error(`[PIPELINE ERROR] Failed to insert batch into ${tempTableName}:`, err);
                                    // Log a snippet of values to debug
                                    console.log(`[PIPELINE DEBUG] First value in failing batch: ${values.substring(0, 200)}...`);
                                    throw err;
                                }
                            }
                        }

                        console.log(`[PIPELINE] Created ${tempTableName} with ${rowsToInsert.length} rows`);
                    } else {
                        // Create an EMPTY temp table so queries referencing it don't fail
                        // We use a generic schema since we don't have data to infer from
                        console.log(`[PIPELINE] Creating EMPTY temp table ${tempTableName} (no data from source)`);
                        await request.query(`CREATE TABLE ${tempTableName} ([_empty_placeholder] NVARCHAR(1));`);
                        createdTempTables.push(tempTableName);
                    }

                } catch (depError) {
                    console.error(`[PIPELINE] Error materializing ${dep.tableName}:`, depError);
                    throw new Error(`Errore nell'esecuzione della dipendenza "${dep.tableName}": ${depError instanceof Error ? depError.message : 'Errore sconosciuto'}`);
                }
            }
        }

        // Execute main query
        let finalQuery = query.trim();

        // Replace pipeline table references with global temp table names
        if (nameMap.size > 0) {
            for (const [originalName, tempName] of nameMap.entries()) {
                finalQuery = replaceTableRef(finalQuery, originalName, tempName);
            }
        }

        // SERVER-SIDE CROSS-TREE DEPENDENCY RESOLUTION
        // After all known deps are materialized, check if the query still references
        // table names that aren't resolved. Search ALL trees in the DB for matching nodes.
        if (user) {
            // Extract potential table names from the query that aren't in nameMap
            const knownNames = new Set([...nameMap.keys(), ...nameMap.values()].map(n => n.toUpperCase()));
            // Match FROM/JOIN/UNION table references (simple heuristic)
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
                console.log(`[PIPELINE] Found unresolved table references in query: ${unresolvedNames.join(', ')}. Searching all trees...`);
                try {
                    const companyId = user.companyId !== 'system-override' ? user.companyId : undefined;
                    const allTreeRecords = await db.tree.findMany({
                        where: companyId ? { companyId } : undefined,
                        select: { jsonDecisionTree: true }
                    });

                    // Flatten all tree nodes to find matching result names
                    const flattenTreeNodes = (node: any, results: any[] = []): any[] => {
                        if (!node || typeof node !== 'object') return results;
                        if (node.sqlResultName || node.pythonResultName || node.sqlQuery || node.pythonCode) {
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
                            n.sqlResultName === unresolvedName || n.pythonResultName === unresolvedName
                        );

                        if (matchingNode) {
                            console.log(`[PIPELINE] Found cross-tree node for "${unresolvedName}" (sqlQuery: ${!!matchingNode.sqlQuery}, pythonCode: ${!!matchingNode.pythonCode})`);

                            const uniqueId = Date.now().toString().slice(-6) + Math.floor(Math.random() * 1000);
                            const sanitizedName = unresolvedName.replace(/[^a-zA-Z0-9_]/g, '_');
                            const tempTableName = `##${sanitizedName}_${uniqueId}`;

                            let rowsToInsert: any[] = [];
                            let columns: string[] = [];

                            if (matchingNode.pythonCode) {
                                const pyRes = await executePythonPreviewAction(
                                    matchingNode.pythonCode, 'table', {},
                                    matchingNode.pipelineDependencies || [],
                                    matchingNode.connectorId || matchingNode.pythonConnectorId
                                );
                                if (pyRes.success && pyRes.data && Array.isArray(pyRes.data) && pyRes.data.length > 0) {
                                    rowsToInsert = pyRes.data;
                                    columns = Object.keys(rowsToInsert[0]);
                                }
                            } else if (matchingNode.sqlQuery) {
                                // Execute with a separate request on the same transaction
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
                                console.log(`[PIPELINE] Cross-tree node "${unresolvedName}" found but returned no data, creating empty table`);
                                await request.query(`CREATE TABLE ${tempTableName} ([_empty] NVARCHAR(1));`);
                                createdTempTables.push(tempTableName);
                                nameMap.set(unresolvedName, tempTableName);
                                finalQuery = replaceTableRef(finalQuery, unresolvedName, tempTableName);
                            }
                        } else {
                            console.warn(`[PIPELINE] No node found for unresolved table "${unresolvedName}" in any tree`);
                        }
                    }
                } catch (crossTreeError) {
                    console.error(`[PIPELINE] Cross-tree resolution error:`, crossTreeError);
                    // Continue with original query - will fail with the original error
                }
            }
        }

        console.log(`[PIPELINE] Executing main query (nameMap: ${JSON.stringify(Object.fromEntries(nameMap))}):\n${finalQuery.substring(0, 500)}`);
        // Use the Transaction Request for the Main Query too!
        const result = await request.query(finalQuery);

        // If successful, Commit the transaction (this might drop temp tables depending on driver, but we are done)
        await transaction.commit();

        return { data: result.recordset, error: null };

    } catch (e) {
        const error = e instanceof Error ? e.message : "Errore durante l'esecuzione della query.";
        console.error("Execute SQL Preview Error:", e);

        // Rollback transaction on error
        if (transaction) {
            try {
                await transaction.rollback();
            } catch (rbError) {
                console.warn("Rollback error:", rbError);
            }
        }
        return { data: null, error };
    } finally {
        // Cleanup temp tables
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

// New action to just fetch schema
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

            // Sanitize table names
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

// --- SQL EXPORT ACTION ---
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

        // Fetch target connector
        const whereClause: any = { id: targetConnectorId, type: 'SQL' };
        if (user) {
            whereClause.companyId = user.companyId;
        }

        const connector = await db.connector.findFirst({
            where: whereClause
        });

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

        // Build SQL config
        const sqlConfig: sql.config = {
            user: conf.user || conf.username,
            password: conf.password,
            server: conf.host || conf.server,
            database: conf.database,
            options: {
                encrypt: conf.host && conf.host.includes('database.windows.net'),
                trustServerCertificate: true,
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

        // Get column names from first row
        const columns = Object.keys(sourceData[0]);
        const sanitizedTableName = targetTableName.replace(/[^a-zA-Z0-9_]/g, '_');

        // Create table if requested
        if (createTableIfNotExists) {
            // Infer column types (simplified: everything is NVARCHAR(MAX) for safety)
            const columnDefs = columns.map(col => {
                const sanitizedCol = col.trim().replace(/[^a-zA-Z0-9_ ]+/g, "");
                return `[${sanitizedCol}] NVARCHAR(MAX)`;
            }).join(', ');

            // OVERWRITE MODE: Drop and Recreate
            const dropTableSql = `
                IF OBJECT_ID('[${sanitizedTableName}]', 'U') IS NOT NULL
                    DROP TABLE [${sanitizedTableName}]
            `;
            await pool.request().query(dropTableSql);

            const createTableSql = `CREATE TABLE [${sanitizedTableName}] (${columnDefs})`;
            await pool.request().query(createTableSql);
            console.log(`[SQL-EXPORT] Table ${sanitizedTableName} recreated.`);


        }

        // Insert data in batches (to avoid parameter limit of 2100)
        // Calculate safe batch size based on column count
        // Max params = 2100. Let's use 2000 to be safe.
        // BatchSize = 2000 / NumColumns

        const MAX_PARAMS = 2000;
        const numColumns = columns.length;
        const calculatedBatchSize = Math.floor(MAX_PARAMS / (numColumns || 1));
        // Clamp batch size between 1 and 1000 (standard limit for row-value constructor is usually 1000 rows too)
        const BATCH_SIZE = Math.max(1, Math.min(1000, calculatedBatchSize));

        console.log(`[SQL-EXPORT] Dynamic Batch Size: ${BATCH_SIZE} (Columns: ${numColumns})`);

        let totalInserted = 0;

        for (let i = 0; i < sourceData.length; i += BATCH_SIZE) {
            const batch = sourceData.slice(i, i + BATCH_SIZE);
            const request = pool.request();

            // Build multi-row INSERT using VALUES
            const valueRows: string[] = [];

            batch.forEach((row, batchIdx) => {
                const rowValues: string[] = [];
                columns.forEach((col, colIdx) => {
                    const paramName = `p${batchIdx}_${colIdx}`;
                    const value = row[col];
                    request.input(paramName, value === null || value === undefined ? null : String(value));
                    rowValues.push(`@${paramName}`);
                });
                valueRows.push(`(${rowValues.join(', ')})`);
            });

            const sanitizedColumns = columns.map(c => {
                const safe = c.trim().replace(/[^a-zA-Z0-9_ ]+/g, "");
                return `[${safe}]`;
            }).join(', ');
            const insertSql = `INSERT INTO [${sanitizedTableName}] (${sanitizedColumns}) VALUES ${valueRows.join(', ')}`;

            await request.query(insertSql);
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

export async function generateSqlAction(
    userDescription: string,
    openRouterConfig?: { apiKey: string, model: string },
    connectorId?: string,
    schemaContextArgs?: string,
    history: { role: string, content: string }[] = []
): Promise<{ sql: string | null; error: string | null }> {

    try {
        const user = await getAuthenticatedUser();

        // 1. Context setup
        let schemaContext = schemaContextArgs || "No specific schema provided. Assume standard SQL naming conventions.";

        // If no context provided but we have a connector, set a basic target hint
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

        if (openRouterConfig && openRouterConfig.apiKey) {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${openRouterConfig.apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: openRouterConfig.model,
                    messages: messages
                })
            });

            if (!response.ok) throw new Error("OpenRouter API Error");

            const json = await response.json();
            const content = json.choices[0].message.content;

            // Cleanup markdown if present
            // Extract content between ```sql ... ``` or just ``` ... ```
            const codeBlockRegex = /```(?:sql|tsql|mssql)?\s*([\s\S]*?)```/i;
            const match = content.match(codeBlockRegex);

            let cleanSql = '';
            if (match && match[1]) {
                cleanSql = match[1].trim();
            } else {
                // Fallback: remove any backticks and trim
                cleanSql = content.replace(/```/g, '').trim();
            }
            return { sql: cleanSql, error: null };

        } else {
            // Fallback or Genkit if configured, but for now let's strict to OpenRouter as per pattern
            return { sql: null, error: "OpenRouter configuration missing." };
        }

    } catch (e) {
        const error = e instanceof Error ? e.message : "Errore generazione SQL.";
        return { sql: null, error };
    }
}


// --- PYTHON ACTIONS ---

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

        // Build context string for the prompt
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
   - **CONTEXT**: You are writing a script that will be executed in an environment where these variables are pre-loaded.
   - **EXCEPTION**: If "Available Document Files" are listed above, you MUST read them from the filesystem using os.environ['DOCUMENTS_DIR']. These files ARE your input data — do not ask the user for them.
7. **ALWAYS USE PLOTLY** (plotly.express or plotly.graph_objects) for charts unless specifically told otherwise. Do not use Matplotlib if possible.
   - For charts, the last line MUST be the figure object 'fig'.
   - Do NOT use fig.show().
8. **ROBUST DATE PARSING**: When converting columns to datetime, ALWAYS use \`pd.to_datetime(..., dayfirst=True, errors='coerce')\` to correctly handle European formats (DD-MM-YYYY) and prevent crashes.
9. **ASK FOR CLARIFICATION**: If you are unsure about column names, dataframe logic, or if the user's request is ambiguous, invalid, or refers to non-existent columns based on the provided context, you MUST ask the user for clarification instead of guessing. Return a polite question describing what is unclear.
10. **DOCUMENT FILES**: When document files are listed in "Available Document Files" section, NEVER ask the user where the files are. They are ALREADY available. Read them using os.environ['DOCUMENTS_DIR'] and os.environ['SELECTED_DOCUMENTS']. Generate the code directly.`;

        const messages = [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: `Generate Python code for: ${userDescription}` }
        ];

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${openRouterConfig.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: openRouterConfig.model,
                messages: messages
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData?.error?.message || `HTTP ${response.status}`);
        }

        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content || '';

        // Extract code from markdown block
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

export async function executePythonPreviewAction(
    code: string,
    outputType: 'table' | 'variable' | 'chart' | 'html',
    inputData: Record<string, any[]> = {},
    dependencies?: { tableName: string; query?: string; isPython?: boolean; pythonCode?: string; connectorId?: string; pipelineDependencies?: any[]; selectedDocuments?: string[] }[],
    connectorId?: string,
    _bypassAuth?: boolean,
    selectedDocuments?: string[]
): Promise<{ success: boolean; data?: any[]; columns?: string[]; variables?: Record<string, any>; chartBase64?: string; chartHtml?: string; html?: string; rechartsConfig?: any; rechartsData?: any[]; rechartsStyle?: any; plotlyJson?: any; error?: string; rowCount?: number; stdout?: string; debugLogs?: string[] }> {
    const debugLogs: string[] = [];
    const tStart = performance.now();

    try {
        let user: any = null;
        if (_bypassAuth) {
            if (connectorId && connectorId !== 'none') {
                const conn = await db.connector.findUnique({ where: { id: connectorId } });
                if (conn) {
                    user = { id: 'system-scheduler', companyId: conn.companyId };
                }
            }
            if (!user) user = { id: 'system-scheduler', companyId: 'system-override' };
        } else {
            user = await getAuthenticatedUser();
        }
        let envVars: Record<string, string> = {};


        // Fetch connector config if provided
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
                // Map common keys to uppercase ENVS
                if (config.accessToken) envVars['HUBSPOT_TOKEN'] = config.accessToken;
                if (config.token) envVars['HUBSPOT_TOKEN'] = config.token; // Fallback
                if (config.apiKey) envVars['HUBSPOT_API_KEY'] = config.apiKey;

                // Generic mapping for other potential keys
                if (config.password) envVars['DB_PASSWORD'] = config.password;
                if (config.username) envVars['DB_USERNAME'] = config.username;

                // Handle SharePoint Auth
                if (connector.type === 'SHAREPOINT') {
                    const tenantId = config.tenantId || "0089ad7d-e10f-49b4-bf68-60e706423382";
                    const clientId = config.clientId || "7ff50e8a-eb8c-4bf8-9fa6-f4068c6fe82b";

                    const { getCachedSharePointTokenAction } = await import('./actions/sharepoint');
                    const authResult = await getCachedSharePointTokenAction(tenantId, clientId, config.clientSecret || undefined, user.companyId);

                    if (authResult.accessToken) {
                        const tokenPreview = authResult.accessToken.length <= 8
                            ? '****'
                            : `${authResult.accessToken.slice(0, 4)}...${authResult.accessToken.slice(-4)}`;
                        envVars['SHAREPOINT_TOKEN'] = authResult.accessToken;
                        // Inject helpful IDs if browsing was used
                        if (config._siteId) envVars['SHAREPOINT_SITE_ID'] = config._siteId;
                        if (config._driveId) envVars['SHAREPOINT_DRIVE_ID'] = config._driveId;
                        if (config._fileId) envVars['SHAREPOINT_FILE_ID'] = config._fileId;
                        // Also inject raw config just in case
                        if (config.siteUrl) envVars['SHAREPOINT_SITE_URL'] = config.siteUrl;
                        if (config.filePath) envVars['SHAREPOINT_FILE_PATH'] = config.filePath;
                        if (config.sheetName) envVars['SHAREPOINT_SHEET_NAME'] = config.sheetName;

                        console.log(`[Python] Injected SharePoint token and context (${tokenPreview}, ${authResult.accessToken.length} chars)`);
                    } else {
                        console.warn(`[Python] Failed to Retrieve SharePoint Token for connector ${connector.name} (ID: ${connectorId}). Result: needsAuth=${authResult.needsAuth}, error=${authResult.error}. Hint: ensure clientSecret is configured in the connector for scheduler/background use.`);
                    }
                }

                console.log(`[Python] Injected env vars from connector ${connector.name} (ID: ${connectorId})`);
                console.log(`[Python] Config keys known: ${Object.keys(config).join(', ')}`);
                console.log(`[Python] Env vars set: ${Object.keys(envVars).join(', ')}`);
            } else {
                console.log(`[Python] Connector ${connectorId} found but no config or invalid`);
            }
        }

        // FIX: If no SHAREPOINT_TOKEN was injected yet (e.g. node's connectorId points to SQL, not SharePoint),
        // search for ANY SharePoint connector for this company and inject the token.
        // This is critical for the scheduler where the node's connectorId might not be the SharePoint one.
        if (!envVars['SHAREPOINT_TOKEN'] && user?.companyId && user.companyId !== 'system-override') {
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

                    const { getCachedSharePointTokenAction } = await import('./actions/sharepoint');
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
                    } else {
                        console.warn(`[Python] SharePoint company-wide fallback failed. needsAuth=${authResult.needsAuth}, error=${authResult.error}`);
                    }
                }
            } catch (spErr: any) {
                console.warn(`[Python] SharePoint company-wide fallback exception: ${spErr.message}`);
            }
        }

        // Inject uploaded document paths if selected
        if (selectedDocuments && selectedDocuments.length > 0) {
            const { join } = await import('path');
            const docsDir = join(process.cwd(), 'public', 'documents');
            envVars['DOCUMENTS_DIR'] = docsDir;
            envVars['SELECTED_DOCUMENTS'] = selectedDocuments.join(',');
            console.log(`[Python] Injected DOCUMENTS_DIR=${docsDir}, SELECTED_DOCUMENTS=${selectedDocuments.join(',')}`);
            debugLogs.push(`[${new Date().toLocaleTimeString()}] Documenti selezionati: ${selectedDocuments.join(', ')}`);
        }

        // If there are dependencies (SQL queries from parent nodes), fetch them first
        if (dependencies && dependencies.length > 0) {
            console.log(`[Python] Fetching ${dependencies.length} dependencies:`, dependencies.map(d => d.tableName).join(', '));
            debugLogs.push(`[${new Date().toLocaleTimeString()}] Start fetching ${dependencies.length} dependencies`);

            for (const dep of dependencies) {
                const tDepStart = performance.now();
                const pipelineCount = dep.pipelineDependencies?.length || 0;
                const depConnectorId = dep.connectorId || 'default (none provided)';
                console.log(`[Python DEBUG] Processing dependency: ${dep.tableName}`);
                console.log(`[Python DEBUG]   - Connector ID: ${depConnectorId}`);
                console.log(`[Python DEBUG]   - Query: "${dep.query}"`);
                console.log(`[Python DEBUG]   - Is Python: ${dep.isPython}`);

                debugLogs.push(`[${new Date().toLocaleTimeString()}] Fetching SQL for table '${dep.tableName}' (Connector: ${depConnectorId})...`);

                let queryResults: any[] = [];

                // Check if data is already provided (Client-side orchestration)
                if (inputData[dep.tableName]) {
                    console.log(`[Python] Dependency ${dep.tableName} already provided in inputData. Skipping fetch.`);
                    debugLogs.push(`[${new Date().toLocaleTimeString()}] Dependency '${dep.tableName}' provided by client. Skipping fetch.`);
                    continue;
                }

                if (dep.query) {
                    try {
                        // FIX: Execute SQL if query is present, even if connectorId is missing (defaults to internal DB)
                        if (dep.query) {
                            debugLogs.push(`[${new Date().toLocaleTimeString()}] Executing SQL query for '${dep.tableName}'...`);

                            // Check connector type ONLY if connectorId is provided
                            let isSqlConnector = true;
                            if (dep.connectorId) {
                                const connector = await db.connector.findUnique({
                                    where: { id: dep.connectorId, companyId: user.companyId }
                                });
                                // Filter for SQL-like connectors
                                isSqlConnector = !connector || (connector.type === 'mssql' || connector.type === 'sql' || connector.type === 'SQL');

                                if (!isSqlConnector) {
                                    console.warn(`[Python] Dependency ${dep.tableName} has connector type ${connector?.type} which might not be fully supported in preview yet.`);
                                    debugLogs.push(`[WARN] Unsupported connector type for ${dep.tableName}: ${connector?.type}`);
                                }
                            }

                            if (isSqlConnector) {
                                // Use executeSqlPreviewAction WITH pipelineDependencies for cascading!
                                const res = await executeSqlPreviewAction(
                                    dep.query,
                                    dep.connectorId || '', // Can be undefined/empty
                                    dep.pipelineDependencies,
                                    _bypassAuth // Pass through bypass flag
                                );
                                if (res.data) {
                                    queryResults = res.data;
                                } else {
                                    console.error(`[Python] Error fetching dependent SQL data for ${dep.tableName}: ${res.error}`);
                                    debugLogs.push(`[ERROR] Fetch failed for ${dep.tableName}: ${res.error}`);
                                    // STOP execution if a core dependency fails
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
                        console.log(`[Python] ✅ Fetched ${queryResults.length} rows for ${dep.tableName} in ${dur}s`);
                        debugLogs.push(`[${new Date().toLocaleTimeString()}] ✅ Fetched ${queryResults.length} rows used for '${dep.tableName}' in ${dur}s`);

                    } catch (err: any) {
                        console.error(`[Python] Execute SQL Preview Error:`, err);
                        debugLogs.push(`[ERROR] Exception fetching ${dep.tableName}: ${err.message}`);
                    }
                } else if (dep.isPython && dep.pythonCode) {
                    // Recursive Python Execution
                    console.log(`[Python] 🐍 Recursively executing Python dependency: ${dep.tableName}`);
                    debugLogs.push(`[${new Date().toLocaleTimeString()}] 🐍 Recursively executing Python dependency: '${dep.tableName}'...`);

                    try {
                        const recursiveRes = await executePythonPreviewAction(
                            dep.pythonCode,
                            'table',
                            {},
                            dep.pipelineDependencies, // Pass its own dependencies!
                            dep.connectorId,
                            _bypassAuth, // Pass through bypass flag
                            dep.selectedDocuments?.length > 0 ? dep.selectedDocuments : undefined
                        );

                        if (recursiveRes.success && recursiveRes.data) {
                            inputData[dep.tableName] = recursiveRes.data;
                            console.log(`[Python] ✅ Fetched ${recursiveRes.data.length} rows for ${dep.tableName} (Recursive)`);
                            debugLogs.push(`[${new Date().toLocaleTimeString()}] ✅ Fetched ${recursiveRes.data.length} rows for '${dep.tableName}' (Recursive Python)`);
                        } else {
                            console.error(`[Python] Error in recursive execution for ${dep.tableName}: ${recursiveRes.error}`);
                            debugLogs.push(`[ERROR] Recursive execution failed for ${dep.tableName}: ${recursiveRes.error}`);
                        }

                    } catch (err: any) {
                        console.error(`[Python] Recursive Execution Exception:`, err);
                        debugLogs.push(`[ERROR] Exception in recursive execution for ${dep.tableName}: ${err.message}`);
                    }
                } else {
                    console.warn(`[Python] ⚠️ Skipping dependency ${dep.tableName} because query is missing.`);
                    debugLogs.push(`[WARN] Skipping dependency ${dep.tableName} because query is missing.`);
                }
            }
        }


        // Load full company chart theme for Python rendering (Plotly + matplotlib)
        let chartThemeData: Record<string, any> | undefined;
        try {
            const companyId = user?.companyId;
            console.log(`[ChartTheme] companyId=${companyId}`);
            if (companyId) {
                const company = await db.company.findUnique({
                    where: { id: companyId },
                    select: { chartTheme: true },
                });
                console.log(`[ChartTheme] DB chartTheme:`, company?.chartTheme ? 'present' : 'null');
                chartThemeData = resolveTheme(company?.chartTheme as any);
                console.log(`[ChartTheme] Resolved colors:`, (chartThemeData as any)?.colors?.slice(0, 3));
            }
        } catch (e) {
            console.error(`[ChartTheme] Error loading theme:`, e);
        }

        // Call Flask backend with retry logic for transient connection errors
        const MAX_RETRIES = 3;
        const RETRY_DELAYS = [1000, 2000, 4000]; // ms between retries

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes timeout

            try {
                console.log(`[executePythonPreviewAction] Calling Python backend at 5005... (attempt ${attempt + 1}/${MAX_RETRIES + 1})`);
                debugLogs.push(`[${new Date().toLocaleTimeString()}] Sending data to Python backend${attempt > 0 ? ` (retry ${attempt})` : ''}...`);

                const response = await fetch('http://localhost:5005/execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        code,
                        outputType,
                        inputData,
                        env: envVars,
                        chartTheme: chartThemeData, // Pass full company theme to Python
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

                if (!result.success) {
                    return {
                        success: false,
                        error: result.error || 'Unknown error from Python backend',
                        stdout: result.stdout
                    };
                }

                // Return the appropriate result based on output type
                if (outputType === 'table') {
                    return {
                        success: true,
                        data: result.data,
                        columns: result.columns,
                        rowCount: result.rowCount,
                        stdout: result.stdout
                    };
                } else if (outputType === 'variable') {
                    return {
                        success: true,
                        variables: result.variables,
                        stdout: result.stdout
                    };
                } else if (outputType === 'chart') {
                    // NEW: Support Recharts config from backend
                    return {
                        success: true,
                        chartBase64: result.chartBase64,
                        chartHtml: result.chartHtml,
                        rechartsConfig: result.rechartsConfig,
                        rechartsData: result.rechartsData,
                        rechartsStyle: result.rechartsStyle,
                        plotlyJson: result.plotlyJson,
                        stdout: result.stdout
                    };
                } else if (outputType === 'html') {
                    return {
                        success: true,
                        html: result.html,
                        stdout: result.stdout
                    };
                }

                return { success: false, error: 'Unknown output type' };

            } catch (fetchError: any) {
                clearTimeout(timeoutId);

                // Check if it's a timeout/abort error - don't retry
                if (fetchError.name === 'AbortError') {
                    return {
                        success: false,
                        error: 'Timeout: Il calcolo Python ha impiegato troppo tempo (>5 minuti). Verifica il codice per eventuali loop infiniti.'
                    };
                }

                const error = fetchError instanceof Error ? fetchError.message : "Error calling Python backend.";
                const errorCause = fetchError?.cause ? ` cause: ${fetchError.cause?.message || fetchError.cause?.code || JSON.stringify(fetchError.cause)}` : '';
                const isConnectionError = error.includes('ECONNREFUSED') || error.includes('fetch failed');

                console.error(`[executePythonPreviewAction] Fetch error: "${error}"${errorCause} (name: ${fetchError?.name}, code: ${fetchError?.cause?.code})`);

                // Retry on connection errors (backend might be restarting)
                if (isConnectionError && attempt < MAX_RETRIES) {
                    const delay = RETRY_DELAYS[attempt] || 4000;
                    console.log(`[executePythonPreviewAction] Connection failed, retrying in ${delay}ms... (attempt ${attempt + 1}/${MAX_RETRIES})`);
                    debugLogs.push(`[${new Date().toLocaleTimeString()}] Backend non raggiungibile, retry tra ${delay / 1000}s...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                // Final failure
                if (isConnectionError) {
                    return {
                        success: false,
                        error: 'Python backend non raggiungibile. Assicurati che sia in esecuzione su porta 5005.'
                    };
                }

                return { success: false, error };
            }
        }

        // Fallback (should never reach here)
        return { success: false, error: 'Python backend non raggiungibile. Assicurati che sia in esecuzione su porta 5005.' };

    } catch (e) {
        const error = e instanceof Error ? e.message : "Error executing Python code.";

        // Check if it's a connection error
        if (error.includes('ECONNREFUSED') || error.includes('fetch failed')) {
            return {
                success: false,
                error: 'Python backend non raggiungibile. Assicurati che sia in esecuzione su porta 5005.'
            };
        }

        return { success: false, error };
    }
}




export async function getVariablesAction(): Promise<{ data: Variable[] | null; error: string | null; }> {
    try {
        const user = await getAuthenticatedUser();
        const now = Date.now();

        // Check cache for variables
        if (serverCache.variables && (now - serverCache.variablesTimestamp) < serverCache.CACHE_DURATION) {
            return { data: serverCache.variables, error: null };
        }

        // Fetch only the fields needed for variable usage tracking (id, name, jsonDecisionTree)
        // Excludes heavy fields like naturalLanguageDecisionTree, questionsScript, description
        let treesData;
        if (serverCache.trees && (now - serverCache.treesTimestamp) < serverCache.CACHE_DURATION) {
            treesData = serverCache.trees;
        } else {
            treesData = await db.tree.findMany({
                where: { companyId: user.companyId },
                select: { id: true, name: true, jsonDecisionTree: true, companyId: true }
            });
        }

        const variablesData = await db.variable.findMany({
            where: { companyId: user.companyId },
            orderBy: { name: 'asc' }
        });

        const variables: Variable[] = variablesData.map(v => ({
            id: v.id,
            name: v.name,
            type: v.type as Variable['type'],
            possibleValues: (v.possibleValues as any) || [],
            createdAt: v.createdAt.toISOString(),
            usedIn: []
        }));

        const variableMapById = new Map(variables.map(v => [v.id, v]));

        for (const treeData of treesData) {
            const treeId = treeData.id;
            const treeName = treeData.name;

            const findVarIds = (node: any) => {
                if (typeof node !== 'object' || node === null) return;

                if (node.variableId) {
                    const dbVar = variableMapById.get(node.variableId);
                    if (dbVar && !dbVar.usedIn?.some(t => t.id === treeId)) {
                        if (!dbVar.usedIn) {
                            dbVar.usedIn = [];
                        }
                        dbVar.usedIn.push({ id: treeId, name: treeName });
                    }
                }

                if (node.options) {
                    for (const key in node.options) {
                        findVarIds(node.options[key]);
                    }
                }
            };

            try {
                if (treeData.jsonDecisionTree) {
                    const jsonTree = JSON.parse(treeData.jsonDecisionTree);
                    findVarIds(jsonTree);
                }
            } catch (e) {
                console.warn(`Malformed JSON in tree ${treeId}, skipping variable usage check for it.`);
            }
        }

        // Update cache
        serverCache.variables = variables;
        serverCache.variablesTimestamp = now;

        return { data: variables, error: null };
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Si è verificato un errore imprevisto durante il recupero delle variabili.';
        console.error("Error in getVariablesAction: ", e);
        return { data: null, error };
    }
}



/**
 * Get OpenRouter account credits (balance)
 * Endpoint: GET https://openrouter.ai/api/v1/credits
 */
export async function getOpenRouterCreditsAction(apiKey: string): Promise<{
    success: boolean;
    credits?: { totalCredits: number; totalUsage: number; remaining: number };
    error?: string;
}> {
    if (!apiKey?.trim()) return { success: false, error: 'API key mancante' };
    try {
        const res = await fetch('https://openrouter.ai/api/v1/credits', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${apiKey.trim()}` },
        });
        if (!res.ok) {
            return { success: false, error: `Errore ${res.status}: ${res.statusText}` };
        }
        const data = await res.json();
        const totalCredits = data.data?.total_credits ?? 0;
        const totalUsage = data.data?.total_usage ?? 0;
        const remaining = Math.max(0, totalCredits - totalUsage);
        return {
            success: true,
            credits: {
                totalCredits: Math.round(totalCredits * 10000) / 10000,
                totalUsage: Math.round(totalUsage * 10000) / 10000,
                remaining: Math.round(remaining * 10000) / 10000,
            },
        };
    } catch (error: any) {
        console.error('OpenRouter credits error:', error);
        return { success: false, error: error.message || 'Errore di connessione' };
    }
}

export async function testOpenRouterConnection(apiKey: string, model: string): Promise<{ success: boolean; message: string }> {
    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: "user", content: "Ciao, questo è un test di connessione. Rispondi 'OK' se mi ricevi." }
                ],
                max_tokens: 10
            })
        });

        if (response.ok) {
            const data = await response.json();
            if (data.choices && data.choices.length > 0) {
                return { success: true, message: "Connessione riuscita! Il modello ha risposto." };
            } else {
                return { success: false, message: "Connessione stabilita, ma nessuna risposta valida dal modello." };
            }
        } else {
            let errorMsg = `Errore HTTP: ${response.status}`;
            try {
                const errorData = await response.json();
                if (errorData.error && errorData.error.message) {
                    errorMsg = `Errore OpenRouter: ${errorData.error.message}`;
                }
            } catch (e) {
                // Ignore json parse error
            }
            return { success: false, message: errorMsg };
        }
    } catch (error) {
        console.error("OpenRouter test error:", error);
        return { success: false, message: error instanceof Error ? error.message : "Errore di connessione sconosciuto." };
    }
}

export async function chatOpenRouterAction(
    apiKey: string,
    model: string,
    messages: { role: string; content: string }[]
): Promise<{ success: boolean; message: string }> {
    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: model,
                messages: messages,
            })
        });

        if (response.ok) {
            const data = await response.json();
            if (data.choices && data.choices.length > 0 && data.choices[0].message) {
                return { success: true, message: data.choices[0].message.content };
            } else {
                return { success: false, message: "Nessuna risposta valida dal modello." };
            }
        } else {
            let errorMsg = `Errore HTTP: ${response.status}`;
            try {
                const errorData = await response.json();
                if (errorData.error && errorData.error.message) {
                    errorMsg = `Errore OpenRouter: ${errorData.error.message}`;
                }
            } catch (e) {
                // Ignore json parse error
            }
            return { success: false, message: errorMsg };
        }
    } catch (error) {
        console.error("OpenRouter chat error:", error);
        return { success: false, message: error instanceof Error ? error.message : "Errore di connessione sconosciuto." };
    }
}

export async function deleteAllVariablesAction(): Promise<{ success: boolean, error: string | null }> {
    try {
        await db.variable.deleteMany();
        return { success: true, error: null };
    } catch (e) {
        const error = e instanceof Error ? e.message : "Si è verificato un errore imprevisto durante l'eliminazione di massa.";
        console.error("Error in deleteAllVariablesAction: ", e);
        return { success: false, error };
    }
}
export async function deleteVariableAction(id: string): Promise<{ success: boolean; error: string | null }> {
    try {
        await db.variable.delete({ where: { id } });
        return { success: true, error: null };
    } catch (e) {
        const error = e instanceof Error ? e.message : "Errore durante l'eliminazione della variabile.";
        return { success: false, error };
    }
}


export async function getStandardizationDataAction(treeId: string): Promise<{ data: { tree: StoredTree, dbVariables: Variable[] } | null, error: string | null }> {
    try {
        const treeResult = await getTreeAction(treeId);
        if (treeResult.error || !treeResult.data) {
            throw new Error(treeResult.error || 'Albero non trovato.');
        }

        const dbVariablesResult = await getVariablesAction();
        if (dbVariablesResult.error) {
            throw new Error(dbVariablesResult.error);
        }

        return {
            data: {
                tree: treeResult.data,
                dbVariables: dbVariablesResult.data || [],
            },
            error: null
        };

    } catch (e) {
        const error = e instanceof Error ? e.message : 'Errore sconosciuto durante il recupero dei dati per la standardizzazione.';
        console.error("Error in getStandardizationDataAction:", e);
        return { data: null, error };
    }
}

export async function executeConsolidationAction(
    treeId: string,
    approvedActions: {
        type: 'add' | 'merge';
        treeVarName: string;
        dbVarId?: string;
        finalName: string;
        finalOptions: VariableOption[];
    }[]
): Promise<{ success: boolean; data: StoredTree | null; error: string | null }> {
    if (approvedActions.length === 0) {
        const treeResult = await getTreeAction(treeId);
        return { success: true, data: treeResult.data, error: null };
    }

    try {
        const user = await getAuthenticatedUser();
        const treeResult = await getTreeAction(treeId);
        if (treeResult.error || !treeResult.data) {
            throw new Error(treeResult.error || 'Impossibile caricare l\'albero.');
        }
        const treeToUpdate = treeResult.data;
        let jsonTree = JSON.parse(treeToUpdate.jsonDecisionTree);

        const transactionOps: any[] = [];

        for (const action of approvedActions) {
            // Fix: Use provided ID if available (for merges OR restoring orphans), otherwise gen new
            const varToSaveId = action.dbVarId ? action.dbVarId : nanoid();

            const cleanFinalOptions = _.uniqBy(
                (action.finalOptions || []).map(opt => ({ ...opt, id: opt.id || nanoid(8) }))
                    .filter(v => v && v.name && v.name.trim() !== ''),
                'name'
            );

            const varData = {
                name: action.finalName,
                type: 'enumeration',
                possibleValues: cleanFinalOptions,
            };

            // Use upsert to handle both create and update (merge) logic
            transactionOps.push(db.variable.upsert({
                where: { id: varToSaveId },
                update: varData,
                create: {
                    id: varToSaveId,
                    ...varData,
                    companyId: user.companyId
                }
            }));


            const { node: updatedJsonTree, updated } = recursiveTreeUpdate(
                jsonTree,
                action.treeVarName,
                action.finalName,
                cleanFinalOptions,
                varToSaveId
            );

            if (updated) {
                jsonTree = updatedJsonTree;
            }
        }

        transactionOps.push(db.tree.update({
            where: { id: treeId },
            data: {
                jsonDecisionTree: JSON.stringify(jsonTree)
            }
        }));

        await db.$transaction(transactionOps);

        const finalTreeResult = await getTreeAction(treeId);

        return { success: true, data: finalTreeResult.data, error: null };

    } catch (e) {
        const error = e instanceof Error ? e.message : 'Errore sconosciuto durante l\'esecuzione del consolidamento.';
        console.error("Error in executeConsolidationAction:", e);
        return { success: false, data: null, error };
    }
}

/**
 * Recursively traverses a decision tree, finds a question by its old name,
 * and updates its name, its options, and its variableId.
 */
function recursiveTreeUpdate(
    node: any,
    oldQuestionName: string,
    newQuestionName: string,
    newPossibleValues: VariableOption[],
    newVariableId?: string,
): { node: any, updated: boolean } {
    let updated = false;

    if (typeof node !== "object" || node === null) {
        return { node, updated };
    }

    const newNode = _.cloneDeep(node);

    if (newNode.question === oldQuestionName) {

        if (newQuestionName !== oldQuestionName) {
            newNode.question = newQuestionName;
            updated = true;
        }

        if (newVariableId && newNode.variableId !== newVariableId) {
            newNode.variableId = newVariableId;
            updated = true;
        }

        if (newPossibleValues && newNode.options) {
            const currentOptions = newNode.options;
            const newOptions: { [key: string]: any } = {};

            newPossibleValues.forEach(opt => {
                newOptions[opt.name] = currentOptions[opt.name] || { decision: 'Percorso non definito', id: nanoid(8) };
            });

            if (!_.isEqual(newNode.options, newOptions)) {
                newNode.options = newOptions;
                updated = true;
            }
        }
    }

    if (newNode.options) {
        for (const key in newNode.options) {
            const result = recursiveTreeUpdate(newNode.options[key], oldQuestionName, newQuestionName, newPossibleValues, newVariableId);
            if (result.updated) {
                newNode.options[key] = result.node;
                updated = true;
            }
        }
    }

    return { node: newNode, updated };
}

// Helper for OpenRouter Tool calls
async function callOpenRouterWithTools(apiKey: string, model: string, messages: any[], tools: any[]): Promise<any> {
    const openRouterTools = tools.map(tool => ({
        type: "function",
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema // Assuming inputSchema is a JSON schema object
        }
    }));

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: model,
            messages: messages,
            tools: openRouterTools,
            tool_choice: "auto"
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`OpenRouter Error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message;
}

export async function detaiAction(input: DetaiInput, openRouterConfig?: { apiKey: string, model: string }): Promise<{ data: any | null; error: string | null; }> {
    try {
        if (openRouterConfig && openRouterConfig.apiKey) {
            // Check if the last message is a tool request that needs execution
            const lastInputMsg = input.messages[input.messages.length - 1];
            if (lastInputMsg?.role === 'model' && lastInputMsg.content[0].toolRequest) {
                const toolReq = lastInputMsg.content[0].toolRequest;
                if (toolReq.function.name === 'searchDecisionTrees') {
                    let args;
                    try {
                        args = JSON.parse(toolReq.function.arguments);
                    } catch (e) {
                        return { data: { toolResponse: { id: toolReq.id, result: "Error parsing arguments" } }, error: null };
                    }

                    const searchResult = await searchTreesAction(args.query, openRouterConfig);

                    return {
                        data: {
                            toolResponse: {
                                id: toolReq.id,
                                result: searchResult
                            }
                        },
                        error: null
                    };
                }
            }

            const systemMessage = {
                role: 'system',
                content: `Sei detAI, un assistente IA esperto e proattivo. Il tuo compito è rispondere in modo utile e, soprattutto, basare le tue risposte sulla conoscenza contenuta in un database di alberi decisionali.

REGOLE FONDAMENTALI E OBBLIGATORIE:

1.  **PROATTIVITÀ OBBLIGATORIA (REGOLA PIÙ IMPORTANTE)**:
    *   Se la domanda o L'AFFERMAZIONE dell'utente contiene un termine specifico, una procedura, una regola o un concetto (es. "acquisizione commessa", "articolo 14", "procedura di reso", "garanzia"), la tua PRIMA AZIONE DEVE ESSERE usare lo strumento \`searchDecisionTrees\`.
    *   NON DEVI MAI rispondere "Mi dispiace, non ho le competenze..." o frasi simili se non hai PRIMA cercato nel database. La tua competenza risiede nella tua capacità di cercare. Se la ricerca non produce risultati, solo allora puoi dire di non aver trovato informazioni.
    *   NON chiedere mai all'utente di spiegarti un termine se puoi cercarlo. Usa lo strumento.

2.  **CONTRADDICI E CORREGGI**: Se l'utente fa un'affermazione che è in contrasto con le informazioni che trovi nel database, il tuo compito è contraddirlo gentilmente e correggerlo, usando i dati trovati. Esempio: "In realtà, secondo la procedura standard, per l'articolo 14 non è necessario avvertire Mattarelli, ma bisogna **compilare il modulo Z-7**."

3.  **ONESTÀ SUI LIMITI**: Se non conosci la risposta E non trovi nulla con lo strumento di ricerca, o se la domanda riguarda informazioni in tempo reale (come la data di oggi, il meteo, o notizie recenti), DEVI dire onestamente che non hai accesso a quel tipo di informazione. Non inventare mai risposte.

4.  **REGOLA CRITICA DI ATTRIBUZIONE DELLA FONTE**: Quando la tua risposta si basa sulle informazioni trovate tramite lo strumento di ricerca, DEVI OBBLIGATORIAMENTE formattare la tua risposta per includere l'attribuzione della fonte. Per ogni pezzo di informazione che proviene da un albero decisionale specifico, DEVI racchiuderlo in un tag speciale che indica il suo \`sourceId\`. Il formato esatto è \`[Fonte: ID_DELLA_FONTE] Testo dell'informazione... [Fine Fonte]\`.
    *   **IMPORTANTE**: NON mettere il tag \`[Fonte: ...]\` solo alla fine della frase. Devi APRIRE il tag PRIMA del testo e CHIUDERLO con \`[Fine Fonte]\` alla fine.
    *   Esempio: Se hai trovato due procedure pertinenti, la tua risposta DOVREBBE assomigliare a questo:
        \`\`\`
        Ho trovato diverse procedure per l'acquisizione di una commessa.

        [Fonte: id_albero_123] Per iniziare, è necessario raccogliere i requisiti del cliente e farli approvare dall'ufficio tecnico. Successivamente, si crea un ordine di vendita nel gestionale. [Fine Fonte]

        [Fonte: id_albero_456] Inoltre, per il processo specifico "SpeedHub", quando si riceve una mail da Tiziano, si apre una commessa e si avvisa Marco. Se Marco non risponde, la mail va inoltrata a Romina. [Fine Fonte]
        \`\`\`
    *   Devi usare questo formato per ogni blocco di informazioni distinto che proviene da una fonte diversa per consentire all'interfaccia utente di visualizzare le fonti.

5.  **REGOLA DI FORMATTAZIONE (GRASSETTO)**: Quando includi informazioni che hai letto dai risultati della ricerca nella tua risposta, DEVI OBBLIGATORIAMENTE racchiudere quelle informazioni esatte tra doppi asterischi per renderle in grassetto, oltre ad usare i tag di attribuzione. Esempio: "[Fonte: id_albero_789] Secondo la procedura, devi **controllare il livello del liquido di raffreddamento**. [Fine Fonte]"

6. **PRESERVAZIONE EVIDENZIATURA**: Se le informazioni che trovi contengono testo racchiuso in \`[[node:...]]\`, DEVI includere questi marcatori nella tua risposta esattamente come sono. Questo è CRUCIALE per l'esperienza utente.`
            };

            // Map messages for OpenRouter
            const messages = [
                systemMessage,
                ...input.messages.map(m => {
                    if (m.role === 'tool') {
                        return {
                            role: 'tool',
                            tool_call_id: m.content[0].toolResponse.id, // We need to store tool call ID in history
                            content: JSON.stringify(m.content[0].toolResponse.result)
                        };
                    }
                    if (m.content[0].toolRequest) {
                        return {
                            role: 'assistant',
                            content: null,
                            tool_calls: [m.content[0].toolRequest]
                        };
                    }
                    return { role: m.role === 'model' ? 'assistant' : m.role, content: m.content[0].text };
                })
            ];

            const tools = [{
                name: 'searchDecisionTrees',
                description: "Cerca nel database degli alberi decisionali per trovare informazioni o procedure pertinenti alla domanda o affermazione dell'utente.",
                inputSchema: {
                    type: "object",
                    properties: {
                        query: { type: "string", description: "La query di ricerca basata sulla domanda o sui termini chiave nell'affermazione dell'utente." }
                    },
                    required: ["query"]
                }
            }];

            const responseMessage = await callOpenRouterWithTools(openRouterConfig.apiKey, openRouterConfig.model, messages, tools);

            console.log("OpenRouter Response Message:", JSON.stringify(responseMessage, null, 2));

            if (responseMessage.tool_calls) {
                // Handle tool call
                const toolCall = responseMessage.tool_calls[0];
                if (toolCall.function.name === 'searchDecisionTrees') {
                    // Return the tool request so client can loop back with the result
                    return {
                        data: {
                            toolRequest: {
                                id: toolCall.id,
                                type: 'function',
                                function: toolCall.function
                            }
                        },
                        error: null
                    };
                }
            }

            // Fallback for empty content or unhandled tool calls
            const responseText = responseMessage.content || "(Nessuna risposta testuale dal modello)";

            return { data: { text: responseText }, error: null };

        } else {
            const result = await detaiFlow(input);

            const lastMessage = input.messages[input.messages.length - 1];
            if (lastMessage?.role === 'tool') {
                return { data: { toolResponse: result }, error: null };
            }

            return { data: { text: result }, error: null };
        }
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Si è verificato un errore imprevisto.';
        console.error('Error in detaiAction:', e);
        return { data: null, error };
    }
}


export async function searchTreesAction(query: string, openRouterConfig?: { apiKey: string, model: string }): Promise<string> {
    const treesResult = await getTreesAction();
    if (treesResult.error || !treesResult.data) {
        return 'Errore: Impossibile accedere al database degli alberi decisionali.';
    }

    const searchableTrees = treesResult.data.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        content: t.naturalLanguageDecisionTree,
    }));

    if (openRouterConfig && openRouterConfig.apiKey) {
        const systemPrompt = `Sei un assistente di ricerca intelligente.
Analizza la lista di alberi decisionali fornita e restituisci solo quelli che sono altamente pertinenti alla query dell'utente.
Per ogni albero pertinente, devi fornire un breve riassunto della procedura.

                    IMPORTANTE: Se il testo originale contiene marcatori [[node: ...]], DEVI preservarli nel riassunto quando citi quei passaggi esatti.

FORMATO OUTPUT(JSON): {
                        "relevantTrees": [
                            {
                                "name": "Nome dell'albero",
                                "sourceId": "ID univoco dell'albero (campo 'id')",
                                "reason": "Motivo della selezione",
                                "summary": "Breve riassunto della procedura"
                            }
                        ]
                    }

Se nessun albero è pertinente, restituisci: { "relevantTrees": [] }`;

        const userPrompt = `Query utente: "${query}"

Alberi disponibili:
                    ${JSON.stringify(searchableTrees, null, 2)
            } `;

        try {
            const result = await callOpenRouterJSON(openRouterConfig.apiKey, openRouterConfig.model, userPrompt, systemPrompt);
            if (!result || !result.relevantTrees || result.relevantTrees.length === 0) {
                return 'Nessun risultato trovato.';
            }
            return JSON.stringify(result.relevantTrees, null, 2);
        } catch (e) {
            console.error("OpenRouter Search Error:", e);
            return 'Errore durante la ricerca con OpenRouter.';
        }
    }

    const SearchResultSchema = z.object({
        relevantTrees: z.array(z.object({
            name: z.string().describe("Il nome dell'albero decisionale."),
            sourceId: z.string().describe("L'ID univoco dell'albero decisionale di origine."),
            reason: z.string().describe("Motivo per cui questo albero è stato selezionato."),
            summary: z.string().describe("Un breve riassunto della procedura descritta nell'albero."),
        }))
    });

    const { output } = await ai.generate({
        model: 'googleai/gemini-1.5-pro-latest',
        prompt: `Analizza la seguente lista di alberi decisionali e restituisci solo quelli che sono altamente pertinenti alla query dell'utente. Per ogni albero, includi il suo ID univoco nel campo 'sourceId'.

Query utente: "${query}"

Alberi disponibili:
${JSON.stringify(searchableTrees, null, 2)}

Per ogni albero pertinente, fornisci un breve riassunto della procedura che descrive.
            IMPORTANTE: Se il testo originale contiene marcatori[[node: ...]], DEVI preservarli nel riassunto quando citi quei passaggi esatti.`,
        output: { schema: SearchResultSchema },
    });

    if (!output || output.relevantTrees.length === 0) {
        return 'Nessun risultato trovato.';
    }

    return JSON.stringify(output.relevantTrees, null, 2);
}




export async function updateVariableAction(treeId: string | undefined, id: string, updateData: Partial<Variable>): Promise<{ success: boolean; data: StoredTree | null; error: string | null; }> {
    try {
        const user = await getAuthenticatedUser();
        if (!id) throw new Error("ID variabile non fornito.");

        const transactionOps: any[] = [];

        const oldVarData = await db.variable.findFirst({ where: { id, companyId: user.companyId } });
        if (!oldVarData) throw new Error("Variabile da aggiornare non trovata.");

        // Ensure IDs are present for new options
        const updatedPossibleValues = updateData.possibleValues?.map(opt => ({
            ...opt,
            id: opt.id || nanoid(8),
        }));

        const newName = updateData.name?.trim();
        const newPossibleValues = updatedPossibleValues ? _.uniqBy((updatedPossibleValues || []).map(v => ({ ...v, name: v.name.trim() })).filter(v => v.name), 'name') : undefined;

        const dbUpdatePayload: any = { ..._.omit(updateData, 'id', 'usedIn', 'createdAt', 'possibleValues') };
        if (newPossibleValues) dbUpdatePayload.possibleValues = newPossibleValues;
        if (newName) dbUpdatePayload.name = newName;

        transactionOps.push(db.variable.update({ where: { id }, data: dbUpdatePayload }));

        const allVarsResult = await getVariablesAction();
        if (allVarsResult.error) throw new Error(allVarsResult.error);
        const affectedTreesIds = allVarsResult.data?.find(v => v.id === id)?.usedIn?.map(t => t.id) || [];

        if (affectedTreesIds.length > 0) {
            const affectedTreesResult = await getTreesAction(affectedTreesIds);
            if (affectedTreesResult.error) throw new Error(affectedTreesResult.error);

            for (const treeDoc of affectedTreesResult.data!) {
                if (!treeDoc.jsonDecisionTree) continue;
                let jsonTree;
                try {
                    jsonTree = JSON.parse(treeDoc.jsonDecisionTree);
                } catch (e) {
                    console.warn(`Skipping malformed tree ${treeDoc.id} `);
                    continue;
                }

                const finalPossibleValues = newPossibleValues || (oldVarData.possibleValues as any);
                const finalOldPossibleValues = (oldVarData.possibleValues as any);

                const { node: updatedJsonTree, updated } = recursiveTreeUpdateById(jsonTree, id, newName || oldVarData.name, finalPossibleValues, finalOldPossibleValues);

                if (updated) {
                    transactionOps.push(db.tree.update({
                        where: { id: treeDoc.id },
                        data: {
                            jsonDecisionTree: JSON.stringify(updatedJsonTree),
                        }
                    }));
                }
            }
        }

        await db.$transaction(transactionOps);

        if (treeId && typeof treeId === 'string') {
            const finalTreeResult = await getTreeAction(treeId);
            return { success: true, data: finalTreeResult.data, error: null };
        }

        return { success: true, data: null, error: null };

    } catch (e) {
        const error = e instanceof Error ? e.message : "Si è verificato un errore imprevisto durante l'aggiornamento della variabile.";
        console.error("Error in updateVariableAction: ", e);
        return { success: false, data: null, error };
    }
}


function recursiveTreeUpdateById(
    node: any,
    variableId: string,
    newQuestionName: string,
    newPossibleValues: VariableOption[],
    oldPossibleValues: VariableOption[] = []
): { node: any, updated: boolean } {
    let updated = false;
    const newNode = _.cloneDeep(node);

    if (typeof node !== "object" || node === null) {
        return { node, updated };
    }

    if (newNode.variableId === variableId) {
        if (newQuestionName !== newNode.question) {
            newNode.question = newQuestionName;
            updated = true;
        }

        if (newPossibleValues && newNode.options) {
            const newOptions: { [key: string]: any } = {};
            const currentOptions = newNode.options;

            const oldOptionsMapById = new Map<string, any>();
            oldPossibleValues.forEach(oldOpt => {
                if (oldOpt.id && currentOptions[oldOpt.name]) {
                    oldOptionsMapById.set(oldOpt.id, currentOptions[oldOpt.name]);
                }
            });

            const oldOptionsMapByName = new Map(oldPossibleValues.map(opt => [opt.name, currentOptions[opt.name]]));

            newPossibleValues.forEach(newOpt => {
                let correspondingChild;
                // Find by ID first (most reliable)
                if (newOpt.id && oldOptionsMapById.has(newOpt.id)) {
                    correspondingChild = oldOptionsMapById.get(newOpt.id);
                } else {
                    // Fallback for options that might not have had an ID before
                    const oldOptMatch = oldPossibleValues.find(o => o.name === newOpt.name);
                    if (oldOptMatch) {
                        correspondingChild = oldOptionsMapByName.get(oldOptMatch.name);
                    }
                }

                if (correspondingChild) {
                    newOptions[newOpt.name] = correspondingChild;
                } else {
                    // If a new option is added, it won't have a corresponding child yet.
                    newOptions[newOpt.name] = { decision: 'Percorso non definito', id: nanoid(8) };
                }
            });

            // Clean up options that were removed
            const newOptionNames = new Set(newPossibleValues.map(opt => opt.name));
            for (const currentOptName in currentOptions) {
                if (!newOptionNames.has(currentOptName)) {
                    // This option was removed, so it's not added to newOptions, effectively deleting it.
                }
            }

            if (!_.isEqual(newNode.options, newOptions)) {
                newNode.options = newOptions;
                updated = true;
            }
        }
    }

    if (newNode.options) {
        for (const key in newNode.options) {
            const result = recursiveTreeUpdateById(newNode.options[key], variableId, newQuestionName, newPossibleValues, oldPossibleValues);
            if (result.updated) {
                newNode.options[key] = result.node;
                updated = true;
            }
        }
    }

    return { node: newNode, updated };
}






export async function mergeVariablesAction(
    sourceVariableId: string,
    targetVariableId: string,
    finalName: string,
    finalPossibleValues: VariableOption[]
): Promise<{ success: boolean; error: string | null }> {
    try {
        if (!sourceVariableId || !targetVariableId || !finalName) {
            throw new Error("ID sorgente, ID destinazione e nome finale sono obbligatori.");
        }

        const transactionOps: any[] = [];

        const allVars = await getVariablesAction();
        if (allVars.error) throw new Error(allVars.error);

        const sourceVarInfo = allVars.data?.find(v => v.id === sourceVariableId);
        const sourceTreeIds = sourceVarInfo?.usedIn?.map(t => t.id) || [];

        if (sourceTreeIds.length > 0) {
            const affectedTreesResult = await getTreesAction(sourceTreeIds);
            if (affectedTreesResult.error) throw new Error(affectedTreesResult.error);

            for (const tree of affectedTreesResult.data!) {
                let jsonTree = JSON.parse(tree.jsonDecisionTree);

                const replaceVarId = (node: any) => {
                    if (typeof node !== 'object' || node === null) return node;

                    if (node.variableId === sourceVariableId) {
                        node.variableId = targetVariableId;
                        node.question = finalName;

                        const newOptions: { [key: string]: any } = {};
                        const currentOptions = node.options || {};
                        for (const finalValue of finalPossibleValues) {
                            newOptions[finalValue.name] = currentOptions[finalValue.name] || { decision: 'Percorso non definito', id: nanoid(8) };
                        }
                        node.options = newOptions;
                    }

                    if (node.options) {
                        for (const key in node.options) {
                            node.options[key] = replaceVarId(node.options[key]);
                        }
                    }
                    return node;
                };

                const updatedJsonTree = replaceVarId(jsonTree);

                transactionOps.push(db.tree.update({
                    where: { id: tree.id },
                    data: {
                        jsonDecisionTree: JSON.stringify(updatedJsonTree),
                    }
                }));
            }
        }

        transactionOps.push(db.variable.update({
            where: { id: targetVariableId },
            data: {
                name: finalName,
                possibleValues: _.uniqBy(finalPossibleValues.map(v => ({ ...v, id: v.id || nanoid(8) })), 'name')
            }
        }));

        transactionOps.push(db.variable.delete({ where: { id: sourceVariableId } }));

        await db.$transaction(transactionOps);
        return { success: true, error: null };

    } catch (e) {
        const error = e instanceof Error ? e.message : "Si è verificato un errore imprevisto durante la fusione.";
        console.error("Error in mergeVariablesAction: ", e);
        return { success: false, error };
    }
}


export async function executeTriggerAction(
    treeId: string,
    nodeId: string | undefined,
    trigger: TriggerItem
): Promise<{ success: boolean; message: string }> {
    try {
        const { name, path } = trigger;

        if (path.startsWith('FIRESTORE_WRITE::')) {
            const collectionName = path.split('::')[1];
            if (!collectionName) {
                throw new Error('Nome della collezione non specificato nel path del trigger.');
            }

            const logData = {
                triggerName: name,
                triggerPath: path,
                treeId: treeId,
                nodeId: nodeId || 'unknown',
                executedAt: new Date(), // Prisma uses Date objects for datetime
            };

            await db.triggerLog.create({
                data: {
                    collection: collectionName,
                    data: logData, // Store the entire logData object as JSON
                }
            });

            return {
                success: true,
                message: `Trigger '${name}' eseguito: log scritto nella collezione '${collectionName}'.`
            };
        }

        // Placeholder for other trigger types in the future
        // else if (path.startsWith('...')) { }

        return {
            success: false,
            message: `Il tipo di trigger con path '${path}' non è supportato.`
        };

    } catch (e) {
        const error = e instanceof Error ? e.message : 'Si è verificato un errore imprevisto durante l\'esecuzione del trigger.';
        console.error("Error in executeTriggerAction:", e);
        return { success: false, message: error };
    }
}

export async function fetchOpenRouterModelsAction(): Promise<{ data: any[] | null; error: string | null }> {
    try {
        const response = await fetch('https://openrouter.ai/api/v1/models', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
            next: { revalidate: 3600 } // Cache for 1 hour
        });

        if (!response.ok) {
            throw new Error(`OpenRouter API error: ${response.statusText}`);
        }

        const json = await response.json();

        // Transform data to a cleaner format
        const models = json.data.map((m: any) => ({
            id: m.id,
            name: m.name,
            context_length: m.context_length,
            pricing: {
                prompt: m.pricing.prompt,
                completion: m.pricing.completion,
            },
            description: m.description
        }));

        return { data: models, error: null };
    } catch (e) {
        console.error("Error fetching OpenRouter models:", e);
        return { data: null, error: e instanceof Error ? e.message : "Errore sconosciuto nel recupero dei modelli." };
    }
}


export async function importTreeFromJsonAction(treeData: Partial<StoredTree>) {
    try {
        const sessionUser = await getAuthenticatedUser();
        if (!sessionUser) {
            return { error: 'Non autorizzato.' };
        }

        // Fetch fresh user data from DB to avoid staleness
        const user = await db.user.findUnique({ where: { id: sessionUser.id } });
        if (!user || !user.companyId) {
            return { error: 'Utente non associato a nessuna azienda.' };
        }

        // Basic validation
        if (!treeData.name || !treeData.jsonDecisionTree) {
            return { error: 'Struttura JSON non valida: mancano nome o dati dell\'albero.' };
        }

        const newTree = await db.tree.create({
            data: {
                id: nanoid(),
                name: treeData.name + ' (Importato)',
                description: treeData.description || 'Importato da JSON',
                jsonDecisionTree: typeof treeData.jsonDecisionTree === 'string' ? treeData.jsonDecisionTree : JSON.stringify(treeData.jsonDecisionTree),
                naturalLanguageDecisionTree: treeData.naturalLanguageDecisionTree || '',
                questionsScript: treeData.questionsScript || '',
                type: treeData.type || 'RULE',
                companyId: user.companyId,
                createdAt: new Date(),
            }
        });

        return { success: true, treeId: newTree.id };
    } catch (e) {
        console.error("Errore nell'importazione dell'albero:", e);
        return { error: 'Errore interno durante il salvataggio dell\'albero.' };
    }
}

// Helper to find a node by its result name (SQL or Python) recursively in the tree
// Server-side version
function findNodeByResultName(node: any, targetName: string): any {
    if (!node) return null;
    const targetLower = targetName.toLowerCase();

    // Check array (children)
    if (Array.isArray(node)) {
        for (const item of node) {
            const found = findNodeByResultName(item, targetName);
            if (found) return found;
        }
        return null;
    }

    // Check object
    if (typeof node === 'object') {
        // Check current node properties (case-insensitive)
        if ('pythonResultName' in node && typeof node.pythonResultName === 'string' && node.pythonResultName.toLowerCase() === targetLower) return node;
        if ('sqlResultName' in node && typeof node.sqlResultName === 'string' && node.sqlResultName.toLowerCase() === targetLower) return node;

        // Recursively check triggers
        if ('triggers' in node && Array.isArray(node.triggers)) {
            // (Triggers usually don't have results we depend on in this flow context)
        }

        // Recursively check options
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

        // Helper to find a node in ANY tree
        const findNodeInDb = async (name: string) => {
            // 1. Search for trees that MIGHT contain the definition (text search on JSON column)
            const candidates = await db.tree.findMany({
                where: {
                    companyId: user.companyId,
                    jsonDecisionTree: {
                        contains: name,
                    }
                },
                select: {
                    id: true,
                    jsonDecisionTree: true,
                    name: true
                }
            });

            // 2. Iterate and parse
            for (const tree of candidates) {
                try {
                    const json = JSON.parse(tree.jsonDecisionTree);
                    const node = findNodeByResultName(json, name);
                    if (node) return node;
                } catch (e) {
                    continue;
                }
            }
            return null;
        };

        const chain: any[] = [];
        const visited = new Set<string>();
        const resolving = new Set<string>(); // Cycle detection

        const buildChain = async (currentName: string) => {
            if (visited.has(currentName.toLowerCase())) return;
            if (resolving.has(currentName.toLowerCase())) {
                console.warn(`Circular dependency detected for ${currentName}. Breaking cycle.`);
                return;
            }
            // Skip common keywords to avoid useless DB lookups
            if (['print', 'len', 'range', 'list', 'dict', 'set', 'str', 'int', 'float', 'import', 'from', 'def', 'return', 'none', 'true', 'false', 'self'].includes(currentName.toLowerCase())) return;

            resolving.add(currentName.toLowerCase());

            const node = await findNodeInDb(currentName);

            if (node) {
                // Determine dependencies of THIS node
                let potentialDeps: string[] = [];
                if (node.pythonCode) {
                    const matches = node.pythonCode.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
                    potentialDeps = Array.from(new Set(matches));
                } else if (node.sqlQuery) {
                    // SQL parsing is harder, but maybe we assume SQL doesn't have cross-tree deps often?
                    // Or maybe look for {{VarName}} patterns?
                    // For now, let's stick to Python deps which are the main issue.
                }

                // Recursively resolve dependencies BEFORE adding this node (Post-Order)
                for (const dep of potentialDeps) {
                    // Optimization: Only resolve if it looks like a variable (length > 2)
                    if (dep.length > 2 && dep !== currentName) {
                        await buildChain(dep);
                    }
                }

                // Add to chain if not already there (visited check handles duplicates, but chain order matters)
                if (!visited.has(currentName.toLowerCase())) {
                    chain.push(node);
                    visited.add(currentName.toLowerCase());
                }
            }

            resolving.delete(currentName.toLowerCase());
        };

        await buildChain(targetName);

        if (chain.length > 0) {
            return { data: chain, error: null };
        }

        // Fallback: If targetName has a dot (e.g. "dBQUID.PROD") and we found nothing, try resolving just the name ("PROD")
        if (targetName.includes('.')) {
            const simpleName = targetName.split('.').pop();
            if (simpleName && simpleName !== targetName) {
                console.log(`[resolveDependencyChainAction] No chain found for "${targetName}". Retrying with simple name "${simpleName}"...`);
                // Reset visited/resolving sets for the new attempt? 
                // Actually, we can just call buildChain again.
                // But we need to make sure we don't return partial chains from the first attempt if it failed?
                // The first attempt verified `chain` is empty, so we are safe.

                await buildChain(simpleName);

                if (chain.length > 0) {
                    return { data: chain, error: null };
                }
            }
        }

        return { data: null, error: 'Nessuna dipendenza trovata.' };

        return { data: chain, error: null };

    } catch (e) {
        console.error("Error in resolveDependencyChainAction:", e);
        return { data: null, error: e instanceof Error ? e.message : "Errore durante la risoluzione delle dipendenze." };
    }
}

// Resolve ancestor resources (media, links, triggers) for a target node by ID
// This is used to collect resources from ancestors of linked nodes
export async function resolveAncestorResourcesAction(targetNodeId: string): Promise<{
    data: { media: any[], links: any[], triggers: any[] } | null,
    error: string | null
}> {
    try {
        const user = await getAuthenticatedUser();

        // Helper to find ancestors of a node with specific ID
        const findAncestorsWithResources = (tree: any, targetId: string): { media: any[], links: any[], triggers: any[] } => {
            const result = { media: [] as any[], links: [] as any[], triggers: [] as any[] };

            // Track path while searching
            const search = (node: any, ancestorMedia: any[], ancestorLinks: any[], ancestorTriggers: any[]): boolean => {
                if (!node) return false;

                // Current node's resources
                const currentMedia = (node.media && Array.isArray(node.media)) ? node.media : [];
                const currentLinks = (node.links && Array.isArray(node.links)) ? node.links : [];
                const currentTriggers = (node.triggers && Array.isArray(node.triggers)) ? node.triggers : [];

                // Combine with ancestors
                const allMedia = [...ancestorMedia, ...currentMedia];
                const allLinks = [...ancestorLinks, ...currentLinks];
                const allTriggers = [...ancestorTriggers, ...currentTriggers];

                // Check if this is the target node
                if (node.id === targetId) {
                    result.media = allMedia;
                    result.links = allLinks;
                    result.triggers = allTriggers;
                    return true;
                }

                // Check arrays
                if (Array.isArray(node)) {
                    for (const item of node) {
                        if (search(item, ancestorMedia, ancestorLinks, ancestorTriggers)) return true;
                    }
                    return false;
                }

                // Check options
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

        // Search all trees for the target node
        const candidates = await db.tree.findMany({
            where: {
                companyId: user.companyId,
                jsonDecisionTree: {
                    contains: targetNodeId,
                }
            },
            select: {
                id: true,
                jsonDecisionTree: true,
                name: true
            }
        });

        for (const tree of candidates) {
            try {
                const json = JSON.parse(tree.jsonDecisionTree);
                const resources = findAncestorsWithResources(json, targetNodeId);

                // If we found any resources, return them
                if (resources.media.length > 0 || resources.links.length > 0 || resources.triggers.length > 0) {
                    console.log(`[resolveAncestorResourcesAction] Found resources for node ${targetNodeId}: ${resources.media.length} media, ${resources.links.length} links, ${resources.triggers.length} triggers`);
                    return { data: resources, error: null };
                }
            } catch (e) {
                continue;
            }
        }

        // Return empty resources if not found
        return { data: { media: [], links: [], triggers: [] }, error: null };

    } catch (e) {
        console.error("Error in resolveAncestorResourcesAction:", e);
        return { data: null, error: e instanceof Error ? e.message : "Errore durante la risoluzione delle risorse ancestor." };
    }
}
