import { describe, it, expect, beforeEach } from 'vitest';
import { rateLimit } from '@/lib/rate-limit';

beforeEach(() => {
    // Force in-memory backend by clearing Upstash env vars per test.
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

describe('rateLimit (in-memory)', () => {
    it('allows up to limit requests in the window', async () => {
        const key = `test:${Math.random()}`;
        for (let i = 0; i < 3; i++) {
            const r = await rateLimit(key, 3, 60_000);
            expect(r.allowed).toBe(true);
        }
        const blocked = await rateLimit(key, 3, 60_000);
        expect(blocked.allowed).toBe(false);
        expect(blocked.retryAfterMs).toBeGreaterThan(0);
    });

    it('isolates keys', async () => {
        const a = await rateLimit(`iso-a:${Math.random()}`, 1, 60_000);
        const b = await rateLimit(`iso-b:${Math.random()}`, 1, 60_000);
        expect(a.allowed).toBe(true);
        expect(b.allowed).toBe(true);
    });

    it('decrements remaining count', async () => {
        const key = `rem:${Math.random()}`;
        const r1 = await rateLimit(key, 5, 60_000);
        const r2 = await rateLimit(key, 5, 60_000);
        expect(r1.remaining).toBe(4);
        expect(r2.remaining).toBe(3);
    });
});
