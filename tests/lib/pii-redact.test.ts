import { describe, it, expect } from 'vitest';
import { redactPII, redactRows, redactForLLM, maybeRedact } from '@/lib/pii-redact';

describe('redactPII (string)', () => {
    it('redacts email', () => {
        expect(redactPII('Contattami a mario.rossi@example.com')).toContain('<redacted:email>');
    });

    it('redacts IBAN', () => {
        expect(redactPII('IBAN IT60X0542811101000000123456')).toContain('<redacted:iban>');
    });

    it('redacts Italian codice fiscale', () => {
        expect(redactPII('CF: RSSMRA80A01H501Z')).toContain('<redacted:codice-fiscale>');
    });

    it('redacts IPv4 addresses', () => {
        expect(redactPII('Server at 192.168.1.42 down')).toContain('<redacted:ip>');
    });

    it('leaves non-PII text untouched', () => {
        const txt = 'Solo testo senza dati personali.';
        expect(redactPII(txt)).toBe(txt);
    });

    it('handles empty / non-string gracefully', () => {
        expect(redactPII('')).toBe('');
        expect(redactPII(null as any)).toBeNull();
    });
});

describe('redactRows', () => {
    it('redacts known PII columns by name regardless of value pattern', () => {
        const rows = [{ id: 1, email: 'foo', telefono: 'bar', name: 'Mario', other: 'safe' }];
        const out = redactRows(rows);
        expect(out[0].email).toBe('<redacted:email>');
        expect(out[0].telefono).toBe('<redacted:phone>');
        expect(out[0].name).toBe('<redacted:name>');
        expect(out[0].other).toBe('safe');
    });

    it('returns input unchanged for non-array', () => {
        expect(redactRows([])).toEqual([]);
    });
});

describe('redactForLLM (recursive)', () => {
    it('walks nested objects', () => {
        const payload = {
            user: { email: 'a@b.com', notes: 'CF RSSMRA80A01H501Z' },
            tags: ['foo', 'IBAN IT60X0542811101000000123456'],
        };
        const out = redactForLLM(payload);
        expect(out.user.email).toBe('<redacted:email>');
        expect(out.user.notes).toContain('<redacted:codice-fiscale>');
        expect(out.tags[1]).toContain('<redacted:iban>');
    });

    it('detects array-of-objects as rows', () => {
        const out = redactForLLM([{ email: 'x' }, { email: 'y' }]);
        expect(out[0].email).toBe('<redacted:email>');
    });
});

describe('maybeRedact env toggle', () => {
    it('respects LLM_PII_REDACT=false', () => {
        const original = process.env.LLM_PII_REDACT;
        try {
            process.env.LLM_PII_REDACT = 'false';
            expect(maybeRedact('mario@example.com')).toBe('mario@example.com');
        } finally {
            process.env.LLM_PII_REDACT = original;
        }
    });

    it('redacts by default', () => {
        const original = process.env.LLM_PII_REDACT;
        try {
            delete process.env.LLM_PII_REDACT;
            expect(maybeRedact('mario@example.com')).toContain('<redacted:email>');
        } finally {
            if (original !== undefined) process.env.LLM_PII_REDACT = original;
        }
    });
});
