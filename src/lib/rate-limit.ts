/**
 * Simple in-memory sliding-window rate limiter.
 *
 * Use only for single-instance deployments. For multi-instance, swap the
 * store for Redis (e.g. upstash/ratelimit) — the interface stays the same.
 *
 * Security: addresses M-06 from 2026-04-14 audit.
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

export interface RateLimitResult {
    /** True if the request is allowed. False if the caller exceeded the limit. */
    allowed: boolean;
    /** Requests remaining in the current window. */
    remaining: number;
    /** Milliseconds until the caller can retry (only when !allowed). */
    retryAfterMs?: number;
}

/**
 * Check if a caller (identified by `key`) is within the rate limit.
 *
 * @param key     Unique caller id (e.g. `login:${email}`, `reset:${ip}`).
 * @param limit   Max requests allowed within `windowMs`.
 * @param windowMs Window duration in ms.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    const cutoff = now - windowMs;

    let bucket = buckets.get(key);
    if (!bucket) {
        bucket = { hits: [] };
        buckets.set(key, bucket);
    }

    // Drop expired hits (sliding window)
    bucket.hits = bucket.hits.filter(t => t > cutoff);

    if (bucket.hits.length >= limit) {
        const oldest = bucket.hits[0];
        return {
            allowed: false,
            remaining: 0,
            retryAfterMs: Math.max(0, oldest + windowMs - now),
        };
    }

    bucket.hits.push(now);
    return {
        allowed: true,
        remaining: limit - bucket.hits.length,
    };
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
