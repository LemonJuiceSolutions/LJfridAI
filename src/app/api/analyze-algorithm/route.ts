/**
 * API Route: Analyze Algorithm
 * Takes SQL/Python code and generates a schema describing:
 * - Data sources (tables, DataFrames, files)
 * - Transformations applied
 * - Output produced
 * Returns structured markdown with a visual flow description.
 * Supports both OpenRouter and Claude CLI providers.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { generateText } from 'ai';
import { getOpenRouterModel } from '@/ai/providers/openrouter-provider';
import { runClaudeCliSync } from '@/ai/providers/claude-cli-provider';
import { db } from '@/lib/db';

export const maxDuration = 60;

const SYSTEM_PROMPT = `Sei un analista tecnico esperto. Analizza codice SQL o Python e restituisci SOLO un JSON valido (senza markdown, senza backtick, senza testo extra).

FORMATO JSON OBBLIGATORIO:
{
  "sources": [
    { "name": "NomeTabella", "type": "Database SQL", "columns": ["col1", "col2"] }
  ],
  "steps": [
    { "action": "READ", "description": "Lettura dati dalla tabella X" },
    { "action": "JOIN", "description": "JOIN tra X e Y su campo Z" },
    { "action": "FILTER", "description": "Filtro: solo record dove condizione" },
    { "action": "AGGREGATE", "description": "Aggregazione: SUM(importo) GROUP BY mese" }
  ],
  "output": {
    "type": "Tabella",
    "columns": ["colonna_risultato_1", "colonna_risultato_2"],
    "description": "Descrizione dell'output finale"
  },
  "notes": ["Nota 1", "Nota 2"]
}

VALORI POSSIBILI:
- source.type: "Database SQL", "DataFrame Pandas", "File CSV", "Pipeline", "API", "Variabile"
- step.action: "READ", "JOIN", "FILTER", "AGGREGATE", "CALCULATE", "SORT", "PIVOT", "MERGE", "TRANSFORM", "FORMAT", "EXPORT"
- step.detail: (opzionale) dettaglio tecnico come la clausola SQL esatta o il codice Python
- output.type: "Tabella", "Grafico", "Variabile", "HTML"

REGOLE:
- Rispondi SOLO con JSON valido, nient'altro
- Le descrizioni DEVONO essere in italiano
- Sii preciso: analizza ogni FROM/JOIN/WHERE/GROUP BY per SQL, ogni read/merge/groupby/apply per Python
- Includi TUTTE le tabelle/sorgenti usate, anche le subquery
- I nomi colonne nel campo columns devono essere quelli reali usati nel codice
- Se ci sono dipendenze da pipeline/nodi esterni, aggiungile come source con type "Pipeline"
- notes: aggiungi solo se ci sono criticità o ottimizzazioni importanti, altrimenti array vuoto`;


export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Fetch user with all AI settings directly from DB
        const user = await db.user.findUnique({
            where: { email: session.user.email },
            select: {
                openRouterApiKey: true,
                openRouterModel: true,
                aiProvider: true,
                claudeCliModel: true,
                company: { select: { id: true } },
            },
        });
        if (!user?.company) {
            return NextResponse.json({ error: 'Utente non associato a una company' }, { status: 400 });
        }

        const body = await request.json();
        const { code, language, context, provider: reqProvider, model: reqModel } = body as {
            code: string;
            language: 'sql' | 'python';
            context?: string;
            provider?: 'openrouter' | 'claude-cli';
            model?: string;
        };

        if (!code?.trim()) {
            return NextResponse.json({ error: 'Nessun codice da analizzare' }, { status: 400 });
        }

        const userPrompt = `Analizza questo codice ${language.toUpperCase()} e genera lo schema dell'algoritmo:

\`\`\`${language}
${code}
\`\`\`
${context ? `\nCONTESTO AGGIUNTIVO (dipendenze pipeline, tabelle disponibili):\n${context}` : ''}`;

        // Determine provider: request > user setting > default
        const provider = reqProvider || (user.aiProvider as string) || 'openrouter';

        let rawText = '';

        if (provider === 'claude-cli') {
            // ─── Claude CLI path ───
            const cliModel = reqModel || user.claudeCliModel || 'claude-sonnet-4-6';
            const result = await runClaudeCliSync({
                model: cliModel,
                systemPrompt: SYSTEM_PROMPT,
                userPrompt,
            });
            rawText = result.text;
        } else {
            // ─── OpenRouter path ───
            const apiKey = user.openRouterApiKey || '';
            if (!apiKey) {
                return NextResponse.json({ error: 'OpenRouter API key non configurata. Vai su Impostazioni per configurarla.' }, { status: 400 });
            }

            const modelId = reqModel || user.openRouterModel || 'google/gemini-2.0-flash-001';
            const model = getOpenRouterModel(apiKey, modelId);

            const result = await generateText({
                model,
                system: SYSTEM_PROMPT,
                prompt: userPrompt,
                temperature: 0.2,
                maxOutputTokens: 3000,
            });
            rawText = result.text;
        }

        // Parse JSON from AI response (strip markdown code fences if present)
        let jsonStr = rawText.trim();
        // Remove ```json ... ``` wrapping if present
        jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/i, '');

        try {
            const schema = JSON.parse(jsonStr);
            // Validate minimum structure
            if (!schema.sources || !schema.steps || !schema.output) {
                throw new Error('Schema incompleto');
            }
            return NextResponse.json({ success: true, schema });
        } catch (parseErr) {
            console.error('[analyze-algorithm] JSON parse failed, raw:', rawText.substring(0, 500));
            return NextResponse.json({ success: true, schema: null, fallbackText: rawText });
        }
    } catch (error: any) {
        console.error('[analyze-algorithm] Error:', error);
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}
