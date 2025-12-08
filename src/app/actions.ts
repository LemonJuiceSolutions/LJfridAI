

'use server';

import { extractVariables } from '@/ai/flows/extract-variables';
import { generateDecisionTree } from '@/ai/flows/generate-decision-tree';
import { rephraseQuestion } from '@/ai/flows/rephrase-question';
import { diagnoseProblem, type DiagnoseProblemInput, type DiagnoseProblemOutput } from '@/ai/flows/diagnose-problem';
import { detaiFlow, type DetaiInput } from '@/ai/flows/detai-flow';
import type { DecisionNode, StoredTree, Variable, ConsolidationProposal, VariableOption, DecisionLeaf, TriggerItem } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, getDoc, setDoc, query, orderBy, Timestamp, where, writeBatch, deleteDoc, updateDoc } from 'firebase/firestore';


import _ from 'lodash';
import {nanoid} from 'nanoid';
import { ai } from '@/ai/genkit';
import { z } from 'zod';


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

// Helper for OpenRouter JSON calls
async function callOpenRouterJSON(apiKey: string, model: string, prompt: string, systemPrompt: string): Promise<any> {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" }
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`OpenRouter Error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    try {
        return JSON.parse(content);
    } catch (e) {
        // Fallback: try to extract JSON from markdown code block if present
        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/{[\s\S]*}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[1] || jsonMatch[0]);
        }
        throw new Error("Failed to parse JSON response from AI");
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
4. Provide three outputs:
   a) "naturalLanguageDecisionTree": A version in natural language.
   b) "jsonDecisionTree": A structured JSON representation (stringified or object).
   c) "questionsScript": A script of questions.

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

**OUTPUT FORMAT**: Return ONLY a valid JSON object with keys: "naturalLanguageDecisionTree", "jsonDecisionTree", "questionsScript".`;

    const treePrompt = `Input Text:
${textDescription}

Variables Table:
${variablesTable}`;

    const treeResult = await callOpenRouterJSON(config.apiKey, config.model, treePrompt, generateTreeSystemPrompt);

    // Ensure jsonDecisionTree is a string for storage (as per StoredTree type)
    let jsonDecisionTreeStr = treeResult.jsonDecisionTree;
    if (typeof jsonDecisionTreeStr !== 'string') {
        jsonDecisionTreeStr = JSON.stringify(jsonDecisionTreeStr);
    }

    return {
        variables, // though not strictly needed by StoredTree directly, it's used for table gen
        naturalLanguageDecisionTree: treeResult.naturalLanguageDecisionTree,
        jsonDecisionTree: jsonDecisionTreeStr,
        questionsScript: treeResult.questionsScript
    };
}

export async function processDescriptionAction(
    textDescription: string, 
    openRouterConfig?: { apiKey: string, model: string }
): Promise<{ data: StoredTree | null; error: string | null; }> {
  try {
    let decisionTreeResult;
    let extractedVariables = [];

    if (openRouterConfig && openRouterConfig.apiKey) {
        const result = await processDescriptionWithOpenRouter(textDescription, openRouterConfig);
        extractedVariables = result.variables;
        decisionTreeResult = {
            naturalLanguageDecisionTree: result.naturalLanguageDecisionTree,
            jsonDecisionTree: result.jsonDecisionTree,
            questionsScript: result.questionsScript
        };
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
    
    try {
        JSON.parse(decisionTreeResult.jsonDecisionTree);
    } catch (e) {
        console.error("JSON non valido ricevuto dall'IA (controllo finale):", decisionTreeResult.jsonDecisionTree);
        return { data: null, error: "L'IA ha generato un albero decisionale JSON non valido. Prova a riformulare la tua input o a riprovare." };
    }

    const name = `Albero-${Date.now().toString().slice(-6)}`;
    
    const newTree: Omit<StoredTree, 'id' | 'variables'> = {
        name,
        description: textDescription,
        ...decisionTreeResult,
        createdAt: Timestamp.now(),
    }
    
    const treeDocRef = doc(collection(db, 'trees'));
    
    await setDoc(treeDocRef, newTree);
    
    const data = { ...newTree, id: treeDocRef.id, createdAt: newTree.createdAt.toDate().toISOString() };

    return { data, error: null };

  } catch (e) {
    const error = e instanceof Error ? e.message : 'Si è verificato un errore imprevisto durante l\'analisi.';
    console.error('Error in processDescriptionAction:', e);
    return { data: null, error };
  }
}

export async function rephraseQuestionAction(question: string, context: string): Promise<{ data: string | null, error: string | null }> {
    try {
        const result = await rephraseQuestion({ question, context });
        return { data: result.rephrasedQuestion, error: null };
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Si è verificato un errore imprevisto durante la riformulazione.';
        console.error('Error in rephraseQuestionAction:', e);
        return { data: null, error };
    }
}

export async function getTreesAction(ids?: string[]): Promise<{ data: StoredTree[] | null; error: string | null; }> {
    try {
        let q;
        const trees: StoredTree[] = [];

        const processSnapshot = (querySnapshot: any) => {
            querySnapshot.forEach((doc: any) => {
                const data = doc.data();
                const createdAt = data.createdAt;
                trees.push({
                    id: doc.id,
                    name: data.name,
                    description: data.description,
                    naturalLanguageDecisionTree: data.naturalLanguageDecisionTree,
                    jsonDecisionTree: data.jsonDecisionTree,
                    questionsScript: data.questionsScript,
                    createdAt: createdAt?.toDate ? createdAt.toDate().toISOString() : (typeof createdAt === 'string' ? createdAt : null),
                });
            });
        };

        if (ids && ids.length > 0) {
            const chunks = _.chunk(ids, 30);
            for (const chunk of chunks) {
                q = query(collection(db, 'trees'), where('__name__', 'in', chunk));
                const querySnapshot = await getDocs(q);
                processSnapshot(querySnapshot);
            }
            if(trees[0]?.createdAt) {
                trees.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            }
        } else {
            q = query(collection(db, 'trees'), orderBy('createdAt', 'desc'));
            const querySnapshot = await getDocs(q);
            processSnapshot(querySnapshot);
        }

        return { data: trees, error: null };
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Si è verificato un errore imprevisto durante il recupero degli alberi.';
        console.error("Error in getTreesAction: ", e);
        return { data: null, error };
    }
}

export async function getTreeAction(id: string): Promise<{ data: StoredTree | null; error: string | null; }> {
    try {
        if (typeof id !== 'string' || !id) {
            return { data: null, error: 'ID albero non valido fornito.' };
        }
        const docRef = doc(db, 'trees', id);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            return { data: null, error: 'Albero decisionale non trovato.' };
        }
        
        const data = docSnap.data();
        const createdAt = data.createdAt;

        const tree: StoredTree = {
            id: docSnap.id,
            name: data.name,
            description: data.description,
            naturalLanguageDecisionTree: data.naturalLanguageDecisionTree,
            jsonDecisionTree: data.jsonDecisionTree,
            questionsScript: data.questionsScript,
            createdAt: createdAt?.toDate ? createdAt.toDate().toISOString() : (typeof createdAt === 'string' ? createdAt : null), 
        };

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
}): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!treeId || !nodePath) {
      throw new Error("Dati mancanti per l'aggiornamento del nodo.");
    }
    
    const treeDocRef = doc(db, 'trees', treeId);
    const treeDoc = await getDoc(treeDocRef);
    if (!treeDoc.exists()) {
      throw new Error("Albero non trovato.");
    }

    const treeToUpdate = treeDoc.data() as StoredTree;
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
        await updateDoc(treeDocRef, { name: parsedNodeData.name });
        return { success: true, error: null };
      }
      jsonTree = { ...jsonTree, ...parsedNodeData };
    } else {
      if (parsedNodeData === null) { // Deletion case
        _.unset(jsonTree, lodashPath);
      } else {
        _.set(jsonTree, lodashPath, parsedNodeData);
      }
    }
    
    await updateDoc(treeDocRef, {
      jsonDecisionTree: JSON.stringify(jsonTree, null, 2),
    });

    return { success: true, error: null };

  } catch (e) {
    const error = e instanceof Error ? e.message : "Si è verificato un errore imprevisto durante l'aggiornamento.";
    console.error("Error in updateTreeNodeAction: ", e);
    return { success: false, error: error.toString() };
  }
}

export async function diagnoseProblemAction(input: Omit<DiagnoseProblemInput, 'decisionTree'>): Promise<{ data: DiagnoseProblemOutput | null; error: string | null; }> {
    try {
      const allTreesResult = await getTreesAction();
      if (allTreesResult.error || !allTreesResult.data) {
        throw new Error(allTreesResult.error || 'Nessun albero decisionale disponibile per la diagnosi.');
      }
      
      const simplifiedTrees = allTreesResult.data.map(t => ({ 
        name: t.name, 
        description: t.description, 
        json: t.jsonDecisionTree 
      }));

      const result = await diagnoseProblem({
        ...input,
        decisionTree: JSON.stringify(simplifiedTrees),
      });

      if (result.isFinalDecision && result.treeName) {
        const foundTree = allTreesResult.data.find(t => t.name === result.treeName);
        if (foundTree) {
            result.treeName = foundTree.id; 
        }
      }

      return { data: result, error: null };
    } catch (e) {
        let errorMessage = 'Si è verificato un errore imprevisto durante la diagnosi.';
        if (e instanceof Error) {
            if (e.message.includes('parts template must produce only one message')) {
                errorMessage = "Si è verificato un errore di comunicazione con il servizio di intelligenza artificiale. Per favore, prova a riformulare la tua richiesta o riprova tra poco.";
            } else {
                errorMessage = e.message;
            }
        }
        console.error('Error in diagnoseProblemAction:', e);
        return { data: null, error: errorMessage };
    }
}

export async function getVariablesAction(): Promise<{ data: Variable[] | null; error: string | null; }> {
    try {
        const variablesQuery = query(collection(db, 'variables'), orderBy('name', 'asc'));
        const treesQuery = query(collection(db, 'trees'));

        const [variablesSnapshot, treesSnapshot] = await Promise.all([
            getDocs(variablesQuery),
            getDocs(treesQuery),
        ]);

        const variables: Variable[] = [];
        variablesSnapshot.forEach((doc) => {
            const data = doc.data();
            const createdAt = data.createdAt;
            variables.push({
                id: doc.id,
                name: data.name,
                type: data.type,
                possibleValues: data.possibleValues || [],
                createdAt: createdAt?.toDate ? createdAt.toDate().toISOString() : createdAt,
                usedIn: [], // Initialize empty
            });
        });

        const variableMapById = new Map(variables.map(v => [v.id, v]));

        for (const treeDoc of treesSnapshot.docs) {
            const treeData = treeDoc.data() as StoredTree;
            const treeId = treeDoc.id;
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
            } catch(e) {
                console.warn(`Malformed JSON in tree ${treeId}, skipping variable usage check for it.`);
            }
        }


        return { data: variables, error: null };
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Si è verificato un errore imprevisto durante il recupero delle variabili.';
        console.error("Error in getVariablesAction: ", e);
        return { data: null, error };
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
        const variablesRef = collection(db, 'variables');
        const querySnapshot = await getDocs(variablesRef);
        
        if (querySnapshot.empty) {
            return { success: true, error: null }; // Nothing to delete
        }

        const batch = writeBatch(db);
        querySnapshot.forEach((doc) => {
            batch.delete(doc.ref);
        });

        await batch.commit();
        return { success: true, error: null };
    } catch (e) {
        const error = e instanceof Error ? e.message : "Si è verificato un errore imprevisto durante l'eliminazione di massa.";
        console.error("Error in deleteAllVariablesAction: ", e);
        return { success: false, error };
    }
}


export async function getStandardizationDataAction(treeId: string): Promise<{ data: { tree: StoredTree, dbVariables: Variable[] } | null, error: string | null}> {
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

    } catch(e) {
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
        const batch = writeBatch(db);
        const variablesRef = collection(db, "variables");
        
        const treeResult = await getTreeAction(treeId);
        if (treeResult.error || !treeResult.data) {
            throw new Error(treeResult.error || 'Impossibile caricare l\'albero.');
        }
        const treeToUpdate = treeResult.data;
        let jsonTree = JSON.parse(treeToUpdate.jsonDecisionTree);
        
        for (const action of approvedActions) {
            const varToSaveId = action.type === 'merge' && action.dbVarId ? action.dbVarId : nanoid();
            const varToSaveRef = doc(variablesRef, varToSaveId);
            
            const cleanFinalOptions = _.uniqBy(
                (action.finalOptions || []).map(opt => ({...opt, id: opt.id || nanoid(8)}))
                    .filter(v => v && v.name && v.name.trim() !== ''),
                'name'
            );
            
            const varData: Omit<Variable, 'id' | 'usedIn' | 'createdAt'> = {
                name: action.finalName,
                type: 'enumeration', 
                possibleValues: cleanFinalOptions,
            };
            
            const varDocSnap = await getDoc(varToSaveRef);
            const existingCreatedAt = varDocSnap.exists() ? varDocSnap.data().createdAt : Timestamp.now();
            
            batch.set(varToSaveRef, { ...varData, createdAt: existingCreatedAt }, { merge: true });

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
        
        const treeDocRef = doc(db, 'trees', treeId);
        
        batch.update(treeDocRef, {
            jsonDecisionTree: JSON.stringify(jsonTree, null, 2),
        });


        await batch.commit();
        
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

export async function detaiAction(input: DetaiInput): Promise<{ data: any | null; error: string | null; }> {
    try {
        const result = await detaiFlow(input);
        
        const lastMessage = input.messages[input.messages.length - 1];
        if (lastMessage?.role === 'tool') {
             return { data: { toolResponse: result }, error: null };
        }

        return { data: { text: result }, error: null };
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Si è verificato un errore imprevisto.';
        console.error('Error in detaiAction:', e);
        return { data: null, error };
    }
}


export async function searchTreesAction(query: string): Promise<string> {
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

Per ogni albero pertinente, fornisci un breve riassunto della procedura che descrive.`,
    output: { schema: SearchResultSchema },
  });

  if (!output || output.relevantTrees.length === 0) {
    return 'Nessun risultato trovato.';
  }

  return JSON.stringify(output.relevantTrees, null, 2);
}




export async function updateVariableAction(treeId: string | undefined, id: string, updateData: Partial<Variable>): Promise<{ success: boolean; data: StoredTree | null; error: string | null; }> {
    try {
        if (!id) throw new Error("ID variabile non fornito.");

        const batch = writeBatch(db);
        const varDocRef = doc(db, 'variables', id);
        
        const varDocSnap = await getDoc(varDocRef);
        if (!varDocSnap.exists()) throw new Error("Variabile da aggiornare non trovata.");
        
        const oldVarData = varDocSnap.data() as Variable;

        // Ensure IDs are present for new options
        const updatedPossibleValues = updateData.possibleValues?.map(opt => ({
            ...opt,
            id: opt.id || nanoid(8),
        }));

        const newName = updateData.name?.trim();
        const newPossibleValues = updatedPossibleValues ? _.uniqBy((updatedPossibleValues || []).map(v => ({...v, name: v.name.trim()})).filter(v => v.name), 'name') : undefined;
        
        const dbUpdatePayload: any = { ..._.omit(updateData, 'id', 'usedIn', 'createdAt', 'possibleValues') };
        if (newPossibleValues) dbUpdatePayload.possibleValues = newPossibleValues;
        if (newName) dbUpdatePayload.name = newName;

        batch.update(varDocRef, dbUpdatePayload);
        
        const allVarsResult = await getVariablesAction(); 
        if (allVarsResult.error) throw new Error(allVarsResult.error);
        const affectedTreesIds = allVarsResult.data?.find(v => v.id === id)?.usedIn?.map(t => t.id) || [];
        
        if (affectedTreesIds.length > 0) {
            const affectedTreesResult = await getTreesAction(affectedTreesIds);
            if (affectedTreesResult.error) throw new Error(affectedTreesResult.error);

            for (const treeDoc of affectedTreesResult.data!) {
                const treeToUpdateRef = doc(db, 'trees', treeDoc.id);

                if (!treeDoc.jsonDecisionTree) continue;
                let jsonTree;
                try {
                     jsonTree = JSON.parse(treeDoc.jsonDecisionTree);
                } catch(e) {
                    console.warn(`Skipping malformed tree ${treeDoc.id}`);
                    continue;
                }

                const finalPossibleValues = newPossibleValues || oldVarData.possibleValues;
                const finalOldPossibleValues = oldVarData.possibleValues;

                const { node: updatedJsonTree, updated } = recursiveTreeUpdateById(jsonTree, id, newName || oldVarData.name, finalPossibleValues, finalOldPossibleValues);
                
                if (updated) {
                    batch.update(treeToUpdateRef, {
                        jsonDecisionTree: JSON.stringify(updatedJsonTree, null, 2),
                    });
                }
            }
        }
        
        await batch.commit();
        
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
        if(oldOpt.id && currentOptions[oldOpt.name]) {
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
            if(oldOptMatch) {
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


export async function deleteTreeAction(id: string): Promise<{ success: boolean, error: string | null }> {
    try {
        const docRef = doc(db, 'trees', id);
        await deleteDoc(docRef);
        return { success: true, error: null };
    } catch (e) {
        const error = e instanceof Error ? e.message : "Si è verificato un errore imprevisto durante l'eliminazione.";
        console.error("Error in deleteTreeAction: ", e);
        return { success: false, error };
    }
}

export async function deleteAllTreesAction(): Promise<{ success: boolean, error: string | null }> {
    try {
        const treesRef = collection(db, 'trees');
        const querySnapshot = await getDocs(treesRef);
        
        if (querySnapshot.empty) {
            return { success: true, error: null };
        }

        const batch = writeBatch(db);
        querySnapshot.forEach((doc) => {
            batch.delete(doc.ref);
        });

        await batch.commit();
        return { success: true, error: null };
    } catch (e) {
        const error = e instanceof Error ? e.message : "Si è verificato un errore imprevisto durante l'eliminazione di massa.";
        console.error("Error in deleteAllTreesAction: ", e);
        return { success: false, error };
    }
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

        const batch = writeBatch(db);
        const variablesRef = collection(db, 'variables');
        const treesRef = collection(db, 'trees');

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

                batch.update(doc(treesRef, tree.id), {
                    jsonDecisionTree: JSON.stringify(updatedJsonTree, null, 2),
                });
            }
        }

        const targetVarRef = doc(variablesRef, targetVariableId);
        batch.update(targetVarRef, {
            name: finalName,
            possibleValues: _.uniqBy(finalPossibleValues.map(v => ({...v, id: v.id || nanoid(8)})), 'name')
        });

        const sourceVarRef = doc(variablesRef, sourceVariableId);
        batch.delete(sourceVarRef);

        await batch.commit();
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
                executedAt: Timestamp.now(),
            };

            await addDoc(collection(db, collectionName), logData);
            
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
