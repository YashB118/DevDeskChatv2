import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@app/common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '@app/common/pipes/zod-validation.pipe';
import { RateLimit } from '@app/common/rate-limit';
import { type Request } from 'express';
import { type AuthenticatedRequestUser } from '@app/modules/auth/auth.types';

function userIdFromReq(req: Request): string | null {
  const u = (req as Request & { user?: AuthenticatedRequestUser }).user;
  return u?.id ?? null;
}

const sendDescriptor = {
  preset: 'send' as const,
  mode: 'hard' as const,
  identify: userIdFromReq,
};
import {
  DeleteMessageSchema,
  EditMessageSchema,
  ForwardSchema,
  ListMessagesQuerySchema,
  ReactSchema,
  SendMediaSchema,
  SendTextSchema,
  type DeleteMessageInput,
  type EditMessageInput,
  type ForwardInput,
  type ListMessagesQuery,
  type ReactInput,
  type SendMediaInput,
  type SendTextInput,
} from './message.schema';
import { MessagesService } from './messages.service';
import { type EnrichedMessage } from './message.types';

interface MessageResponse {
  id: string;
  chatId: string;
  stanzaId: string;
  fromJid: string;
  fromMe: boolean;
  body: string | null;
  type: string;
  sentAt: string;
  rowId: number | null;
  deleted: boolean;
  reactions: { senderJid: string; emoji: string; createdAt: string }[];
  mentions: string[];
  edits: { previousBody: string | null; newBody: string | null; editedAt: string }[];
  quote: { quotedStanzaId: string; quotedBody: string | null } | null;
}

function toResponse(message: EnrichedMessage): MessageResponse {
  return {
    id: message.id,
    chatId: message.chatId,
    stanzaId: message.stanzaId,
    fromJid: message.fromJid,
    fromMe: message.fromMe,
    body: message.body,
    type: message.type,
    sentAt: message.sentAt.toISOString(),
    rowId: message.rowId,
    deleted: message.deleted,
    reactions: message.reactions.map((r) => ({
      senderJid: r.senderJid,
      emoji: r.emoji,
      createdAt: r.createdAt.toISOString(),
    })),
    mentions: message.mentions,
    edits: message.edits.map((e) => ({
      previousBody: e.previousBody,
      newBody: e.newBody,
      editedAt: e.editedAt.toISOString(),
    })),
    quote:
      message.quote === null
        ? null
        : {
            quotedStanzaId: message.quote.quotedStanzaId,
            quotedBody: message.quote.quotedBody,
          },
  };
}

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly service: MessagesService) {}

  @Get(':chatId')
  async list(
    @Param('chatId') chatId: string,
    @Query('session') session: string,
    @Query(new ZodValidationPipe(ListMessagesQuerySchema)) query: ListMessagesQuery,
  ): Promise<{ messages: MessageResponse[] }> {
    const messages = await this.service.list(session, chatId, query);
    return { messages: messages.map(toResponse) };
  }

  @Post(':chatId/send')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit(sendDescriptor)
  async sendText(
    @Param('chatId') chatId: string,
    @Body(new ZodValidationPipe(SendTextSchema)) body: SendTextInput,
  ): Promise<{ id: string; stanzaId: string }> {
    return this.service.sendText(chatId, body);
  }

  @Post(':chatId/media')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit(sendDescriptor)
  async sendMedia(
    @Param('chatId') chatId: string,
    @Body(new ZodValidationPipe(SendMediaSchema)) body: SendMediaInput,
  ): Promise<{ id: string; stanzaId: string }> {
    return this.service.sendMedia(chatId, body);
  }

  @Patch(':chatId/:stanzaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async edit(
    @Param('chatId') chatId: string,
    @Param('stanzaId') stanzaId: string,
    @Body(new ZodValidationPipe(EditMessageSchema)) body: EditMessageInput,
  ): Promise<void> {
    await this.service.edit(chatId, stanzaId, body);
  }

  @Delete(':chatId/:stanzaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('chatId') chatId: string,
    @Param('stanzaId') stanzaId: string,
    @Body(new ZodValidationPipe(DeleteMessageSchema)) body: DeleteMessageInput,
  ): Promise<void> {
    await this.service.delete(chatId, stanzaId, body);
  }

  @Post(':chatId/:stanzaId/react')
  async react(
    @Param('chatId') chatId: string,
    @Param('stanzaId') stanzaId: string,
    @Body(new ZodValidationPipe(ReactSchema)) body: ReactInput,
  ): Promise<{ removed: boolean }> {
    return this.service.react(chatId, stanzaId, body);
  }

  @Post(':chatId/:stanzaId/forward')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit(sendDescriptor)
  async forward(
    @Param('chatId') chatId: string,
    @Param('stanzaId') stanzaId: string,
    @Body(new ZodValidationPipe(ForwardSchema)) body: ForwardInput,
  ): Promise<{ stanzaId: string }> {
    return this.service.forward(chatId, stanzaId, body);
  }
}
