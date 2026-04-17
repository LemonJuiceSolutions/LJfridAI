import { NextRequest } from 'next/server';
import { generateText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getOpenRouterSettingsAction } from '@/actions/openrouter';
import { getAiProviderAction, type AiProvider } from '@/actions/ai-settings';
import { getOpenRouterModel } from '@/ai/providers/openrouter-provider';
import { runClaudeCliSync } from '@/ai/providers/claude-cli-provider';
import { getPythonBackendUrl } from '@/lib/python-backend';

export const maxDuration = 120;

// ── Provider-aware text generation ──────────────────────
async function generateTextAny(opts: {
    aiProvider: AiProvider;
    aiModel: any;
    cliModel?: string;
    system?: string;
    prompt: string;
    temperature?: number;
    maxRetries?: number;
}): Promise<{ text: string; usage: { inputTokens: number; outputTokens: number } }> {
    if (opts.aiProvider === 'claude-cli') {
        const result = await runClaudeCliSync({
            model: opts.cliModel || 'claude-sonnet-4-6',
            systemPrompt: opts.system || '',
            userPrompt: opts.prompt,
        });
        return {
            text: result.text,
            usage: { inputTokens: result.inputTokens || 0, outputTokens: result.outputTokens || 0 },
        };
    }
    const result = await generateText({
        model: opts.aiModel,
        system: opts.system,
        prompt: opts.prompt,
        temperature: opts.temperature ?? 0.3,
        maxRetries: opts.maxRetries ?? 2,
    });
    const u = result.usage || { inputTokens: 0, outputTokens: 0 };
    return { text: result.text || '', usage: { inputTokens: u.inputTokens || 0, outputTokens: u.outputTokens || 0 } };
}

// ── Helpers ──────────────────────────────────────────
function stripMarkdownFences(text: string): string {
    const m = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    return m ? m[1].trim() : text.trim();
}

function extractJson(text: string): string | null {
    const fenced = stripMarkdownFences(text);
    try { JSON.parse(fenced); return fenced; } catch { /* */ }
    const a = text.match(/\[[\s\S]*\]/);
    if (a) { try { JSON.parse(a[0]); return a[0]; } catch { /* */ } }
    const o = text.match(/\{[\s\S]*\}/);
    if (o) { try { JSON.parse(o[0]); return o[0]; } catch { /* */ } }
    return null;
}

function parseResult(text: string, outputType: string): any {
    switch (outputType) {
        case 'table': {
            const json = extractJson(text);
            if (json) { const p = JSON.parse(json); if (Array.isArray(p)) return p; if (p.data && Array.isArray(p.data)) return p.data; return [p]; }
            return [{ risultato: text.trim() }];
        }
        case 'number': {
            const c = stripMarkdownFences(text);
            const m = c.match(/-?\d+([.,]\d+)?/);
            if (m) return parseFloat(m[0].replace(',', '.'));
            const f = text.match(/-?\d+([.,]\d+)?/);
            if (f) return parseFloat(f[0].replace(',', '.'));
            return 0;
        }
        case 'chart': {
            const json = extractJson(text);
            if (json) { const p = JSON.parse(json); if (p.type && p.data) return p; if (p.data && Array.isArray(p.data)) return { type: 'bar-chart', data: p.data, xAxisKey: Object.keys(p.data[0] || {})[0], dataKeys: Object.keys(p.data[0] || {}).slice(1), title: p.title || 'Grafico AI' }; }
            throw new Error('Grafico non valido');
        }
        case 'string': default: return text.trim();
    }
}

// ── Validation ──────────────────────────────────────
const FAKE_DOMAINS = ['example.com', 'example.org', 'example.net', 'test.com', 'test.org', 'placeholder.com', 'fake.com', 'sample.com', 'domain.com', 'website.com', 'yoursite.com', 'mysite.com', 'sito.com', 'sito.it', 'lorem.com'];

function detectFakeUrls(result: any[]): number {
    let fakeCount = 0;
    for (const row of result) {
        for (const val of Object.values(row)) {
            if (typeof val === 'string' && (val.startsWith('http://') || val.startsWith('https://'))) {
                const lower = val.toLowerCase();
                if (FAKE_DOMAINS.some(d => lower.includes(d))) fakeCount++;
                if (/https?:\/\/(www\.)?[\w-]+\.(com|org|net)\/(rates|data|info|page|article|doc)\/\d{4}/.test(lower)) {
                    const knownReal = ['reuters.com', 'bloomberg.com', 'ecb.europa.eu', 'bankofengland.co.uk', 'federalreserve.gov', 'bce.europa.eu', 'bancaditalia.it', 'istat.it', 'wikipedia.org', 'investopedia.com', 'tradingeconomics.com', 'statista.com', 'worldbank.org', 'imf.org', 'oecd.org', 'mutuionline.it', 'ilsole24ore.com', 'corriere.it', 'ansa.it'];
                    if (!knownReal.some(d => lower.includes(d))) fakeCount++;
                }
            }
        }
    }
    return fakeCount;
}

function detectFabricatedSequences(result: any[]): { isFabricated: boolean; issue: string } {
    if (result.length < 4) return { isFabricated: false, issue: '' };
    const keys = Object.keys(result[0] || {});
    for (const key of keys) {
        const vals = result.map(r => typeof r[key] === 'number' ? r[key] : parseFloat(r[key])).filter(v => !isNaN(v));
        if (vals.length < 4) continue;

        // Check: all values identical (e.g. 2.2, 2.2, 2.2, 2.2...)
        const allIdentical = vals.every(v => v === vals[0]);
        if (allIdentical && vals.length >= 4) {
            return { isFabricated: true, issue: `Colonna "${key}" ha lo stesso valore (${vals[0]}) per tutte le ${vals.length} righe. I dati reali hanno valori DIVERSI per ogni periodo. Leggi i dati dalla ricerca con più attenzione e estrai il valore SPECIFICO per ogni data/periodo.` };
        }

        // Check: perfectly linear non-zero increments (e.g. 4.25, 4.30, 4.35...)
        const diffs: number[] = [];
        for (let i = 1; i < vals.length; i++) diffs.push(Math.round((vals[i] - vals[i - 1]) * 10000) / 10000);
        const allSameDiff = diffs.every(d => d === diffs[0]);
        if (allSameDiff && diffs[0] !== 0) {
            return { isFabricated: true, issue: `Colonna "${key}" ha una progressione lineare perfetta (incremento costante di ${diffs[0]}). I dati reali NON sono mai perfettamente lineari. Estrai i valori ESATTI dalla ricerca.` };
        }
    }
    return { isFabricated: false, issue: '' };
}

function validateResult(result: any, outputType: string): { valid: boolean; issues: string[] } {
    const issues: string[] = [];
    if (outputType === 'table' && Array.isArray(result)) {
        if (result.length === 0) issues.push('Tabella vuota');
        let nulls = 0;
        for (const row of result) for (const k of Object.keys(row)) if (row[k] === null || row[k] === undefined || row[k] === '') nulls++;
        if (nulls > 0) issues.push(`${nulls} valori nulli/vuoti`);
        const seen = new Set<string>(); let dups = 0;
        for (const row of result) { const k = JSON.stringify(row); if (seen.has(k)) dups++; seen.add(k); }
        if (dups > 0) issues.push(`${dups} righe duplicate`);
        if (result.length === 1 && result[0].risultato) issues.push('Testo al posto di dati strutturati');
        const fakeUrls = detectFakeUrls(result);
        if (fakeUrls > 0) issues.push(`${fakeUrls} link falsi/inventati. Usa SOLO URL reali dalla ricerca.`);
        const fabricated = detectFabricatedSequences(result);
        if (fabricated.isFabricated) issues.push(fabricated.issue);
        // Detect all-same links (lazy copy of one URL)
        if (result.length >= 4) {
            for (const key of Object.keys(result[0] || {})) {
                const vals = result.map(r => r[key]).filter(v => typeof v === 'string' && v.startsWith('http'));
                if (vals.length >= 4 && vals.every(v => v === vals[0])) {
                    issues.push(`Colonna "${key}" ha lo stesso link per tutte le righe. Ogni riga dovrebbe avere la fonte specifica per quel dato, oppure ometti la colonna link se i dati vengono dalla stessa pagina.`);
                }
            }
        }
    }
    if (outputType === 'number' && (typeof result !== 'number' || isNaN(result))) issues.push('Non è un numero valido');
    return { valid: issues.length === 0, issues };
}

// ── Direct Web Search (no LLM dependency) ──────────
async function searchWeb(query: string, serpApiKey: string): Promise<{ text: string; sources: { title: string; url: string; snippet: string }[] }> {
    const sources: { title: string; url: string; snippet: string }[] = [];
    const textParts: string[] = [];

    if (serpApiKey) {
        try {
            const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&api_key=${serpApiKey}&hl=it&gl=it&num=8`;
            const r = await fetch(url);
            if (r.ok) {
                const d = await r.json();
                if (d.answer_box?.answer) textParts.push(`Risposta diretta: ${d.answer_box.answer}`);
                if (d.answer_box?.snippet) textParts.push(`Snippet: ${d.answer_box.snippet}`);
                if (d.answer_box?.snippet_highlighted_words) textParts.push(`Parole chiave: ${d.answer_box.snippet_highlighted_words.join(', ')}`);
                if (d.knowledge_graph?.description) textParts.push(`Knowledge Graph: ${d.knowledge_graph.description}`);
                if (d.knowledge_graph?.title) textParts.push(`Titolo KG: ${d.knowledge_graph.title}`);
                if (d.organic_results) {
                    for (const x of d.organic_results.slice(0, 8)) {
                        sources.push({ title: x.title || '', url: x.link || '', snippet: x.snippet || '' });
                        textParts.push(`[${x.title}] (${x.link})\n${x.snippet || ''}`);
                        // Include rich snippets if available
                        if (x.rich_snippet?.top?.extensions) textParts.push(`  Dettagli: ${x.rich_snippet.top.extensions.join(' | ')}`);
                        if (x.rich_snippet?.bottom?.extensions) textParts.push(`  Info: ${x.rich_snippet.bottom.extensions.join(' | ')}`);
                    }
                }
                // Include related questions if available
                if (d.related_questions) {
                    for (const rq of d.related_questions.slice(0, 3)) {
                        if (rq.snippet) textParts.push(`FAQ: ${rq.question}\n${rq.snippet}`);
                    }
                }
            }
        } catch { /* serpapi failed */ }
    }

    // Fallback: localhost scraper
    if (textParts.length === 0) {
        try {
            const r = await fetch(`${getPythonBackendUrl()}/scrape`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=it`, extractType: 'text' }),
                signal: AbortSignal.timeout(30_000),
            });
            if (r.ok) { const d = await r.json(); if (d.text) textParts.push(d.text.slice(0, 4000)); }
        } catch { /* scraper failed */ }
    }

    return { text: textParts.join('\n\n'), sources };
}

// ── Scrape full page content from URLs ──────────
async function scrapePageContent(url: string): Promise<string> {
    // Try localhost scraper first (most reliable for extracting clean text)
    try {
        const r = await fetch(`${getPythonBackendUrl()}/scrape`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, extractType: 'text' }),
            signal: AbortSignal.timeout(30_000),
        });
        if (r.ok) {
            const d = await r.json();
            if (d.text && d.text.length > 100) return d.text.slice(0, 8000);
        }
    } catch { /* scraper not available */ }

    // Fallback: direct fetch + basic HTML text extraction
    // SECURITY: SSRF guard via safeFetch (blocks loopback, private, AWS metadata)
    try {
        const { safeFetch } = await import('@/lib/safe-fetch');
        const r = await safeFetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; FridAI/1.0)',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
            },
            timeoutMs: 10000,
        });
        if (r.ok) {
            const html = await r.text();
            // Basic HTML to text: remove scripts, styles, tags
            const text = html
                .replace(/<script[\s\S]*?<\/script>/gi, '')
                .replace(/<style[\s\S]*?<\/style>/gi, '')
                .replace(/<nav[\s\S]*?<\/nav>/gi, '')
                .replace(/<footer[\s\S]*?<\/footer>/gi, '')
                .replace(/<header[\s\S]*?<\/header>/gi, '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/&nbsp;/g, ' ')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&#?\w+;/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            if (text.length > 100) return text.slice(0, 8000);
        }
    } catch { /* fetch failed */ }

    return '';
}

// Pick most relevant URLs to scrape for full content
function selectUrlsToScrape(sources: { title: string; url: string; snippet: string }[], maxUrls: number = 3): string[] {
    // Prioritize known data-rich domains
    const priorityDomains = ['tradingeconomics.com', 'ecb.europa.eu', 'bancaditalia.it', 'istat.it', 'mutuionline.it', 'ilsole24ore.com', 'investing.com', 'statista.com', 'worldbank.org', 'oecd.org', 'bce.europa.eu'];
    const sorted = [...sources].sort((a, b) => {
        const aPriority = priorityDomains.some(d => a.url.includes(d)) ? 0 : 1;
        const bPriority = priorityDomains.some(d => b.url.includes(d)) ? 0 : 1;
        return aPriority - bPriority;
    });
    // Deduplicate by domain
    const seen = new Set<string>();
    const urls: string[] = [];
    for (const s of sorted) {
        try {
            const domain = new URL(s.url).hostname;
            if (!seen.has(domain)) {
                seen.add(domain);
                urls.push(s.url);
                if (urls.length >= maxUrls) break;
            }
        } catch { /* invalid URL */ }
    }
    return urls;
}

// ── Extract search queries from prompt ──────────
async function extractSearchQueries(prompt: string, aiModel: any, todayISO: string, feedback?: string): Promise<string[]> {
    try {
        const feedbackHint = feedback ? `\nTentativo precedente fallito perché: ${feedback}\nGenera query DIVERSE e più specifiche.` : '';
        const result = await generateText({
            model: aiModel,
            system: `Sei un assistente che genera query di ricerca Google. Data di oggi: ${todayISO}.
Genera 3-5 query di ricerca Google in italiano per trovare i dati richiesti.
REGOLE:
- Query specifiche e mirate (includi anno/mese corrente se rilevante)
- Includi nomi di fonti autorevoli (es. "site:ecb.europa.eu", "site:bancaditalia.it", "ISTAT", "Trading Economics")
- Una query generica + 2-3 query specifiche per fonti diverse
- Rispondi SOLO con le query, una per riga, senza numerazione né commenti${feedbackHint}`,
            prompt,
            temperature: 0.3,
            maxRetries: 1,
        });
        const queries = (result.text || '').split('\n').map(q => q.trim()).filter(q => q.length > 5 && q.length < 200);
        return queries.slice(0, 5);
    } catch {
        // Fallback: use the first 100 chars of the prompt as a search query
        const simple = prompt.replace(/\{\{[^}]+\}\}/g, '').slice(0, 100).trim();
        return simple ? [simple] : [];
    }
}

function buildFormatSystemPrompt(outputType: string, today: string, hasEmbeddedData: boolean): string {
    const dataSource = hasEmbeddedData
        ? `Hai a disposizione DUE fonti di dati:
1. DATI DELL'UTENTE: tabelle, variabili e dati già presenti nel prompt dell'utente (questi sono la fonte PRIMARIA).
2. RICERCA WEB: risultati dalla ricerca web (fonte supplementare per arricchire/integrare).
USA PRIMA i dati dell'utente come base, poi ARRICCHISCI con i dati dalla ricerca web se utile.`
        : `Hai a disposizione i RISULTATI DI RICERCA WEB. ESTRAI tutti i dati rilevanti che trovi.`;

    const base = `Sei un analista dati AI. Il tuo compito è elaborare i dati forniti e produrre il risultato richiesto.
La data di oggi è ${today}.
${dataSource}
REGOLE:
- Rispondi SOLO con il formato richiesto, ZERO commenti o spiegazioni.
- NON restituire MAI un array vuoto [] o "Dati non disponibili". Elabora i dati che hai.
- I link/URL devono essere reali (copiati dalla ricerca, MAI inventati).
- NON inventare dati che non esistono nelle fonti fornite.`;
    switch (outputType) {
        case 'table': return `${base}\nFORMATO: JSON array di oggetti. Ogni riga deve avere valori (MAI null). Estrai/elabora TUTTE le righe di dati.\n${hasEmbeddedData ? 'Se i dati utente contengono una tabella JSON, USALA come base principale e arricchisci/trasforma secondo la richiesta.\n' : ''}Esempio: [{"col1": "val1", "col2": 123, "fonte": "https://url-reale.com"}]`;
        case 'number': return `${base}\nFORMATO: Un singolo numero. Niente testo.\nEsempio: 42.5`;
        case 'chart': return `${base}\nFORMATO: JSON recharts.\n{"type": "bar-chart", "data": [{"x": "Label", "y": 10}], "xAxisKey": "x", "dataKeys": ["y"], "title": "Titolo"}`;
        case 'string': default: return `${base}\nFORMATO: Testo conciso in italiano. Cita le fonti con URL reali se disponibili.`;
    }
}

// ── Streaming Agent Loop ──────────────────────────────
export async function POST(request: NextRequest) {
    // Auth & setup (non-streaming errors returned as JSON)
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return Response.json({ success: false, error: 'Non autorizzato' }, { status: 401 });

    const user = await db.user.findUnique({ where: { email: session.user.email }, include: { company: true } });
    if (!user?.company) return Response.json({ success: false, error: 'Utente non trovato' }, { status: 400 });

    const body = await request.json();
    const { prompt, model, outputType, documents } = body;
    if (!prompt || !model || !outputType) return Response.json({ success: false, error: 'Campi mancanti' }, { status: 400 });

    const providerSettings = await getAiProviderAction();
    const aiProvider: AiProvider = providerSettings.provider || 'openrouter';

    let apiKey = '';
    if (aiProvider !== 'claude-cli') {
        const openRouterSettings = await getOpenRouterSettingsAction();
        apiKey = (user as any).openRouterApiKey || openRouterSettings.apiKey || '';
        if (!apiKey) return Response.json({ success: false, error: 'API key OpenRouter non configurata.' }, { status: 400 });
    }

    const leadGenApiKeys = (user.company as any).leadGenApiKeys as any || {};
    const serpApiKey = leadGenApiKeys.serpApi || '';
    // For Claude CLI, aiModel is unused (runClaudeCliSync handles it).
    // Create a placeholder to avoid null checks throughout; the Claude CLI path
    // in generateTextAny doesn't use it.
    const aiModel: any = aiProvider === 'claude-cli' ? {} : getOpenRouterModel(apiKey, model);

    // Build prompt with docs
    let fullPrompt = prompt;
    if (Array.isArray(documents) && documents.length > 0) {
        try {
            const { listAllDocumentsAction } = await import('@/actions/xbrl');
            const docResult = await listAllDocumentsAction();
            if (docResult.files) {
                const contents: string[] = [];
                for (const dn of documents) {
                    const doc = docResult.files.find((f: { name: string; url: string }) => f.name === dn);
                    // SECURITY: SSRF guard — doc URLs may be user-supplied
                    if (doc?.url) try {
                        const { safeFetch } = await import('@/lib/safe-fetch');
                        const r = await safeFetch(doc.url, { timeoutMs: 10000 });
                        if (r.ok) contents.push(`[DOC: ${dn}]\n${(await r.text()).slice(0, 5000)}\n[/DOC]`);
                    } catch { /* */ }
                }
                if (contents.length > 0) fullPrompt += `\n\nDOCUMENTI:\n${contents.join('\n\n')}`;
            }
        } catch { /* */ }
    }

    // ── Stream response with progress events ──
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            const send = (event: Record<string, any>) => {
                try { controller.enqueue(encoder.encode(JSON.stringify(event) + '\n')); } catch { /* stream closed */ }
            };

            const MAX_ROUNDS = 3;
            const todayISO = new Date().toISOString().split('T')[0];
            let totalIn = 0, totalOut = 0;
            let bestResult: any = null;
            let bestValidation: { valid: boolean; issues: string[] } = { valid: false, issues: [] };
            let feedback = '';

            // Detect if prompt already contains embedded data (tables, variables, charts)
            const hasEmbeddedData = /\[[\s\S]{50,}\]/.test(fullPrompt) || /\{[\s\S]{50,}\}/.test(fullPrompt);
            const promptDataSize = fullPrompt.length;

            for (let round = 0; round < MAX_ROUNDS; round++) {
                const roundLabel = MAX_ROUNDS > 1 ? ` (Round ${round + 1}/${MAX_ROUNDS})` : '';

                // ── STEP 1: Ricerca Web (automatic, supplementary to embedded data) ──
                let gatheredContext = '';
                let allSources: { title: string; url: string; snippet: string }[] = [];

                // Always try web search for enrichment, but don't block on failure if we have embedded data
                send({ type: 'step', round, step: 'gather', status: 'running', label: hasEmbeddedData ? `Ricerca web di arricchimento...${roundLabel}` : `Ricerca dati sul web...${roundLabel}` });

                try {
                    const queries = await extractSearchQueries(fullPrompt, aiModel, todayISO, round > 0 ? feedback : undefined);

                    if (queries.length > 0) {
                        send({ type: 'step', round, step: 'gather', status: 'running', label: `Esecuzione ${queries.length} ricerche web...${roundLabel}` });

                        const searchResults = await Promise.allSettled(
                            queries.map(q => searchWeb(q, serpApiKey))
                        );

                        const allTexts: string[] = [];
                        for (let i = 0; i < searchResults.length; i++) {
                            const sr = searchResults[i];
                            if (sr.status === 'fulfilled' && sr.value.text.length > 0) {
                                allTexts.push(`--- Ricerca: "${queries[i]}" ---\n${sr.value.text}`);
                                allSources.push(...sr.value.sources);
                            }
                        }

                        gatheredContext = allTexts.join('\n\n');
                        const successCount = searchResults.filter(sr => sr.status === 'fulfilled' && sr.value.text.length > 0).length;

                        // ── STEP 1b: Scrape top URLs for full page content ──
                        if (allSources.length > 0) {
                            const urlsToScrape = selectUrlsToScrape(allSources, 3);
                            if (urlsToScrape.length > 0) {
                                send({ type: 'step', round, step: 'gather', status: 'running', label: `Approfondimento ${urlsToScrape.length} fonti...` });

                                const scrapeResults = await Promise.allSettled(
                                    urlsToScrape.map(u => scrapePageContent(u))
                                );

                                let scrapedCount = 0;
                                for (let i = 0; i < scrapeResults.length; i++) {
                                    const sr = scrapeResults[i];
                                    if (sr.status === 'fulfilled' && sr.value.length > 100) {
                                        gatheredContext += `\n\n--- Contenuto completo: ${urlsToScrape[i]} ---\n${sr.value}`;
                                        scrapedCount++;
                                    }
                                }

                                if (scrapedCount > 0) {
                                    send({ type: 'step', round, step: 'gather', status: 'running', label: `${scrapedCount}/${urlsToScrape.length} pagine scaricate` });
                                }
                            }
                        }

                        if (gatheredContext.length > 100) {
                            send({ type: 'step', round, step: 'gather', status: 'success', label: `${successCount}/${queries.length} ricerche + scraping completati (${gatheredContext.length} car., ${allSources.length} fonti)` });
                        } else if (hasEmbeddedData) {
                            // Web search weak but we have embedded data - proceed anyway
                            send({ type: 'step', round, step: 'gather', status: 'success', label: `Ricerca web limitata, ma dati utente disponibili (${promptDataSize} car.)` });
                        } else {
                            const hasSerp = !!serpApiKey;
                            const hint = hasSerp ? 'Risultati insufficienti.' : 'SerpAPI non configurato.';
                            send({ type: 'step', round, step: 'gather', status: 'error', label: `${hint} (${successCount}/${queries.length} ricerche, ${gatheredContext.length} car.)` });
                            feedback = `Ricerca insufficiente: ${hint}`;
                            continue;
                        }
                    } else if (hasEmbeddedData) {
                        send({ type: 'step', round, step: 'gather', status: 'success', label: `Uso dati utente dal prompt (${promptDataSize} car.)` });
                    } else {
                        send({ type: 'step', round, step: 'gather', status: 'error', label: 'Nessuna query generata e nessun dato nel prompt' });
                        feedback = 'Impossibile generare query di ricerca.';
                        continue;
                    }
                } catch (e: any) {
                    if (hasEmbeddedData) {
                        // Search failed but we have embedded data - proceed
                        send({ type: 'step', round, step: 'gather', status: 'success', label: `Ricerca web fallita, uso dati utente (${promptDataSize} car.)` });
                    } else {
                        send({ type: 'step', round, step: 'gather', status: 'error', label: `Errore ricerca: ${e.message}` });
                        feedback = `Errore nella ricerca: ${e.message}`;
                        continue;
                    }
                }

                // ── STEP 2: Formattazione (LLM processes user data + web results) ──
                send({ type: 'step', round, step: 'format', status: 'running', label: 'Elaborazione e formattazione...' });

                let parsedResult: any = null;
                try {
                    const formatHint = round > 0 && feedback ? `\n\nPROBLEMA NEL TENTATIVO PRECEDENTE: ${feedback}\nCorreggi questi problemi.` : '';

                    const sourcesList = allSources.length > 0
                        ? `\n\nFONTI WEB TROVATE (URL reali):\n${allSources.map(s => `- ${s.title}: ${s.url}`).join('\n')}`
                        : '';

                    // Build format prompt differently based on whether we have embedded data
                    let fp: string;
                    if (hasEmbeddedData) {
                        fp = `RICHIESTA DELL'UTENTE (contiene dati incorporati - tabelle/variabili):\n${fullPrompt}`;
                        if (gatheredContext.length > 0) {
                            fp += `\n\n--- DATI SUPPLEMENTARI DALLA RICERCA WEB (data: ${todayISO}) ---\n${gatheredContext}${sourcesList}`;
                        }
                        fp += `${formatHint}\n\nISTRUZIONI: Elabora i DATI DELL'UTENTE nel prompt come fonte primaria. ${gatheredContext.length > 0 ? 'Usa i dati dalla ricerca web per ARRICCHIRE/INTEGRARE.' : ''} Produci il risultato nel formato richiesto.`;
                    } else {
                        fp = `Domanda dell'utente: ${fullPrompt}\n\nRISULTATI RICERCA WEB (data: ${todayISO}):\n${gatheredContext}${sourcesList}${formatHint}\n\nISTRUZIONI: ESTRAI i dati rilevanti dalla ricerca web e formattali. NON restituire array vuoto.`;
                    }

                    const formatResult = await generateText({
                        model: aiModel,
                        system: buildFormatSystemPrompt(outputType, todayISO, hasEmbeddedData),
                        prompt: fp,
                        temperature: round === 0 ? 0.1 : 0.3,
                        maxRetries: 2,
                    });

                    const u = formatResult.usage || { inputTokens: 0, outputTokens: 0 };
                    totalIn += u.inputTokens || 0;
                    totalOut += u.outputTokens || 0;

                    const text = formatResult.text || '';
                    if (text.trim()) parsedResult = parseResult(text, outputType);

                    send({ type: 'step', round, step: 'format', status: parsedResult !== null ? 'success' : 'error', label: parsedResult !== null ? 'Formattazione completata' : 'Nessun risultato prodotto' });
                } catch (e: any) {
                    send({ type: 'step', round, step: 'format', status: 'error', label: `Errore formattazione: ${e.message}` });
                    feedback = `Errore formattazione: ${e.message}`;
                    continue;
                }

                if (parsedResult === null) {
                    feedback = `Nessun risultato prodotto. ${hasEmbeddedData ? 'Il prompt contiene dati - elaborali.' : 'Estrai i dati dalla ricerca web.'}`;
                    continue;
                }

                // ── STEP 3: Verifica ──
                send({ type: 'step', round, step: 'validate', status: 'running', label: 'Verifica qualità dati...' });

                const validation = validateResult(parsedResult, outputType);

                // Special case: empty table but we had data available = formatting failure
                const totalDataAvailable = gatheredContext.length + (hasEmbeddedData ? promptDataSize : 0);
                if (outputType === 'table' && Array.isArray(parsedResult) && parsedResult.length === 0 && totalDataAvailable > 200) {
                    validation.valid = false;
                    if (!validation.issues.includes('Tabella vuota')) validation.issues.push('Tabella vuota');
                    validation.issues.push(`Hai ${totalDataAvailable} car. di dati disponibili ma non hai estratto nulla. Elabora i dati e crea la tabella.`);
                }

                if (bestResult === null || validation.issues.length < bestValidation.issues.length) {
                    bestResult = parsedResult;
                    bestValidation = validation;
                }

                if (validation.valid) {
                    send({ type: 'step', round, step: 'validate', status: 'success', label: 'Dati verificati ✓' });
                    bestResult = parsedResult;
                    bestValidation = validation;
                    break;
                } else {
                    const issuesSummary = validation.issues.join(', ');
                    send({ type: 'step', round, step: 'validate', status: 'error', label: `Problemi: ${issuesSummary}` });
                    feedback = validation.issues.join('\n');

                    if (round < MAX_ROUNDS - 1) {
                        send({ type: 'step', round, step: 'retry', status: 'running', label: `Nuovo tentativo con query migliorate...` });
                    }
                }
            }

            // ── Final result ──
            const totalUsage = { promptTokens: totalIn, completionTokens: totalOut, totalTokens: totalIn + totalOut };

            if (bestResult !== null) {
                send({ type: 'result', success: true, result: bestResult, outputType, usage: totalUsage, validation: bestValidation });
            } else {
                send({ type: 'result', success: false, error: `Nessun risultato dopo ${MAX_ROUNDS} tentativi. ${feedback}`, usage: totalUsage });
            }

            controller.close();
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Transfer-Encoding': 'chunked',
            'Cache-Control': 'no-cache',
        },
    });
}
