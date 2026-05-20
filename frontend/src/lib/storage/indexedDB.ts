import Dexie, { type Table } from 'dexie';

export const SCHEMA_VERSION = 1;
export const DB_NAME = 'devdeskchat';

export interface SnapshotRow {
  key: string;
  version: number;
  payload: unknown;
  updatedAt: number;
}

export interface MediaBlobRow {
  messageId: string;
  mime: string;
  size: number;
  blob: Blob;
  accessedAt: number;
}

export class AppDatabase extends Dexie {
  snapshots!: Table<SnapshotRow, string>;
  mediaBlobs!: Table<MediaBlobRow, string>;

  constructor(name: string = DB_NAME) {
    super(name);
    this.version(SCHEMA_VERSION).stores({
      snapshots: '&key, updatedAt',
      mediaBlobs: '&messageId, accessedAt, size',
    });
  }
}

let dbInstance: AppDatabase | null = null;
let dbAvailable: boolean | null = null;

export function getDatabase(): AppDatabase | null {
  if (dbAvailable === false) return null;
  if (!dbInstance) {
    try {
      dbInstance = new AppDatabase();
      dbAvailable = true;
    } catch (err) {
      console.warn('[storage] IndexedDB unavailable — degrading to memory only', err);
      dbAvailable = false;
      return null;
    }
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export async function deleteDatabase(): Promise<void> {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
  await Dexie.delete(DB_NAME);
}

export function _resetForTests(): void {
  dbInstance = null;
  dbAvailable = null;
}
