import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WahaModule } from '@app/integrations/waha/waha.module';
import { RealtimeModule } from '@app/realtime/realtime.module';
import { SessionEntity } from './session.entity';
import { SessionRepository } from './session.repository';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  imports: [TypeOrmModule.forFeature([SessionEntity]), WahaModule, RealtimeModule],
  controllers: [SessionsController],
  providers: [SessionRepository, SessionsService],
  exports: [SessionsService, SessionRepository],
})
export class SessionsModule {}
