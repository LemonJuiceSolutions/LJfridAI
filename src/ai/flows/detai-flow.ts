'use server';

/**
 * @fileOverview A general-purpose AI chatbot flow with tool-using capabilities.
 *
 * - detaiFlow - A function that handles a conversational turn.
 * - searchDecisionTrees - A tool that allows the AI to search the decision tree database.
 */

import { ai } from '@/ai/genkit';
import { searchTreesAction } from '@/app/actions';
import { z } from 'genkit';


const searchDecisionTrees = ai.defineTool(
    {
        name: 'searchDecisionTrees',
        description: "Cerca nel database degli alberi decisionali per trovare informazioni o procedure pertinenti alla domanda o affermazione dell'utente.",
        inputSchema: z.object({
            query: z.string().describe("La query di ricerca basata sulla domanda o sui termini chiave nell'affermazione dell'utente."),
        }),
        outputSchema: z.string().describe("Un riepilogo in formato stringa dei risultati della ricerca trovati. Questo sarà 'Nessun risultato trovato.' se nulla corrisponde."),
    },
    async (input) => {
        return searchTreesAction(input.query);
    }
)


const DetaiInputSchema = z.object({
    messages: z.array(z.object({
        role: z.enum(['user', 'model', 'tool', 'system']),
        content: z.array(z.object({
            text: z.string().optional(),
            media: z.any().optional(),
            toolRequest: z.any().optional(),
            toolResponse: z.any().optional(),
        }))
    })).describe("The conversation history."),
});
export type DetaiInput = z.infer<typeof DetaiInputSchema>;

const DetaiOutputSchema = z.string().describe("The AI's response.");
export type DetaiOutput = z.infer<typeof DetaiOutputSchema>;


export async function detaiFlow(input: DetaiInput): Promise<DetaiOutput> {

    const systemMessage = {
        role: 'system' as const,
        content: [{
            text: `Sei detAI, un assistente IA esperto e proattivo. Il tuo compito è rispondere in modo utile e, soprattutto, basare le tue risposte sulla conoscenza contenuta in un database di alberi decisionali.

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

5.  **REGOLA DI FORMATTAZIONE (GRASSETTO)**: Quando includi informazioni che hai letto dai risultati della ricerca nella tua risposta, DEVI OBBLIGATORIAMENTE racchiudere quelle informazioni esatte tra doppi asterischi per renderle in grassetto, oltre ad usare i tag di attribuzione. Esempio: "[Fonte: id_albero_789] Secondo la procedura, devi **controllare il livello del liquido di raffreddamento**. [Fine Fonte]"`}]
    };

    // Sanitize messages to ensure they match Genkit's strict Part schema
    const cleanHistory = input.messages.map(m => {
        const cleanContent = m.content.map(c => {
            const part: any = {};
            if (c.text !== undefined && c.text !== null) part.text = c.text;
            if (c.media) part.media = c.media;

            if (c.toolRequest) {
                // Transform OpenAI-style tool request to Genkit format if necessary
                if (c.toolRequest.function && c.toolRequest.function.name) {
                    let args = {};
                    try {
                        args = typeof c.toolRequest.function.arguments === 'string'
                            ? JSON.parse(c.toolRequest.function.arguments)
                            : c.toolRequest.function.arguments;
                    } catch (e) {
                        console.error("Failed to parse tool arguments", e);
                    }

                    part.toolRequest = {
                        name: c.toolRequest.function.name,
                        input: args,
                        ref: c.toolRequest.id // Map 'id' to 'ref' for Genkit
                    };
                } else {
                    part.toolRequest = c.toolRequest;
                }
            }

            if (c.toolResponse) {
                // Ensure toolResponse is also Genkit compatible if it comes in a different format
                // But usually client sends what we expect. Let's just pass it for now unless we see issues.
                // Based on Genkit schema, it expects { name, output, ref }.
                // If our client sends { id, result }, we might need mapping.
                // Let's check the client side (actions.ts) structure for toolResponse.
                // In actions.ts: { id: toolReq.id, result: searchResult }
                // We need to map this to { ref: id, output: result, name: ... }
                // But we don't easily have the name here without looking back at the request.
                // However, Genkit might be lenient or we might need to store the name.
                // Let's assume for now we just pass it, but if it fails we fix it.
                // Actually, to be safe, let's map it if it looks like our custom structure.
                if (c.toolResponse.id && c.toolResponse.result) {
                    part.toolResponse = {
                        name: 'searchDecisionTrees', // We only have one tool for now, so this is a safe guess. ideally we should track it.
                        output: c.toolResponse.result,
                        ref: c.toolResponse.id
                    };
                } else {
                    part.toolResponse = c.toolResponse;
                }
            }

            // Ensure at least one property exists to satisfy validation
            if (Object.keys(part).length === 0) {
                return { text: "" };
            }
            return part;
        });
        return { role: m.role, content: cleanContent };
    });

    const fullHistory = [systemMessage, ...cleanHistory];

    const { text } = await ai.generate({
        model: 'googleai/gemini-1.5-flash',
        messages: fullHistory,
        tools: [searchDecisionTrees],
    });
    return text;
}
