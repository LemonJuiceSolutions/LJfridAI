import { describe, it, expect } from 'vitest';
import { generateSecret, verifyToken } from '@/lib/totp';
import * as OTPAuth from 'otpauth';

describe('generateSecret', () => {
    it('returns a base32 secret string', () => {
        const { secret } = generateSecret('user@example.com');
        expect(secret).toBeTruthy();
        // base32 alphabet: A-Z 2-7
        expect(secret).toMatch(/^[A-Z2-7]+=*$/);
    });

    it('returns a valid otpauth:// URI', () => {
        const { uri } = generateSecret('user@example.com');
        expect(uri).toMatch(/^otpauth:\/\/totp\//);
        expect(uri).toContain('issuer=FridAI');
        expect(uri).toContain('user%40example.com');
    });

    it('generates different secrets on each call', () => {
        const a = generateSecret('a@example.com');
        const b = generateSecret('a@example.com');
        expect(a.secret).not.toBe(b.secret);
    });

    it('URI contains digits=6 and period=30', () => {
        const { uri } = generateSecret('test@test.com');
        expect(uri).toContain('digits=6');
        expect(uri).toContain('period=30');
    });
});

describe('verifyToken', () => {
    it('accepts a valid current token', () => {
        const { secret } = generateSecret('user@example.com');
        // Generate a valid token for the current time step
        const totp = new OTPAuth.TOTP({
            issuer: 'FridAI',
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
            secret: OTPAuth.Secret.fromBase32(secret),
        });
        const token = totp.generate();
        expect(verifyToken(secret, token)).toBe(true);
    });

    it('rejects a wrong token', () => {
        const { secret } = generateSecret('user@example.com');
        expect(verifyToken(secret, '000000')).toBe(false);
    });

    it('rejects an empty token', () => {
        const { secret } = generateSecret('user@example.com');
        expect(verifyToken(secret, '')).toBe(false);
    });

    it('rejects a token with wrong length', () => {
        const { secret } = generateSecret('user@example.com');
        expect(verifyToken(secret, '12345')).toBe(false);
        expect(verifyToken(secret, '1234567')).toBe(false);
    });
});
