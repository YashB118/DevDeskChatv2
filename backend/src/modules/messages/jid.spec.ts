import { describe, expect, it } from 'vitest';
import { dedupeChats, isGroupJid, isLidJid, isPhoneJid, sortByRowid } from './jid';

describe('JID predicates', () => {
  it('recognizes phone-format JIDs', () => {
    expect(isPhoneJid('15551234@s.whatsapp.net')).toBe(true);
    expect(isPhoneJid('999@lid')).toBe(false);
    expect(isPhoneJid('not-a-jid')).toBe(false);
  });

  it('recognizes LID-format JIDs', () => {
    expect(isLidJid('999@lid')).toBe(true);
    expect(isLidJid('15551234@s.whatsapp.net')).toBe(false);
  });

  it('recognizes group JIDs', () => {
    expect(isGroupJid('120363001@g.us')).toBe(true);
    expect(isGroupJid('999@lid')).toBe(false);
  });
});

describe('dedupeChats', () => {
  it('keeps the entry with an LID when both variants are present', () => {
    const chats = [
      { id: 'a-phone', phoneJid: '15551234@s.whatsapp.net' },
      { id: 'a-lid', lid: '999@lid', phoneJid: '15551234@s.whatsapp.net' },
    ];
    const out = dedupeChats(chats);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe('a-lid');
  });

  it('preserves entries with no matching variant', () => {
    const chats = [{ id: 'group@g.us' }, { id: 'other@g.us' }];
    expect(dedupeChats(chats)).toHaveLength(2);
  });

  it('falls back to chat.id when neither LID nor phone JID is set', () => {
    const chats = [{ id: 'x' }, { id: 'x' }, { id: 'y' }];
    const out = dedupeChats(chats);
    expect(out.map((c) => c.id)).toEqual(['x', 'y']);
  });
});

describe('sortByRowid', () => {
  it('orders ascending by rowid', () => {
    const out = sortByRowid([
      { rowId: 5, stanzaId: 'c' },
      { rowId: 1, stanzaId: 'a' },
      { rowId: 3, stanzaId: 'b' },
    ]);
    expect(out.map((m) => m.stanzaId)).toEqual(['a', 'b', 'c']);
  });

  it('sinks null-rowid messages to the bottom', () => {
    const out = sortByRowid([
      { rowId: null, stanzaId: 'local-1' },
      { rowId: 2, stanzaId: 'b' },
      { rowId: null, stanzaId: 'local-0' },
      { rowId: 1, stanzaId: 'a' },
    ]);
    expect(out.map((m) => m.stanzaId)).toEqual(['a', 'b', 'local-0', 'local-1']);
  });

  it('breaks ties between two null rowids by stanzaId', () => {
    const out = sortByRowid([
      { rowId: null, stanzaId: 'z' },
      { rowId: null, stanzaId: 'a' },
    ]);
    expect(out.map((m) => m.stanzaId)).toEqual(['a', 'z']);
  });
});
