import { describe, it, expect } from 'vitest';

/**
 * Tests for the redactConfig function from backup-restore.ts.
 * The function is defined inline in a server action, so we replicate
 * its logic here for unit testing without pulling in the full
 * Next.js server action runtime.
 */

const REDACTED = '****';
const SENSITIVE_KEYS = ['password', 'pwd', 'secret', 'apiKey', 'api_key', 'token', 'connectionString'];

function redactConfig(config: Record<string, any>): Record<string, any> {
    const redacted: Record<string, any> = {};
    for (const [key, value] of Object.entries(config)) {
        if (SENSITIVE_KEYS.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
            redacted[key] = REDACTED;
        } else {
            redacted[key] = value;
        }
    }
    return redacted;
}

describe('redactConfig', () => {
    it('redacts password fields', () => {
        const config = { server: 'db.host.com', password: 'supersecret', port: 1433 };
        const result = redactConfig(config);
        expect(result.password).toBe(REDACTED);
        expect(result.server).toBe('db.host.com');
        expect(result.port).toBe(1433);
    });

    it('redacts pwd fields', () => {
        const result = redactConfig({ userPwd: 'abc123', database: 'mydb' });
        expect(result.userPwd).toBe(REDACTED);
        expect(result.database).toBe('mydb');
    });

    it('redacts apiKey fields', () => {
        const result = redactConfig({ openRouterApiKey: 'sk-xxx', model: 'gpt-4' });
        expect(result.openRouterApiKey).toBe(REDACTED);
        expect(result.model).toBe('gpt-4');
    });

    it('redacts api_key fields', () => {
        const result = redactConfig({ my_api_key: 'key123', name: 'test' });
        expect(result.my_api_key).toBe(REDACTED);
        expect(result.name).toBe('test');
    });

    it('redacts token fields', () => {
        const result = redactConfig({ bearerToken: 'tok_xyz', enabled: true });
        expect(result.bearerToken).toBe(REDACTED);
        expect(result.enabled).toBe(true);
    });

    it('redacts secret fields', () => {
        const result = redactConfig({ mfaSecret: 'JBSWY3DPEHPK3PXP', user: 'admin' });
        expect(result.mfaSecret).toBe(REDACTED);
        expect(result.user).toBe('admin');
    });

    it('redacts connectionString fields', () => {
        const result = redactConfig({ connectionString: 'Server=...;Password=...', type: 'mssql' });
        expect(result.connectionString).toBe(REDACTED);
        expect(result.type).toBe('mssql');
    });

    it('is case-insensitive for key matching', () => {
        const result = redactConfig({ PASSWORD: 'abc', ApiKey: 'xyz', myConnectionString: 'connstr' });
        // The function matches key.toLowerCase() includes sk.toLowerCase()
        // PASSWORD -> password includes password -> true
        // ApiKey -> apikey includes apikey -> true
        // myConnectionString -> myconnectionstring includes connectionstring -> true
        expect(result.PASSWORD).toBe(REDACTED);
        expect(result.ApiKey).toBe(REDACTED);
        expect(result.myConnectionString).toBe(REDACTED);
    });

    it('preserves non-sensitive fields unchanged', () => {
        const config = { server: 'localhost', port: 5432, database: 'fridai', encrypt: true };
        const result = redactConfig(config);
        expect(result).toEqual(config);
    });

    it('handles empty config', () => {
        expect(redactConfig({})).toEqual({});
    });

    it('handles config with only sensitive fields', () => {
        const config = { password: 'a', secret: 'b', token: 'c' };
        const result = redactConfig(config);
        expect(result.password).toBe(REDACTED);
        expect(result.secret).toBe(REDACTED);
        expect(result.token).toBe(REDACTED);
    });

    it('redacts multiple sensitive fields in same config', () => {
        const config = {
            server: 'db.example.com',
            password: 'pass123',
            apiKey: 'sk-abc',
            token: 'tok-xyz',
            database: 'production',
        };
        const result = redactConfig(config);
        expect(result.server).toBe('db.example.com');
        expect(result.password).toBe(REDACTED);
        expect(result.apiKey).toBe(REDACTED);
        expect(result.token).toBe(REDACTED);
        expect(result.database).toBe('production');
    });
});
