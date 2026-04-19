/**
 * POST /api/scheduler/optimize/[taskId]
 *
 * 1. Loads the task and walks its tree to find SQL nodes.
 * 2. Asks an AI to propose an optimized version of each SQL query.
 * 3. Runs BOTH the original and the optimized query against the source
 *    connector, capturing wall time for each.
 * 4. Compares the result sets (row count + canonical hash) so the user
 *    can trust that "Apply" won't change reporting output.
 *
 * Returns a per-node report with original/optimized SQL, timings,
 * row counts, equivalence verdict, and the AI's suggestion notes.
 *
 * The query execution can take several minutes on a slow source DB —
 * client should fire-and-poll or accept long TTFB. maxDuration is set
 * to the route's hard cap below.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { generateText } from 'ai';
import { getOpenRouterModel } from '@/ai/providers/openrouter-provider';
import { runClaudeCliSync } from '@/ai/providers/claude-cli-provider';
import { executeSqlPreviewAction } from '@/app/actions/sql';
import crypto from 'crypto';

type Provider = 'openrouter' | 'claude-cli';

// 25 min — the slowest task in our corpus (FatturatoB2C, 6 min) can run
// even longer under load; with parallel orig+opt exec the bottleneck is
// now max(orig, opt) per node * number of SQL nodes plus AI round-trips.
export const maxDuration = 1500;

const SYSTEM_PROMPT = `Sei un esperto SQL Server (T-SQL) e ottimizzazione query.
Riceverai una query SQL che gira su un database MSSQL e una statistica di esecuzione.
Devi proporre una versione OTTIMIZZATA della query che produca ESATTAMENTE lo stesso result set.

REGOLE DURISSIME:
- Stessa lista di colonne, nello stesso ordine, con gli stessi nomi.
- Stesso identico set di righe (stesso COUNT, stessi valori). Se la query originale usa ORDER BY, mantienilo. Se non lo usa, l'ordine non conta.
- NON cambiare la semantica dei filtri, dei JOIN, delle aggregazioni.
- Ottimizza riducendo il lavoro che il motore deve fare:
  * Sposta i filtri il piu vicino possibile alla scansione (predicate pushdown).
  * Pre-filtra prima di parsing XML / decodifica binaria / CROSS APPLY.
  * Sostituisci scan con seek dove possibile (date range, codici applicazione, etc.).
  * Evita SELECT * quando le colonne usate sono note.
  * Riduci CTE ridondanti.
- Se la query e' gia' ottimale, rispondi che non ci sono ottimizzazioni significative — non inventare.

Rispondi SEMPRE e SOLO con un JSON valido (no markdown, no backtick, no testo extra) in questo formato:
{
  "optimizedSql": "<la query ottimizzata, o stringa vuota se non ottimizzabile>",
  "rationale": "<spiegazione breve in italiano: cosa hai cambiato e perche>",
  "expectedSpeedup": "<stima testuale, es. '5-10x' o 'minimo' o 'nessuna'>",
  "risk": "<low|medium|high — quanto e' rischioso che il risultato differisca>",
  "notes": ["<eventuali avvertenze, es. richiede un index su X>"]
}`;

interface SqlNode {
    nodeId: string;
    name: string;
    nodePath: string;
    sqlQuery: string;
    connectorId?: string;
}

function flattenSqlNodes(treeJson: any, path: string[] = [], out: SqlNode[] = []): SqlNode[] {
    if (!treeJson || typeof treeJson !== 'object') return out;
    const candidateName = treeJson.sqlResultName || treeJson.name || treeJson.id;
    if (treeJson.sqlQuery && typeof treeJson.sqlQuery === 'string' && treeJson.sqlQuery.trim().length > 0) {
        out.push({
            nodeId: treeJson.id || treeJson.nodeId || candidateName,
            name: candidateName || '(anonymous)',
            nodePath: path.join(' > '),
            sqlQuery: treeJson.sqlQuery,
            connectorId: treeJson.connectorId || treeJson.sqlConnectorId,
        });
    }
    if (treeJson.options && typeof treeJson.options === 'object') {
        for (const key of Object.keys(treeJson.options)) {
            const child = treeJson.options[key];
            if (Array.isArray(child)) {
                child.forEach((c, i) => flattenSqlNodes(c, [...path, `${key}[${i}]`], out));
            } else {
                flattenSqlNodes(child, [...path, key], out);
            }
        }
    }
    return out;
}

/** Canonical hash of a row-set for equivalence verification.
 *  Sorts columns alphabetically and rows lexicographically before hashing
 *  so two queries that return the same logical data hash to the same value
 *  even if column order or row order differ. */
function hashRows(rows: any[] | null | undefined): { hash: string; sample: any[] } {
    if (!Array.isArray(rows) || rows.length === 0) {
        return { hash: 'EMPTY', sample: [] };
    }
    const allKeys = Array.from(
        new Set(rows.flatMap(r => Object.keys(r))),
    ).sort();
    const lines = rows
        .map(r => allKeys.map(k => JSON.stringify(r[k] ?? null)).join('|'))
        .sort();
    const h = crypto.createHash('sha256');
    for (const l of lines) h.update(l + '\n');
    return { hash: h.digest('hex'), sample: rows.slice(0, 5) };
}

async function getOpenRouterCreds(userId: string): Promise<{ apiKey: string; model: string } | null> {
    const u = await db.user.findUnique({
        where: { id: userId },
        select: { openRouterApiKey: true, openRouterModel: true },
    });
    const apiKey = u?.openRouterApiKey || process.env.OPENROUTER_API_KEY || '';
    const model = u?.openRouterModel || 'anthropic/claude-sonnet-4';
    if (!apiKey) return null;
    return { apiKey, model };
}

async function getClaudeCliDefaultModel(userId: string): Promise<string> {
    const u = await db.user.findUnique({
        where: { id: userId },
        select: { claudeCliModel: true },
    });
    return u?.claudeCliModel || 'claude-sonnet-4-6';
}

/** Run the optimizer prompt against either provider, return raw text. */
async function runOptimizerPrompt(opts: {
    provider: Provider;
    model: string;
    apiKey?: string;
    userPrompt: string;
}): Promise<string> {
    if (opts.provider === 'claude-cli') {
        const res = await runClaudeCliSync({
            userPrompt: opts.userPrompt,
            systemPrompt: SYSTEM_PROMPT,
            model: opts.model,
        });
        return res.text;
    }
    if (!opts.apiKey) throw new Error('OpenRouter API key missing');
    const ai = await generateText({
        model: getOpenRouterModel(opts.apiKey, opts.model),
        system: SYSTEM_PROMPT,
        prompt: opts.userPrompt,
        temperature: 0.1,
        maxOutputTokens: 4000,
    });
    return ai.text;
}

async function timedExec(query: string, connectorId: string) {
    const start = Date.now();
    const res = await executeSqlPreviewAction(query, connectorId, []);
    const ms = Date.now() - start;
    return { ms, data: res.data, error: res.error };
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ taskId: string }> }) {
    const { taskId } = await ctx.params;
    const t0 = Date.now();
    const log = (msg: string) => console.log(`[optimize/${taskId}] +${((Date.now() - t0) / 1000).toFixed(1)}s ${msg}`);

    const session = await getServerSession(authOptions);
    const user = session?.user as { id?: string; email?: string; companyId?: string } | undefined;
    if (!user?.companyId || !user.id) {
        log('401 unauthorized');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Per-call provider + model override from the UI picker. Falls back to
    // the user's saved openRouterModel / claudeCliModel if absent.
    const body = await request.json().catch(() => ({})) as { provider?: string; model?: string };
    const requestModel = typeof body?.model === 'string' && body.model.trim() ? body.model.trim() : null;
    const requestProvider: Provider = body?.provider === 'claude-cli' ? 'claude-cli' : 'openrouter';

    log(`start provider=${requestProvider} model=${requestModel || '(default)'}`);
    const task = await db.scheduledTask.findFirst({
        where: { id: taskId, companyId: user.companyId },
    });
    if (!task) { log('404 task not found'); return NextResponse.json({ error: 'Task not found' }, { status: 404 }); }

    const cfg: any = task.config || {};
    if (!cfg.treeId) { log('400 no treeId'); return NextResponse.json({ error: 'Task has no associated tree' }, { status: 400 }); }

    const tree = await db.tree.findFirst({
        where: { id: cfg.treeId, companyId: user.companyId },
    });
    if (!tree) { log('404 tree not found'); return NextResponse.json({ error: 'Tree not found' }, { status: 404 }); }

    const treeJson = JSON.parse(tree.jsonDecisionTree);
    const sqlNodes = flattenSqlNodes(treeJson);
    log(`sqlNodes=${sqlNodes.length}`);
    if (sqlNodes.length === 0) {
        return NextResponse.json({ error: 'No SQL nodes in this task' }, { status: 400 });
    }

    // Per-provider credentials. OpenRouter needs an API key; Claude CLI runs
    // locally on the server (no key, but the binary must exist).
    let creds: { apiKey: string; model: string } | null = null;
    let effectiveModel: string;
    if (requestProvider === 'claude-cli') {
        effectiveModel = requestModel || (await getClaudeCliDefaultModel(user.id));
    } else {
        creds = await getOpenRouterCreds(user.id);
        if (!creds) {
            return NextResponse.json(
                { error: 'OpenRouter API key not configured for this user. Add it in Settings.' },
                { status: 400 },
            );
        }
        effectiveModel = requestModel || creds.model;
    }

    // Pull recent execution stats so the AI knows what we are trying to beat.
    const recent = await db.scheduledTaskExecution.findMany({
        where: { taskId },
        orderBy: { startedAt: 'desc' },
        take: 10,
        select: { startedAt: true, completedAt: true, status: true },
    });
    const recentMs: number[] = recent
        .filter((r: { completedAt: Date | null }) => r.completedAt)
        .map((r: { completedAt: Date | null; startedAt: Date }) => (r.completedAt as Date).getTime() - r.startedAt.getTime());
    const avgRecentMs = recentMs.length > 0 ? Math.round(recentMs.reduce((s: number, x: number) => s + x, 0) / recentMs.length) : null;

    const reports: any[] = [];

    for (const node of sqlNodes) {
        log(`node ${node.name} — asking AI`);
        const userPrompt = `STATISTICA TASK:
- avg recent task duration: ${avgRecentMs ? `${(avgRecentMs / 1000).toFixed(1)}s` : 'unknown'}
- node name: ${node.name}
- node path: ${node.nodePath}

QUERY ORIGINALE:
${node.sqlQuery}

Proponi versione ottimizzata.`;

        // 1) Ask AI for optimized SQL
        let optimizedSql = '';
        let rationale = '';
        let expectedSpeedup = '';
        let risk = 'medium';
        let aiNotes: string[] = [];
        let aiError: string | null = null;
        try {
            const rawText = await runOptimizerPrompt({
                provider: requestProvider,
                model: effectiveModel,
                apiKey: creds?.apiKey,
                userPrompt,
            });
            log(`node ${node.name} — AI responded (${rawText.length} chars)`);
            const text = rawText.trim()
                .replace(/^```(?:json)?/, '')
                .replace(/```$/, '')
                .trim();
            const parsed = JSON.parse(text);
            optimizedSql = (parsed.optimizedSql || '').trim();
            rationale = parsed.rationale || '';
            expectedSpeedup = parsed.expectedSpeedup || '';
            risk = parsed.risk || 'medium';
            aiNotes = Array.isArray(parsed.notes) ? parsed.notes : [];
        } catch (e: any) {
            aiError = e.message || String(e);
        }

        if (!optimizedSql || aiError) {
            reports.push({
                nodeId: node.nodeId,
                nodeName: node.name,
                nodePath: node.nodePath,
                originalSql: node.sqlQuery,
                optimizedSql: null,
                rationale: aiError ? `AI error: ${aiError}` : (rationale || 'AI ritiene la query gia ottimale.'),
                expectedSpeedup,
                risk,
                aiNotes,
                originalMs: null,
                optimizedMs: null,
                originalRows: null,
                optimizedRows: null,
                equivalent: null,
                resultDiff: null,
            });
            continue;
        }

        // 2) Execute both queries with the node's connector (or inherited if missing).
        const connectorId = node.connectorId || cfg.connectorId || '';
        if (!connectorId) {
            reports.push({
                nodeId: node.nodeId,
                nodeName: node.name,
                nodePath: node.nodePath,
                originalSql: node.sqlQuery,
                optimizedSql,
                rationale,
                expectedSpeedup,
                risk,
                aiNotes,
                originalMs: null,
                optimizedMs: null,
                originalRows: null,
                optimizedRows: null,
                equivalent: null,
                resultDiff: 'connectorId missing — cannot execute',
            });
            continue;
        }

        // Run original and optimized in parallel — halves total wall time
        // when both hit different connection pools (they do, since
        // executeSqlPreviewAction opens a fresh pool per call). If one
        // errors we still report the other.
        log(`node ${node.name} — running original + optimized in parallel`);
        const [orig, opt] = await Promise.all([
            timedExec(node.sqlQuery, connectorId),
            timedExec(optimizedSql, connectorId),
        ]);
        log(`node ${node.name} — original ${orig.ms}ms rows=${orig.data?.length ?? 'null'} err=${orig.error || 'none'}`);
        log(`node ${node.name} — optimized ${opt.ms}ms rows=${opt.data?.length ?? 'null'} err=${opt.error || 'none'}`);

        const origHash = hashRows(orig.data);
        const optHash = hashRows(opt.data);
        const equivalent = !orig.error && !opt.error && origHash.hash === optHash.hash;
        const diffNote = orig.error
            ? `Originale ha fallito: ${orig.error}`
            : opt.error
              ? `Ottimizzata ha fallito: ${opt.error}`
              : equivalent
                ? null
                : `Hash diversi: orig=${origHash.hash.slice(0, 12)} opt=${optHash.hash.slice(0, 12)} (rows orig=${orig.data?.length} opt=${opt.data?.length})`;

        reports.push({
            nodeId: node.nodeId,
            nodeName: node.name,
            nodePath: node.nodePath,
            originalSql: node.sqlQuery,
            optimizedSql,
            rationale,
            expectedSpeedup,
            risk,
            aiNotes,
            originalMs: orig.ms,
            optimizedMs: opt.ms,
            originalRows: orig.data?.length ?? null,
            optimizedRows: opt.data?.length ?? null,
            originalSample: origHash.sample,
            optimizedSample: optHash.sample,
            equivalent,
            resultDiff: diffNote,
        });
    }

    log(`done — returning ${reports.length} report(s)`);
    return NextResponse.json({
        taskId,
        taskName: task.name,
        treeId: cfg.treeId,
        sqlNodeCount: sqlNodes.length,
        avgRecentMs,
        provider: requestProvider,
        model: effectiveModel,
        reports,
    });
}
