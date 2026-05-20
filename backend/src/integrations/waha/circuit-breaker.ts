import { Logger } from '@nestjs/common';
import { ExternalServiceError } from '@app/shared/errors';

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  name: string;
  failureThreshold: number;
  cooldownMs: number;
  errorCode?: string;
  now?: () => number;
}

/**
 * Per-method circuit breaker. Closes after a successful half-open call,
 * opens after `failureThreshold` consecutive failures, half-opens after
 * `cooldownMs` so one probe can recover the route.
 *
 * When open, every call short-circuits with `ExternalServiceError` so
 * callers don't pay the timeout budget on a degraded provider.
 */
export class CircuitBreaker {
  private readonly logger: Logger;
  private state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private openedAt = 0;
  private readonly now: () => number;

  constructor(private readonly opts: CircuitBreakerOptions) {
    this.logger = new Logger(`CB:${opts.name}`);
    this.now = opts.now ?? ((): number => Date.now());
  }

  async exec<R>(fn: () => Promise<R>): Promise<R> {
    if (this.state === 'open') {
      if (this.now() - this.openedAt < this.opts.cooldownMs) {
        throw this.openError();
      }
      this.transition('half-open');
    }
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure(err);
      throw err;
    }
  }

  status(): { state: CircuitState; consecutiveFailures: number } {
    return { state: this.state, consecutiveFailures: this.consecutiveFailures };
  }

  reset(): void {
    this.state = 'closed';
    this.consecutiveFailures = 0;
    this.openedAt = 0;
  }

  private onSuccess(): void {
    if (this.state === 'half-open') {
      this.transition('closed');
    }
    this.consecutiveFailures = 0;
  }

  private onFailure(_err: unknown): void {
    this.consecutiveFailures += 1;
    if (this.state === 'half-open' || this.consecutiveFailures >= this.opts.failureThreshold) {
      this.openedAt = this.now();
      this.transition('open');
    }
  }

  private transition(next: CircuitState): void {
    if (this.state === next) return;
    this.logger.warn(`circuit ${this.state} -> ${next}`);
    this.state = next;
  }

  private openError(): ExternalServiceError {
    return new ExternalServiceError(`${this.opts.name} circuit open`, {
      code: this.opts.errorCode ?? 'WAHA_UNAVAILABLE',
      details: { method: this.opts.name, state: this.state },
    });
  }
}
