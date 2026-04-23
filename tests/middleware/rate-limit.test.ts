import { describe, it, expect, beforeEach } from 'vitest';
import { rateLimit, cleanupRateLimitBuckets } from '@/lib/rate-limit';

beforeEach(() => {
    // Force in-memory backend by clearing Upstash env vars.
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

describe('rate limiter: allows requests under limit', () => {
    it('allows first request', async () => {
        const key = `under:${Math.random()}`;
        const result = await rateLimit(key, 5, 60_000);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4);
    });

    it('allows requests up to limit', async () => {
        const key = `upto:${Math.random()}`;
        for (let i = 0; i < 5; i++) {
            const result = await rateLimit(key, 5, 60_000);
            expect(result.allowed).toBe(true);
        }
    });

    it('remaining decreases with each request', async () => {
        const key = `dec:${Math.random()}`;
        const r1 = await rateLimit(key, 3, 60_000);
        const r2 = await rateLimit(key, 3, 60_000);
        const r3 = await rateLimit(key, 3, 60_000);
        expect(r1.remaining).toBe(2);
        expect(r2.remaining).toBe(1);
        expect(r3.remaining).toBe(0);
    });
});

describe('rate limiter: blocks requests over limit', () => {
    it('blocks the request exceeding the limit', async () => {
        const key = `over:${Math.random()}`;
        // Exhaust the limit
        for (let i = 0; i < 3; i++) {
            await rateLimit(key, 3, 60_000);
        }
        const blocked = await rateLimit(key, 3, 60_000);
        expect(blocked.allowed).toBe(false);
        expect(blocked.remaining).toBe(0);
    });

    it('returns retryAfterMs when blocked', async () => {
        const key = `retry:${Math.random()}`;
        await rateLimit(key, 1, 60_000);
        const blocked = await rateLimit(key, 1, 60_000);
        expect(blocked.allowed).toBe(false);
        expect(blocked.retryAfterMs).toBeGreaterThan(0);
    });

    it('blocks all subsequent requests after limit', async () => {
        const key = `multi:${Math.random()}`;
        await rateLimit(key, 1, 60_000);
        for (let i = 0; i < 5; i++) {
            const r = await rateLimit(key, 1, 60_000);
            expect(r.allowed).toBe(false);
        }
    });
});

describe('rate limiter: bucket cleanup', () => {
    it('cleanupRateLimitBuckets does not throw', () => {
        expect(() => cleanupRateLimitBuckets()).not.toThrow();
    });

    it('cleanup with custom maxAge does not throw', () => {
        expect(() => cleanupRateLimitBuckets(1000)).not.toThrow();
    });

    it('cleanup does not crash on populated buckets', async () => {
        const key = `cleanup:${Math.random()}`;
        // Fill the bucket with some hits
        await rateLimit(key, 5, 60_000);
        await rateLimit(key, 5, 60_000);

        // Cleanup with a very large maxAge should keep recent buckets
        expect(() => cleanupRateLimitBuckets(3600_000)).not.toThrow();
    });
});
