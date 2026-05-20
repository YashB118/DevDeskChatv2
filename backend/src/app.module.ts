import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@app/config/config.module';
import { LoggerModule } from '@app/config/logger.module';
import { DatabaseModule } from '@app/infra/db/database.module';
import { CacheModule } from '@app/infra/cache/cache.module';
import { HealthModule } from '@app/infra/health/health.module';
import { CorrelationMiddleware } from '@app/common/middleware/correlation.middleware';
import { TransactionRunner } from '@app/infra/db/transactions';
import { UsersModule } from '@app/modules/users/users.module';
import { AuthModule } from '@app/modules/auth/auth.module';
import { RealtimeModule } from '@app/realtime/realtime.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    DatabaseModule,
    CacheModule,
    HealthModule,
    UsersModule,
    AuthModule,
    RealtimeModule,
  ],
  providers: [TransactionRunner],
  exports: [TransactionRunner],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
