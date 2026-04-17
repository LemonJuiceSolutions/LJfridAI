import { describe, it, expect } from 'vitest';
import { isRetriable } from '@/lib/scheduler/retry-policy';

describe('isRetriable (scheduler Python backend)', () => {
    describe('retries transient failures', () => {
        it('retries AbortError (fetch timeout)', () => {
            expect(isRetriable({ name: 'AbortError', message: 'aborted' })).toBe(true);
        });
        it('retries ECONNRESET', () => {
            expect(isRetriable({ code: 'ECONNRESET', message: 'socket hang up' })).toBe(true);
        });
        it('retries ECONNREFUSED', () => {
            expect(isRetriable({ code: 'ECONNREFUSED', message: 'connect failed' })).toBe(true);
        });
        it('retries ETIMEDOUT', () => {
            expect(isRetriable({ code: 'ETIMEDOUT', message: 'timeout' })).toBe(true);
        });
        it('retries generic fetch failure', () => {
            expect(isRetriable({ message: 'fetch failed' })).toBe(true);
        });
        it('retries HTTP 500', () => {
            expect(isRetriable({ message: 'Python backend HTTP 500: server error' })).toBe(true);
        });
        it('retries HTTP 502 (bad gateway)', () => {
            expect(isRetriable({ message: 'Python backend HTTP 502: bad gateway' })).toBe(true);
        });
        it('retries HTTP 503 (unavailable)', () => {
            expect(isRetriable({ message: 'Python backend HTTP 503: service unavailable' })).toBe(true);
        });
        it('retries HTTP 504 (gateway timeout)', () => {
            expect(isRetriable({ message: 'Python backend HTTP 504: gateway timeout' })).toBe(true);
        });
    });

    describe('does NOT retry client/unknown errors', () => {
        it('no retry on HTTP 400', () => {
            expect(isRetriable({ message: 'Python backend HTTP 400: bad request' })).toBe(false);
        });
        it('no retry on HTTP 404', () => {
            expect(isRetriable({ message: 'Python backend HTTP 404: not found' })).toBe(false);
        });
        it('no retry on HTTP 422 (validation)', () => {
            expect(isRetriable({ message: 'Python backend HTTP 422: invalid input' })).toBe(false);
        });
        it('no retry on non-network unknown error', () => {
            expect(isRetriable({ message: 'something broke' })).toBe(false);
        });
        it('no retry on empty error', () => {
            expect(isRetriable({})).toBe(false);
        });
    });

    describe('regression: previous inverted logic', () => {
        // Bug: `!err.message?.includes('backend')` skipped retry on HTTP 5xx
        // (because their messages DO contain "backend"). New policy retries
        // 5xx explicitly.
        it('retries 5xx even though message contains "backend"', () => {
            expect(isRetriable({ message: 'Python backend HTTP 502 bad gateway' })).toBe(true);
        });
    });
});
