import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { type Request } from 'express';
import { JwtAuthGuard } from '@app/common/guards/jwt-auth.guard';
import { CurrentUser } from '@app/common/decorators/current-user.decorator';
import { ZodValidationPipe } from '@app/common/pipes/zod-validation.pipe';
import { RateLimit } from '@app/common/rate-limit';
import { type UserDomain } from '@app/modules/users/user.types';
import { type AuthenticatedRequestUser } from '@app/modules/auth/auth.types';
import { UserRepository } from '@app/modules/users/user.repository';
import { UserId } from '@app/shared/types/ids';
import { NotFoundError } from '@app/shared/errors';
import { ListChatsQuerySchema, type ListChatsQuery } from './chat.schema';
import {
  CachedChatListSchema,
  ChatsService,
  chatsListCacheKey,
  type EnrichedChat,
} from './chats.service';

function softChatsKey(req: Request): string | null {
  const user = (req as Request & { user?: AuthenticatedRequestUser }).user;
  if (user === undefined) return null;
  const q = req.query as Record<string, string | undefined>;
  const session = q.session;
  if (session === undefined || session === '') return null;
  const limit = Number.parseInt(q.limit ?? '50', 10);
  const offset = Number.parseInt(q.offset ?? '0', 10);
  if (!Number.isFinite(limit) || !Number.isFinite(offset)) return null;
  return chatsListCacheKey(user.id, session, limit, offset);
}

@Controller('chats')
@UseGuards(JwtAuthGuard)
export class ChatsController {
  constructor(
    private readonly service: ChatsService,
    private readonly users: UserRepository,
  ) {}

  @Get()
  @RateLimit({
    preset: 'chats',
    mode: 'soft',
    identify: (req) => (req as Request & { user?: AuthenticatedRequestUser }).user?.id ?? null,
    softCache: {
      key: softChatsKey,
      schema: CachedChatListSchema,
      wrap: (cached): { chats: unknown } => ({ chats: cached }),
    },
  })
  async list(
    @CurrentUser() current: AuthenticatedRequestUser,
    @Query(new ZodValidationPipe(ListChatsQuerySchema)) query: ListChatsQuery,
  ): Promise<{ chats: EnrichedChat[] }> {
    const user = await this.resolveUser(current);
    return { chats: await this.service.list(user, query) };
  }

  @Post(':chatId/read')
  async markRead(
    @CurrentUser() current: AuthenticatedRequestUser,
    @Param('chatId') chatId: string,
  ): Promise<{ ok: true }> {
    const user = await this.resolveUser(current);
    await this.service.markRead(user, chatId);
    return { ok: true };
  }

  @Post('sync')
  async sync(
    @CurrentUser() current: AuthenticatedRequestUser,
    @Query('session') session: string,
  ): Promise<{ chats: EnrichedChat[] }> {
    const user = await this.resolveUser(current);
    return { chats: await this.service.sync(user, session) };
  }

  /**
   * Participants of a chat. Used by the frontend's @-mention autocomplete.
   * Until the WAHA client exposes a group-members call, this returns an empty
   * list — the contract exists so the UI never 404s.
   */
  @Get(':chatId/participants')
  async participants(
    @CurrentUser() current: AuthenticatedRequestUser,
    @Param('chatId') chatId: string,
  ): Promise<{ items: { id: string; name: string }[] }> {
    const user = await this.resolveUser(current);
    return { items: await this.service.listParticipants(user, chatId) };
  }

  private async resolveUser(current: AuthenticatedRequestUser): Promise<UserDomain> {
    const user = await this.users.findById(UserId(current.id));
    if (user === null) throw new NotFoundError('user');
    return user;
  }
}
