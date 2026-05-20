import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { deleteDatabase, _resetForTests } from './indexedDB';
import {
  clearAllPersistedData,
  flushSnapshot,
  getMediaBlob,
  putMediaBlob,
  readSnapshot,
} from './persistence.service';

const ChatSchema = z.object({ id: z.string(), name: z.string() });
type Chat = z.infer<typeof ChatSchema>;

beforeEach(async () => {
  await deleteDatabase();
  _resetForTests();
});

describe('persistence.service — snapshots', () => {
  it('round-trips a payload through IndexedDB', async () => {
    const payload: Chat = { id: 'c-1', name: 'Alpha' };
    await flushSnapshot('chats', payload);

    const read = await readSnapshot('chats', ChatSchema);
    expect(read).toEqual(payload);
  });

  it('returns null when nothing is stored', async () => {
    const read = await readSnapshot('chats', ChatSchema);
    expect(read).toBeNull();
  });

  it('drops the row and returns null on schema drift', async () => {
    await flushSnapshot('chats', { id: 'c-1' /* missing name */ });
    const read = await readSnapshot('chats', ChatSchema);
    expect(read).toBeNull();

    const again = await readSnapshot('chats', ChatSchema);
    expect(again).toBeNull();
  });

  it('clearAllPersistedData empties every table', async () => {
    await flushSnapshot('chats', { id: 'c-1', name: 'Alpha' });
    await putMediaBlob('m-1', 'image/png', new Blob(['x']));

    await clearAllPersistedData();

    expect(await readSnapshot('chats', ChatSchema)).toBeNull();
    expect(await getMediaBlob('m-1')).toBeNull();
  });
});

describe('persistence.service — media blobs', () => {
  it('round-trips a media blob', async () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });
    await putMediaBlob('m-1', 'text/plain', blob);

    const got = await getMediaBlob('m-1');
    expect(got).not.toBeNull();
  });

  it('returns null for unknown ids', async () => {
    expect(await getMediaBlob('nope')).toBeNull();
  });
});
