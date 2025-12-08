

'use server';

import { extractVariables } from '@/ai/flows/extract-variables';
import { generateDecisionTree } from '@/ai/flows/generate-decision-tree';
import { rephraseQuestion } from '@/ai/flows/rephrase-question';
import { diagnoseProblem, type DiagnoseProblemInput, type DiagnoseProblemOutput } from '@/ai/flows/diagnose-problem';
import { detaiFlow, type DetaiInput } from '@/ai/flows/detai-flow';
import type { DecisionNode, StoredTree, Variable, ConsolidationProposal, VariableOption, DecisionLeaf, TriggerItem, MediaItem, LinkItem } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, getDoc, setDoc, query, orderBy, Timestamp, where, writeBatch, deleteDoc, updateDoc } from 'firebase/firestore';


import _ from 'lodash';
import {nanoid} from 'nanoid';
import { ai } from '@/ai/genkit';
import { z } from 'zod';

function findNodeByQuestion(node: DecisionNode | DecisionLeaf | string | { ref: string } | { subTreeRef: string } | any, questionOrDecision: string): DecisionNode | DecisionLeaf | null {
    if (typeof node === 'string') return null;
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
        questionsScript: treeResult.questionsScript,
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
    openRouterConfig?: { apiKey: string, model: string }
): Promise<{ data: StoredTree & { debug?: any } | null; error: string | null; }> {
  try {
    let decisionTreeResult;
    let extractedVariables = [];
    let debugInfo = null;

    if (openRouterConfig && openRouterConfig.apiKey) {
        const result = await processDescriptionWithOpenRouter(textDescription, openRouterConfig);
        extractedVariables = result.variables;
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
    
    const data = { ...newTree, id: treeDocRef.id, createdAt: newTree.createdAt.toDate().toISOString(), debug: debugInfo };

    return { data, error: null };

  } catch (e) {
    const error = e instanceof Error ? e.message : 'Si è verificato un errore imprevisto durante l\'analisi.';
    console.error('Error in processDescriptionAction:', e);
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

export async function diagnoseProblemAction(input: Omit<DiagnoseProblemInput, 'decisionTree'>, openRouterConfig?: { apiKey: string, model: string }): Promise<{ data: DiagnoseProblemOutput | null; error: string | null; }> {
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

      let result;
      
      if (openRouterConfig && openRouterConfig.apiKey) {
           const decisionTreeStr = JSON.stringify(simplifiedTrees);
           const prompt = `Here is the context for your task:
- The user's initial problem description is "${input.userProblem}"
- The complete library of available decision trees (with name, description, and full JSON content) is: ${decisionTreeStr}
- The conversation history so far is: ${input.history || 'No history yet.'}
- The user's most recent answer is: ${input.currentAnswer || 'This is the first interaction.'}`;

           const systemPrompt = `You are an expert diagnostic AI chatbot. Your primary goal is to help a user identify the correct troubleshooting guide (a specific decision tree from a provided library) and then walk them through it, question by question.
You MUST respond in Italian.

Follow these steps with absolute rigor:

1.  **Phase 1: IDENTIFY THE CORRECT TREE.**
    *   Your FIRST task is to analyze the user's problem description and the conversation history. Compare this information against the 'name', 'description', and the actual questions and decisions inside the 'json' of EVERY decision tree in the library to find the most relevant one.
    *   **If you are 100% confident** which tree to use, based on all the available information, proceed to Phase 2.
    *   **If you are NOT 100% confident, you MUST conduct a thorough investigation.** You must ask at least 4 clarifying questions to be sure.
        *   a. Identify the most probable decision tree.
        *   b. **Ask the ROOT QUESTION from that specific tree's JSON as a clarifying question.** This is how you test your hypothesis. For example, if you think the problem is about hydraulics, ask the first question from the hydraulics tree.
        *   c. Analyze the user's answer ('currentAnswer'). If it logically fits as a response to the question you asked, your hypothesis is gaining strength. Continue asking questions from this tree to gather more context.
        *   d. If the user's answer is nonsensical or clearly indicates the question was wrong, your hypothesis is incorrect. Apologize briefly, discard that tree, and pick the *next* most likely tree to test. Repeat the process by asking the root question of this new hypothesized tree.
        *   e. Only after you have gathered enough information from this multi-step clarification process (at least 4 interactions) and you are confident, you may proceed to Phase 2.
    *   **Crucially, do NOT invent your own generic clarifying questions.** Use the actual questions from the trees to probe the user and confirm the context. Do not ask the user to pick a tree by its name.

2.  **Phase 2: NAVIGATE THE IDENTIFIED TREE (INTERACTIVE GUIDE).**
    *   Once a tree is identified with high confidence, your job is to guide the user through its JSON structure, step-by-step.
    *   **If you are just starting the navigation (i.e., you have just identified the tree)**, your response MUST be the root question of that tree's JSON. Provide the corresponding options from the JSON. (Note: If you confirmed the tree via hypothesis testing, you've already asked the first question, so use the 'currentAnswer' to find the *next* step).
    *   **If you already have a user's answer ('currentAnswer') to a previous question from the tree**, use that answer to find the next node in the JSON (question or decision).
    *   Continue asking questions from the tree until you reach a leaf node (a final 'decision').

3.  **Formulate Output**:
    *   If you are asking a question (either to test a hypothesis, or from within a tree), set 'isFinalDecision' to 'false', provide the question text in the 'question' field, and list the available choices in the 'options' array.
    *   If you reach a leaf node (a final 'decision'), set 'isFinalDecision' to 'true', set the 'question' field to the final decision text, and leave the 'options' array empty. Set 'treeName' to the name of the tree you just navigated.
    *   **ALWAYS include 'treeName'** if you have identified the correct decision tree, even for intermediate questions. This helps in verifying the context.
    *   **CRITICAL: Include Attachments**: If the current node (question or decision) in the JSON tree contains 'media', 'links', or 'triggers', you MUST include them in your output exactly as they appear in the JSON. Do NOT include attachments if they are not present in the current node. Do NOT copy attachments from previous nodes.
    
    OUTPUT JSON FORMAT:
    {
        "question": "string",
        "options": ["string", "string"],
        "isFinalDecision": boolean,
        "treeName": "string (optional)",
        "media": [ ... ],
        "links": [ ... ],
        "triggers": [ ... ]
    }`;

           result = await callOpenRouterJSON(openRouterConfig.apiKey, openRouterConfig.model, prompt, systemPrompt);

      } else {
          result = await diagnoseProblem({
            ...input,
            decisionTree: JSON.stringify(simplifiedTrees),
          });
      }

      if (result.treeName) {
        // Try to find by name first, then by ID if not found (since treeName might be ID)
        let foundTree = allTreesResult.data.find(t => t.name === result.treeName);
        if (!foundTree) {
            foundTree = allTreesResult.data.find(t => t.id === result.treeName);
        }

        if (foundTree) {
            result.treeName = foundTree.id; // Normalize to ID

            // STRICT VERIFICATION: Verify attachments against the JSON source
            try {
                const treeJson = JSON.parse(foundTree.jsonDecisionTree);
                const matchingNode = findNodeByQuestion(treeJson, result.question);

                if (matchingNode) {
                    // Overwrite attachments from the authoritative source
                    result.media = matchingNode.media || [];
                    result.links = matchingNode.links || [];
                    result.triggers = matchingNode.triggers || [];
                } else {
                    // If node not found (rare, maybe slight text mismatch), fallback to LLM but be cautious
                    // Or we could try fuzzy matching, but for now let's trust LLM if exact match fails
                    // However, to fix the user's specific issue of hallucination, we might want to clear them if not found?
                    // No, safe to keep LLM's if we can't verify. But usually exact match should work if LLM follows instructions.
                }
            } catch (jsonError) {
                console.error("Error parsing tree JSON for verification:", jsonError);
            }
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
    *   Esempio: Se hai trovato due procedure pertinenti, la tua risposta DOVREBBE assomigliare a questo:
        \`\`\`
        Ho trovato diverse procedure per l'acquisizione di una commessa.

        [Fonte: id_albero_123] Per iniziare, è necessario raccogliere i requisiti del cliente e farli approvare dall'ufficio tecnico. Successivamente, si crea un ordine di vendita nel gestionale. [Fine Fonte]

        [Fonte: id_albero_456] Inoltre, per il processo specifico "SpeedHub", quando si riceve una mail da Tiziano, si apre una commessa e si avvisa Marco. Se Marco non risponde, la mail va inoltrata a Romina. [Fine Fonte]
        \`\`\`
    *   Devi usare questo formato per ogni blocco di informazioni distinto che proviene da una fonte diversa per consentire all'interfaccia utente di visualizzare le fonti.

5.  **REGOLA DI FORMATTAZIONE (GRASSETTO)**: Quando includi informazioni che hai letto dai risultati della ricerca nella tua risposta, DEVI OBBLIGATORIAMENTE racchiudere quelle informazioni esatte tra doppi asterischi per renderle in grassetto, oltre ad usare i tag di attribuzione. Esempio: "[Fonte: id_albero_789] Secondo la procedura, devi **controllare il livello del liquido di raffreddamento**. [Fine Fonte]"`
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
            
            return { data: { text: responseMessage.content }, error: null };

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

FORMATO OUTPUT (JSON):
{
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
${JSON.stringify(searchableTrees, null, 2)}`;

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
