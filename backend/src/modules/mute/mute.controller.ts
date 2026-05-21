import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '@app/common/pipes/zod-validation.pipe';
import { CurrentUser } from '@app/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@app/common/guards/jwt-auth.guard';
import { UserId } from '@app/shared/types/ids';
import { NotFoundError } from '@app/shared/errors';
import { type AuthenticatedRequestUser } from '@app/modules/auth/auth.types';
import { UserRepository } from '@app/modules/users/user.repository';
import { type UserDomain } from '@app/modules/users/user.types';
import { MuteService } from './mute.service';
import {
  ChatMuteSchema,
  type ChatMuteInput,
  GlobalMuteSchema,
  type GlobalMuteInput,
} from './mute.schema';

@Controller('mute')
@UseGuards(JwtAuthGuard)
export class MuteController {
  constructor(
    private readonly service: MuteService,
    private readonly users: UserRepository,
  ) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  async setChat(
    @CurrentUser() current: AuthenticatedRequestUser,
    @Body(new ZodValidationPipe(ChatMuteSchema)) body: ChatMuteInput,
  ): Promise<{ ok: true }> {
    const user = await this.resolve(current);
    await this.service.setChatMute(user, body.chatId, body.muted);
    return { ok: true };
  }

  @Post('global')
  @HttpCode(HttpStatus.OK)
  async setGlobal(
    @CurrentUser() current: AuthenticatedRequestUser,
    @Body(new ZodValidationPipe(GlobalMuteSchema)) body: GlobalMuteInput,
  ): Promise<{ enabled: boolean }> {
    const user = await this.resolve(current);
    return this.service.setGlobalMute(user, body.enabled);
  }

  @Get()
  async list(
    @CurrentUser() current: AuthenticatedRequestUser,
  ): Promise<{ chatIds: string[]; globalEnabled: boolean }> {
    const muted = await this.service.mutedChatIdsForUser(current.id);
    const global = await this.service.isGlobalMuted(current.id);
    return { chatIds: [...muted], globalEnabled: global };
  }

  @Get('global')
  async getGlobal(@CurrentUser() current: AuthenticatedRequestUser): Promise<{ enabled: boolean }> {
    const enabled = await this.service.isGlobalMuted(current.id);
    return { enabled };
  }

  private async resolve(current: AuthenticatedRequestUser): Promise<UserDomain> {
    const user = await this.users.findById(UserId(current.id));
    if (user === null) throw new NotFoundError('user');
    return user;
  }
}
