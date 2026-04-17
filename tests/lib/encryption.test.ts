import { describe, it, expect, beforeAll } from 'vitest';

// 32 zero bytes — fine for tests, NEVER for real data.
const TEST_KEY = Buffer.alloc(32, 0).toString('base64');

beforeAll(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY;
});

// Imports are lazy so the env var is set before module evaluation.
async function load() {
    return await import('@/lib/encryption');
}

describe('encryption helpers', () => {
    it('round-trips a normal string', async () => {
        const { encrypt, decrypt } = await load();
        const plain = 'mario.rossi@example.com';
        const cipher = encrypt(plain)!;
        expect(cipher).toMatch(/^enc:v1:/);
        expect(decrypt(cipher)).toBe(plain);
    });

    it('returns null for null input', async () => {
        const { encrypt, decrypt } = await load();
        expect(encrypt(null)).toBeNull();
        expect(encrypt(undefined)).toBeNull();
        expect(decrypt(null)).toBeNull();
    });

    it('passes through empty string', async () => {
        const { encrypt, decrypt } = await load();
        expect(encrypt('')).toBe('');
        expect(decrypt('')).toBe('');
    });

    it('is idempotent — encrypting an already-encrypted value returns the same value', async () => {
        const { encrypt } = await load();
        const a = encrypt('foo')!;
        const b = encrypt(a)!;
        expect(a).toBe(b);
    });

    it('treats unprefixed values as legacy plaintext on decrypt', async () => {
        const { decrypt } = await load();
        expect(decrypt('legacy plaintext')).toBe('legacy plaintext');
    });

    it('detects encrypted values via isEncrypted()', async () => {
        const { encrypt, isEncrypted } = await load();
        expect(isEncrypted('plain')).toBe(false);
        expect(isEncrypted('')).toBe(false);
        expect(isEncrypted(null)).toBe(false);
        expect(isEncrypted(encrypt('x'))).toBe(true);
    });

    it('produces different ciphertext for the same plaintext (random IV)', async () => {
        const { encrypt } = await load();
        const a = encrypt('hello world')!;
        // First encrypt result is already encrypted on second pass — re-encrypt a fresh string
        const b = encrypt('hello world')!;
        // Both decrypt to same plain but ciphertext differs.
        expect(a).not.toBe(b);
    });

    it('tryDecrypt returns null on tampered ciphertext instead of throwing', async () => {
        const { encrypt, tryDecrypt } = await load();
        const cipher = encrypt('secret')!;
        // Corrupt the auth tag region.
        const tampered = cipher.slice(0, -4) + 'XXXX';
        expect(tryDecrypt(tampered)).toBeNull();
    });
});
