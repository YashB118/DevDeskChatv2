import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ConfigModule } from '@app/config/config.module';
import { LoggerModule } from '@app/config/logger.module';
import { AllExceptionsFilter } from '@app/common/filters/all-exceptions.filter';
import { CorrelationMiddleware } from '@app/common/middleware/correlation.middleware';

@Controller('health')
class LivenessOnlyController {
  @Get('live')
  @HttpCode(HttpStatus.OK)
  live() {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }
}

@Module({
  imports: [ConfigModule, LoggerModule],
  controllers: [LivenessOnlyController],
})
class TestAppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}

describe('Liveness + correlation + 404 envelope (no infra)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL ??= 'postgres://user:pass@localhost:5432/devdesk';
    process.env.REDIS_URL ??= 'redis://localhost:6379';
    process.env.JWT_PRIVATE_KEY ??= '-----BEGIN PRIVATE KEY-----\nstub\n-----END PRIVATE KEY-----';
    process.env.JWT_PUBLIC_KEY ??= '-----BEGIN PUBLIC KEY-----\nstub\n-----END PUBLIC KEY-----';
    const mod = await Test.createTestingModule({ imports: [TestAppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health/live returns 200', async () => {
    const res = await request(app.getHttpServer()).get('/health/live');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('unknown path returns the normalized 404 envelope', async () => {
    const res = await request(app.getHttpServer()).get('/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.correlationId).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
