import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Module,
  type INestApplication,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import helmet from 'helmet';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { APP_CONFIG } from '@app/config/constants';
import { type AppConfig } from '@app/config/env';
import { ConfigModule } from '@app/config/config.module';
import { LoggerModule } from '@app/config/logger.module';
import { CorrelationMiddleware } from '@app/common/middleware/correlation.middleware';
import { AllExceptionsFilter } from '@app/common/filters/all-exceptions.filter';
import { RequestTimeoutInterceptor } from '@app/common/interceptors/request-timeout.interceptor';

@Controller('probe')
class ProbeController {
  @Get('fast')
  @HttpCode(HttpStatus.OK)
  fast(): { ok: true } {
    return { ok: true };
  }

  @Get('slow')
  @HttpCode(HttpStatus.OK)
  async slow(): Promise<{ ok: true }> {
    await new Promise((r) => setTimeout(r, 200));
    return { ok: true };
  }
}

@Module({
  imports: [ConfigModule, LoggerModule],
  controllers: [ProbeController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: RequestTimeoutInterceptor }],
})
class SecurityTestModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}

describe('Phase 11 — helmet posture + request timeout (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL ??= 'postgres://user:pass@localhost:5432/devdesk';
    process.env.REDIS_URL ??= 'redis://localhost:6379';
    process.env.JWT_PRIVATE_KEY ??= '-----BEGIN PRIVATE KEY-----\nstub\n-----END PRIVATE KEY-----';
    process.env.JWT_PUBLIC_KEY ??= '-----BEGIN PUBLIC KEY-----\nstub\n-----END PUBLIC KEY-----';
    process.env.WAHA_BASE_URL ??= 'http://localhost:3001';
    process.env.WAHA_STORE_PATH ??= '/tmp/waha-store.db';
    // Tight budget so the slow handler trips the interceptor without holding
    // the test process for a meaningful slice of wall-time.
    process.env.REQUEST_TIMEOUT_MS = '50';

    const mod = await Test.createTestingModule({ imports: [SecurityTestModule] }).compile();
    app = mod.createNestApplication();
    const cfg = app.get<AppConfig>(APP_CONFIG);
    app.use(
      helmet({
        contentSecurityPolicy: {
          useDefaults: false,
          directives: {
            defaultSrc: ["'none'"],
            baseUri: ["'none'"],
            frameAncestors: ["'none'"],
            formAction: ["'none'"],
          },
        },
        strictTransportSecurity: {
          maxAge: cfg.HSTS_MAX_AGE_SECONDS,
          includeSubDomains: true,
          preload: true,
        },
        referrerPolicy: { policy: 'no-referrer' },
        crossOriginResourcePolicy: { policy: 'same-site' },
        crossOriginOpenerPolicy: { policy: 'same-origin' },
        crossOriginEmbedderPolicy: false,
        xPermittedCrossDomainPolicies: { permittedPolicies: 'none' },
      }),
    );
    app.use(
      (
        _req: unknown,
        res: { setHeader: (k: string, v: string) => void },
        next: () => void,
      ): void => {
        res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
        next();
      },
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.REQUEST_TIMEOUT_MS;
  });

  it('emits the strict CSP, HSTS, and Permissions-Policy headers', async () => {
    const res = await request(app.getHttpServer()).get('/probe/fast');
    expect(res.status).toBe(200);
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/);
    expect(res.headers['strict-transport-security']).toContain('includeSubDomains');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['permissions-policy']).toContain('camera=()');
    expect(res.headers['x-permitted-cross-domain-policies']).toBe('none');
  });

  it('returns 503 REQUEST_TIMEOUT when the handler runs past REQUEST_TIMEOUT_MS', async () => {
    const res = await request(app.getHttpServer()).get('/probe/slow');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('REQUEST_TIMEOUT');
    expect(res.body.error.details.timeoutMs).toBe(50);
  });
});
