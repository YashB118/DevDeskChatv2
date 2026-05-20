import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@app/config/config.module';
import { LoggerModule } from '@app/config/logger.module';
import { DatabaseModule } from '@app/infra/db/database.module';
import { CacheModule } from '@app/infra/cache/cache.module';
import { HealthModule } from '@app/infra/health/health.module';
import { CorrelationMiddleware } from '@app/common/middleware/correlation.middleware';
import { UsersModule } from '@app/modules/users/users.module';
import { AuthModule } from '@app/modules/auth/auth.module';
import { RealtimeModule } from '@app/realtime/realtime.module';
import { QueueModule } from '@app/queues/queue.module';
import { WahaModule } from '@app/integrations/waha/waha.module';
import { WahaStoreModule } from '@app/integrations/waha-store/waha-store.module';
import { MessagesModule } from '@app/modules/messages/messages.module';
import { ChatsModule } from '@app/modules/chats/chats.module';
import { SessionsModule } from '@app/modules/sessions/sessions.module';
import { WebhooksModule } from '@app/modules/webhooks/webhooks.module';
import { AssignmentsModule } from '@app/modules/assignments/assignments.module';
import { MuteModule } from '@app/modules/mute/mute.module';
import { FeedbackModule } from '@app/modules/feedback/feedback.module';

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
    WahaModule,
    WahaStoreModule,
    SessionsModule,
    MessagesModule,
    AssignmentsModule,
    MuteModule,
    ChatsModule,
    FeedbackModule,
    WebhooksModule,
    QueueModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
