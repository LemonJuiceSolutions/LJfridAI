import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('env validation', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('exports env without throwing when required vars are set', async () => {
    process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
    process.env.NEXTAUTH_SECRET = 'a-secret-that-is-at-least-32-chars-long';
    (process.env as any).NODE_ENV = 'test';

    const mod = await import('@/lib/env');
    expect(mod.env).toBeDefined();
    expect(mod.env?.DATABASE_URL).toBe('postgresql://localhost:5432/test');
  });

  it('returns undefined env when required vars are missing in non-production', async () => {
    delete process.env.DATABASE_URL;
    delete process.env.NEXTAUTH_SECRET;
    (process.env as any).NODE_ENV = 'test';

    const mod = await import('@/lib/env');
    expect(mod.env).toBeUndefined();
  });

  it('applies default values for optional fields', async () => {
    process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
    process.env.NEXTAUTH_SECRET = 'a-secret-that-is-at-least-32-chars-long';
    delete process.env.PYTHON_BACKEND_URL;
    delete process.env.DATA_LAKE_PATH;
    (process.env as any).NODE_ENV = 'test';

    const mod = await import('@/lib/env');
    expect(mod.env).toBeDefined();
    expect(mod.env?.PYTHON_BACKEND_URL).toBe('http://localhost:5005');
    expect(mod.env?.DATA_LAKE_PATH).toBe('data_lake');
  });
});
