## Module — Chats

> Chat list facade. The chat directory itself lives in WAHA — we never persist a `chats` table — but `chat_metadata` holds per-chat overrides (display name, last-seen). Reads fan-out through `WahaService.listChats`, dedupe by chat id, gate by `ChatPolicy` (admins see everything; developers are restricted to chats with an active row in `developer_assignments`), enrich with metadata + mute state, and cache for 10s per `(userId, session, limit, offset)` via `CacheService.wrap`.

**Files**
- `src/modules/chats/chats.module.ts` — providers + controller; imports `WahaModule`, `UsersModule`, `AssignmentsModule`, `MuteModule`.
- `src/modules/chats/chats.controller.ts` — `@UseGuards(JwtAuthGuard)`; routes under `/api/chats`. Resolves the current `UserDomain` via `UserRepository.findById` for policy decisions.
- `src/modules/chats/chats.service.ts` — `list` / `markRead` / `sync`; owns the cache key shape; calls `MuteService.filterMutedChatIds` during enrichment so `muted` reflects the live `chat_mutes` table.
- `src/modules/chats/chat-metadata.entity.ts` — `chat_metadata` table (`chatId` PK, `displayNameOverride`, `lastSeenAt`, `updatedAt`).
- `src/modules/chats/chat-metadata.repository.ts` — `findByChatId`, `setLastSeen`, `setDisplayNameOverride`.
- `src/modules/chats/chat.policy.ts` — `filterVisibleChatIds(user, ids)`, `canReadChat`, `canWriteChat`, `assertCanWrite`; queries `AssignmentRepository` for non-admin actors. Reads/writes throw `ForbiddenError` when the chat is not actively assigned.
- `src/modules/chats/chat.schema.ts` — Zod for query + param.

---

## 1. HTTP surface

| Method | Path | Body / Query |
| --- | --- | --- |
| `GET` | `/api/chats?session=<n>&limit=&offset=` | — |
| `POST` | `/api/chats/:chatId/read` | — |
| `POST` | `/api/chats/sync?session=<n>` | — |

Response shape: `{ chats: EnrichedChat[] }`. `EnrichedChat = { id, name, isGroup, unreadCount, lastMessage, displayNameOverride, lastSeenAt, muted }`. As of Phase 9, `muted` is the live value from `chat_mutes` for the calling user.

## 2. List flow

```
ChatsController.list
  ↓ UserRepository.findById(currentUser.id)
  ↓ ChatsService.list(user, query)
      ↓ cache.wrap(`chats:list:<userId>:<session>:<limit>:<offset>`, loader, { ttlSeconds: 10, schema })
          ↓ waha.listChats(session, { limit, offset })
          ↓ dedupe by chat id
          ↓ policy.filterVisibleChatIds(user, ids)                  // joins developer_assignments for non-admins
          ↓ mute.filterMutedChatIds(userId, visibleIds)             // resolves Set<chatId> in one query
          ↓ enrich (chat_metadata join in memory; muted from set)
      ← EnrichedChat[]
```

Cached payloads pass through a Zod schema on read so a deploy that changed the shape can't poison the cache.

## 3. Mark-read + sync

- `markRead(user, chatId)` calls `chat.policy.assertCanWrite` (throws `ForbiddenError` if a developer marks an unassigned chat read), `chat_metadata.setLastSeen(chatId, new Date())`, then invalidates the default-page cache key. A `chat:read` socket event still needs wiring (planned).
- `sync(user, session)` invalidates the user's cached page + `WahaService.invalidateChats(session)`, then re-runs `list` with default paging. The frontend calls this when the user pulls to refresh.

## 4. Open questions / future phases

- `GET /api/chats/:chatId/participants` not yet exposed (WAHA call wrapper); land alongside the per-chat-member badge UI.
- `invalidateUserCache` currently only deletes the default-page key (`<limit>=50, <offset>=0`) because `CacheService` doesn't expose `SCAN`. If non-default paging starts mattering, layer a small key-set in Redis to track active keys per user, or move the cache key namespace under a Redis `Hash` so a single `DEL` clears the user's pages.
- Mute toggles do **not** invalidate the chat-list cache today — the 10s TTL is short enough that the discrepancy resolves quickly, and the explicit `/api/chats/sync` path handles the "I want it now" case.

## 5. Tests (`src/modules/chats/chat.policy.spec.ts`)

Admins see every id; developers only see chats where `AssignmentRepository.listActiveChatIdsForUser` returned the id; `canReadChat` / `canWriteChat` return true for admins unconditionally and for developers only when an active assignment exists. Chat-list integration coverage lives in the Phase-12 Testcontainers e2e.
