import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG } from '@app/config/constants';
import { type AppConfig } from '@app/config/env';
import { ExternalServiceError } from '@app/shared/errors';
import {
  METRIC_OUTCOME,
  wahaCircuitState,
  wahaRequestDuration,
  wahaRequestsTotal,
} from '@app/shared/observability/metrics.registry';
import { CircuitBreaker } from './circuit-breaker';
import { TtlCache } from './ttl-cache';
import { WahaClient } from './waha.client';
import {
  type DeleteMessageParams,
  type EditMessageParams,
  type ForwardMessageParams,
  type ListChatsParams,
  type ListMessagesParams,
  type ReactToMessageParams,
  type SendMediaParams,
  type SendTextParams,
  type WahaChat,
  type WahaMessage,
  type WahaQrCode,
  type WahaSession,
} from './waha.types';

interface RetryOptions {
  maxAttempts: number;
  baseMs: number;
}

/**
 * Resilience-wrapped facade for the WAHA HTTP API.
 *
 * Responsibilities the pure `WahaClient` deliberately omits:
 *  - in-memory TTL caches on hot read paths (sessions/chats/status),
 *  - exponential retry on idempotent GETs only,
 *  - per-method circuit breaker so a degraded route doesn't drag the
 *    whole integration down,
 *  - request timeouts (already set on the axios instance).
 *
 * Writes never retry — duplicate side-effects are worse than a 502.
 */
@Injectable()
export class WahaService {
  private readonly logger = new Logger(WahaService.name);
  private readonly retry: RetryOptions;
  private readonly breakers = new Map<string, CircuitBreaker>();
  private readonly sessionsCache: TtlCache<WahaSession[]>;
  private readonly sessionCache: TtlCache<WahaSession>;
  private readonly statusCache: TtlCache<WahaSession>;
  private readonly chatsCache: TtlCache<WahaChat[]>;
  private readonly cbFailureThreshold: number;
  private readonly cbCooldownMs: number;

  constructor(
    @Inject(APP_CONFIG) env: AppConfig,
    private readonly client: WahaClient,
  ) {
    this.retry = { maxAttempts: env.WAHA_RETRY_MAX, baseMs: env.WAHA_RETRY_BASE_MS };
    this.cbFailureThreshold = env.WAHA_CB_FAILURE_THRESHOLD;
    this.cbCooldownMs = env.WAHA_CB_COOLDOWN_MS;
    this.sessionsCache = new TtlCache(env.WAHA_SESSIONS_CACHE_TTL_MS);
    this.sessionCache = new TtlCache(env.WAHA_SESSIONS_CACHE_TTL_MS);
    this.statusCache = new TtlCache(env.WAHA_STATUS_CACHE_TTL_MS);
    this.chatsCache = new TtlCache(env.WAHA_CHATS_CACHE_TTL_MS);
  }

  // ----- Sessions (cached + retried) -----
  listSessions(): Promise<WahaSession[]> {
    return this.sessionsCache.wrap('all', () =>
      this.callIdempotent('listSessions', () => this.client.listSessions()),
    );
  }

  getSession(name: string): Promise<WahaSession> {
    return this.sessionCache.wrap(name, () =>
      this.callIdempotent('getSession', () => this.client.getSession(name)),
    );
  }

  getSessionStatus(name: string): Promise<WahaSession> {
    return this.statusCache.wrap(name, () =>
      this.callIdempotent('getSessionStatus', () => this.client.getSession(name)),
    );
  }

  startSession(name: string): Promise<WahaSession> {
    return this.mutate('startSession', () => this.client.startSession(name), [
      () => {
        this.invalidateSession(name);
      },
    ]);
  }

  stopSession(name: string): Promise<WahaSession> {
    return this.mutate('stopSession', () => this.client.stopSession(name), [
      () => {
        this.invalidateSession(name);
      },
    ]);
  }

  deleteSession(name: string): Promise<void> {
    return this.mutate('deleteSession', () => this.client.deleteSession(name), [
      () => {
        this.invalidateSession(name);
      },
    ]);
  }

  getQrCode(name: string): Promise<WahaQrCode> {
    return this.callIdempotent('getQrCode', () => this.client.getQrCode(name));
  }

  // ----- Chats (cached) -----
  listChats(session: string, params: ListChatsParams = {}): Promise<WahaChat[]> {
    return this.chatsCache.wrap(`${session}:${this.hash(params)}`, () =>
      this.callIdempotent('listChats', () => this.client.listChats(session, params)),
    );
  }

  // ----- Messages -----
  listMessages(
    session: string,
    chatId: string,
    params: ListMessagesParams = {},
  ): Promise<WahaMessage[]> {
    return this.callIdempotent('listMessages', () =>
      this.client.listMessages(session, chatId, params),
    );
  }

  sendText(params: SendTextParams): Promise<WahaMessage> {
    return this.mutate('sendText', () => this.client.sendText(params));
  }

  sendMedia(params: SendMediaParams): Promise<WahaMessage> {
    return this.mutate('sendMedia', () => this.client.sendMedia(params));
  }

  editMessage(params: EditMessageParams): Promise<WahaMessage> {
    return this.mutate('editMessage', () => this.client.editMessage(params));
  }

  deleteMessage(params: DeleteMessageParams): Promise<void> {
    return this.mutate('deleteMessage', () => this.client.deleteMessage(params));
  }

  reactToMessage(params: ReactToMessageParams): Promise<void> {
    return this.mutate('reactToMessage', () => this.client.reactToMessage(params));
  }

  forwardMessage(params: ForwardMessageParams): Promise<WahaMessage> {
    return this.mutate('forwardMessage', () => this.client.forwardMessage(params));
  }

  // ----- Cache control (used by webhook on session.status) -----
  invalidateSession(name: string): void {
    this.sessionCache.invalidate(name);
    this.statusCache.invalidate(name);
    this.sessionsCache.clear();
  }

  invalidateChats(session?: string): void {
    if (session === undefined) {
      this.chatsCache.clear();
      return;
    }
    // Best-effort: TtlCache doesn't expose key listing; full clear is acceptable
    // because chat lists are paginated by `(session, params)` and the upstream
    // signal that triggered this (e.g. a webhook) usually invalidates broadly.
    this.chatsCache.clear();
  }

  circuitStatus(method: string): { state: string; consecutiveFailures: number } | undefined {
    const cb = this.breakers.get(method);
    if (cb === undefined) return undefined;
    return cb.status();
  }

  private breaker(method: string): CircuitBreaker {
    const existing = this.breakers.get(method);
    if (existing !== undefined) return existing;
    const cb = new CircuitBreaker({
      name: `waha.${method}`,
      failureThreshold: this.cbFailureThreshold,
      cooldownMs: this.cbCooldownMs,
      errorCode: 'WAHA_UNAVAILABLE',
    });
    this.breakers.set(method, cb);
    return cb;
  }

  private async callIdempotent<R>(method: string, fn: () => Promise<R>): Promise<R> {
    return this.instrument(method, () =>
      this.breaker(method).exec(() => this.retryable(method, fn)),
    );
  }

  private async mutate<R>(
    method: string,
    fn: () => Promise<R>,
    afterSuccess: (() => void)[] = [],
  ): Promise<R> {
    const result = await this.instrument(method, () => this.breaker(method).exec(fn));
    for (const cb of afterSuccess) {
      try {
        cb();
      } catch (err) {
        this.logger.warn(`post-${method} hook failed: ${(err as Error).message}`);
      }
    }
    return result;
  }

  private async instrument<R>(method: string, fn: () => Promise<R>): Promise<R> {
    const start = process.hrtime.bigint();
    try {
      const out = await fn();
      this.recordCall(method, METRIC_OUTCOME.SUCCESS, start);
      return out;
    } catch (err) {
      this.recordCall(method, METRIC_OUTCOME.FAILURE, start);
      throw err;
    }
  }

  private recordCall(method: string, outcome: string, start: bigint): void {
    const durationSec = Number(process.hrtime.bigint() - start) / 1_000_000_000;
    wahaRequestDuration.observe({ method, outcome }, durationSec);
    wahaRequestsTotal.inc({ method, outcome });
    const status = this.breakers.get(method)?.status();
    if (status !== undefined) {
      const value = status.state === 'open' ? 2 : status.state === 'half-open' ? 1 : 0;
      wahaCircuitState.set({ method }, value);
    }
  }

  private async retryable<R>(method: string, fn: () => Promise<R>): Promise<R> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= this.retry.maxAttempts + 1; attempt += 1) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (!this.shouldRetry(err) || attempt > this.retry.maxAttempts) {
          throw err;
        }
        const delay = this.retry.baseMs * 2 ** (attempt - 1);
        this.logger.debug(`waha.${method} retry ${String(attempt)} in ${String(delay)}ms`);
        await this.sleep(delay);
      }
    }
    throw lastErr;
  }

  private shouldRetry(err: unknown): boolean {
    if (!(err instanceof ExternalServiceError)) return false;
    const details = err.details;
    if (details === undefined) return false;
    const status = details.status;
    if (typeof status === 'number') return status >= 500;
    // Network-level failures (no response) — retry.
    return details.axiosCode !== undefined;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private hash(value: unknown): string {
    return JSON.stringify(value ?? null);
  }
}
