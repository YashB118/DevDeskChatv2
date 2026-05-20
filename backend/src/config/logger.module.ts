import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { APP_CONFIG } from './constants';
import { REDACT_PATHS } from './constants';
import { type AppConfig } from './env';
import { ConfigModule } from './config.module';

@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.LOG_LEVEL,
          name: config.APP_NAME,
          redact: { paths: REDACT_PATHS, remove: true },
          autoLogging: {
            ignore: (req) => req.url === '/health/live' || req.url === '/health/ready',
          },
          ...(config.NODE_ENV === 'development'
            ? {
                transport: {
                  target: 'pino-pretty',
                  options: { singleLine: true, translateTime: 'HH:MM:ss.l', colorize: true },
                },
              }
            : {}),
          customProps: (req) => ({
            correlationId: (req as { correlationId?: string }).correlationId,
          }),
        },
      }),
    }),
  ],
  exports: [PinoLoggerModule],
})
export class LoggerModule {}
