import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WahaModule } from '@app/integrations/waha/waha.module';
import { WahaStoreModule } from '@app/integrations/waha-store/waha-store.module';
import { RealtimeModule } from '@app/realtime/realtime.module';
import { TransactionRunner } from '@app/infra/db/transactions';
import { MessageEntity } from './message.entity';
import { MessageReactionEntity } from './message-reaction.entity';
import { MessageEditEntity } from './message-edit.entity';
import { MessageMentionEntity } from './message-mention.entity';
import { MessageQuoteEntity } from './message-quote.entity';
import { DeletedMessageEntity } from './deleted-message.entity';
import { MessageRepository } from './message.repository';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { PendingMessageStore } from './pending.store';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MessageEntity,
      MessageReactionEntity,
      MessageEditEntity,
      MessageMentionEntity,
      MessageQuoteEntity,
      DeletedMessageEntity,
    ]),
    WahaModule,
    WahaStoreModule,
    RealtimeModule,
  ],
  controllers: [MessagesController],
  providers: [MessageRepository, MessagesService, PendingMessageStore, TransactionRunner],
  exports: [PendingMessageStore, MessagesService, MessageRepository],
})
export class MessagesModule {}
