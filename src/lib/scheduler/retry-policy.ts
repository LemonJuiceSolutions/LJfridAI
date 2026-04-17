/**
 * Retry classification for scheduler's Python backend calls. Separate file so
 * the policy is unit-testable (previous bug: inverted condition skipped retry
 * exactly when it should have been enabled — fixed in scheduler-actions.ts).
 */

export interface ClassifyInput {
    name?: string;
    code?: string;
    message?: string;
}

/**
 * Returns `true` if the error is transient and the call should be retried.
 * Retry on:
 *   - fetch AbortError / network errors (ECONNRESET, ECONNREFUSED, ETIMEDOUT)
 *   - HTTP 5xx responses from the Python backend
 *   - generic "fetch failed" errors
 * Do NOT retry on:
 *   - HTTP 4xx (client bug — same result on retry)
 *   - anything else
 */
export function isRetriable(err: ClassifyInput): boolean {
    const msg = String(err?.message || '');
    const isHttp4xx = /Python backend HTTP 4\d\d/.test(msg);
    if (isHttp4xx) return false;

    const isHttp5xx = /Python backend HTTP 5\d\d/.test(msg);
    const isNetworkOrTimeout =
        err?.name === 'AbortError' ||
        err?.code === 'ECONNRESET' ||
        err?.code === 'ECONNREFUSED' ||
        err?.code === 'ETIMEDOUT' ||
        msg.includes('fetch failed');

    return isHttp5xx || isNetworkOrTimeout;
}
