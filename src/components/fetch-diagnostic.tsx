'use client';

import { useEffect } from 'react';

/**
 * Global fetch wrapper with two jobs:
 *   1. Transparent retry on transient network failures ("Load failed",
 *      "NetworkError", "Failed to fetch"). The Next.js dev server auto-
 *      restarts at 80% heap usage and kills in-flight sockets — this
 *      hides those restarts from every caller in the app without
 *      touching N fetch call sites.
 *   2. Diagnostic logging so the devtools console shows which URL fell
 *      over even after retries exhaust.
 *
 * Retry policy (universal defaults):
 *   - Retry up to 3 times with 500ms → 1s → 2s backoff + jitter.
 *   - Retry ONLY on TypeError network errors. Never on HTTP 4xx/5xx
 *     (caller's responsibility) and never on AbortError (intentional).
 *   - Skip retry for POST/PUT/PATCH/DELETE by default — non-idempotent
 *     writes could double-commit if the server processed the request
 *     then the socket died before the response. Opt in per-request via
 *     `init.headers['x-retry-writes'] = '1'` for idempotent writes.
 */

const NETWORK_ERROR_PATTERNS = ['load failed', 'networkerror', 'failed to fetch', 'network request failed'];

function isTransientNetworkError(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const e = err as { name?: string; message?: string };
    if (e.name === 'AbortError') return false;
    const msg = (e.message || '').toLowerCase();
    if (e.name === 'TypeError') return true;
    return NETWORK_ERROR_PATTERNS.some(p => msg.includes(p));
}

function isSafeMethod(method: string): boolean {
    return method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
}

function extractUrl(input: RequestInfo | URL): string {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.toString();
    return (input as Request).url;
}

function extractMethod(input: RequestInfo | URL, init?: RequestInit): string {
    if (init?.method) return init.method.toUpperCase();
    if (typeof input !== 'string' && !(input instanceof URL)) {
        return (input as Request).method.toUpperCase();
    }
    return 'GET';
}

export function FetchDiagnostic() {
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if ((window as any).__fetchDiagInstalled) return;
        (window as any).__fetchDiagInstalled = true;

        const original = window.fetch.bind(window);

        window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
            const url = extractUrl(input);
            const method = extractMethod(input, init);
            const headers = new Headers(init?.headers);
            const retryWrites = headers.get('x-retry-writes') === '1';
            const canRetry = isSafeMethod(method) || retryWrites;

            const MAX_RETRIES = canRetry ? 3 : 0;
            const BASE_DELAY = 500;

            let lastErr: unknown;
            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                const started = performance.now();
                try {
                    const res = await original(input as any, init);
                    if (attempt > 0) {
                        // eslint-disable-next-line no-console
                        console.info(`[fetch-diag] recovered after ${attempt} retry(ies) — ${method} ${url}`);
                    }
                    return res;
                } catch (err: any) {
                    lastErr = err;
                    const elapsed = Math.round(performance.now() - started);
                    const name = err?.name || 'Error';
                    const msg = err?.message || String(err);

                    if (name === 'AbortError' || init?.signal?.aborted) throw err;

                    if (attempt === MAX_RETRIES || !isTransientNetworkError(err)) {
                        if (name !== 'AbortError') {
                            // eslint-disable-next-line no-console
                            console.error(
                                `[fetch-diag] ${name} after ${elapsed}ms (${attempt + 1}/${MAX_RETRIES + 1}) — ${method} ${url}\n  → ${msg}`,
                            );
                        }
                        throw err;
                    }

                    // eslint-disable-next-line no-console
                    console.warn(`[fetch-diag] retry ${attempt + 1}/${MAX_RETRIES} after ${elapsed}ms — ${method} ${url} (${msg})`);
                    const delay = BASE_DELAY * Math.pow(2, attempt) + Math.random() * 200;
                    await new Promise(r => setTimeout(r, delay));
                }
            }
            throw lastErr;
        };

        return () => {
            // Don't unpatch — leaves wrapper intact for the life of the tab.
        };
    }, []);

    return null;
}
