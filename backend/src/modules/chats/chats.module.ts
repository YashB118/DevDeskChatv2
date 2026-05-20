import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WahaModule } from '@app/integrations/waha/waha.module';
import { UsersModule } from '@app/modules/users/users.module';
import { ChatMetadataEntity } from './chat-metadata.entity';
import { ChatMetadataRepository } from './chat-metadata.repository';
import { ChatPolicy } from './chat.policy';
import { ChatsController } from './chats.controller';
import { ChatsService } from './chats.service';

@Module({
  imports: [TypeOrmModule.forFeature([ChatMetadataEntity]), WahaModule, UsersModule],
  controllers: [ChatsController],
  providers: [ChatMetadataRepository, ChatPolicy, ChatsService],
  exports: [ChatsService, ChatMetadataRepository, ChatPolicy],
})
export class ChatsModule {}
