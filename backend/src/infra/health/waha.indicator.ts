import { Inject, Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, type HealthIndicatorResult } from '@nestjs/terminus';
import { APP_CONFIG } from '@app/config/constants';
import { type AppConfig } from '@app/config/env';
import { WahaService } from '@app/integrations/waha/waha.service';

interface CachedResult {
  status: 'up' | 'down';
  message: string | null;
  expiresAt: number;
}

/**
 * WAHA reachability probe for `/health/ready`. Result is cached briefly so a
 * tight orchestrator probe loop doesn't hammer the upstream — health checks
 * usually fire every 1–5 seconds, but WAHA's session list call is heavier
 * than a Postgres ping.
 */
@Injectable()
export class WahaHealthIndicator extends HealthIndicator {
  private cached: CachedResult | null = null;
  private readonly cacheTtlMs: number;
  private readonly timeoutMs: number;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly waha: WahaService,
  ) {
    super();
    this.cacheTtlMs = config.HEALTH_WAHA_CACHE_TTL_MS;
    this.timeoutMs = config.HEALTH_WAHA_TIMEOUT_MS;
  }

  async pingCheck(key: string): Promise<HealthIndicatorResult> {
    const result = await this.evaluate();
    if (result.status === 'up') {
      return this.getStatus(key, true, { message: result.message ?? 'ok' });
    }
    throw new HealthCheckError('WAHA unreachable', {
      [key]: { status: 'down', message: result.message ?? 'unknown' },
    });
  }

  private async evaluate(): Promise<CachedResult> {
    const now = Date.now();
    if (this.cached !== null && this.cached.expiresAt > now) return this.cached;
    let next: CachedResult;
    try {
      await Promise.race([this.waha.listSessions(), this.timeout()]);
      next = { status: 'up', message: null, expiresAt: now + this.cacheTtlMs };
    } catch (err) {
      next = {
        status: 'down',
        message: (err as Error).message,
        // Cache failures briefly too so a flapping upstream doesn't melt the
        // probe path; the next scrape will retry naturally.
        expiresAt: now + Math.min(this.cacheTtlMs, 5_000),
      };
    }
    this.cached = next;
    return next;
  }

  private timeout(): Promise<never> {
    const ms = this.timeoutMs;
    return new Promise((_resolve, reject) =>
      setTimeout(() => {
        reject(new Error(`WAHA probe timed out after ${String(ms)}ms`));
      }, ms),
    );
  }
}
