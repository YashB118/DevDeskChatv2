import { describe, it, expect } from 'vitest';
import type { InfiniteData } from '@tanstack/react-query';
import {
  applyAssigned,
  applyMuted,
  applyRead,
  applyUnassigned,
  bumpChatWithMessage,
} from './chats.mutations';
import type { ChatDTO, ChatListPage } from '../types';

function chat(over: Partial<ChatDTO> = {}): ChatDTO {
  return {
    id: 'c-1',
    kind: 'INDIVIDUAL',
    title: 'Alice',
    avatarUrl: null,
    unreadCount: 0,
    muted: false,
    pinned: false,
    assignedTo: null,
    sessionId: null,
    lastMessage: null,
    updatedAt: 0,
    ...over,
  };
}

function cache(items: ChatDTO[]): InfiniteData<ChatListPage> {
  return {
    pages: [{ items, nextCursor: null }],
    pageParams: [null],
  };
}

describe('chats sync mutations', () => {
  it('bumpChatWithMessage moves the chat to the top and increments unread', () => {
    const data = cache([chat({ id: 'c-2', title: 'Bob' }), chat({ id: 'c-1' })]);
    const next = bumpChatWithMessage(data, {
      chatId: 'c-1',
      message: {
        id: 'm-1',
        chatId: 'c-1',
        senderId: 'u-other',
        body: 'hey',
        ts: 1000,
        type: 'TEXT',
      },
      preview: { messageId: 'm-1', preview: 'hey', ts: 1000, fromSelf: false },
    });
    const items = next!.pages[0]!.items;
    expect(items[0]!.id).toBe('c-1');
    expect(items[0]!.unreadCount).toBe(1);
    expect(items[0]!.lastMessage?.preview).toBe('hey');
  });

  it('bumpChatWithMessage from self does NOT bump unread', () => {
    const data = cache([chat({ id: 'c-1', unreadCount: 3 })]);
    const next = bumpChatWithMessage(data, {
      chatId: 'c-1',
      message: {
        id: 'm-2',
        chatId: 'c-1',
        senderId: 'u-self',
        body: 'mine',
        ts: 2000,
        type: 'TEXT',
      },
      preview: { messageId: 'm-2', preview: 'mine', ts: 2000, fromSelf: true },
    });
    expect(next!.pages[0]!.items[0]!.unreadCount).toBe(3);
  });

  it('bumpChatWithMessage is a no-op when chat is not in cache', () => {
    const data = cache([chat({ id: 'c-2' })]);
    const next = bumpChatWithMessage(data, {
      chatId: 'unknown',
      message: {
        id: 'm',
        chatId: 'unknown',
        senderId: 'x',
        body: 'x',
        ts: 1,
        type: 'TEXT',
      },
      preview: { messageId: 'm', preview: 'x', ts: 1, fromSelf: false },
    });
    expect(next).toBe(data);
  });

  it('applyRead zeroes unreadCount for the target chat', () => {
    const data = cache([chat({ id: 'c-1', unreadCount: 5 }), chat({ id: 'c-2', unreadCount: 3 })]);
    const next = applyRead(data, { chatId: 'c-1', by: 'self' });
    expect(next!.pages[0]!.items[0]!.unreadCount).toBe(0);
    expect(next!.pages[0]!.items[1]!.unreadCount).toBe(3);
  });

  it('applyMuted flips muted only on the target chat', () => {
    const data = cache([chat({ id: 'c-1' }), chat({ id: 'c-2' })]);
    const next = applyMuted(data, { chatId: 'c-1', muted: true });
    expect(next!.pages[0]!.items[0]!.muted).toBe(true);
    expect(next!.pages[0]!.items[1]!.muted).toBe(false);
  });

  it('applyAssigned + applyUnassigned manipulate assignedTo', () => {
    const data = cache([chat({ id: 'c-1' })]);
    const assigned = applyAssigned(data, { chatId: 'c-1', assignedTo: 'u-9' });
    expect(assigned!.pages[0]!.items[0]!.assignedTo).toBe('u-9');
    const unassigned = applyUnassigned(assigned, { chatId: 'c-1' });
    expect(unassigned!.pages[0]!.items[0]!.assignedTo).toBeNull();
  });
});
