/**
 * Pure helpers around WhatsApp identifiers. Exported so the dedup function
 * and the JID-merge sort can be unit-tested in isolation.
 *
 *  - `<phone>@s.whatsapp.net`  — phone-format JID (legacy)
 *  - `<lid>@lid`               — LID JID (current)
 *  - `<groupId>@g.us`          — group JID
 */
export function isPhoneJid(value: string): boolean {
  return /^\d+@s\.whatsapp\.net$/.test(value);
}

export function isLidJid(value: string): boolean {
  return /^\d+@lid$/.test(value);
}

export function isGroupJid(value: string): boolean {
  return value.endsWith('@g.us');
}

/**
 * NOWEB dual-ID dedupe. WAHA can deliver the same logical chat twice
 * — once keyed by phone JID, once by LID. We prefer the LID variant
 * because that's the long-lived identifier WhatsApp standardized on.
 *
 * Strategy: index by every JID variant each entry exposes, then collapse
 * entries that share any variant. The LID-bearing entry wins.
 */
export function dedupeChats<
  T extends { id: string; phoneJid?: string | null; lid?: string | null },
>(chats: T[]): T[] {
  // First pass: discover phone↔LID aliasing from entries that carry both.
  const phoneToLid = new Map<string, string>();
  for (const chat of chats) {
    if (chat.lid != null && chat.phoneJid != null) {
      phoneToLid.set(chat.phoneJid, chat.lid);
    }
  }

  // Second pass: collapse by canonical key (LID > phone JID > id).
  const canonical = (chat: T): string => {
    if (chat.lid != null) return chat.lid;
    if (chat.phoneJid != null) return phoneToLid.get(chat.phoneJid) ?? chat.phoneJid;
    return chat.id;
  };

  const byKey = new Map<string, T>();
  for (const chat of chats) {
    const key = canonical(chat);
    const existing = byKey.get(key);
    if (existing === undefined) {
      byKey.set(key, chat);
      continue;
    }
    const existingHasLid = existing.lid != null;
    const incomingHasLid = chat.lid != null;
    if (incomingHasLid && !existingHasLid) {
      byKey.set(key, chat);
    }
  }
  return [...byKey.values()];
}

/**
 * Sort messages by their NOWEB SQLite rowid (ascending). Messages
 * without a rowid sink to the bottom — they're typically locally
 * generated outbound shadows awaiting reconciliation.
 */
export function sortByRowid<T extends { rowId: number | null; stanzaId: string }>(
  messages: T[],
): T[] {
  return [...messages].sort((a, b) => {
    if (a.rowId === null && b.rowId === null) return a.stanzaId.localeCompare(b.stanzaId);
    if (a.rowId === null) return 1;
    if (b.rowId === null) return -1;
    return a.rowId - b.rowId;
  });
}
