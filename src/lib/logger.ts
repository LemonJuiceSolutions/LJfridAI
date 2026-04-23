type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const currentLevel = (process.env.LOG_LEVEL as LogLevel) || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatMessage(level: LogLevel, message: string, context?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();

  if (process.env.NODE_ENV === 'production') {
    return JSON.stringify({ timestamp, level, message, ...context });
  }

  const contextStr = context ? ' ' + JSON.stringify(context) : '';
  return `[${timestamp}] ${level.toUpperCase()}: ${message}${contextStr}`;
}

/**
 * Simple structured log function for use in contexts where the full logger
 * object is not needed. Outputs JSON in production, human-readable in dev.
 */
export function log(level: 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };
  if (process.env.NODE_ENV === 'production') {
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](JSON.stringify(entry));
  } else {
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](`[${level.toUpperCase()}] ${message}`, context || '');
  }
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => {
    if (shouldLog('debug')) console.debug(formatMessage('debug', message, context));
  },
  info: (message: string, context?: Record<string, unknown>) => {
    if (shouldLog('info')) console.info(formatMessage('info', message, context));
  },
  warn: (message: string, context?: Record<string, unknown>) => {
    if (shouldLog('warn')) console.warn(formatMessage('warn', message, context));
  },
  error: (message: string, context?: Record<string, unknown>) => {
    if (shouldLog('error')) console.error(formatMessage('error', message, context));
  },
};
