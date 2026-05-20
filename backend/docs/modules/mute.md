# Module — Mute

> Per-chat and global mute toggles. Chat-list enrichment reads from here; Phase 10 will gate notification dispatch (and rate-limit budget) on it.

**Files**
- `src/modules/mute/mute.module.ts` — composition (`TypeOrmModule.forFeature([ChatMuteEntity, GlobalMuteEntity])`, `AssignmentsModule` for the developer authorization check, `UsersModule`). Exports `MuteService` + `MuteRepository`.
- `src/modules/mute/chat-mute.entity.ts` — `chat_mutes` (composite PK `(user_id, chat_id)`).
- `src/modules/mute/global-mute.entity.ts` — `global_mutes` (PK `user_id`).
- `src/modules/mute/mute.repository.ts` — `setChatMute`, `isChatMuted`, `mutedChatIdsForUser`, `filterMutedChatIds`, `setGlobalMute`, `getGlobalMute`. Uses `INSERT … ON CONFLICT DO NOTHING` semantics for chat mutes (via `orIgnore`).
- `src/modules/mute/mute.service.ts` — gates developer mutes against active assignments and writes the audit row.
- `src/modules/mute/mute.controller.ts` — `/api/mute` (guarded by `JwtAuthGuard`; admin / developer share the route).
- `src/modules/mute/mute.schema.ts` — `ChatMuteSchema` (`{ chatId, muted }`), `GlobalMuteSchema` (`{ enabled }`).

---

## 1. Schema (recap — see [db.md](db.md))

```sql
CREATE TABLE chat_mutes (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id varchar(128) NOT NULL,
  muted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, chat_id)
);

CREATE TABLE global_mutes (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

## 2. HTTP surface (`/api/mute`)

| Verb | Path | Body | Notes |
| --- | --- | --- | --- |
| `POST` | `/api/mute/chat` | `ChatMuteSchema` | Admin: any chat. Developer: only chats they have an active assignment for (else 403 `FORBIDDEN`). Idempotent. |
| `POST` | `/api/mute/global` | `GlobalMuteSchema` | Always allowed for the authenticated user. |
| `GET` | `/api/mute` | — | Returns `{ chatIds: string[], globalEnabled: boolean }` for the caller. |

Both mutations write to `audit_log`: `mute.chat.set` and `mute.global.set`.

## 3. Chat-list integration

`ChatsService.list` is the primary read consumer: after visibility filtering, it calls `MuteService.filterMutedChatIds(userId, visibleChatIds)` and stamps the `muted` boolean on each enriched chat. Cached for 10 seconds via `CacheService.wrap` (cache invalidates on chat sync / mark-read but not on mute toggle — clients can refetch via the existing `/api/chats/sync` endpoint or wait out the TTL).

## 4. Tests

`mute.service.spec.ts` covers: admin can mute any chat, developer without an active assignment is rejected (`ForbiddenError`), developer with an active assignment succeeds, audit rows write for both chat + global toggles. Repository behaviour (uniqueness, idempotent insert) is exercised by Phase 12's Testcontainers suite.

## 5. Editing rules

- Authorization always runs through `MuteService` — never call `MuteRepository.setChatMute` directly from a controller.
- The developer authorization check requires `AssignmentRepository.findActive`; admin override is hard-coded in `MuteService`.
- Notification dispatch in Phase 10 must consult `MuteService` (per chat first, then global) before pushing to a user's socket / push subscription.
