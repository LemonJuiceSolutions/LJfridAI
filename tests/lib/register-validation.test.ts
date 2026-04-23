import { describe, it, expect } from 'vitest';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mirror the password policy enforced in src/app/api/auth/register/route.ts
function isValidPassword(p: string): boolean {
    return (
        typeof p === 'string' &&
        p.length >= 8 &&
        /[A-Z]/.test(p) &&
        /[a-z]/.test(p) &&
        /[0-9]/.test(p)
    );
}

function isValidEmail(e: string): boolean {
    return typeof e === 'string' && EMAIL_RE.test(e) && e.length <= 254;
}

describe('register validation', () => {
    it('rejects password shorter than 8 chars', () => {
        expect(isValidPassword('Ab1')).toBe(false);
    });

    it('rejects password without uppercase', () => {
        expect(isValidPassword('abcdef12')).toBe(false);
    });

    it('rejects password without lowercase', () => {
        expect(isValidPassword('ABCDEF12')).toBe(false);
    });

    it('rejects password without digit', () => {
        expect(isValidPassword('Abcdefgh')).toBe(false);
    });

    it('accepts strong password', () => {
        expect(isValidPassword('StrongPass1')).toBe(true);
    });

    it('rejects email without @', () => {
        expect(isValidEmail('foobar.com')).toBe(false);
    });

    it('rejects email with whitespace', () => {
        expect(isValidEmail('foo @bar.com')).toBe(false);
    });

    it('rejects email longer than 254 chars', () => {
        const longLocal = 'a'.repeat(250);
        expect(isValidEmail(`${longLocal}@b.co`)).toBe(false);
    });

    it('accepts well-formed email', () => {
        expect(isValidEmail('user@example.com')).toBe(true);
    });
});
