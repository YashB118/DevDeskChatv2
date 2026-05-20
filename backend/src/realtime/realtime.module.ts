import { Module } from '@nestjs/common';
import { AuthModule } from '@app/modules/auth/auth.module';
import { RealtimeGateway } from './realtime.gateway';
import { WsAuthGuard } from './ws-jwt.guard';
import { SocketEmitter } from './socket.emitter';
import { SequenceService } from './sequence';

@Module({
  imports: [AuthModule],
  providers: [RealtimeGateway, WsAuthGuard, SequenceService, SocketEmitter],
  exports: [SocketEmitter, SequenceService],
})
export class RealtimeModule {}
