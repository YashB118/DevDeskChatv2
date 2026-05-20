import { accessSync, constants as fsConstants, existsSync } from 'node:fs';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import BetterSqlite3, { type Database } from 'better-sqlite3';
import { APP_CONFIG } from '@app/config/constants';
import { type AppConfig } from '@app/config/env';
import { ExternalServiceError, NotFoundError } from '@app/shared/errors';
import { TtlCache } from '@app/integrations/waha/ttl-cache';
import { type MessageRowid } from './waha-store.types';

/**
 * Read-only reader for the NOWEB SQLite database that WAHA persists
 * locally. Used by message-list pagination (rowid ordering) and the
 * webhook normalizer (phone ↔ LID JID conversion).
 *
 * Per-session DB handles open lazily on first access and stay open for
 * the process lifetime; the file is mounted read-only at the container
 * level, and `better-sqlite3` is opened with `readonly: true` so any
 * accidental write throws SQLITE_READONLY.
 */
@Injectable()
export class WahaStoreService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(WahaStoreService.name);
  private readonly storePath: string;
  private readonly requireReadOnly: boolean;
  private readonly cacheTtlMs: number;
  private readonly handles = new Map<string, Database>();
  private readonly rowidCache: TtlCache<MessageRowid[]>;
  private readonly phoneCache: TtlCache<string | null>;
  private readonly lidCache: TtlCache<string | null>;

  constructor(@Inject(APP_CONFIG) env: AppConfig) {
    this.storePath = env.WAHA_STORE_PATH;
    this.requireReadOnly = env.WAHA_STORE_REQUIRE_READONLY;
    this.cacheTtlMs = env.WAHA_STORE_CACHE_TTL_MS;
    this.rowidCache = new TtlCache(this.cacheTtlMs);
    this.phoneCache = new TtlCache(this.cacheTtlMs);
    this.lidCache = new TtlCache(this.cacheTtlMs);
  }

  onApplicationBootstrap(): void {
    if (!this.requireReadOnly) return;
    if (!existsSync(this.storePath)) {
      throw new ExternalServiceError(`WAHA store path does not exist: ${this.storePath}`, {
        code: 'WAHA_STORE_MISSING',
      });
    }
    try {
      accessSync(this.storePath, fsConstants.W_OK);
      // Write access succeeded — mount is NOT read-only.
      throw new ExternalServiceError(`WAHA store at ${this.storePath} must be mounted read-only`, {
        code: 'WAHA_STORE_NOT_READONLY',
      });
    } catch (err) {
      if (err instanceof ExternalServiceError) throw err;
      this.logger.log(`WAHA store at ${this.storePath} verified read-only`);
    }
  }

  onApplicationShutdown(): void {
    for (const [session, db] of this.handles.entries()) {
      try {
        db.close();
      } catch (err) {
        this.logger.warn(`failed to close store handle for ${session}: ${(err as Error).message}`);
      }
    }
    this.handles.clear();
    this.rowidCache.clear();
    this.phoneCache.clear();
    this.lidCache.clear();
  }

  /**
   * Returns stanza-id → SQLite rowid pairs for messages in a chat,
   * ordered by rowid ASC. Callers use this to sort messages even when
   * `sentAt` is identical (e.g. edits that share a timestamp).
   */
  getMessageRowids(session: string, chatId: string): Promise<MessageRowid[]> {
    return this.rowidCache.wrap(`${session}|${chatId}`, () => {
      const db = this.open(session);
      const rows = db
        .prepare<
          [string],
          { stanza_id: string; rowid: number }
        >('SELECT rowid, id AS stanza_id FROM messages WHERE chat_id = ? ORDER BY rowid ASC')
        .all(chatId);
      return Promise.resolve(rows.map((r) => ({ stanzaId: r.stanza_id, rowid: r.rowid })));
    });
  }

  phoneToLid(session: string, phoneJid: string): Promise<string | null> {
    return this.phoneCache.wrap(`${session}|${phoneJid}`, () => {
      const db = this.open(session);
      const row = db
        .prepare<[string], { lid: string | null }>('SELECT lid FROM jid_map WHERE phone_jid = ?')
        .get(phoneJid);
      return Promise.resolve(row?.lid ?? null);
    });
  }

  lidToPhone(session: string, lidJid: string): Promise<string | null> {
    return this.lidCache.wrap(`${session}|${lidJid}`, () => {
      const db = this.open(session);
      const row = db
        .prepare<
          [string],
          { phone_jid: string | null }
        >('SELECT phone_jid FROM jid_map WHERE lid = ?')
        .get(lidJid);
      return Promise.resolve(row?.phone_jid ?? null);
    });
  }

  private open(session: string): Database {
    const existing = this.handles.get(session);
    if (existing !== undefined) return existing;
    if (!existsSync(this.storePath)) {
      throw new NotFoundError(`WAHA store path missing: ${this.storePath}`);
    }
    try {
      const db = new BetterSqlite3(this.storePath, { readonly: true, fileMustExist: true });
      this.handles.set(session, db);
      this.logger.debug(`opened WAHA store handle for session=${session}`);
      return db;
    } catch (err) {
      throw new ExternalServiceError('failed to open WAHA store', {
        code: 'WAHA_STORE_OPEN_FAILED',
        details: { path: this.storePath, session },
        cause: err,
      });
    }
  }
}
