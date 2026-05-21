import 'reflect-metadata';
// Load `.env` into process.env BEFORE any module reads config.
// Must precede `AppModule` import (transitively imports env.ts via ConfigModule).
import 'dotenv/config';
// OpenTelemetry must start before any module that auto-instrumentation patches
// is imported (express, pg, ioredis, axios, bullmq). `startTelemetry` is the
// only thing allowed above `AppModule`.
import { startTelemetry } from './config/telemetry';
import { RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { APP_CONFIG } from './config/constants';
import { type AppConfig } from './config/env';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { MetricsInterceptor } from './shared/observability/metrics.interceptor';
import { SocketRedisAdapter } from './realtime/socket-redis.adapter';

async function bootstrap(): Promise<void> {
  const telemetry = await startTelemetry();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));
  const config = app.get<AppConfig>(APP_CONFIG);
  const logger = app.get(Logger);

  app.disable('x-powered-by');
  if (config.TRUST_PROXY) app.set('trust proxy', 1);

  // Strict, API-only helmet posture. We never serve HTML, so the CSP can be
  // maximally tight (`default-src 'none'`) — there is no surface to harden
  // beyond preventing scripts/iframes from loading even by accident.
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
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      referrerPolicy: { policy: 'no-referrer' },
      strictTransportSecurity: {
        maxAge: config.HSTS_MAX_AGE_SECONDS,
        includeSubDomains: true,
        preload: true,
      },
      xPermittedCrossDomainPolicies: { permittedPolicies: 'none' },
    }),
  );
  app.use((_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    // Permissions-Policy is not yet covered by helmet defaults. Deny every
    // powerful feature an API caller could plausibly trigger via a browser.
    res.setHeader(
      'Permissions-Policy',
      [
        'accelerometer=()',
        'autoplay=()',
        'camera=()',
        'clipboard-read=()',
        'clipboard-write=()',
        'display-capture=()',
        'fullscreen=()',
        'geolocation=()',
        'gyroscope=()',
        'magnetometer=()',
        'microphone=()',
        'midi=()',
        'payment=()',
        'usb=()',
      ].join(', '),
    );
    next();
  });
  app.use(cookieParser());
  app.enableCors({
    origin: config.CORS_ORIGINS.includes('*') ? true : config.CORS_ORIGINS,
    credentials: true,
  });
  app.useBodyParser('json', {
    limit: config.BODY_LIMIT,
    // Stash raw bytes for the webhook HMAC verifier. The buffer is small
    // (limited by BODY_LIMIT) and only held for the request lifetime.
    verify: (req: { rawBody?: Buffer }, _res: unknown, buf: Buffer): void => {
      req.rawBody = Buffer.from(buf);
    },
  });
  app.useBodyParser('urlencoded', { limit: config.BODY_LIMIT, extended: true });

  app.setGlobalPrefix('api', {
    exclude: [{ path: 'health/(.*)', method: RequestMethod.ALL }],
  });

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(app.get(MetricsInterceptor));

  // Install the Socket.IO Redis adapter only after the cache module's Redis
  // client has been resolved during DI. Doing this before `listen()` ensures
  // the adapter is in place before any WS upgrade is accepted.
  app.useWebSocketAdapter(new SocketRedisAdapter(app));

  app.enableShutdownHooks();

  if (telemetry.started) {
    const drain = (): void => {
      void telemetry.shutdown();
    };
    process.once('SIGTERM', drain);
    process.once('SIGINT', drain);
  }

  await app.listen(config.PORT);
  logger.log(
    `Listening on http://localhost:${config.PORT.toString()} (otel=${telemetry.started ? 'on' : 'off'})`,
    'Bootstrap',
  );
}

process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection', reason);
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  console.error('uncaughtException', err);
  process.exit(1);
});

void bootstrap();
