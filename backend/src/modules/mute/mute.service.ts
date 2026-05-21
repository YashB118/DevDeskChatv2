import { Injectable } from '@nestjs/common';
import { AuthRepository } from '@app/modules/auth/auth.repository';
import { ForbiddenError } from '@app/modules/auth/auth.errors';
import { type UserDomain, UserRole } from '@app/modules/users/user.types';
import { AssignmentRepository } from '@app/modules/assignments/assignment.repository';
import { SocketEmitter } from '@app/realtime/socket.emitter';
import { MuteRepository } from './mute.repository';

@Injectable()
export class MuteService {
  constructor(
    private readonly repo: MuteRepository,
    private readonly assignments: AssignmentRepository,
    private readonly auth: AuthRepository,
    private readonly emitter: SocketEmitter,
  ) {}

  async setChatMute(actor: UserDomain, chatId: string, muted: boolean): Promise<void> {
    if (actor.role !== UserRole.ADMIN) {
      // Developers may only mute chats actively assigned to them.
      const assigned = await this.assignments.findActive(actor.id, chatId);
      if (assigned === null) throw new ForbiddenError('Chat not assigned to user');
    }
    await this.repo.setChatMute(actor.id, chatId, muted);
    await this.auth.writeAudit('mute.chat.set', actor.id, { chatId, muted });
    this.emitter.toUser(actor.id, 'chat:muted', { chatId, muted });
  }

  async setGlobalMute(actor: UserDomain, enabled: boolean): Promise<{ enabled: boolean }> {
    const row = await this.repo.setGlobalMute(actor.id, enabled);
    await this.auth.writeAudit('mute.global.set', actor.id, { enabled });
    return { enabled: row.enabled };
  }

  isChatMuted(userId: string, chatId: string): Promise<boolean> {
    return this.repo.isChatMuted(userId, chatId);
  }

  mutedChatIdsForUser(userId: string): Promise<Set<string>> {
    return this.repo.mutedChatIdsForUser(userId);
  }

  filterMutedChatIds(userId: string, chatIds: string[]): Promise<Set<string>> {
    return this.repo.filterMutedChatIds(userId, chatIds);
  }

  isGlobalMuted(userId: string): Promise<boolean> {
    return this.repo.getGlobalMute(userId);
  }
}
