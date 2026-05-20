import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { type AppConfig } from '@app/config/env';
import { WahaStoreService } from './waha-store.service';

let tmpDir: string;
let dbPath: string;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'waha-store-'));
  dbPath = join(tmpDir, 'store.db');
  const db = new BetterSqlite3(dbPath);
  db.exec(`
    CREATE TABLE messages (id TEXT NOT NULL, chat_id TEXT NOT NULL);
    INSERT INTO messages (id, chat_id) VALUES ('stanza-a', 'chat-1');
    INSERT INTO messages (id, chat_id) VALUES ('stanza-b', 'chat-1');
    INSERT INTO messages (id, chat_id) VALUES ('stanza-c', 'chat-2');

    CREATE TABLE jid_map (phone_jid TEXT, lid TEXT);
    INSERT INTO jid_map (phone_jid, lid) VALUES ('15551234@s.whatsapp.net', '999@lid');
    INSERT INTO jid_map (phone_jid, lid) VALUES ('15555678@s.whatsapp.net', '888@lid');
  `);
  db.close();
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function buildService(overrides: Partial<AppConfig> = {}): WahaStoreService {
  const env = {
    WAHA_STORE_PATH: dbPath,
    WAHA_STORE_REQUIRE_READONLY: false,
    WAHA_STORE_CACHE_TTL_MS: 60_000,
    ...overrides,
  } as AppConfig;
  return new WahaStoreService(env);
}

describe('WahaStoreService', () => {
  it('returns stanza-id/rowid pairs ordered by rowid', async () => {
    const svc = buildService();
    const rows = await svc.getMessageRowids('s1', 'chat-1');
    expect(rows).toEqual([
      { stanzaId: 'stanza-a', rowid: 1 },
      { stanzaId: 'stanza-b', rowid: 2 },
    ]);
    svc.onApplicationShutdown();
  });

  it('resolves phone → LID and LID → phone', async () => {
    const svc = buildService();
    expect(await svc.phoneToLid('s1', '15551234@s.whatsapp.net')).toBe('999@lid');
    expect(await svc.lidToPhone('s1', '888@lid')).toBe('15555678@s.whatsapp.net');
    svc.onApplicationShutdown();
  });

  it('returns null for unknown JIDs', async () => {
    const svc = buildService();
    expect(await svc.phoneToLid('s1', 'unknown@s.whatsapp.net')).toBeNull();
    expect(await svc.lidToPhone('s1', 'nope@lid')).toBeNull();
    svc.onApplicationShutdown();
  });

  it('caches rowid lookups within TTL', async () => {
    const svc = buildService();
    const a = await svc.getMessageRowids('s1', 'chat-1');
    const b = await svc.getMessageRowids('s1', 'chat-1');
    expect(a).toBe(b); // same array reference because TtlCache returns cached value
    svc.onApplicationShutdown();
  });

  it('opens read-only handles that reject writes', async () => {
    const svc = buildService();
    await svc.getMessageRowids('s1', 'chat-1'); // forces open
    const handle = (svc as unknown as { handles: Map<string, BetterSqlite3.Database> }).handles.get(
      's1',
    );
    expect(handle).toBeDefined();
    expect(() => handle?.exec('DELETE FROM messages')).toThrow(/readonly|SQLITE_READONLY/i);
    svc.onApplicationShutdown();
  });

  it('rejects boot when require-readonly is on and file is writable', () => {
    const svc = buildService({ WAHA_STORE_REQUIRE_READONLY: true });
    expect(() => {
      svc.onApplicationBootstrap();
    }).toThrow(/read-only/i);
  });
});
