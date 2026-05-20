import 'reflect-metadata';
// Load `.env` into process.env BEFORE any module reads config.
// Must precede `AppModule` import (transitively imports env.ts via ConfigModule).
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { APP_CONFIG } from './config/constants';
import { type AppConfig } from './config/env';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));
  const config = app.get<AppConfig>(APP_CONFIG);
  const logger = app.get(Logger);

  app.disable('x-powered-by');
  if (config.TRUST_PROXY) app.set('trust proxy', 1);

  app.use(helmet());
  app.enableCors({
    origin: config.CORS_ORIGINS.includes('*') ? true : config.CORS_ORIGINS,
    credentials: true,
  });
  app.useBodyParser('json', { limit: config.BODY_LIMIT });
  app.useBodyParser('urlencoded', { limit: config.BODY_LIMIT, extended: true });

  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  await app.listen(config.PORT);
  logger.log(`Listening on http://localhost:${config.PORT.toString()}`, 'Bootstrap');
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
