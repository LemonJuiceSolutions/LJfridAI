'use server';
/**
 * @fileOverview An AI flow for Python agent interactions.
 *
 * - pythonAgentChat - A function that handles Python agent conversations.
 */

import { ai } from '@/ai/genkit';
import { AgentInputSchema, AgentOutputSchema, type AgentInput, type AgentOutput } from '@/ai/schemas/agent-schema';

export async function pythonAgentChat(input: AgentInput): Promise<AgentOutput> {
  return pythonAgentFlow(input);
}

const pythonAgentFlow = ai.defineFlow(
  {
    name: 'pythonAgentFlow',
    inputSchema: AgentInputSchema,
    outputSchema: AgentOutputSchema,
  },
  async ({ nodeId, userMessage, script, tableSchema, inputTables, conversationHistory, needsClarification }) => {
    try {
      // Build context from table schema and input tables
      let context = '';
      
      if (tableSchema && Object.keys(tableSchema).length > 0) {
        context += '\n\n=== TABELLE DISPONIBILI ===\n';
        for (const [tableName, columns] of Object.entries(tableSchema)) {
          context += `\nTabella: ${tableName}\n`;
          if (Array.isArray(columns)) {
            context += `Colonne: ${columns.join(', ')}\n`;
          }
        }
      }
      
      if (inputTables && Object.keys(inputTables).length > 0) {
        context += '\n\n=== DATI DI ESEMPIO ===\n';
        for (const [tableName, data] of Object.entries(inputTables)) {
          if (Array.isArray(data) && data.length > 0) {
            context += `\nTabella: ${tableName}\n`;
            const sampleRows = data.slice(0, 3);
            context += `Esempio di righe:\n${JSON.stringify(sampleRows, null, 2)}\n`;
          }
        }
      }
      
      // Build conversation history
      let historyContext = '';
      if (conversationHistory && conversationHistory.length > 0) {
        historyContext = '\n\n=== CRONOLOGIA CONVERSAZIONE ===\n';
        for (const msg of conversationHistory) {
          historyContext += `\n${msg.role === 'user' ? 'Utente' : 'Agente'}: ${msg.content}\n`;
        }
      }
      
      // Build system prompt
      const systemPrompt = `Sei un assistente AI esperto in Python (pandas, matplotlib, plotly) che aiuta gli utenti a scrivere e modificare codice Python per l'analisi dati.

IL TUO RUOLO:
1. Capire il contesto delle tabelle in input e del codice Python corrente
2. Rispondere alle richieste dell'utente in modo preciso
3. Se non capisci la richiesta, CHIEDI CLARIFICAZIONI invece di indovinare
4. Aggiornare il codice Python quando richiesto

LIBRARIE DISPONIBILI:
- pandas (pd): per manipolazione dati
- numpy (np): per calcoli numerici
- matplotlib.pyplot (plt): per grafici statici
- plotly.express (px): per grafici interattivi
- plotly.graph_objects (go): per grafici personalizzati

REGOLE IMPORTANTI:
- Analizza SEMPRE lo script Python corrente prima di proporre modifiche
- Capisci SEMPRE le colonne disponibili nelle tabelle
- Se l'utente chiede qualcosa di vago (es. "aggiungi spazio a destra"), chiedi chiarimenti su:
  * Quale colonna?
  * Che tipo di spazio (padding, margine, layout, ecc.)?
  * Per quale scopo (grafico, tabella, ecc.)?
- Se l'utente menziona colonne che non esistono, informalo delle colonne disponibili
- Mantieni sempre il codice Python valido e corretto
- Per i grafici, usa le librerie appropriate (px per grafici veloci, go per personalizzazioni)

FORMATO RISPOSTA JSON:
{
  "message": "la tua risposta in italiano",
  "updatedScript": "il codice Python aggiornato (se applicabile)",
  "needsClarification": true/false,
  "clarificationQuestions": ["domanda 1", "domanda 2"] (se needsClarification è true)
}`;

      // Build user prompt
      const userPrompt = `=== RICHIESTA UTENTE ===
${userMessage}

=== CODICE PYTHON CORRENTE ===
${script || '(nessun codice definito)'}

${context}
${historyContext}

=== ISTRUZIONI ===
Analizza la richiesta e il contesto, poi rispondi in formato JSON seguendo le regole sopra indicate.`;

      // Call the AI model
      const { text } = await ai.generate({
        model: 'googleai/gemini-2.5-flash',
        prompt: `${systemPrompt}\n\n${userPrompt}`,
        config: {
          temperature: 0.7,
        },
      });
      
      // Parse the response
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            message: parsed.message || text,
            updatedScript: parsed.updatedScript,
            needsClarification: parsed.needsClarification || false,
            clarificationQuestions: parsed.clarificationQuestions || [],
          };
        }
      } catch (e) {
        console.error('Error parsing agent response:', e);
      }
      
      // Fallback if JSON parsing fails
      return {
        message: text,
        needsClarification: false,
      };
      
    } catch (e: any) {
      console.error('Error in Python agent flow:', e);
      return {
        message: `Errore: ${e.message}`,
        needsClarification: false,
      };
    }
  }
);
