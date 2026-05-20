## Module — Messages

> Domain module for message reads + writes. Goes through `WahaService` for every outbound action, persists local state (including a shadow row for each outbound send), enriches reads with reactions / quotes / mentions / edits / deletions, and reconciles inbound webhooks against a Redis-backed pending store so the UI never double-renders an outbound bubble.

**Files**
- `src/modules/messages/messages.module.ts` — providers + controller; imports `WahaModule`, `WahaStoreModule`, `RealtimeModule`; registers `TransactionRunner` so the service can run multi-row writes atomically.
- `src/modules/messages/messages.controller.ts` — `@UseGuards(JwtAuthGuard)`; routes under `/api/messages`.
- `src/modules/messages/messages.service.ts` — list / sendText / sendMedia / edit / delete / react / forward / `upsertFromWebhook`.
- `src/modules/messages/message.repository.ts` — every table the domain owns; `upsert` by `stanzaId`, cursor pagination by `(sentAt, stanzaId)`, batched `enrich()` that hits reactions/edits/quotes/mentions/deletions in parallel.
- `src/modules/messages/message.entity.ts` — partitioned table; composite PK `(id, sent_at)` because Postgres requires the partition key in the PK; `rowId` uses a string↔number transformer for `bigint`.
- `src/modules/messages/message-{reaction,edit,quote,mention}.entity.ts`, `deleted-message.entity.ts` — sub-tables (no FKs back to `messages` because Postgres won't allow FKs to a partitioned table on a non-unique column; we key on `stanzaId`).
- `src/modules/messages/message.schema.ts` — Zod for every request body / query.
- `src/modules/messages/messages.errors.ts` — `MessageNotFoundError`, `InvalidMediaPayloadError`.
- `src/modules/messages/jid.ts` — pure JID helpers: `isPhoneJid` / `isLidJid` / `isGroupJid`, `dedupeChats` (LID preference with phone↔LID aliasing), `sortByRowid` (null rowids sink, stable tiebreak by stanzaId).
- `src/modules/messages/pending.store.ts` — Redis `SET ... PX <ttl>` map (`add` / `isPending` / `resolve`) keyed by stanza id, 9-second default TTL.

---

## 1. HTTP surface

| Method | Path | Body |
| --- | --- | --- |
| `GET` | `/api/messages/:chatId?session=&limit=&beforeSentAt=&beforeStanzaId=` | — |
| `POST` | `/api/messages/:chatId/send` | `{ session, text, quotedStanzaId?, mentions? }` |
| `POST` | `/api/messages/:chatId/media` | `{ session, mimetype, data?, url?, filename?, caption?, asDocument? }` |
| `PATCH` | `/api/messages/:chatId/:stanzaId` | `{ session, text }` |
| `DELETE` | `/api/messages/:chatId/:stanzaId` | `{ session }` |
| `POST` | `/api/messages/:chatId/:stanzaId/react` | `{ session, emoji }` |
| `POST` | `/api/messages/:chatId/:stanzaId/forward` | `{ session, toChatId }` |

## 2. Outbound send flow (`sendText`)

```
tx.run(em):
  shadow = repo.upsert({ stanzaId: `local:<uuid>`, fromMe: true, ... }, em)
  if quotedStanzaId: repo.setQuote(...)
  if mentions:        repo.setMentions(...)
  sent = wahaService.sendText({ session, chatId, text, ... })   // WAHA HTTP
  repo.upsert({ id: shadow.id, stanzaId: sent.id, ... }, em)    // rewrite stanza id to real WAHA id
  pending.add(sent.id)                                          // 9s TTL
  return { id: shadow.id, stanzaId: sent.id }
```

The webhook delivery of the same message later hits `upsertFromWebhook`, sees `isPending = true`, calls `pending.resolve(...)`, and **does not** emit `message:new` — the UI already showed the outbound bubble from the HTTP response. Inbound novel stanzas (no pending entry) emit `message:new` to the chat room.

## 3. Reads + enrichment

`list(session, chatId, query)` returns the most recent `limit` messages for the chat, cursor-paginated by `(sentAt, stanzaId)`. After fetching the base rows, the service:

1. Layers in NOWEB rowids via `WahaStoreService.getMessageRowids(session, chatId)` (graceful fallback if the store is unreachable — falls back to whatever `rowId` is in Postgres).
2. Hands the batch to `repo.enrich(messages)`, which fires five parallel `IN (stanzaIds)` queries (`message_reactions`, `message_edits`, `message_quotes`, `message_mentions`, `deleted_messages`) and joins them in memory. We intentionally do **not** lean on TypeORM eager relations — the partition + missing-FK shape means relations don't cleanly express the join.
3. Sorts by rowid via `sortByRowid` (null rowids sink to the bottom, stable tiebreak by `stanzaId`), then reverses so the controller returns descending recency.

## 4. Edit / delete / react

- `edit(chatId, stanzaId, input)` calls `WahaService.editMessage`, then in a single `TransactionRunner.run` records the edit history row and updates the message body. Emits `message:edited`.
- `delete(chatId, stanzaId, input)` calls `WahaService.deleteMessage`, marks the message deleted in `deleted_messages` (idempotent `upsert`), emits `message:deleted`.
- `react(chatId, stanzaId, input)` calls `WahaService.reactToMessage`, toggles the reaction in `message_reactions`, emits `message:reaction` with the resolved `removed` flag.

## 5. PendingMessageStore

Redis-backed, lives in this module but exported so the webhook reconciliation path can read it. Default TTL is `PENDING_MESSAGE_TTL_MS = 9000` (must outlive the WAHA round-trip + webhook delivery latency). Resolve returns whether a key was actually deleted, so the caller can branch on whether to suppress emission.

## 6. Tests (`src/modules/messages/*.spec.ts`)

- `jid.spec.ts`: predicate checks, `dedupeChats` (phone↔LID aliasing across entries that share only one variant), `sortByRowid` (null behaviour + tiebreak).
- `pending.store.spec.ts`: Redis `SET ... PX <ttl>` arguments, `isPending` boolean mapping, `resolve` return value.
- `messages.service.reconcile.spec.ts`: `upsertFromWebhook` suppresses emission + resolves the pending key when the stanza was pending; emits `message:new` for novel inbound stanzas.
