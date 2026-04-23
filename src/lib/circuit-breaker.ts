import { log } from '@/lib/logger';

/**
 * Lightweight circuit breaker for external service calls.
 *
 * States:
 *   CLOSED   -> normal operation; failures are counted
 *   OPEN     -> all calls fail immediately with CircuitOpenError
 *   HALF_OPEN -> one probe call is allowed; success closes, failure re-opens
 */

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before the circuit opens. Default: 5 */
  failureThreshold: number;
  /** Milliseconds before transitioning from OPEN to HALF_OPEN. Default: 30000 */
  resetTimeoutMs: number;
  /** Service name used in log messages */
  name: string;
}

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitOpenError extends Error {
  constructor(serviceName: string) {
    super(
      `Circuit breaker OPEN for "${serviceName}" — calls are being rejected. ` +
        'The service will be retried automatically after the reset timeout.',
    );
    this.name = 'CircuitOpenError';
  }
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly svc: string;

  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  readonly serviceName: string;

  constructor(options: CircuitBreakerOptions) {
    this.failureThreshold = options.failureThreshold;
    this.resetTimeoutMs = options.resetTimeoutMs;
    this.serviceName = options.name;
    this.svc = options.name;
  }

  /** Current circuit state — useful for health checks / monitoring. */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Execute `fn` through the circuit breaker.
   *
   * - CLOSED: call proceeds normally. On failure the counter increments.
   * - OPEN: call is rejected immediately with `CircuitOpenError`.
   * - HALF_OPEN: one probe call is allowed.
   */
  async call<T>(fn: () => Promise<T>): Promise<T> {
    // Check whether an OPEN circuit should transition to HALF_OPEN
    if (this.state === 'OPEN') {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.resetTimeoutMs) {
        this.transitionTo('HALF_OPEN');
      } else {
        throw new CircuitOpenError(this.serviceName);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  // ── internal helpers ──────────────────────────────────────────

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      log('info', `[circuit:${this.svc}] probe succeeded, closing circuit`);
    }
    this.failureCount = 0;
    if (this.state !== 'CLOSED') {
      this.transitionTo('CLOSED');
    }
  }

  private onFailure(error: unknown): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    const msg = error instanceof Error ? error.message : String(error);

    if (this.state === 'HALF_OPEN') {
      log('warn', `[circuit:${this.svc}] probe failed, re-opening: ${msg}`);
      this.transitionTo('OPEN');
      return;
    }

    if (this.failureCount >= this.failureThreshold) {
      log('error', `[circuit:${this.svc}] threshold ${this.failureThreshold} reached, opening: ${msg}`);
      this.transitionTo('OPEN');
    } else {
      log('warn', `[circuit:${this.svc}] failure ${this.failureCount}/${this.failureThreshold}: ${msg}`);
    }
  }

  private transitionTo(newState: CircuitState): void {
    const prev = this.state;
    this.state = newState;
    log('info', `[circuit:${this.svc}] ${prev} → ${newState}`);
  }
}

// ── Pre-built instances for the two main external services ──────────

/** Circuit breaker for Python backend (localhost:5005 / Docker service) */
export const pythonBackendCircuit = new CircuitBreaker({
  name: 'python-backend',
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
});

/** Circuit breaker for OpenRouter API */
export const openRouterCircuit = new CircuitBreaker({
  name: 'openrouter',
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
});
