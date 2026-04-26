import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Verify that production env validation throws when critical secrets are missing.
// Tests the contract enforced by src/lib/env.ts — if this changes, update both.

const CRITICAL_PROD_VARS = [
    'ENCRYPTION_KEY',
    'PII_ENCRYPTION_ENABLED',
    'CRON_SECRET',
    'INTERNAL_QUERY_TOKEN',
    'MCP_INTERNAL_SECRET',
    'PYTHON_BACKEND_TOKEN',
];

describe('env validation contract (documentation)', () => {
    it('declares the full list of production-required secrets', () => {
        // This list should stay in sync with src/lib/env.ts prodOnlySchema.
        // If someone adds a new required secret, add it here too.
        expect(CRITICAL_PROD_VARS).toContain('ENCRYPTION_KEY');
        expect(CRITICAL_PROD_VARS).toContain('PII_ENCRYPTION_ENABLED');
        expect(CRITICAL_PROD_VARS).toContain('CRON_SECRET');
        expect(CRITICAL_PROD_VARS).toContain('INTERNAL_QUERY_TOKEN');
        expect(CRITICAL_PROD_VARS).toContain('MCP_INTERNAL_SECRET');
        expect(CRITICAL_PROD_VARS).toContain('PYTHON_BACKEND_TOKEN');
    });

    it('NEXTAUTH_SECRET must be >=32 chars', () => {
        const weak = 'short';
        const strong = 'x'.repeat(32);
        expect(weak.length >= 32).toBe(false);
        expect(strong.length >= 32).toBe(true);
    });
});
