/**
 * Sliding-window rate limiter with optional Upstash Redis backend.
 *
 * - If UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set, requests
 *   go through a REST pipeline (works across horizontal scaling).
 * - Otherwise, falls back to an in-memory map (single-instance only).
 *
 * The async signature lets both backends share the same callers. Upstash
 * network failures silently fall back to in-memory to avoid 429-ing
 * legitimate traffic during an Upstash outage.
 */
import "server-only";

interface Bucket {
    /** Timestamps (ms) of requests within the window. */
    hits: number[];
}

const globalForRateLimit = globalThis as unknown as {
    _rateLimitBuckets?: Map<string, Bucket>;
};
if (!globalForRateLimit._rateLimitBuckets) {
    globalForRateLimit._rateLimitBuckets = new Map();
}
const buckets = globalForRateLimit._rateLimitBuckets;

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, '');
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const useUpstash = !!(UPSTASH_URL && UPSTASH_TOKEN);

// ── Production safety warning ──
// In production with multiple instances (e.g. Vercel serverless), the in-memory
// rate limiter is per-isolate and trivially bypassed by distributing requests
// across instances. Upstash Redis is required for accurate cross-instance limits.
if (process.env.NODE_ENV === 'production' && !useUpstash) {
    console.warn(
        '\n' +
        '╔══════════════════════════════════════════════════════════════════╗\n' +
        '║  CRITICAL: In-memory rate limiter active in PRODUCTION         ║\n' +
        '║                                                                ║\n' +
        '║  UPSTASH_REDIS_REST_URL and/or UPSTASH_REDIS_REST_TOKEN are    ║\n' +
        '║  not set. Rate limiting falls back to in-memory, which is      ║\n' +
        '║  per-instance only and BYPASSED in multi-instance deployments   ║\n' +
        '║  (Vercel serverless, horizontal scaling).                       ║\n' +
        '║                                                                ║\n' +
        '║  Set both env vars to enable distributed rate limiting.        ║\n' +
        '╚══════════════════════════════════════════════════════════════════╝\n'
    );
}

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    retryAfterMs?: number;
}

function rateLimitInMemory(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    const cutoff = now - windowMs;
    let bucket = buckets.get(key);
    if (!bucket) {
        bucket = { hits: [] };
        buckets.set(key, bucket);
    }
    bucket.hits = bucket.hits.filter(t => t > cutoff);
    if (bucket.hits.length >= limit) {
        const oldest = bucket.hits[0];
        return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, oldest + windowMs - now) };
    }
    bucket.hits.push(now);
    return { allowed: true, remaining: limit - bucket.hits.length };
}

async function rateLimitUpstash(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const fullKey = `rl:${key}`;
    const ttlSec = Math.max(1, Math.ceil(windowMs / 1000));
    try {
        const res = await fetch(`${UPSTASH_URL}/pipeline`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify([
                ['INCR', fullKey],
                ['EXPIRE', fullKey, String(ttlSec), 'NX'],
                ['PTTL', fullKey],
            ]),
            signal: AbortSignal.timeout(1500),
        });
        if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);
        const json: any = await res.json();
        const count = Number(json?.[0]?.result ?? 0);
        const pttl = Number(json?.[2]?.result ?? windowMs);
        if (!Number.isFinite(count) || count <= 0) throw new Error('Bad Upstash response');
        if (count > limit) return { allowed: false, remaining: 0, retryAfterMs: pttl > 0 ? pttl : windowMs };
        return { allowed: true, remaining: Math.max(0, limit - count) };
    } catch {
        return rateLimitInMemory(key, limit, windowMs);
    }
}

/**
 * Check if a caller (identified by `key`) is within the rate limit.
 *
 * @param key     Unique caller id (e.g. `login:${email}`, `reset:${ip}`).
 * @param limit   Max requests allowed within `windowMs`.
 * @param windowMs Window duration in ms.
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    if (useUpstash) return rateLimitUpstash(key, limit, windowMs);
    return rateLimitInMemory(key, limit, windowMs);
}

/** Extract client IP from NextRequest headers (proxy-aware). */
export function getClientIp(req: Request): string {
    const fwd = req.headers.get("x-forwarded-for");
    if (fwd) return fwd.split(",")[0].trim();
    const real = req.headers.get("x-real-ip");
    if (real) return real;
    return "unknown";
}

/** Opportunistic cleanup of stale buckets (call periodically). */
export function cleanupRateLimitBuckets(maxAgeMs = 3600_000): void {
    const cutoff = Date.now() - maxAgeMs;
    for (const [key, bucket] of buckets.entries()) {
        if (bucket.hits.length === 0 || bucket.hits[bucket.hits.length - 1] < cutoff) {
            buckets.delete(key);
        }
    }
}

// Schedule periodic cleanup so the in-memory map cannot grow forever.
// `.unref()` lets the process exit if this is the only remaining handle.
// Guarded on globalThis so HMR re-imports do not stack intervals.
declare global {
    // eslint-disable-next-line no-var
    var _rateLimitCleanupScheduled: boolean | undefined;
}
if (!useUpstash && !globalThis._rateLimitCleanupScheduled) {
    globalThis._rateLimitCleanupScheduled = true;
    setInterval(() => cleanupRateLimitBuckets(), 10 * 60_000).unref();
}
