import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssignmentsModule } from '@app/modules/assignments/assignments.module';
import { UsersModule } from '@app/modules/users/users.module';
import { RealtimeModule } from '@app/realtime/realtime.module';
import { ChatMuteEntity } from './chat-mute.entity';
import { GlobalMuteEntity } from './global-mute.entity';
import { MuteRepository } from './mute.repository';
import { MuteService } from './mute.service';
import { MuteController } from './mute.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatMuteEntity, GlobalMuteEntity]),
    AssignmentsModule,
    UsersModule,
    RealtimeModule,
  ],
  controllers: [MuteController],
  providers: [MuteRepository, MuteService],
  exports: [MuteService, MuteRepository],
})
export class MuteModule {}
