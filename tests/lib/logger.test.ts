import { describe, it, expect, vi, afterEach } from 'vitest';

describe('logger', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('exports a logger with standard pino methods', async () => {
    process.env.LOG_LEVEL = 'debug';
    const { logger } = await import('@/lib/logger');

    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.child).toBe('function');
  });

  it('exports a backward-compatible log() function', async () => {
    const { log } = await import('@/lib/logger');
    expect(typeof log).toBe('function');
  });

  it('child() creates a child logger with context', async () => {
    const { logger } = await import('@/lib/logger');
    const child = logger.child({ requestId: 'abc-123' });
    expect(typeof child.info).toBe('function');
    expect(typeof child.error).toBe('function');
  });

  it('log() delegates to pino without errors', async () => {
    process.env.LOG_LEVEL = 'info';
    const { log } = await import('@/lib/logger');
    // Should not throw
    expect(() => log('info', 'test message')).not.toThrow();
    expect(() => log('info', 'test with context', { key: 'val' })).not.toThrow();
    expect(() => log('error', 'error message')).not.toThrow();
    expect(() => log('warn', 'warning message')).not.toThrow();
  });
});
