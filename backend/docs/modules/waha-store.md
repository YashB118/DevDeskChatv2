## Module — WAHA Store (NOWEB SQLite reader)

> Read-only reader for the NOWEB SQLite database WAHA persists locally. Used by message-list pagination (rowid ordering) and the webhook normalizer (phone↔LID JID conversion). Per-session handles open lazily and stay open for the process lifetime; `better-sqlite3` is opened with `readonly: true + fileMustExist: true` so any accidental write throws `SQLITE_READONLY`.

**Files**
- `src/integrations/waha-store/waha-store.module.ts` — provides + exports `WahaStoreService`.
- `src/integrations/waha-store/waha-store.service.ts` — per-session handle cache, 60s `TtlCache` for `getMessageRowids`, `phoneToLid`, `lidToPhone`. Implements `OnApplicationBootstrap` (optionally verifies the file is mounted read-only via `fs.accessSync(path, W_OK)`) and `OnApplicationShutdown` (closes every handle).
- `src/integrations/waha-store/waha-store.types.ts` — `MessageRowid = { stanzaId, rowid }`.

---

## 1. API

```ts
getMessageRowids(session, chatId): Promise<MessageRowid[]>   // ORDER BY rowid ASC
phoneToLid(session, phoneJid): Promise<string | null>
lidToPhone(session, lidJid): Promise<string | null>
```

All three results are cached for `WAHA_STORE_CACHE_TTL_MS` (default 60s) keyed by `<session>|<arg>`.

## 2. Read-only enforcement

- `BetterSqlite3(path, { readonly: true, fileMustExist: true })` — any write throws `SQLITE_READONLY` at the driver layer.
- When `WAHA_STORE_REQUIRE_READONLY=true`, `onApplicationBootstrap` also probes the filesystem via `fs.accessSync(path, W_OK)` and refuses to start if the process user has write permission. Default in dev is `false` so a writable local file doesn't block development.

## 3. Failure modes

- Missing file at boot with `WAHA_STORE_REQUIRE_READONLY=true` → `ExternalServiceError(WAHA_STORE_MISSING)`.
- Writable mount with `WAHA_STORE_REQUIRE_READONLY=true` → `ExternalServiceError(WAHA_STORE_NOT_READONLY)`.
- Missing file on first read → `NotFoundError`.
- `better-sqlite3` open failure → `ExternalServiceError(WAHA_STORE_OPEN_FAILED)` with the cause attached.

## 4. Tests (`src/integrations/waha-store/waha-store.service.spec.ts`)

Fixture SQLite DB built at test time: rowid ordering, JID round-trips, unknown JIDs return `null`, cached results return the same reference within TTL, opened handles reject writes, bootstrap refuses a writable file when `WAHA_STORE_REQUIRE_READONLY=true`.
