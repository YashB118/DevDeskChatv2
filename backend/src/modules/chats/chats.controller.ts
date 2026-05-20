import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@app/common/guards/jwt-auth.guard';
import { CurrentUser } from '@app/common/decorators/current-user.decorator';
import { ZodValidationPipe } from '@app/common/pipes/zod-validation.pipe';
import { type UserDomain } from '@app/modules/users/user.types';
import { type AuthenticatedRequestUser } from '@app/modules/auth/auth.types';
import { UserRepository } from '@app/modules/users/user.repository';
import { UserId } from '@app/shared/types/ids';
import { NotFoundError } from '@app/shared/errors';
import { ListChatsQuerySchema, type ListChatsQuery } from './chat.schema';
import { ChatsService, type EnrichedChat } from './chats.service';

@Controller('chats')
@UseGuards(JwtAuthGuard)
export class ChatsController {
  constructor(
    private readonly service: ChatsService,
    private readonly users: UserRepository,
  ) {}

  @Get()
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

  private async resolveUser(current: AuthenticatedRequestUser): Promise<UserDomain> {
    const user = await this.users.findById(UserId(current.id));
    if (user === null) throw new NotFoundError('user');
    return user;
  }
}
