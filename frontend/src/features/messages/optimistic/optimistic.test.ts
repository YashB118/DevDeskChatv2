import { describe, it, expect } from 'vitest';
import {
  appendOptimistic,
  applyAck,
  applyDelete,
  applyEdit,
  applyMessageNew,
  applyReaction,
  buildPending,
  makeTempId,
  markFailed,
  reconcileSend,
  type MessagesCache,
} from './index';
import type { MessageDTO } from '../types';

function msg(over: Partial<MessageDTO> = {}): MessageDTO {
  return {
    id: 'm-1',
    chatId: 'c-1',
    senderId: 'u-1',
    body: 'hello',
    type: 'TEXT',
    ts: 1000,
    editedAt: null,
    deletedAt: null,
    reactions: [],
    quoted: null,
    forwarded: false,
    media: null,
    status: 'confirmed',
    ...over,
  };
}

function cache(items: MessageDTO[]): MessagesCache {
  return { pages: [{ items, nextCursor: null }], pageParams: [null] };
}

describe('messages optimistic helpers', () => {
  it('makeTempId returns a unique tmp prefixed id', () => {
    const a = makeTempId();
    const b = makeTempId();
    expect(a).not.toBe(b);
    expect(a.startsWith('tmp-')).toBe(true);
  });

  it('buildPending populates expected fields', () => {
    const pending = buildPending('c-1', 'u-1', { body: 'hi' }, 'tmp-x');
    expect(pending.status).toBe('pending');
    expect(pending.tempId).toBe('tmp-x');
    expect(pending.body).toBe('hi');
    expect(pending.type).toBe('TEXT');
  });

  it('appendOptimistic adds to the latest page', () => {
    const data = cache([msg({ id: 'a' })]);
    const next = appendOptimistic(data, msg({ id: 'b' }));
    expect(next!.pages[0]!.items.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('reconcileSend replaces the pending entry by tempId', () => {
    const pending = buildPending('c-1', 'u-1', { body: 'hi' }, 'tmp-1');
    const data = appendOptimistic(undefined, pending);
    const server = msg({ id: 'server-1' });
    const next = reconcileSend(data, 'tmp-1', server);
    const items = next!.pages[0]!.items;
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe('server-1');
    expect(items[0]!.status).toBe('confirmed');
    expect(items[0]!.tempId).toBeUndefined();
  });

  it('reconcileSend appends when no matching pending entry', () => {
    const data = cache([msg({ id: 'a' })]);
    const server = msg({ id: 'b' });
    const next = reconcileSend(data, 'tmp-missing', server);
    expect(next!.pages[0]!.items.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('markFailed flips status on the matching tempId', () => {
    const pending = buildPending('c-1', 'u-1', { body: 'hi' }, 'tmp-1');
    const data = appendOptimistic(undefined, pending);
    const next = markFailed(data, 'tmp-1');
    expect(next!.pages[0]!.items[0]!.status).toBe('failed');
  });

  it('applyMessageNew appends and deduplicates by id', () => {
    const data = cache([msg({ id: 'a' })]);
    const payload = {
      chatId: 'c-1',
      preview: { messageId: 'b', preview: 'b', ts: 2, fromSelf: false },
      message: {
        id: 'b',
        chatId: 'c-1',
        senderId: 'u-2',
        body: 'b',
        ts: 2,
        type: 'TEXT' as const,
      },
    };
    const once = applyMessageNew(data, payload);
    expect(once!.pages[0]!.items.map((m) => m.id)).toEqual(['a', 'b']);
    const twice = applyMessageNew(once, payload);
    expect(twice).toBe(once);
  });

  it('applyAck updates the ack state', () => {
    const data = cache([msg({ id: 'a' })]);
    const next = applyAck(data, { chatId: 'c-1', messageId: 'a', state: 'READ' });
    expect(next!.pages[0]!.items[0]!.ackState).toBe('READ');
  });

  it('applyEdit updates body and stamps editedAt', () => {
    const data = cache([msg({ id: 'a', body: 'old' })]);
    const next = applyEdit(data, { messageId: 'a', body: 'new', editedAt: 5 });
    expect(next!.pages[0]!.items[0]!.body).toBe('new');
    expect(next!.pages[0]!.items[0]!.editedAt).toBe(5);
  });

  it('applyDelete blanks body and stamps deletedAt', () => {
    const data = cache([msg({ id: 'a', body: 'secret' })]);
    const next = applyDelete(data, { messageId: 'a', deletedAt: 9 });
    expect(next!.pages[0]!.items[0]!.body).toBe('');
    expect(next!.pages[0]!.items[0]!.deletedAt).toBe(9);
  });

  it('applyReaction adds, replaces, and removes a user reaction', () => {
    const data = cache([msg({ id: 'a' })]);
    const after1 = applyReaction(data, { chatId: 'c-1', messageId: 'a', userId: 'u-1', emoji: '👍' });
    expect(after1!.pages[0]!.items[0]!.reactions).toEqual([{ userId: 'u-1', emoji: '👍' }]);
    const after2 = applyReaction(after1, { chatId: 'c-1', messageId: 'a', userId: 'u-1', emoji: '😂' });
    expect(after2!.pages[0]!.items[0]!.reactions).toEqual([{ userId: 'u-1', emoji: '😂' }]);
    const after3 = applyReaction(after2, { chatId: 'c-1', messageId: 'a', userId: 'u-1', emoji: null });
    expect(after3!.pages[0]!.items[0]!.reactions).toEqual([]);
  });
});
