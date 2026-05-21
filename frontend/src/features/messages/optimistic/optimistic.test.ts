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
    stanzaId: 'stanza-1',
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

  it('buildPending populates expected fields with tempId standing in for stanzaId', () => {
    const pending = buildPending('c-1', 'u-1', { body: 'hi' }, 'tmp-x');
    expect(pending.status).toBe('pending');
    expect(pending.tempId).toBe('tmp-x');
    expect(pending.stanzaId).toBe('tmp-x');
    expect(pending.body).toBe('hi');
    expect(pending.type).toBe('TEXT');
  });

  it('appendOptimistic adds to the latest page', () => {
    const data = cache([msg({ id: 'a' })]);
    const next = appendOptimistic(data, msg({ id: 'b', stanzaId: 'b' }));
    expect(next!.pages[0]!.items.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('reconcileSend merges server id + stanzaId onto pending bubble', () => {
    const pending = buildPending('c-1', 'u-1', { body: 'hi' }, 'tmp-1');
    const data = appendOptimistic(undefined, pending);
    const next = reconcileSend(data, 'tmp-1', { id: 'server-1', stanzaId: 'stanza-9' });
    const items = next!.pages[0]!.items;
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe('server-1');
    expect(items[0]!.stanzaId).toBe('stanza-9');
    expect(items[0]!.status).toBe('confirmed');
    expect(items[0]!.tempId).toBeUndefined();
    expect(items[0]!.body).toBe('hi');
  });

  it('reconcileSend is a no-op when no matching pending entry', () => {
    const data = cache([msg({ id: 'a' })]);
    const next = reconcileSend(data, 'tmp-missing', { id: 'b', stanzaId: 'b' });
    expect(next!.pages[0]!.items.map((m) => m.id)).toEqual(['a']);
  });

  it('markFailed flips status on the matching tempId', () => {
    const pending = buildPending('c-1', 'u-1', { body: 'hi' }, 'tmp-1');
    const data = appendOptimistic(undefined, pending);
    const next = markFailed(data, 'tmp-1');
    expect(next!.pages[0]!.items[0]!.status).toBe('failed');
  });

  it('applyMessageNew appends and deduplicates by id', () => {
    const data = cache([msg({ id: 'a', stanzaId: 'a' })]);
    const payload = {
      chatId: 'c-1',
      message: {
        id: 'b',
        chatId: 'c-1',
        stanzaId: 'stz-b',
        fromJid: 'u-2',
        fromMe: false,
        body: 'b',
        type: 'TEXT',
        sentAt: '2026-01-01T00:00:02.000Z',
      },
    };
    const once = applyMessageNew(data, payload);
    expect(once!.pages[0]!.items.map((m) => m.id)).toEqual(['a', 'b']);
    expect(once!.pages[0]!.items[1]!.stanzaId).toBe('stz-b');
    const twice = applyMessageNew(once, payload);
    expect(twice).toBe(once);
  });

  it('applyAck matches by stanzaId and writes the new ack (incl FAILED)', () => {
    const data = cache([msg({ id: 'a', stanzaId: 'sa' })]);
    const next = applyAck(data, { chatId: 'c-1', stanzaId: 'sa', ack: 'FAILED' });
    expect(next!.pages[0]!.items[0]!.ackState).toBe('FAILED');
  });

  it('applyEdit (wire) updates body via newBody + ISO editedAt', () => {
    const data = cache([msg({ id: 'a', stanzaId: 'sa', body: 'old' })]);
    const next = applyEdit(data, {
      chatId: 'c-1',
      stanzaId: 'sa',
      newBody: 'new',
      editedAt: '2026-01-01T00:00:05.000Z',
    });
    expect(next!.pages[0]!.items[0]!.body).toBe('new');
    expect(next!.pages[0]!.items[0]!.editedAt).toBe(Date.parse('2026-01-01T00:00:05.000Z'));
  });

  it('applyEdit (local) keeps the legacy {messageId,body} shape working', () => {
    const data = cache([msg({ id: 'a', body: 'old' })]);
    const next = applyEdit(data, { messageId: 'a', body: 'new', editedAt: 5 });
    expect(next!.pages[0]!.items[0]!.body).toBe('new');
    expect(next!.pages[0]!.items[0]!.editedAt).toBe(5);
  });

  it('applyDelete (wire) blanks body and stamps deletedAt from ISO', () => {
    const data = cache([msg({ id: 'a', stanzaId: 'sa', body: 'secret' })]);
    const next = applyDelete(data, {
      chatId: 'c-1',
      stanzaId: 'sa',
      deletedAt: '2026-01-01T00:00:09.000Z',
    });
    expect(next!.pages[0]!.items[0]!.body).toBe('');
    expect(next!.pages[0]!.items[0]!.deletedAt).toBe(Date.parse('2026-01-01T00:00:09.000Z'));
  });

  it('applyReaction (wire) adds + removes via senderJid + removed flag', () => {
    const data = cache([msg({ id: 'a', stanzaId: 'sa' })]);
    const after1 = applyReaction(data, {
      chatId: 'c-1',
      stanzaId: 'sa',
      senderJid: 'u-1',
      emoji: '👍',
      removed: false,
    });
    expect(after1!.pages[0]!.items[0]!.reactions).toEqual([{ userId: 'u-1', emoji: '👍' }]);
    const after2 = applyReaction(after1, {
      chatId: 'c-1',
      stanzaId: 'sa',
      senderJid: 'u-1',
      emoji: '👍',
      removed: true,
    });
    expect(after2!.pages[0]!.items[0]!.reactions).toEqual([]);
  });

  it('applyReaction (local) supports the messageId+emoji-null variant', () => {
    const data = cache([msg({ id: 'a' })]);
    const after = applyReaction(data, {
      chatId: 'c-1',
      messageId: 'a',
      userId: 'u-1',
      emoji: null,
    });
    expect(after!.pages[0]!.items[0]!.reactions).toEqual([]);
  });
});
