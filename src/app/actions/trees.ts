'use server';

import { revalidatePath } from 'next/cache';
import { extractVariables } from '@/ai/flows/extract-variables';
import { generateDecisionTree } from '@/ai/flows/generate-decision-tree';
import { rephraseQuestion } from '@/ai/flows/rephrase-question';
import type { DecisionNode, StoredTree, Variable, ConsolidationProposal, VariableOption, DecisionLeaf } from '@/lib/types';
import { db } from '@/lib/db';
import cloneDeep from 'lodash/cloneDeep';
import isEqual from 'lodash/isEqual';
import omit from 'lodash/omit';
import set from 'lodash/set';
import uniqBy from 'lodash/uniqBy';
import unset from 'lodash/unset';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { generateText, Output } from 'ai';
import { getOpenRouterProvider, DEFAULT_MODEL } from '@/ai/ai-client';
import { getAuthenticatedUser } from './auth';
import { serverCache, invalidateServerTreeCache } from '@/lib/server-cache';
import { callOpenRouterJSON } from './openrouter';
import { extractFirstJSON, sanitizeJSONString } from '@/lib/json-utils';
import { findNodeByQuestion, getLastAssistantQuestion, findNodeById, formatVariablesToTable, extractSubTreeRefs, recursiveTreeUpdate, recursiveTreeUpdateById } from '@/lib/tree-utils';

async function checkSubTreeCycle(originalTreeId: string, treeIdToCheck: string, companyId: string, visited: Set<string> = new Set()) {
    if (treeIdToCheck === originalTreeId) {
        throw new Error("Errore: Rilevato riferimento circolare. L'albero non può contenere se stesso (direttamente o indirettamente).");
    }

    if (visited.has(treeIdToCheck)) return;
    visited.add(treeIdToCheck);

    const treeData = await db.tree.findFirst({ where: { id: treeIdToCheck, companyId } });
    if (!treeData) return;

    if (!treeData.jsonDecisionTree) return;

    let jsonTree;
    try {
        jsonTree = JSON.parse(treeData.jsonDecisionTree);
    } catch {
        return;
    }

    const subRefs = extractSubTreeRefs(jsonTree);
    for (const ref of subRefs) {
        await checkSubTreeCycle(originalTreeId, ref, companyId, visited);
    }
}

async function processDescriptionWithOpenRouter(textDescription: string, config: { apiKey: string, model: string }) {
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

    const variables = (varsResult.variables || []).map((v: any) => ({
        ...v,
        possibleValues: (v.possibleValues || []).map((opt: any) => ({ ...opt, id: nanoid(8) }))
    }));

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
            extractVarsInput: { system: extractVarsSystemPrompt, user: textDescription },
            extractVarsOutput: varsResult,
            generateTreeInput: { system: generateTreeSystemPrompt, user: treePrompt },
            generateTreeOutput: treeResult
        }
    };
}

// ---------------------------------------------------------------------------
// Exported server actions
// ---------------------------------------------------------------------------

export async function processDescriptionAction(
    textDescription: string,
    name: string,
    type: 'RULE' | 'PIPELINE' = 'RULE',
    openRouterConfig?: { apiKey: string, model: string },
    _bypassCompanyId?: string
): Promise<{ data: any | null; error: string | null }> {
    try {
        let companyId: string;

        if (_bypassCompanyId) {
            companyId = _bypassCompanyId;
        } else {
            const sessionUser = await getAuthenticatedUser();
            if (!sessionUser) {
                return { data: null, error: 'Non autorizzato.' };
            }
            const user = await db.user.findUnique({ where: { id: sessionUser.id } });
            if (!user || !user.companyId) {
                return { data: null, error: 'Utente non associato a nessuna azienda.' };
            }
            companyId = user.companyId;
        }
        let decisionTreeResult;
        let extractedVariables = [];
        let debugInfo = null;
        let suggestedName = '';

        // SECURITY: resolve key from DB if client passed masked value or nothing
        const { resolveOpenRouterConfig } = await import('@/lib/openrouter-credentials');
        const effectiveConfig = await resolveOpenRouterConfig(openRouterConfig);

        if (effectiveConfig) {
            const result = await processDescriptionWithOpenRouter(textDescription, effectiveConfig);
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
            const { variables } = await extractVariables(textDescription);
            extractedVariables = variables;
            const variablesTable = formatVariablesToTable(variables);
            decisionTreeResult = await generateDecisionTree({
                textDescription,
                variablesTable,
            });
        }

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

        const treeName = suggestedName
            ? suggestedName
            : `Pipeline-${Date.now().toString().slice(-6)}`;

        const newTreeData = {
            name: treeName,
            description: textDescription,
            ...finalTreeData,
            createdAt: new Date(),
            type: type,
            companyId,
        };

        const createdTree = await db.tree.create({ data: newTreeData });
        const data = { ...createdTree, createdAt: createdTree.createdAt.toISOString(), debug: debugInfo };

        return { data, error: null };

    } catch (e) {
        const error = e instanceof Error ? e.message : 'Si è verificato un errore imprevisto durante l\'analisi.';
        console.error('Error in processDescriptionAction:', e);
        return { data: null, error };
    }
}

export async function rephraseQuestionAction(question: string, context: string, openRouterConfig?: { apiKey: string, model: string }): Promise<{ data: string | null, error: string | null }> {
    try {
        const { resolveOpenRouterConfig } = await import('@/lib/openrouter-credentials');
        const effectiveConfig = await resolveOpenRouterConfig(openRouterConfig);

        if (effectiveConfig) {
            const systemPrompt = `You are an AI assistant designed to rephrase questions for clarity or suggest related options.
  You MUST respond in Italian.

  Please provide a rephrased question that is easier to understand or suggest a few related options that the user can choose from.
  Ensure the rephrased question or suggested options are clear and concise.
  Output should be a single string in a JSON object with key "rephrasedQuestion".`;

            const prompt = `Original Question: ${question}\nContext: ${context}`;

            const result = await callOpenRouterJSON(effectiveConfig.apiKey, effectiveConfig.model, prompt, systemPrompt);
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

        if (!ids && !type && !lightweight && serverCache.trees && (now - serverCache.treesTimestamp) < serverCache.CACHE_DURATION) {
            return { data: serverCache.trees, error: null };
        }

        const whereClause: any = { companyId: user.companyId };
        if (type) whereClause.type = type;

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

        const trees: StoredTree[] = treesData.map((t: any) => ({
            ...t,
            jsonDecisionTree: (t as any).jsonDecisionTree ?? '',
            naturalLanguageDecisionTree: (t as any).naturalLanguageDecisionTree ?? '',
            questionsScript: (t as any).questionsScript ?? '',
            createdAt: t.createdAt.toISOString()
        }));

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

        const now = Date.now();
        if (!forceRefresh) {
            const cached = serverCache.treeById.get(id);
            if (cached && (now - cached.timestamp) < serverCache.CACHE_DURATION) {
                return { data: cached.data, error: null };
            }
        }

        const treeData = await db.tree.findFirst({
            where: { id, companyId: user.companyId }
        });

        if (!treeData) {
            return { data: null, error: 'Albero decisionale non trovato.' };
        }

        const tree: StoredTree = {
            ...treeData,
            type: (treeData as any).type || 'RULE',
            createdAt: treeData.createdAt.toISOString()
        };

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

        const treeToUpdate = await db.tree.findFirst({
            where: { id: treeId, companyId: user.companyId },
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
            if (parsedNodeData === null) {
                unset(jsonTree, lodashPath);
            } else {
                const newRefs = extractSubTreeRefs(parsedNodeData);
                if (newRefs.length > 0) {
                    try {
                        for (const ref of newRefs) {
                            await checkSubTreeCycle(treeId, ref, user.companyId);
                        }
                    } catch (e) {
                        const error = e instanceof Error ? e.message : "Rilevato ciclo di dipendenze.";
                        return { success: false, error: error };
                    }
                }
                set(jsonTree, lodashPath, parsedNodeData);
            }
        }

        const updatedJsonStr = JSON.stringify(jsonTree);

        const updated = await db.tree.update({
            where: { id: treeId },
            data: { jsonDecisionTree: updatedJsonStr },
            select: { id: true, name: true, description: true, type: true, createdAt: true, companyId: true, naturalLanguageDecisionTree: true, questionsScript: true }
        });

        invalidateServerTreeCache(treeId);

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

export async function regenerateNaturalLanguageAction(
    treeId: string,
    openRouterConfig?: { apiKey: string, model: string }
): Promise<{ success: boolean; error: string | null; data?: string }> {
    try {
        if (!treeId) {
            throw new Error("ID albero mancante.");
        }

        const user = await getAuthenticatedUser();
        const treeDoc = await db.tree.findFirst({ where: { id: treeId, companyId: user.companyId } });
        if (!treeDoc) {
            throw new Error("Albero non trovato.");
        }

        const jsonDecisionTree = treeDoc.jsonDecisionTree;

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

        // Check AI provider: Claude CLI or OpenRouter
        const { getAiProviderAction } = await import('@/actions/ai-settings');
        const providerSettings = await getAiProviderAction();
        const aiProvider = providerSettings.provider || 'openrouter';

        if (aiProvider === 'claude-cli') {
            // Use Claude CLI
            const { runClaudeCliSync } = await import('@/ai/providers/claude-cli-provider');
            const cliModel = providerSettings.claudeCliModel || 'claude-haiku-4-5';
            const result = await runClaudeCliSync({
                model: cliModel,
                systemPrompt,
                userPrompt,
            });
            // Parse JSON from Claude CLI text output
            try {
                const jsonMatch = result.text.match(/\{[\s\S]*"naturalLanguageDecisionTree"[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    newDescription = parsed.naturalLanguageDecisionTree || "";
                } else {
                    // If no JSON wrapper, the whole text is the description
                    newDescription = result.text.trim();
                }
            } catch {
                newDescription = result.text.trim();
            }
        } else {
            // OpenRouter path
            // Resolve AI config: prefer caller-supplied config, fall back to user's stored settings
            let resolvedApiKey = openRouterConfig?.apiKey;
            let resolvedModel = openRouterConfig?.model;
            if (!resolvedApiKey) {
                const { getOpenRouterSettingsAction } = await import('@/actions/openrouter');
                const settings = await getOpenRouterSettingsAction();
                resolvedApiKey = settings.apiKey || undefined;
                resolvedModel = resolvedModel || settings.model || DEFAULT_MODEL;
            }

            if (resolvedApiKey) {
                const result = await callOpenRouterJSON(
                    resolvedApiKey,
                    resolvedModel || DEFAULT_MODEL,
                    userPrompt,
                    systemPrompt
                );
                newDescription = result.naturalLanguageDecisionTree || result.description || "";
            } else {
                // Last resort: use OPENROUTER_API_KEY env var (may be empty in dev without .env)
                const provider = getOpenRouterProvider();
                const { output } = await generateText({
                    model: provider(resolvedModel || DEFAULT_MODEL),
                    prompt: userPrompt,
                    system: systemPrompt,
                    output: Output.object({
                        schema: z.object({
                            naturalLanguageDecisionTree: z.string().describe("La descrizione in linguaggio naturale dell'albero decisionale.")
                        }),
                    }),
                });
                newDescription = output?.naturalLanguageDecisionTree || "";
            }
        }

        if (!newDescription) {
            throw new Error("L'IA non ha generato una descrizione valida.");
        }

        await db.tree.update({
            where: { id: treeId },
            data: { naturalLanguageDecisionTree: newDescription }
        });

        return { success: true, error: null, data: newDescription };

    } catch (e) {
        const error = e instanceof Error ? e.message : "Si è verificato un errore imprevisto durante la rigenerazione.";
        console.error("Error in regenerateNaturalLanguageAction: ", e);
        return { success: false, error: error.toString() };
    }
}

export async function getStandardizationDataAction(treeId: string): Promise<{ data: { tree: StoredTree, dbVariables: Variable[] } | null, error: string | null }> {
    try {
        const treeResult = await getTreeAction(treeId);
        if (treeResult.error || !treeResult.data) {
            throw new Error(treeResult.error || 'Albero non trovato.');
        }

        const { getVariablesAction } = await import('./variables');
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
            const varToSaveId = action.dbVarId ? action.dbVarId : nanoid();

            const cleanFinalOptions = uniqBy(
                (action.finalOptions || []).map(opt => ({ ...opt, id: opt.id || nanoid(8) }))
                    .filter(v => v && v.name && v.name.trim() !== ''),
                'name'
            );

            const varData = {
                name: action.finalName,
                type: 'enumeration',
                possibleValues: cleanFinalOptions,
            };

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
            data: { jsonDecisionTree: JSON.stringify(jsonTree) }
        }));

        await db.$transaction(transactionOps);

        // Invalidate variable cache so getVariablesAction returns fresh data
        serverCache.variables = null;
        serverCache.variablesTimestamp = 0;
        invalidateServerTreeCache(treeId);

        const finalTreeResult = await getTreeAction(treeId);
        return { success: true, data: finalTreeResult.data, error: null };

    } catch (e) {
        const error = e instanceof Error ? e.message : 'Errore sconosciuto durante l\'esecuzione del consolidamento.';
        console.error("Error in executeConsolidationAction:", e);
        return { success: false, data: null, error };
    }
}

export async function searchTreesAction(query: string, openRouterConfig?: { apiKey: string, model: string }, claudeCliConfig?: { model: string }): Promise<string> {
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

    const { resolveOpenRouterConfig: resolveCfgSearch } = await import('@/lib/openrouter-credentials');
    const effectiveConfig = await resolveCfgSearch(openRouterConfig);

    if (effectiveConfig) {
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
            const result = await callOpenRouterJSON(effectiveConfig.apiKey, effectiveConfig.model, userPrompt, systemPrompt);
            if (!result || !result.relevantTrees || result.relevantTrees.length === 0) {
                return 'Nessun risultato trovato.';
            }
            return JSON.stringify(result.relevantTrees, null, 2);
        } catch (e) {
            console.error("OpenRouter Search Error:", e);
            return 'Errore durante la ricerca con OpenRouter.';
        }
    }

    if (claudeCliConfig) {
        const queryLower = query.toLowerCase();
        const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
        const matchedTrees = searchableTrees
            .map(t => {
                const searchText = `${t.name} ${t.description || ''} ${t.content || ''}`.toLowerCase();
                const matchCount = queryWords.filter(w => searchText.includes(w)).length;
                return { ...t, matchCount };
            })
            .filter(t => t.matchCount > 0)
            .sort((a, b) => b.matchCount - a.matchCount)
            .slice(0, 5);

        if (matchedTrees.length === 0) {
            return 'Nessun risultato trovato.';
        }

        return JSON.stringify(matchedTrees.map(t => ({
            name: t.name,
            sourceId: t.id,
            reason: `Corrispondenza per ${t.matchCount} parole chiave`,
            summary: (t.content || t.description || '').slice(0, 500)
        })), null, 2);
    }

    const SearchResultSchema = z.object({
        relevantTrees: z.array(z.object({
            name: z.string().describe("Il nome dell'albero decisionale."),
            sourceId: z.string().describe("L'ID univoco dell'albero decisionale di origine."),
            reason: z.string().describe("Motivo per cui questo albero è stato selezionato."),
            summary: z.string().describe("Un breve riassunto della procedura descritta nell'albero."),
        }))
    });

    const provider = getOpenRouterProvider();
    const { output } = await generateText({
        model: provider(DEFAULT_MODEL),
        prompt: `Analizza la seguente lista di alberi decisionali e restituisci solo quelli che sono altamente pertinenti alla query dell'utente. Per ogni albero, includi il suo ID univoco nel campo 'sourceId'.

Query utente: "${query}"

Alberi disponibili:
${JSON.stringify(searchableTrees, null, 2)}

Per ogni albero pertinente, fornisci un breve riassunto della procedura che descrive.
            IMPORTANTE: Se le informazioni che trovi contengono testo racchiuso in [[node:...]], DEVI includere questi marcatori nella tua risposta.`,
        output: Output.object({ schema: SearchResultSchema }),
    });

    if (!output || output.relevantTrees.length === 0) {
        return 'Nessun risultato trovato.';
    }

    return JSON.stringify(output.relevantTrees, null, 2);
}

export async function importTreeFromJsonAction(treeData: Partial<StoredTree>) {
    try {
        const sessionUser = await getAuthenticatedUser();
        if (!sessionUser) {
            return { error: 'Non autorizzato.' };
        }

        const user = await db.user.findUnique({ where: { id: sessionUser.id } });
        if (!user || !user.companyId) {
            return { error: 'Utente non associato a nessuna azienda.' };
        }

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

export async function clearPreviewDataAction(treeId: string): Promise<{ success: boolean; bytesFreed: number; error: string | null }> {
    try {
        const user = await getAuthenticatedUser();
        const treeRecord = await db.tree.findFirst({
            where: { id: treeId, companyId: user.companyId },
            select: { id: true, jsonDecisionTree: true },
        });
        if (!treeRecord) throw new Error('Albero non trovato.');

        const originalSize = Buffer.byteLength(treeRecord.jsonDecisionTree, 'utf8');

        function stripNode(node: any): any {
            if (!node || typeof node !== 'object') return node;
            if (Array.isArray(node)) return node.map(stripNode);

            const cleaned = { ...node };

            if (cleaned.externalAgentConfig) {
                const cfg = { ...cleaned.externalAgentConfig };
                delete cfg.lastResult;
                if (cfg.history) {
                    cfg.history = cfg.history.map((entry: any) => {
                        const { result, ...rest } = entry;
                        return rest;
                    });
                }
                cleaned.externalAgentConfig = cfg;
            }

            if (cleaned.aiConfig) {
                const cfg = { ...cleaned.aiConfig };
                delete cfg.lastResult;
                cleaned.aiConfig = cfg;
            }

            if (cleaned.widgetConfig) {
                const cfg = { ...cleaned.widgetConfig };
                delete cfg.data;
                cleaned.widgetConfig = cfg;
            }

            delete cleaned.pythonPreviewResult;
            delete cleaned.sqlPreviewData;
            delete cleaned.sqlPreviewTimestamp;
            delete cleaned.sqlPreviewLastUpdate;

            if (Array.isArray(cleaned.sqlChatHistory)) {
                cleaned.sqlChatHistory = cleaned.sqlChatHistory.map(({ preview: _p, ...msg }: any) => msg);
            }
            if (Array.isArray(cleaned.pythonChatHistory)) {
                cleaned.pythonChatHistory = cleaned.pythonChatHistory.map(({ preview: _p, ...msg }: any) => msg);
            }

            if (cleaned.options) {
                const newOptions: Record<string, any> = {};
                for (const [key, value] of Object.entries(cleaned.options)) {
                    newOptions[key] = stripNode(value);
                }
                cleaned.options = newOptions;
            }

            return cleaned;
        }

        const jsonTree = JSON.parse(treeRecord.jsonDecisionTree);
        const cleanedTree = stripNode(jsonTree);
        const cleanedJson = JSON.stringify(cleanedTree);
        const newSize = Buffer.byteLength(cleanedJson, 'utf8');

        await db.tree.update({
            where: { id: treeId },
            data: { jsonDecisionTree: cleanedJson },
        });

        invalidateServerTreeCache(treeId);

        return { success: true, bytesFreed: originalSize - newSize, error: null };
    } catch (e) {
        console.error('Error in clearPreviewDataAction:', e);
        return { success: false, bytesFreed: 0, error: e instanceof Error ? e.message : 'Errore sconosciuto' };
    }
}

export async function hydrateTreePreviewsAction(treeId: string, parsedTree: any): Promise<any> {
    try {
        const { hydrateTreeWithPreviews } = await import('@/lib/preview-cache');
        return await hydrateTreeWithPreviews(treeId, parsedTree);
    } catch (err: any) {
        console.warn('[hydrateTreePreviewsAction] Error:', err.message);
        return parsedTree;
    }
}

/**
 * Lightweight preview metadata for widget discovery.
 * Returns ONLY nodeId + presence flags — no actual data arrays.
 * Single DB query per tree, no Parquet reads, minimal RSC payload.
 */
export async function getTreePreviewMetadataAction(treeId: string): Promise<
    Record<string, { hasSql: boolean; pythonType?: string; aiOutputType?: string }>
> {
    try {
        const entries = await db.nodePreviewCache.findMany({
            where: { treeId },
            select: { nodeId: true, data: true },
        });

        const meta: Record<string, { hasSql: boolean; pythonType?: string; aiOutputType?: string }> = {};
        for (const entry of entries) {
            const cached = entry.data as any;
            if (!cached) continue;
            meta[entry.nodeId] = {
                hasSql: !!(cached.sqlPreviewData),
                pythonType: cached.pythonPreviewResult?.type || undefined,
                aiOutputType: cached.aiPreviewResult?.outputType || undefined,
            };
        }
        return meta;
    } catch (err: any) {
        console.warn('[getTreePreviewMetadataAction] Error:', err.message);
        return {};
    }
}

export async function getNodePreviewAction(treeId: string, nodeId: string, maxRows?: number): Promise<any | null> {
    try {
        const { db } = await import('@/lib/db');
        const entry = await db.nodePreviewCache.findUnique({
            where: { treeId_nodeId: { treeId, nodeId } },
        });
        if (!entry) return null;

        const cached = entry.data as any;
        const limit = maxRows || 2000;

        if (cached.sqlPreviewData === '__parquet__') {
            const { readParquet } = await import('@/lib/parquet-cache');
            const rows = await readParquet(treeId, `${nodeId}_sql`);
            if (rows) {
                cached.sqlPreviewData = rows.length > limit ? rows.slice(0, limit) : rows;
                cached._sqlTotalRows = rows.length;
            } else {
                delete cached.sqlPreviewData;
            }
        } else if (Array.isArray(cached.sqlPreviewData) && cached.sqlPreviewData.length > limit) {
            cached._sqlTotalRows = cached.sqlPreviewData.length;
            cached.sqlPreviewData = cached.sqlPreviewData.slice(0, limit);
        }

        if (cached.pythonPreviewResult?.data === '__parquet__') {
            const { readParquet } = await import('@/lib/parquet-cache');
            const rows = await readParquet(treeId, `${nodeId}_python`);
            if (rows) {
                cached.pythonPreviewResult.data = rows.length > limit ? rows.slice(0, limit) : rows;
                cached.pythonPreviewResult._totalRows = rows.length;
            } else {
                delete cached.pythonPreviewResult.data;
            }
        } else if (Array.isArray(cached.pythonPreviewResult?.data) && cached.pythonPreviewResult.data.length > limit) {
            cached.pythonPreviewResult._totalRows = cached.pythonPreviewResult.data.length;
            cached.pythonPreviewResult.data = cached.pythonPreviewResult.data.slice(0, limit);
        }

        return cached;
    } catch (err: any) {
        console.warn('[getNodePreviewAction] Error:', err.message);
        return null;
    }
}
