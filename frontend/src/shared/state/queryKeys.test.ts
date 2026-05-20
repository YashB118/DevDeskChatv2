import { describe, it, expect } from 'vitest';
import { keys } from './queryKeys';
import { toChatId, toMessageId, toUserId } from '@/shared/types/ids';

describe('queryKeys', () => {
  it('produces stable tuples for me', () => {
    expect(keys.me()).toEqual(['me']);
  });

  it('namespaces chats with filters', () => {
    const a = keys.chats({ assignedToMe: true });
    const b = keys.chats({ assignedToMe: true });
    expect(a).toEqual(b);
    expect(a[0]).toBe('chats');
  });

  it('keys messages by chat id', () => {
    const chatId = toChatId('chat-1');
    expect(keys.messages(chatId)).toEqual(['messages', chatId]);
  });

  it('keys a specific message', () => {
    const chatId = toChatId('chat-1');
    const messageId = toMessageId('m-1');
    expect(keys.message(chatId, messageId)).toEqual(['messages', chatId, messageId]);
  });

  it('keys assignments by user', () => {
    const userId = toUserId('u-1');
    expect(keys.assignmentsByUser(userId)).toEqual(['assignments', 'user', userId]);
  });
});
