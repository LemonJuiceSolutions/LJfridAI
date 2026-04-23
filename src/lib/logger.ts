import pino, { type Logger as PinoLogger } from 'pino';

/**
 * Structured logger powered by Pino.
 *
 * - Production: JSON output with timestamp and level
 * - Development: pretty-printed via pino-pretty (optional dep)
 * - PII fields are automatically redacted in all environments
 *
 * The exported `logger` preserves the call signature
 *   logger.info(message, context?)
 * so that existing callers continue to work unchanged.
 */

const redactPaths = [
  'email',
  'password',
  'token',
  'apiKey',
  'secret',
  'authorization',
  '*.email',
  '*.password',
  '*.token',
  '*.apiKey',
];

const isProduction = process.env.NODE_ENV === 'production';
const level = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

const pinoInstance: PinoLogger = pino({
  level,
  redact: {
    paths: redactPaths,
    censor: '[REDACTED]',
  },
  ...(isProduction
    ? {
        timestamp: pino.stdTimeFunctions.isoTime,
      }
    : (() => {
        // Use pino-pretty in dev if available, otherwise fall back to default JSON
        try {
          require.resolve('pino-pretty');
          return {
            transport: {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
                ignore: 'pid,hostname',
              },
            },
          };
        } catch {
          return { timestamp: pino.stdTimeFunctions.isoTime };
        }
      })()),
});

// ---------------------------------------------------------------------------
// Typed wrapper that keeps the (message, context?) call signature expected by
// every caller in the codebase while delegating to Pino internally.
// ---------------------------------------------------------------------------

export interface AppLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  /** Create a child logger with additional bound context (e.g. requestId). */
  child(bindings: Record<string, unknown>): AppLogger;
}

function wrapPino(p: PinoLogger): AppLogger {
  const makeMethod =
    (lvl: 'debug' | 'info' | 'warn' | 'error') =>
    (message: string, context?: Record<string, unknown>): void => {
      if (context) {
        p[lvl](context, message);
      } else {
        p[lvl](message);
      }
    };

  return {
    debug: makeMethod('debug'),
    info: makeMethod('info'),
    warn: makeMethod('warn'),
    error: makeMethod('error'),
    child(bindings: Record<string, unknown>): AppLogger {
      return wrapPino(p.child(bindings));
    },
  };
}

/**
 * Application logger.
 *
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.info('request handled', { userId: '123', latencyMs: 42 });
 *
 *   const reqLogger = logger.child({ requestId: 'abc-123' });
 *   reqLogger.error('database timeout', { query: 'SELECT ...' });
 */
export const logger: AppLogger = wrapPino(pinoInstance);

/**
 * Convenience `log()` function for callers that previously used the simple
 * `log(level, message, context)` signature. Preserves backward compatibility.
 */
export function log(
  level: 'info' | 'warn' | 'error',
  message: string,
  context?: Record<string, unknown>,
) {
  logger[level](message, context);
}
