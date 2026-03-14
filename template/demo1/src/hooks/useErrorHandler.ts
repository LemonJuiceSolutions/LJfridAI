import { useCallback } from 'react';

interface ErrorHandlerOptions {
  onError?: (error: Error) => void;
  logToConsole?: boolean;
  logToService?: boolean;
}

export const useErrorHandler = (options: ErrorHandlerOptions = {}) => {
  const { onError, logToConsole = true, logToService = false } = options;

  const handleError = useCallback(
    (error: Error, context?: string) => {
      // Log to console if enabled
      if (logToConsole) {
        console.error(`Error${context ? ` in ${context}` : ''}:`, error);
      }

      // Log to external service if enabled
      if (logToService) {
        // Example: logErrorToService(error, { context });
        console.warn('Error logging to external service not implemented');
      }

      // Call custom error handler if provided
      if (onError) {
        onError(error);
      }
    },
    [onError, logToConsole, logToService]
  );

  const handleAsyncError = useCallback(
    async <T>(asyncFn: () => Promise<T>, context?: string): Promise<T | null> => {
      try {
        return await asyncFn();
      } catch (error) {
        handleError(error as Error, context);
        return null;
      }
    },
    [handleError]
  );

  const wrapWithErrorHandler = useCallback(
    <TArgs extends unknown[], TReturn>(fn: (...args: TArgs) => TReturn, context?: string) => {
      return (...args: TArgs): TReturn => {
        try {
          return fn(...args);
        } catch (error) {
          handleError(error as Error, context);
          throw error; // Re-throw to maintain original behavior
        }
      };
    },
    [handleError]
  );

  return {
    handleError,
    handleAsyncError,
    wrapWithErrorHandler,
  };
};
