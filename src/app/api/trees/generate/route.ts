/**
 * POST /api/trees/generate
 *
 * Generates a decision tree from a text description.
 * Checks the AI provider setting:
 *   - claude-cli  → spawns Claude CLI synchronously to generate the tree
 *   - openrouter  → delegates to processDescriptionAction (existing flow)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getAiProviderAction } from '@/actions/ai-settings';
import { processDescriptionAction } from '@/app/actions';
import { spawn } from 'child_process';

export const maxDuration = 120;

// ─── Claude CLI sync helper ─────────────────────────────────────────────────

async function generateTreeWithClaudeCli(
    textDescription: string,
    type: 'RULE' | 'PIPELINE',
    companyId: string,
    model: string,
): Promise<{ data: any | null; error: string | null }> {
    const claudePath = process.env.CLAUDE_PATH || '/opt/homebrew/bin/claude';

    const systemPrompt = `Sei un Business Rules Engine esperto. Devi generare un albero decisionale strutturato a partire dalla descrizione fornita dall'utente.

COMPITO:
1. Analizza il testo e identifica TUTTE le variabili decisionali
2. Genera un albero JSON strutturato con domande, opzioni e decisioni finali
3. Genera una versione in linguaggio naturale dell'albero
4. Genera uno script delle domande numerato

FORMATO OUTPUT (JSON VALIDO, nient'altro):
{
  "suggestedName": "Nome breve dell'albero (2-5 parole, in italiano)",
  "jsonDecisionTree": {
    "question": "Prima domanda?",
    "options": {
      "Opzione1": {
        "question": "Sotto-domanda?",
        "options": {
          "Sì": { "decision": "Decisione finale A" },
          "No": { "decision": "Decisione finale B" }
        }
      },
      "Opzione2": { "decision": "Decisione finale C" }
    }
  },
  "naturalLanguageDecisionTree": "Versione testuale completa dell'albero in italiano...",
  "questionsScript": "1. Prima domanda?\\n2. Seconda domanda?\\n..."
}

REGOLE:
- Ogni nodo interno ha "question" + "options" (mappa di opzioni → sotto-nodi)
- Ogni foglia ha "decision" (stringa con la decisione finale)
- L'output DEVE essere in italiano
- Rispondi SOLO con il JSON, senza markdown, senza commenti, senza \`\`\`
- Il JSON deve essere valido e parsabile`;

    const userPrompt = `Genera l'albero decisionale per questa descrizione:\n\n${textDescription}`;

    return new Promise((resolve) => {
        const args = [
            '--model', model,
            '-p',
            '--output-format', 'json',
            '--permission-mode', 'bypassPermissions',
            `<system>\n${systemPrompt}\n</system>\n\n${userPrompt}`,
        ];

        // Ensure /opt/homebrew/bin is in PATH so `node` and `claude` are found
        const extraPaths = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'];
        const currentPath = process.env.PATH || '';
        const fullPath = [...extraPaths, currentPath].join(':');
        const child = spawn(claudePath, args, {
            cwd: process.cwd(),
            env: { ...process.env, FORCE_COLOR: '0', PATH: fullPath },
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf-8'); });
        child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf-8'); });

        child.on('close', async (code) => {
            if (code !== 0) {
                console.error('[generate/cli] stderr:', stderr);
                resolve({ data: null, error: `Claude CLI errore (exit ${code}): ${stderr.slice(0, 500)}` });
                return;
            }

            try {
                // Parse the CLI JSON output — extract the result text
                const cliOutput = JSON.parse(stdout);
                const resultText = cliOutput?.result || '';

                // The result text should be raw JSON (not markdown-wrapped)
                let treeData: any;
                try {
                    treeData = JSON.parse(resultText);
                } catch {
                    // Try extracting JSON from potential markdown wrapping
                    const jsonMatch = resultText.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
                    if (jsonMatch) {
                        treeData = JSON.parse(jsonMatch[1]);
                    } else {
                        // Try finding raw JSON object
                        const objMatch = resultText.match(/\{[\s\S]*\}/);
                        if (objMatch) {
                            treeData = JSON.parse(objMatch[0]);
                        } else {
                            throw new Error('Nessun JSON trovato nella risposta');
                        }
                    }
                }

                // Validate required fields
                if (!treeData.jsonDecisionTree) {
                    resolve({ data: null, error: "L'AI non ha generato il campo jsonDecisionTree." });
                    return;
                }

                const jsonDecisionTree = typeof treeData.jsonDecisionTree === 'string'
                    ? treeData.jsonDecisionTree
                    : JSON.stringify(treeData.jsonDecisionTree);

                // Validate JSON
                JSON.parse(jsonDecisionTree);

                const name = treeData.suggestedName || `Regola-${Date.now().toString().slice(-6)}`;

                const createdTree = await db.tree.create({
                    data: {
                        name,
                        description: textDescription,
                        jsonDecisionTree,
                        naturalLanguageDecisionTree: String(treeData.naturalLanguageDecisionTree || ''),
                        questionsScript: String(treeData.questionsScript || ''),
                        type,
                        companyId,
                    },
                });

                resolve({
                    data: {
                        ...createdTree,
                        createdAt: createdTree.createdAt.toISOString(),
                    },
                    error: null,
                });
            } catch (e: any) {
                console.error('[generate/cli] Parse error:', e.message, 'stdout:', stdout.slice(0, 500));
                resolve({ data: null, error: `Errore parsing risposta Claude CLI: ${e.message}` });
            }
        });

        // Timeout after 90 seconds
        setTimeout(() => {
            try { child.kill('SIGTERM'); } catch { /* ignore */ }
            resolve({ data: null, error: 'Claude CLI timeout (90s)' });
        }, 90000);
    });
}

// ─── POST handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ data: null, error: 'Non autorizzato.' }, { status: 401 });
        }

        const user = await db.user.findUnique({
            where: { email: session.user.email },
            select: {
                id: true,
                companyId: true,
                openRouterApiKey: true,
                openRouterModel: true,
                aiProvider: true,
                claudeCliModel: true,
            },
        });

        if (!user?.companyId) {
            return NextResponse.json({ data: null, error: 'Utente non associato a una azienda.' }, { status: 400 });
        }

        const { textDescription, type = 'RULE', model: requestModel } = await req.json();
        if (!textDescription?.trim()) {
            return NextResponse.json({ data: null, error: 'Descrizione mancante.' }, { status: 400 });
        }

        const providerSettings = await getAiProviderAction();
        const aiProvider = providerSettings.provider || 'openrouter';

        if (aiProvider === 'claude-cli') {
            // ─── Claude CLI path ─────────────────────────────────────────────
            const cliModel = requestModel || providerSettings.claudeCliModel || 'claude-sonnet-4-6';
            const result = await generateTreeWithClaudeCli(
                textDescription,
                type as 'RULE' | 'PIPELINE',
                user.companyId,
                cliModel,
            );
            return NextResponse.json(result);
        }

        // ─── OpenRouter path (existing) ──────────────────────────────────────
        const openRouterModel = requestModel || user.openRouterModel || 'google/gemini-2.0-flash-001';
        const openRouterConfig = user.openRouterApiKey
            ? { apiKey: user.openRouterApiKey, model: openRouterModel }
            : undefined;

        const result = await processDescriptionAction(
            textDescription,
            '',
            type as 'RULE' | 'PIPELINE',
            openRouterConfig,
        );

        return NextResponse.json(result);
    } catch (e: any) {
        console.error('[api/trees/generate] Error:', e.message);
        return NextResponse.json({ data: null, error: e.message || 'Errore interno.' }, { status: 500 });
    }
}
