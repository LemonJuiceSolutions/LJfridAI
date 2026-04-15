import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('logger', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    // Clear module cache so logger re-evaluates env vars on next import
    vi.resetModules();
  });

  it('outputs debug messages when LOG_LEVEL is debug', async () => {
    process.env.LOG_LEVEL = 'debug';
    process.env.NODE_ENV = 'test';
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    const { logger } = await import('@/lib/logger');
    logger.debug('test debug message');

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain('test debug message');
  });

  it('suppresses debug messages when LOG_LEVEL is info', async () => {
    process.env.LOG_LEVEL = 'info';
    process.env.NODE_ENV = 'test';
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    const { logger } = await import('@/lib/logger');
    logger.debug('should not appear');

    expect(spy).not.toHaveBeenCalled();
  });

  it('outputs info messages when LOG_LEVEL is info', async () => {
    process.env.LOG_LEVEL = 'info';
    process.env.NODE_ENV = 'test';
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const { logger } = await import('@/lib/logger');
    logger.info('info message');

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain('info message');
  });

  it('outputs warn messages at warn level', async () => {
    process.env.LOG_LEVEL = 'warn';
    process.env.NODE_ENV = 'test';
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { logger } = await import('@/lib/logger');
    logger.warn('warning');

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('outputs error messages at error level', async () => {
    process.env.LOG_LEVEL = 'error';
    process.env.NODE_ENV = 'test';
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { logger } = await import('@/lib/logger');
    logger.error('error msg');

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('formats as JSON in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.LOG_LEVEL = 'info';
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const { logger } = await import('@/lib/logger');
    logger.info('prod message', { userId: '123' });

    expect(spy).toHaveBeenCalledTimes(1);
    const output = spy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('prod message');
    expect(parsed.userId).toBe('123');
    expect(parsed.timestamp).toBeDefined();
  });

  it('formats as plain text in development', async () => {
    process.env.NODE_ENV = 'development';
    process.env.LOG_LEVEL = 'info';
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const { logger } = await import('@/lib/logger');
    logger.info('dev message');

    expect(spy).toHaveBeenCalledTimes(1);
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain('INFO:');
    expect(output).toContain('dev message');
    // Should NOT be valid JSON
    expect(() => JSON.parse(output)).toThrow();
  });
});
