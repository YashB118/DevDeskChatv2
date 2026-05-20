import type { ZodTypeAny, z } from 'zod';
import { getDatabase, SCHEMA_VERSION } from './indexedDB';

const MEDIA_LIMIT_BYTES = 200 * 1024 * 1024;
const WRITE_DEBOUNCE_MS = 500;

const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();

export async function readSnapshot<Schema extends ZodTypeAny>(
  key: string,
  schema: Schema,
): Promise<z.infer<Schema> | null> {
  const db = getDatabase();
  if (!db) return null;

  try {
    const row = await db.snapshots.get(key);
    if (!row) return null;

    if (row.version !== SCHEMA_VERSION) {
      await db.snapshots.delete(key);
      return null;
    }

    const parsed = schema.safeParse(row.payload);
    if (!parsed.success) {
      await db.snapshots.delete(key);
      return null;
    }
    return parsed.data as z.infer<Schema>;
  } catch (err) {
    console.warn('[storage] readSnapshot failed', key, err);
    return null;
  }
}

export function writeSnapshot(key: string, payload: unknown): void {
  const existing = pendingWrites.get(key);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    pendingWrites.delete(key);
    void flushSnapshot(key, payload);
  }, WRITE_DEBOUNCE_MS);
  pendingWrites.set(key, timer);
}

export async function flushSnapshot(key: string, payload: unknown): Promise<void> {
  const db = getDatabase();
  if (!db) return;
  try {
    await db.snapshots.put({
      key,
      version: SCHEMA_VERSION,
      payload,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.warn('[storage] writeSnapshot failed', key, err);
  }
}

export async function clearAllPersistedData(): Promise<void> {
  for (const timer of pendingWrites.values()) clearTimeout(timer);
  pendingWrites.clear();

  const db = getDatabase();
  if (!db) return;
  try {
    await Promise.all([db.snapshots.clear(), db.mediaBlobs.clear()]);
  } catch (err) {
    console.warn('[storage] clearAllPersistedData failed', err);
  }
}

export async function putMediaBlob(messageId: string, mime: string, blob: Blob): Promise<void> {
  const db = getDatabase();
  if (!db) return;
  try {
    await db.mediaBlobs.put({
      messageId,
      mime,
      size: blob.size,
      blob,
      accessedAt: Date.now(),
    });
    await evictMediaIfOverLimit();
  } catch (err) {
    console.warn('[storage] putMediaBlob failed', messageId, err);
  }
}

export async function getMediaBlob(messageId: string): Promise<Blob | null> {
  const db = getDatabase();
  if (!db) return null;
  try {
    const row = await db.mediaBlobs.get(messageId);
    if (!row) return null;
    await db.mediaBlobs.update(messageId, { accessedAt: Date.now() });
    return row.blob;
  } catch (err) {
    console.warn('[storage] getMediaBlob failed', messageId, err);
    return null;
  }
}

async function evictMediaIfOverLimit(): Promise<void> {
  const db = getDatabase();
  if (!db) return;
  const total = await db.mediaBlobs
    .toCollection()
    .toArray()
    .then((rows) => rows.reduce((sum, r) => sum + r.size, 0));
  if (total <= MEDIA_LIMIT_BYTES) return;

  let overflow = total - MEDIA_LIMIT_BYTES;
  const oldest = await db.mediaBlobs.orderBy('accessedAt').toArray();
  for (const row of oldest) {
    if (overflow <= 0) break;
    await db.mediaBlobs.delete(row.messageId);
    overflow -= row.size;
  }
}

export function _flushAllForTests(): void {
  for (const [key, timer] of pendingWrites) {
    clearTimeout(timer);
    pendingWrites.delete(key);
  }
}
