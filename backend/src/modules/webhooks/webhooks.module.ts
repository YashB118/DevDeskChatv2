import { Module, type Provider } from '@nestjs/common';
import { WahaStoreModule } from '@app/integrations/waha-store/waha-store.module';
import { MessagesModule } from '@app/modules/messages/messages.module';
import { SessionsModule } from '@app/modules/sessions/sessions.module';
import { RealtimeModule } from '@app/realtime/realtime.module';
import { QueueModule } from '@app/queues/queue.module';
import { WebhookProcessor } from '@app/queues/webhook.processor';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhookDispatch } from './dispatch';
import { GroupParticipantsWebhookHandler } from './handlers/group-participants.handler';
import { MessageAckWebhookHandler } from './handlers/message-ack.handler';
import { MessageEditedWebhookHandler } from './handlers/message-edited.handler';
import { MessageReactionWebhookHandler } from './handlers/message-reaction.handler';
import { MessageRevokedWebhookHandler } from './handlers/message-revoked.handler';
import { MessageWebhookHandler } from './handlers/message.handler';
import { SessionStatusWebhookHandler } from './handlers/session-status.handler';
import {
  GROUP_PARTICIPANTS_HANDLER,
  MESSAGE_ACK_HANDLER,
  MESSAGE_EDITED_HANDLER,
  MESSAGE_HANDLER,
  MESSAGE_REACTION_HANDLER,
  MESSAGE_REVOKED_HANDLER,
  SESSION_STATUS_HANDLER,
} from './handler.types';

const handlerBindings: Provider[] = [
  { provide: MESSAGE_HANDLER, useExisting: MessageWebhookHandler },
  { provide: MESSAGE_ACK_HANDLER, useExisting: MessageAckWebhookHandler },
  { provide: MESSAGE_EDITED_HANDLER, useExisting: MessageEditedWebhookHandler },
  { provide: MESSAGE_REACTION_HANDLER, useExisting: MessageReactionWebhookHandler },
  { provide: MESSAGE_REVOKED_HANDLER, useExisting: MessageRevokedWebhookHandler },
  { provide: SESSION_STATUS_HANDLER, useExisting: SessionStatusWebhookHandler },
  { provide: GROUP_PARTICIPANTS_HANDLER, useExisting: GroupParticipantsWebhookHandler },
];

@Module({
  imports: [QueueModule, WahaStoreModule, MessagesModule, SessionsModule, RealtimeModule],
  controllers: [WebhooksController],
  providers: [
    WebhooksService,
    WebhookDispatch,
    WebhookProcessor,
    MessageWebhookHandler,
    MessageAckWebhookHandler,
    MessageEditedWebhookHandler,
    MessageReactionWebhookHandler,
    MessageRevokedWebhookHandler,
    SessionStatusWebhookHandler,
    GroupParticipantsWebhookHandler,
    ...handlerBindings,
  ],
  exports: [WebhooksService, WebhookDispatch],
})
export class WebhooksModule {}
