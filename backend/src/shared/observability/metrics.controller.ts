import { Controller, Get, Header, Inject, Req } from '@nestjs/common';
import { type Request } from 'express';
import { APP_CONFIG } from '@app/config/constants';
import { type AppConfig } from '@app/config/env';
import { Public } from '@app/common/decorators/public.decorator';
import { ForbiddenError, UnauthorizedError } from '@app/modules/auth/auth.errors';
import { metricsRegistry } from './metrics.registry';

/**
 * `/metrics` is `@Public()` because Prometheus scrapers don't carry JWTs.
 * Instead a single bearer token from env gates the route — when the token is
 * unset the endpoint is intentionally inaccessible (defence-in-depth: a fresh
 * deploy never accidentally exposes internal counters before the scraper is
 * configured).
 */
@Controller('metrics')
export class MetricsController {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  @Public()
  @Get()
  @Header('Cache-Control', 'no-store')
  async scrape(@Req() req: Request): Promise<string> {
    this.assertAuthorized(req);
    const body = await metricsRegistry.metrics();
    return body;
  }

  private assertAuthorized(req: Request): void {
    const token = this.config.METRICS_BEARER_TOKEN;
    if (token === undefined) {
      // Endpoint disabled: pretend it doesn't exist for unauthenticated probes.
      throw new ForbiddenError('Metrics endpoint disabled');
    }
    const header = req.header('authorization') ?? '';
    const [scheme, presented] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || presented !== token) {
      throw new UnauthorizedError('Invalid metrics token');
    }
  }
}
