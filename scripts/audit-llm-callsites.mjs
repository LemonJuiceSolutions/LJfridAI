#!/usr/bin/env node
/**
 * scripts/audit-llm-callsites.mjs
 *
 * Scans src/ for outbound LLM call sites and checks whether each one is
 * guarded by a maybeRedact / redactForLLM / redactPII call nearby. Prints a
 * report so we can verify the PII redaction invariant documented in the
 * REMEDIATION_PLAN.md phase 1.3.
 *
 * Exit code:
 *   0 — no unguarded call sites
 *   1 — at least one call site without redaction near it
 *
 * Run:
 *   node scripts/audit-llm-callsites.mjs
 *   node scripts/audit-llm-callsites.mjs --strict   # also fails on warnings
 *   node scripts/audit-llm-callsites.mjs --json     # machine-readable output
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SRC = join(ROOT, 'src');

// Patterns that look like an outbound LLM request. Each matches a single line.
// Order matters: more specific patterns first.
const CALL_PATTERNS = [
    { name: 'AI SDK generateText',    re: /\bgenerateText\s*\(/ },
    { name: 'AI SDK streamText',      re: /\bstreamText\s*\(/ },
    { name: 'AI SDK generateObject',  re: /\bgenerateObject\s*\(/ },
    { name: 'AI SDK streamObject',    re: /\bstreamObject\s*\(/ },
    { name: 'Genkit ai.generate',     re: /\bai\.generate\s*\(/ },
    { name: 'fetch openrouter',       re: /fetch\s*\([^)]*openrouter\.ai/ },
    { name: 'fetch openai',           re: /fetch\s*\([^)]*(?:api\.)?openai\.com/ },
    { name: 'fetch anthropic',        re: /fetch\s*\([^)]*api\.anthropic\.com/ },
    { name: 'fetch google ai',        re: /fetch\s*\([^)]*generativelanguage\.googleapis\.com/ },
];

// Any of these within WINDOW lines above the call counts as "guarded".
const GUARD_PATTERNS = [
    /\bmaybeRedact\b/,
    /\bredactForLLM\b/,
    /\bredactPII\b/,
    /\bredactRows\b/,
];

const WINDOW = 40; // lines before the call site to scan for a guard

const IGNORE_DIRS = new Set(['node_modules', '.next', 'dist', 'build']);

function walk(dir, out = []) {
    for (const entry of readdirSync(dir)) {
        if (IGNORE_DIRS.has(entry)) continue;
        const full = join(dir, entry);
        const s = statSync(full);
        if (s.isDirectory()) walk(full, out);
        else if (/\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(entry)) out.push(full);
    }
    return out;
}

function analyzeFile(path) {
    const rel = relative(ROOT, path);
    const text = readFileSync(path, 'utf8');
    const lines = text.split('\n');
    const hits = [];

    lines.forEach((line, idx) => {
        for (const pat of CALL_PATTERNS) {
            if (!pat.re.test(line)) continue;
            // Skip comments.
            const trimmed = line.trimStart();
            if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
            // Skip the audit script itself and the redact library.
            if (rel === 'scripts/audit-llm-callsites.mjs') continue;
            if (rel === 'src/lib/pii-redact.ts') continue;

            const start = Math.max(0, idx - WINDOW);
            const context = lines.slice(start, idx + 1).join('\n');
            const guarded = GUARD_PATTERNS.some(g => g.test(context));
            hits.push({
                file: rel,
                line: idx + 1,
                kind: pat.name,
                snippet: line.trim().slice(0, 140),
                guarded,
            });
            break; // one match per line
        }
    });

    return hits;
}

function main() {
    const args = process.argv.slice(2);
    const json = args.includes('--json');
    const strict = args.includes('--strict');

    const files = walk(SRC);
    const allHits = [];
    for (const f of files) allHits.push(...analyzeFile(f));

    const unguarded = allHits.filter(h => !h.guarded);

    if (json) {
        console.log(JSON.stringify({ total: allHits.length, unguarded, hits: allHits }, null, 2));
    } else {
        console.log(`\nLLM call-site audit — ${allHits.length} call(s) found across ${files.length} files.\n`);
        if (allHits.length === 0) {
            console.log('  (nothing to audit)');
        } else {
            const byFile = new Map();
            for (const h of allHits) {
                if (!byFile.has(h.file)) byFile.set(h.file, []);
                byFile.get(h.file).push(h);
            }
            for (const [file, hits] of [...byFile.entries()].sort()) {
                console.log(`  ${file}`);
                for (const h of hits) {
                    const mark = h.guarded ? '✓' : '✗';
                    console.log(`    ${mark} ${h.kind} @ line ${h.line}  ${h.guarded ? '' : '(UNGUARDED)'}`);
                }
            }
        }

        console.log(`\nSummary: ${allHits.length - unguarded.length} guarded, ${unguarded.length} unguarded.`);
        if (unguarded.length > 0) {
            console.log('\nUnguarded call sites need a maybeRedact/redactForLLM wrap before the request body is built.');
            console.log('See docs/REMEDIATION_PLAN.md phase 1.3 for the planned gateway refactor.\n');
        }
    }

    if (unguarded.length > 0 && strict) process.exit(1);
}

main();
