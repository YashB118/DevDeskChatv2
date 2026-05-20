## Module — Chats

> Chat list facade. The chat directory itself lives in WAHA — we never persist a `chats` table — but `chat_metadata` holds per-chat overrides (display name, last-seen). Reads fan-out through `WahaService.listChats`, dedupe by chat id, enrich with metadata, and cache for 10s per `(userId, session, limit, offset)` via `CacheService.wrap`. A `ChatPolicy` stub gates visibility (admins see everything; Phase 9 narrows the developer path against `developer_assignments`).

**Files**
- `src/modules/chats/chats.module.ts` — providers + controller; imports `WahaModule` + `UsersModule`.
- `src/modules/chats/chats.controller.ts` — `@UseGuards(JwtAuthGuard)`; routes under `/api/chats`. Resolves the current `UserDomain` via `UserRepository.findById` for policy decisions.
- `src/modules/chats/chats.service.ts` — `list` / `markRead` / `sync`; owns the cache key shape.
- `src/modules/chats/chat-metadata.entity.ts` — `chat_metadata` table (`chatId` PK, `displayNameOverride`, `lastSeenAt`, `updatedAt`).
- `src/modules/chats/chat-metadata.repository.ts` — `findByChatId`, `setLastSeen`, `setDisplayNameOverride`.
- `src/modules/chats/chat.policy.ts` — `filterVisibleChatIds(user, ids)`, `canReadChat`, `canWriteChat` (Phase 8 stub; Phase 9 narrows).
- `src/modules/chats/chat.schema.ts` — Zod for query + param.

---

## 1. HTTP surface

| Method | Path | Body / Query |
| --- | --- | --- |
| `GET` | `/api/chats?session=<n>&limit=&offset=` | — |
| `POST` | `/api/chats/:chatId/read` | — |
| `POST` | `/api/chats/sync?session=<n>` | — |

Response shape: `{ chats: EnrichedChat[] }`. `EnrichedChat = { id, name, isGroup, unreadCount, lastMessage, displayNameOverride, lastSeenAt, muted }` (muted is `false` until Phase 9 wires the mute table).

## 2. List flow

```
ChatsController.list
  ↓ UserRepository.findById(currentUser.id)
  ↓ ChatsService.list(user, query)
      ↓ cache.wrap(`chats:list:<userId>:<session>:<limit>:<offset>`, loader, { ttlSeconds: 10, schema })
          ↓ waha.listChats(session, { limit, offset })
          ↓ dedupe by chat id
          ↓ policy.filterVisibleChatIds(user, ids)
          ↓ enrich (chat_metadata join in memory)
      ← EnrichedChat[]
```

Cached payloads pass through a Zod schema on read so a deploy that changed the shape can't poison the cache.

## 3. Mark-read + sync

- `markRead(user, chatId)` calls `chat.policy.canWriteChat`, `chat_metadata.setLastSeen(chatId, new Date())`, then invalidates the default-page cache key. Phase 9 will also publish a `chat:read` socket event.
- `sync(user, session)` invalidates the user's cached page + `WahaService.invalidateChats(session)`, then re-runs `list` with default paging. The frontend calls this when the user pulls to refresh.

## 4. Open questions / Phase 9 follow-ups

- `ChatPolicy` is currently permissive for developers. Phase 9 will join against `developer_assignments` so developers only see assigned chats.
- Muted state is hardcoded `false`; Phase 9 wires `chat_mutes` + `global_mutes`.
- `GET /api/chats/:chatId/participants` not yet exposed (WAHA call wrapper); land it alongside the assignment-aware visibility filter.
- `invalidateUserCache` currently only deletes the default-page key (`<limit>=50, <offset>=0`) because `CacheService` doesn't expose `SCAN`. If non-default paging starts mattering, layer a small key-set in Redis to track active keys per user, or move the cache key namespace under a Redis `Hash` so a single `DEL` clears the user's pages.

## 5. Tests (`src/modules/chats/chat.policy.spec.ts`)

Admin sees every id; developer visibility is permissive (Phase 9 will narrow); `canReadChat` / `canWriteChat` permissive at this phase. Chat list integration coverage lives in the Phase-12 Testcontainers e2e.
