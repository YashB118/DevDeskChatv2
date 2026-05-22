import { Injectable } from '@nestjs/common';
import { ForbiddenError } from '@app/modules/auth/auth.errors';
import { AssignmentRepository } from '@app/modules/assignments/assignment.repository';
import { type UserDomain, UserRole } from '@app/modules/users/user.types';

/**
 * Visibility + write gate for chats. Admins see and act on every chat;
 * developers are restricted to chats that have an active row in
 * `developer_assignments`.
 */
@Injectable()
export class ChatPolicy {
  constructor(private readonly assignments: AssignmentRepository) {}

  async filterVisibleChatIds(user: UserDomain, chatIds: string[]): Promise<string[]> {
    if (user.role === UserRole.ADMIN) return chatIds;
    if (chatIds.length === 0) return [];
    const assigned = new Set(await this.assignments.listActiveChatIdsForUser(user.id));
    return chatIds.filter((id) => assigned.has(id));
  }

  async canReadChat(user: UserDomain, chatId: string): Promise<boolean> {
    if (user.role === UserRole.ADMIN) return true;
    const row = await this.assignments.findActive(user.id, chatId);
    return row !== null;
  }

  async canWriteChat(user: UserDomain, chatId: string): Promise<boolean> {
    return this.canReadChat(user, chatId);
  }

  async assertCanWrite(user: UserDomain, chatId: string): Promise<void> {
    if (!(await this.canWriteChat(user, chatId))) {
      throw new ForbiddenError('Chat not assigned to user');
    }
  }

  async assertCanRead(user: UserDomain, chatId: string): Promise<void> {
    if (!(await this.canReadChat(user, chatId))) {
      throw new ForbiddenError('Chat not assigned to user');
    }
  }
}
