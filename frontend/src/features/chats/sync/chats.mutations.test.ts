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

function msg(
  over: { fromMe?: boolean; body?: string | null; sentAt?: string; id?: string } = {},
): {
  id: string;
  chatId: string;
  stanzaId: string;
  fromJid: string;
  fromMe: boolean;
  body: string | null;
  type: string;
  sentAt: string;
} {
  return {
    id: over.id ?? 'm-1',
    chatId: 'c-1',
    stanzaId: over.id ?? 'stz-1',
    fromJid: 'u-other',
    fromMe: over.fromMe ?? false,
    body: over.body ?? 'hey',
    type: 'TEXT',
    sentAt: over.sentAt ?? '2026-01-01T00:00:01.000Z',
  };
}

describe('chats sync mutations', () => {
  it('bumpChatWithMessage moves the chat to the top and increments unread', () => {
    const data = cache([chat({ id: 'c-2', title: 'Bob' }), chat({ id: 'c-1' })]);
    const next = bumpChatWithMessage(data, { chatId: 'c-1', message: msg() });
    const items = next!.pages[0]!.items;
    expect(items[0]!.id).toBe('c-1');
    expect(items[0]!.unreadCount).toBe(1);
    expect(items[0]!.lastMessage?.preview).toBe('hey');
  });

  it('bumpChatWithMessage from self does NOT bump unread', () => {
    const data = cache([chat({ id: 'c-1', unreadCount: 3 })]);
    const next = bumpChatWithMessage(data, {
      chatId: 'c-1',
      message: msg({ id: 'm-2', body: 'mine', fromMe: true, sentAt: '2026-01-01T00:00:02.000Z' }),
    });
    expect(next!.pages[0]!.items[0]!.unreadCount).toBe(3);
  });

  it('bumpChatWithMessage is a no-op when chat is not in cache', () => {
    const data = cache([chat({ id: 'c-2' })]);
    const next = bumpChatWithMessage(data, {
      chatId: 'unknown',
      message: msg({ id: 'm', body: 'x' }),
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

  it('applyAssigned + applyUnassigned manipulate assignedTo on the chat row', () => {
    const data = cache([chat({ id: 'c-1' })]);
    const assigned = applyAssigned(data, {
      assignmentId: '00000000-0000-0000-0000-0000000000aa',
      userId: '00000000-0000-0000-0000-0000000000bb',
      chatId: 'c-1',
      assignedBy: null,
      assignedAt: '2026-02-01T00:00:00.000Z',
    });
    expect(assigned!.pages[0]!.items[0]!.assignedTo).toBe('00000000-0000-0000-0000-0000000000bb');
    const unassigned = applyUnassigned(assigned, {
      assignmentId: '00000000-0000-0000-0000-0000000000aa',
      userId: '00000000-0000-0000-0000-0000000000bb',
      chatId: 'c-1',
      unassignedBy: null,
      unassignedAt: '2026-02-02T00:00:00.000Z',
    });
    expect(unassigned!.pages[0]!.items[0]!.assignedTo).toBeNull();
  });
});
