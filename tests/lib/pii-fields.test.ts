import { describe, it, expect } from 'vitest';
import { PII_FIELDS_BY_MODEL, getPiiFields } from '@/lib/pii-fields';

describe('PII_FIELDS_BY_MODEL', () => {
    it('has User with openRouterApiKey and mfaSecret', () => {
        expect(PII_FIELDS_BY_MODEL.User).toBeDefined();
        expect(PII_FIELDS_BY_MODEL.User).toContain('openRouterApiKey');
        expect(PII_FIELDS_BY_MODEL.User).toContain('mfaSecret');
    });

    it('has Connector with config', () => {
        expect(PII_FIELDS_BY_MODEL.Connector).toBeDefined();
        expect(PII_FIELDS_BY_MODEL.Connector).toContain('config');
    });

    it('has Lead with expected fields', () => {
        expect(PII_FIELDS_BY_MODEL.Lead).toBeDefined();
        expect(PII_FIELDS_BY_MODEL.Lead).toContain('phone');
        expect(PII_FIELDS_BY_MODEL.Lead).toContain('linkedinUrl');
        expect(PII_FIELDS_BY_MODEL.Lead).toContain('notes');
    });

    it('has WhatsAppContact with notes', () => {
        expect(PII_FIELDS_BY_MODEL.WhatsAppContact).toBeDefined();
        expect(PII_FIELDS_BY_MODEL.WhatsAppContact).toContain('notes');
    });

    it('contains all expected models', () => {
        const models = Object.keys(PII_FIELDS_BY_MODEL);
        expect(models).toContain('Lead');
        expect(models).toContain('Connector');
        expect(models).toContain('User');
        expect(models).toContain('WhatsAppContact');
    });

    it('every model has at least one field', () => {
        for (const [model, fields] of Object.entries(PII_FIELDS_BY_MODEL)) {
            expect(fields.length, `${model} should have at least one PII field`).toBeGreaterThan(0);
        }
    });
});

describe('getPiiFields', () => {
    it('returns fields for known model', () => {
        expect(getPiiFields('User')).toEqual(PII_FIELDS_BY_MODEL.User);
    });

    it('returns null for unknown model', () => {
        expect(getPiiFields('NonExistentModel')).toBeNull();
    });

    it('returns null for undefined', () => {
        expect(getPiiFields(undefined)).toBeNull();
    });

    it('returns null for empty string', () => {
        expect(getPiiFields('')).toBeNull();
    });
});
