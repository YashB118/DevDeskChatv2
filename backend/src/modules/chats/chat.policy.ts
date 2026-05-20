import { Injectable } from '@nestjs/common';
import { type UserDomain, UserRole } from '@app/modules/users/user.types';

/**
 * Visibility gate for chat reads/writes. Phase 8 ships the admin path and
 * a permissive developer path; Phase 9 narrows the developer path against
 * the `developer_assignments` table.
 */
@Injectable()
export class ChatPolicy {
  filterVisibleChatIds(user: UserDomain, chatIds: string[]): string[] {
    if (user.role === UserRole.ADMIN) return chatIds;
    // Phase-8 stub: developers see all chats. Phase 9 joins against
    // developer_assignments to restrict by active assignment.
    return chatIds;
  }

  canReadChat(user: UserDomain, _chatId: string): boolean {
    if (user.role === UserRole.ADMIN) return true;
    return true;
  }

  canWriteChat(user: UserDomain, _chatId: string): boolean {
    if (user.role === UserRole.ADMIN) return true;
    return true;
  }
}
