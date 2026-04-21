/**
 * Client-side fetch with automatic retry on transient network failures.
 *
 * Retries only TRUE network errors (browser TypeError like "Load failed",
 * "NetworkError when attempting to fetch", "Failed to fetch"). Does NOT
 * retry HTTP 4xx/5xx responses — those are legitimate server errors the
 * caller must handle. Does NOT retry AbortError (caller cancelled or the
 * signal timed out intentionally).
 *
 * Use for long-running or intermittent API calls where Next.js dev HMR,
 * momentary proxy drops, or backgrounded tabs can surface "Load failed"
 * before the server has really failed.
 *
 *   const res = await fetchWithRetry('/api/foo', { method: 'POST' }, {
 *     retries: 2,
 *     onRetry: (attempt, err) => toast({ title: `Riprovo (${attempt})...` }),
 *   });
 */

export interface RetryOpts {
    /** How many retries after the initial attempt (default 2 → 3 total). */
    retries?: number;
    /** Base delay in ms before first retry; doubles each subsequent retry. */
    baseDelayMs?: number;
    /** Upper bound on the computed delay. */
    maxDelayMs?: number;
    /** Override which errors trigger a retry. */
    shouldRetry?: (err: unknown) => boolean;
    /** Called before each retry (1-indexed attempt number). */
    onRetry?: (attempt: number, err: unknown) => void;
}

/** Default policy: retry only true network failures, not HTTP errors or aborts. */
export function isTransientNetworkError(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const e = err as { name?: string; message?: string };
    // AbortError means the caller (or signal.timeout) asked to stop — never retry.
    if (e.name === 'AbortError') return false;
    const msg = (e.message || '').toLowerCase();
    return (
        e.name === 'TypeError' ||
        msg.includes('load failed') ||
        msg.includes('networkerror') ||
        msg.includes('failed to fetch') ||
        msg.includes('network request failed')
    );
}

export async function fetchWithRetry(
    input: RequestInfo | URL,
    init: RequestInit = {},
    opts: RetryOpts = {},
): Promise<Response> {
    const retries = opts.retries ?? 2;
    const baseDelay = opts.baseDelayMs ?? 500;
    const maxDelay = opts.maxDelayMs ?? 3000;
    const shouldRetry = opts.shouldRetry ?? isTransientNetworkError;

    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fetch(input, init);
        } catch (err) {
            lastErr = err;
            // Don't retry if the caller's signal was aborted — respect cancel.
            if (init.signal?.aborted) throw err;
            if (attempt === retries || !shouldRetry(err)) throw err;
            const delay = Math.min(maxDelay, baseDelay * Math.pow(2, attempt));
            const jitter = Math.random() * 200;
            opts.onRetry?.(attempt + 1, err);
            await new Promise(r => setTimeout(r, delay + jitter));
        }
    }
    throw lastErr;
}
