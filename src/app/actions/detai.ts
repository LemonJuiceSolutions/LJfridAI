'use server';

import { detaiFlow, type DetaiInput } from '@/ai/flows/detai-flow';
import type { StoredTree, DiagnoseProblemOutput } from '@/lib/types';
import { z } from 'zod';
import { generateText, Output } from 'ai';
import { getOpenRouterProvider, DEFAULT_MODEL } from '@/ai/ai-client';
import { getAuthenticatedUser } from './auth';
import { getTreesAction, searchTreesAction } from './trees';
import { callOpenRouterJSON, callOpenRouterWithTools } from './openrouter';

export interface DiagnoseProblemActionInput {
    id: string;
    decisionTree: StoredTree;
    userState: Record<string, any>;
    userProblem?: string;
    currentAnswer?: string;
    history: string | { speaker: 'user' | 'bot', text: string }[];
}

export async function diagnoseProblemAction(
    input: Omit<DiagnoseProblemActionInput, 'decisionTree'> & { specificTreeId?: string; previousNodeId?: string },
    openRouterConfig?: { apiKey: string, model: string },
    claudeCliConfig?: { model: string }
): Promise<{ data: DiagnoseProblemOutput | null; error: string | null; }> {
    try {
        const allTreesResult = await getTreesAction();

        if (allTreesResult.error || !allTreesResult.data) {
            throw new Error(allTreesResult.error || 'Nessun albero decisionale disponibile per la diagnosi.');
        }

        const trees = allTreesResult.data;

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
  "options": ["Opzione 1", "Opzione 2"],
  "isFinalDecision": boolean,
  "treeName": "Nome dell'albero usato (opzionale)"
}`;

        // SECURITY GDPR: redact PII from user-supplied text before sending to LLM
        const { maybeRedact } = await import('@/lib/pii-redact');
        const formattedHistory = Array.isArray(input.history)
            ? input.history.map(h => `${h.speaker.toUpperCase()}: ${maybeRedact(h.text)}`).join('\n')
            : maybeRedact(input.history);

        const userPrompt = `Stato Utente: ${JSON.stringify(maybeRedact(input.userState || {}))}
Problema Iniziale: ${maybeRedact(input.userProblem || '')}
Risposta Corrente: ${maybeRedact(input.currentAnswer || '')}
Cronologia Chat:
${formattedHistory}

Diagnostica il prossimo passo.`;

        let diagnosisOutput: DiagnoseProblemOutput | null = null;

        // SECURITY: resolve masked/missing apiKey from DB server-side
        const { resolveOpenRouterConfig } = await import('@/lib/openrouter-credentials');
        const effectiveOrConfig = await resolveOpenRouterConfig(openRouterConfig);

        if (effectiveOrConfig) {
            const result = await callOpenRouterJSON(
                effectiveOrConfig.apiKey,
                effectiveOrConfig.model,
                userPrompt,
                systemPrompt
            );
            if (result) {
                diagnosisOutput = {
                    question: result.question || result.text || "Non ho capito, puoi ripetere?",
                    options: result.options,
                    isFinalDecision: result.isFinalDecision || false,
                    treeName: result.treeName
                };
            }
        } else if (claudeCliConfig) {
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);
            const claudePath = process.env.CLAUDE_PATH || '/opt/homebrew/bin/claude';

            const cliPrompt = `<system>\n${systemPrompt}\n\nRispondi SOLO con JSON valido nel formato specificato. Nessun testo extra.\n</system>\n\n${userPrompt}`;

            try {
                const extraPaths = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'];
                const fullPath = [...extraPaths, process.env.PATH || ''].join(':');
                const { stdout } = await execAsync(
                    `${claudePath} --model ${claudeCliConfig.model} -p ${JSON.stringify(cliPrompt)}`,
                    { timeout: 60000, maxBuffer: 1024 * 1024, env: { ...process.env, PATH: fullPath } }
                );
                const jsonMatch = stdout.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    diagnosisOutput = {
                        question: parsed.question || parsed.text || "Non ho capito, puoi ripetere?",
                        options: parsed.options,
                        isFinalDecision: parsed.isFinalDecision || false,
                        treeName: parsed.treeName
                    };
                }
            } catch (cliError: any) {
                console.error('Claude CLI diagnose error:', cliError);
                throw new Error(`Claude CLI errore: ${cliError.message}`);
            }
        } else {
            const provider = getOpenRouterProvider();
            const { output } = await generateText({
                model: provider(DEFAULT_MODEL),
                prompt: userPrompt,
                system: systemPrompt,
                output: Output.object({
                    schema: z.object({
                        question: z.string(),
                        options: z.array(z.string()).optional(),
                        isFinalDecision: z.boolean(),
                        treeName: z.string().optional()
                    }),
                }),
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

export async function detaiAction(
    input: DetaiInput,
    openRouterConfig?: { apiKey: string, model: string },
    claudeCliConfig?: { model: string }
): Promise<{ data: any | null; error: string | null; }> {
    try {
        // SECURITY: resolve masked/missing apiKey from DB server-side
        const { resolveOpenRouterConfig } = await import('@/lib/openrouter-credentials');
        const effectiveOrConfig = await resolveOpenRouterConfig(openRouterConfig);

        if (claudeCliConfig) {
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);
            const claudePath = process.env.CLAUDE_PATH || '/opt/homebrew/bin/claude';

            const lastUserMsg = input.messages.filter(m => m.role === 'user').pop();
            const userText = lastUserMsg?.content?.[0]?.text || '';

            const historyText = input.messages
                .filter(m => (m as any).id !== 'initial-message')
                .map(m => {
                    if (m.role === 'user') return `User: ${m.content[0]?.text || ''}`;
                    if (m.role === 'model') return `Assistant: ${m.content[0]?.text || ''}`;
                    return '';
                })
                .filter(Boolean)
                .join('\n');

            const systemPrompt = `Sei detAI, un assistente IA esperto e proattivo. Rispondi in italiano. Basa le tue risposte sulla conoscenza contenuta negli alberi decisionali dell'azienda.

REGOLE:
1. Se l'utente menziona un termine specifico, una procedura o un concetto, CERCA prima nel database usando lo strumento searchDecisionTrees.
2. Se trovi informazioni, attribuisci la fonte con [Fonte: ID] ... [Fine Fonte].
3. Usa il grassetto (**testo**) per le informazioni trovate.
4. Se non trovi nulla, dillo onestamente.`;

            const treesResult = await getTreesAction();
            let contextPrompt = '';
            if (treesResult.data && treesResult.data.length > 0) {
                const queryLower = userText.toLowerCase();
                const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
                const matchedTrees = treesResult.data
                    .map(t => {
                        const searchText = `${t.name} ${t.description || ''} ${t.naturalLanguageDecisionTree || ''}`.toLowerCase();
                        const matchCount = queryWords.filter(w => searchText.includes(w)).length;
                        return { ...t, matchCount };
                    })
                    .filter(t => t.matchCount > 0)
                    .sort((a, b) => b.matchCount - a.matchCount)
                    .slice(0, 5);

                if (matchedTrees.length > 0) {
                    const treeSummaries = matchedTrees.map(t =>
                        `[Albero: ${t.name} (ID: ${t.id})]\n${(t.naturalLanguageDecisionTree || t.description || '').slice(0, 2000)}`
                    ).join('\n\n---\n\n');
                    contextPrompt = `<context>\nAlberi decisionali pertinenti trovati:\n\n${treeSummaries}\n</context>\n\n`;
                }
            }

            const fullPrompt = `<system>\n${systemPrompt}\n</system>\n\n${contextPrompt}${historyText ? `Conversazione precedente:\n${historyText}\n\n` : ''}Rispondi all'utente: ${userText}`;

            try {
                const extraPaths2 = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'];
                const fullPath2 = [...extraPaths2, process.env.PATH || ''].join(':');
                const { stdout } = await execAsync(
                    `${claudePath} --model ${claudeCliConfig.model} -p ${JSON.stringify(fullPrompt)}`,
                    { timeout: 60000, maxBuffer: 1024 * 1024, env: { ...process.env, PATH: fullPath2 } }
                );
                return { data: { text: stdout.trim() }, error: null };
            } catch (cliError: any) {
                console.error('Claude CLI error:', cliError);
                return { data: null, error: `Claude CLI errore: ${cliError.message}` };
            }
        } else if (effectiveOrConfig) {
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

                    const searchResult = await searchTreesAction(args.query, effectiveOrConfig);

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
    *   NON DEVI MAI rispondere "Mi dispiace, non ho le competenze..." o frasi simili se non hai PRIMA cercato nel database.
    *   NON chiedere mai all'utente di spiegarti un termine se puoi cercarlo. Usa lo strumento.

2.  **CONTRADDICI E CORREGGI**: Se l'utente fa un'affermazione che è in contrasto con le informazioni che trovi nel database, il tuo compito è contraddirlo gentilmente e correggerlo, usando i dati trovati.

3.  **ONESTÀ SUI LIMITI**: Se non conosci la risposta E non trovi nulla con lo strumento di ricerca, DEVI dire onestamente che non hai accesso a quel tipo di informazione.

4.  **REGOLA CRITICA DI ATTRIBUZIONE DELLA FONTE**: Quando la tua risposta si basa sulle informazioni trovate tramite lo strumento di ricerca, DEVI OBBLIGATORIAMENTE formattare la tua risposta per includere l'attribuzione della fonte con il formato esatto \`[Fonte: ID_DELLA_FONTE] Testo... [Fine Fonte]\`.

5.  **REGOLA DI FORMATTAZIONE (GRASSETTO)**: Quando includi informazioni che hai letto dai risultati della ricerca, DEVI OBBLIGATORIAMENTE racchiudere quelle informazioni tra doppi asterischi.

6. **PRESERVAZIONE EVIDENZIATURA**: Se le informazioni che trovi contengono testo racchiuso in \`[[node:...]]\`, DEVI includere questi marcatori nella tua risposta esattamente come sono.`
            };

            const messages = [
                systemMessage,
                ...input.messages.map(m => {
                    if (m.role === 'tool') {
                        return {
                            role: 'tool',
                            tool_call_id: m.content[0].toolResponse.id,
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

            const responseMessage = await callOpenRouterWithTools(effectiveOrConfig.apiKey, effectiveOrConfig.model, messages, tools);

            console.log("OpenRouter Response Message:", JSON.stringify(responseMessage, null, 2));

            if (responseMessage.tool_calls) {
                const toolCall = responseMessage.tool_calls[0];
                if (toolCall.function.name === 'searchDecisionTrees') {
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
