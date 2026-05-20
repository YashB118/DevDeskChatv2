# Backend Features Overview

DevChatDesk backend is a **NestJS 10 (Express adapter) + TypeORM + PostgreSQL + Socket.IO** API server. It acts as the control layer between WAHA (WhatsApp HTTP API), Postgres, Redis/BullMQ, and the React frontend. All features live as NestJS modules under `src/modules/<feature>/`.

---

## 1. Authentication

### Login (`POST /api/auth/login`)
- Validates email/password against bcrypt hash stored in Postgres (`users` table).
- Returns a short-lived JWT access token in the response body.
- Issues a long-lived refresh token as an HTTP-only cookie.

### Token Refresh (`POST /api/auth/refresh`)
- Validates the HTTP-only refresh token cookie against the hashed value in `refresh_tokens`.
- Issues a new access token without requiring re-login.
- Implements refresh token rotation (old row marked `revoked = true`, new row inserted under the same `family_id`, both writes inside `withTransaction`).
- On replay detection (hit on an already-revoked token), the entire `family_id` is revoked — forces re-login on all devices.

### Logout (`POST /api/auth/logout`)
- Invalidates the active refresh token family in the database.
- Clears the HTTP-only cookie.

### Password Change (`PATCH /api/auth/password`)
- Authenticated endpoint; validates current password, then stores new bcrypt hash.
- Available to all roles (admin and developer).
- Invalidates every refresh token family for the user.

### JWT Guards
- `JwtAuthGuard` verifies the bearer token on protected routes (applied via `@UseGuards(JwtAuthGuard)`).
- `AdminGuard` additionally asserts `role === ADMIN`.
- Token payload carries `userId` and `role`; the guard populates `req.user`.

---

## 2. User Management

### CRUD (`/api/users`)
- Admin-only endpoints to create, list, update, and delete developer accounts.
- `User` entity stores: email (citext, unique), hashed password, role (`ADMIN | DEVELOPER` Postgres enum), display name, disabled boolean status.
- Disabled users cannot log in; disabling also revokes all refresh tokens and disconnects active Socket.IO connections.

### Seed Script
- `npm run seed` creates the initial admin account (`admin@test.com` / `password123`) for first-time setup. Idempotent — re-running upserts.

---

## 3. Chat Management

### Chat List (`GET /api/chats`)
- Fetches chat list from WAHA, then applies access control:
  - **Admins**: see all chats across all sessions.
  - **Developers**: see only chats assigned to them via the `developer_assignments` table.
- Deduplicates NOWEB dual-ID entries (removes phone-format entry when a LID entry with matching `pnJid` exists).
- Enriches each chat with: display name, last message preview, unread count, assignment info, mute status.
- Supports cursor-based pagination.
- Results cached in Redis with a 10-second TTL (stampede-protected via distributed lock) to reduce WAHA API pressure.

### Chat Details (`GET /api/chats/:chatId`)
- Returns metadata for a single chat.
- Enforces the same developer/admin visibility rules via `chat.policy.ts`.

### Mark as Read (`POST /api/chats/:chatId/read`)
- Calls WAHA's mark-read endpoint and updates the internal unread counter.

### Group Participants (`GET /api/chats/:chatId/participants`)
- Returns list of participants for group chats.
- Used by the frontend `@mention` autocomplete.

### Chat Sync (`POST /api/chats/sync`)
- Forces a full re-fetch from WAHA and invalidates the Redis cache key.

---

## 4. Message Management

### Fetch Messages (`GET /api/messages/:chatId`)
- Cursor-based pagination (newest first, paginate older).
- For NOWEB sessions, fetches from **both** LID-format and phone-format chat IDs in parallel, merges results by stanza ID, and deduplicates.
- Sorts by SQLite rowid (not `messageTimestamp`) because WAHA NOWEB overwrites timestamps on edited messages.
- Persists messages into the partitioned `messages` table (monthly range partitions on `sent_at`).
- Enriches each message with:
  - Reactions (from `message_reactions` table)
  - Quoted/replied-to content (from `message_quotes` table)
  - Deleted status (from `deleted_messages` table)
  - Mentions (from `message_mentions` table)
  - Edit history (from `message_edits` table)

### Send Text Message (`POST /api/messages/:chatId/send`)
- Calls `WahaService.sendText()`.
- Supports reply-to (`quotedMessageId`).
- Persists an outbound shadow row plus a pending-message entry in Redis (9s TTL) for reconciliation.

### Send Media (`POST /api/messages/:chatId/send-media`)
- Accepts multipart form-data (image, video, audio, document) via `multer`.
- Calls the appropriate `WahaService` media send method based on MIME type.
- Supports optional caption.

### Edit Message (`PATCH /api/messages/:chatId/:messageId`)
- Calls WAHA's edit-message endpoint.
- Stores original and updated text in `message_edits` for audit; `withTransaction` keeps the audit row and the message update atomic.

### Delete Message (`DELETE /api/messages/:chatId/:messageId`)
- Calls WAHA's delete-message endpoint.
- Marks the message in `deleted_messages` so fetch enrichment can replace content with a placeholder.

### Reactions (`POST /api/messages/:chatId/:messageId/reaction`)
- Sends a reaction emoji via WAHA.
- Upserts into the `message_reactions` table (composite PK on `message_id + sender_jid + emoji`).
- Toggles off — submitting the same emoji from the same sender removes the row.

### Forward Message (`POST /api/messages/forward`)
- Forwards a message from one chat to another via WAHA.
- Attaches a forwarded-message flag.

---

## 5. Session Management

### List Sessions (`GET /api/sessions`)
- Returns all WAHA sessions joined with the local `sessions` table for status snapshots (WORKING, STOPPED, SCAN_QR_CODE, etc.).
- Admin-only.

### Create Session (`POST /api/sessions`)
- Creates a new WAHA session with `noweb.store.enabled = true`.
- Configures the internal webhook URL automatically to `http://backend:4000/api/webhooks/waha`.
- Stores session metadata in the Postgres `sessions` table.

### Start / Stop Session (`POST /api/sessions/:name/start`, `POST /api/sessions/:name/stop`)
- Proxies start/stop commands to the WAHA API.
- Emits `session:status` socket event so the admin frontend updates status live.

### Delete Session (`DELETE /api/sessions/:name`)
- Removes session from WAHA and Postgres.

### QR Code (`GET /api/sessions/:name/qr`)
- Fetches the QR code from WAHA in SVG format (`format=raw`).
- Returns raw SVG for the frontend to render inline.

### Session Status Polling
- Status cached with a 5-second TTL.
- Socket event (`session:status`) emitted when WAHA reports a status change via webhook.

---

## 6. Chat Assignment System

### Assign Chat (`POST /api/assignments`)
- Admin assigns a specific `chatId` to a developer.
- Inserts into `developer_assignments` (one row per developer–chat pair, with `is_active` flag and audit columns) plus an append-only `assignment_history` row inside a single `withTransaction`.
- A partial-unique index `UNIQUE (user_id, chat_id) WHERE is_active = true` prevents duplicate active assignments at the database layer.
- Emits `chat:assigned` to both the developer's `user:<id>` room and the `admin` room.

### Unassign Chat (`DELETE /api/assignments/:chatId`)
- Sets `is_active = false` on the assignment row (soft delete, retains history).
- Appends `UNASSIGNED` event to `assignment_history`.
- Emits `chat:unassigned`.

### List Assignments (`GET /api/assignments`)
- Returns all active assignments (admin) or the caller's own assignments (developer).

### Assignment History
- `assignment_history` is append-only: `(id, assignment_id, event, actor_id, payload jsonb, occurred_at)`.
- `event` is a Postgres enum (`ASSIGNED | UNASSIGNED | REASSIGNED`).

### Data Model
- Flat normalized schema — no embedded arrays. Joins on `user_id` and the natural-key `chat_id varchar(128)`.
- Indexes: `(user_id, is_active)`, `(chat_id, is_active)`, `(assigned_by, assigned_at DESC)`.
- All chat-listing endpoints filter against `developer_assignments` for non-admin users.

---

## 7. Webhook Handler

`POST /api/webhooks/waha` receives all inbound events from WAHA.

### Webhook Queue (BullMQ via `@nestjs/bullmq`)
- Incoming webhook payloads are immediately enqueued in the `webhook:waha` queue backed by Redis.
- Controller responds HTTP 200 to WAHA within milliseconds — no processing on the request path (prevents WAHA timeout retries).
- The `WebhookProcessor` (a `@Processor('webhook:waha')` NestJS provider) processes jobs asynchronously with concurrency control.

### Supported Event Types

| Event | Action |
|---|---|
| `message` | Persist new inbound message; resolve chat room; emit `message:new` |
| `message.any` | Catch-all for outbound self-messages (fromMe); same persist + emit pipeline |
| `message.ack` | Update delivery/read receipt; emit `message:ack` |
| `message.edited` | Append to `message_edits` and update the message body; emit `message:edited` |
| `message.reaction` | Upsert/toggle row in `message_reactions`; emit `message:reaction` |
| `session.status` | Update `sessions` row; emit `session:status` to admin room |
| `group.v2.participants` | Persist group event; emit `group:participants` |

### Phone→LID Normalization
- All incoming events carry phone-format chat IDs (`917046900859@s.whatsapp.net`).
- The processor calls `WahaStoreService.phoneToLid()` before any DB write or socket emit.
- Ensures the frontend only ever deals with LID-format IDs, avoiding duplicate chat entries.

### Pending Message Reconciliation
- Outbound messages sent via the app are tracked as "pending" in Redis with a 9-second TTL.
- When the corresponding `message.any` webhook arrives, the pending key is matched by stanza ID and resolved — the inbound is dropped (no double-emit) and the shadow row is upgraded to `confirmed`.
- Prevents duplicate display of optimistic UI + real message.

### Idempotency
- Jobs are deduplicated via `jobId = hash(event.id)` so retried deliveries from WAHA never double-write.

---

## 8. Real-Time (Socket.IO)

### Server Initialization
- The `RealtimeGateway` (`@WebSocketGateway`) is registered by `RealtimeModule`.
- A custom `IoAdapter` (`socket-redis.adapter.ts`) wires the `socket.io-redis-adapter` so emits fan out across pods.
- CORS configured from `FRONTEND_URL`.
- `WsAuthGuard` runs on every connection; rejects unauthenticated sockets immediately.

### Rooms
- On connect, each socket automatically joins `user:<userId>` (personal room) and, for admins, the `admin` room.
- Clients emit `chats:join` with an array of chat IDs to join per-chat rooms (`chat:<chatId>`).
- Per-chat rooms enable targeted delivery — only users with that chat open receive granular message events.

### Emit Rules
- All emits flow through the `SocketEmitter` provider (`emitter.toChat`, `emitter.toUser`, `emitter.toAdmin`).
- Payloads are Zod-validated against `events.contract.ts` schemas in non-production builds.
- Multi-room emits use chained `.to()` calls — Socket.IO deduplicates per-socket.

### Key Emitted Events

| Event | Payload | Recipients |
|---|---|---|
| `message:new` | Full message DTO | All members of `chat:<chatId>` |
| `message:ack` | `{messageId, ack}` | Chat room |
| `message:edited` | Updated message | Chat room |
| `message:deleted` | `{messageId}` | Chat room |
| `message:reaction` | `{messageId, reaction, fromMe}` | Chat room |
| `chat:assigned` | Assignment DTO | Developer's room + admin room |
| `chat:unassigned` | `{chatId}` | Developer's room + admin room |
| `session:status` | `{name, status}` | Admin room |
| `group:participants` | Group event | Chat room + admin room |

---

## 9. WAHA Integration Service (`waha.service.ts`)

`WahaService` is a NestJS provider exported from `WahaModule`. It is the only place outbound calls to the WAHA HTTP API originate.

### Authentication
- Supports `X-Api-Key` header or HTTP Basic Auth, configured via environment variables.

### In-Memory Caching
- Session list: 10-second TTL.
- Chat list: 10-second TTL.
- Session status: 5-second TTL.
- Reduces WAHA API load during burst activity.

### Resilience Layer
- Exponential retry on idempotent GETs (after network/5xx errors).
- Per-method circuit breaker (opens after consecutive 5xx; half-open after cooldown).
- Request timeouts (5s default, 30s for media uploads).
- Provider errors are wrapped as `ExternalServiceError` with the original cause preserved.

### Send Methods
- `sendText(session, chatId, text, quotedId?)` — plain text, optional reply.
- `sendImage(session, chatId, file, caption?)` — image with optional caption.
- `sendVideo(session, chatId, file, caption?)` — video.
- `sendAudio(session, chatId, file)` — audio.
- `sendDocument(session, chatId, file, caption?)` — arbitrary document.
- `sendSticker(session, chatId, file)` — sticker.

### Session Methods
- `createSession(name)` — always sets `noweb.store.enabled = true` before QR scan.
- `startSession(name)`, `stopSession(name)`, `deleteSession(name)`.
- `getQR(name)` — fetches raw SVG QR code.

### Chat Methods
- `getChats(session)` — full chat list with names/avatars.
- `getChatMessages(session, chatId, limit, before?)` — paginated message history.
- `markRead(session, chatId)` — mark chat as read in WAHA.

---

## 10. WAHA Store Service (`waha-store.service.ts`)

Reads WAHA's NOWEB SQLite database directly (mounted read-only at `/app/.sessions`) via `better-sqlite3`. Exposed as a NestJS provider from `WahaStoreModule`.

### Message Rowid Lookup (`getMessageRowids`)
- Given a list of stanza IDs, returns their SQLite `rowid` values.
- Rowids reflect true insertion order — used as the authoritative sort key for messages because WAHA NOWEB overwrites `messageTimestamp` when a message is edited.

### Phone↔LID Mapping
- `phoneToLid(session, phoneJid)` — resolves a phone-format JID to its LID equivalent using the SQLite `chats` table.
- `lidToPhone(session, lidJid)` — reverse lookup.
- Both use a 60-second in-memory TTL cache to avoid repeated SQLite reads.
- Critical for the webhook normalization pipeline.

---

## 11. Mute System

### Per-Chat Mute (`chat_mutes` table)
- Composite primary key `(user_id, chat_id)` — one row per (user, muted chat) pair.
- Admin or developer can mute a specific chat (developers only on chats they own).
- Muted chats are excluded from desktop notification delivery (checked by the `NotificationProcessor`).
- Mute status returned in chat list enrichment so the frontend can reflect it.

### Global Mute (`global_mutes` table)
- One row per admin user, primary-keyed by `user_id`.
- Single boolean toggle to silence all notification sounds globally; toggled via `PATCH /api/mute/global`.
- Checked before any notification emit.

---

## 12. Feedback Module

### Submit Feedback (`POST /api/feedback`)
- Authenticated developers submit text feedback/bug reports.
- Stored in the `feedback` table with `user_id`, `body`, `created_at`, `read` boolean.

### List Feedback (`GET /api/feedback`)
- Admin: returns all submissions.
- Developer: returns own submissions only.

### Mark Read (`PATCH /api/feedback/:id/read`)
- Admin marks a submission as read.

---

## 13. Rate Limiting

Layered Redis-backed limiters implemented as a `RateLimit({...})` guard factory. Applied via `@UseGuards(RateLimit({...}))` per route or controller.

| Limiter | Applied To | Behavior |
|---|---|---|
| Auth attempts | Login endpoint | Hard 429 after 5 failures / 15min per email + slow-down |
| Global IP | All `/api` routes | Hard 429 at 600 req/min per IP |
| Per-user API | Authenticated routes | Hard 429 at 300 req/min per user |
| Send message | Send endpoints | Hard 429 at 30 msg / 10s per user |
| Chat list | Chat list endpoint | **Soft** — serves cached response with `X-RateLimit-Cached: true` instead of 429 |

- IP-based limiters use the resolved client IP (respecting trusted proxies).
- Authenticated limiters key on `req.user.userId`.
- All counters live in Redis so limits hold across pods.

---

## 14. NOWEB Dual-ID Resolution

WAHA NOWEB represents one contact as two chat entries — outbound messages under LID format (`12345@lid`), inbound under phone format (`917046900859@s.whatsapp.net`). The backend resolves this at three layers:

1. **Chat list dedup** — a pure helper (`chat-dedup.ts`) removes phone-format entries when a LID entry with matching `pnJid` exists.
2. **Message merge** — `MessagesService.getChatMessages` fetches from both JID formats in parallel, merges by stanza ID, sorts by SQLite rowid via `WahaStoreService.getMessageRowids`.
3. **Webhook normalization** — the `WebhookProcessor` calls `WahaStoreService.phoneToLid()` on every incoming event before persisting or emitting, so all downstream code uses a single canonical ID.

---

## 15. Infrastructure & Configuration

| Concern | Detail |
|---|---|
| Framework | NestJS 10 with the Express HTTP adapter |
| Database | PostgreSQL 16 via TypeORM (`@nestjs/typeorm`); partitioned `messages` and `audit_log` |
| Job Queue | BullMQ via `@nestjs/bullmq` backed by Redis |
| Cache / Pub-Sub | Redis (ioredis); used for caching, distributed locks, rate-limiting, Socket.IO adapter |
| SQLite | `better-sqlite3` for direct WAHA NOWEB store reads (read-only mount) |
| Real-time | Socket.IO via `@nestjs/websockets` with the `socket.io-redis-adapter` |
| Auth | `@nestjs/jwt` (RS256) + bcrypt; refresh tokens hashed and family-tracked in Postgres |
| Validation | Zod via a custom `ZodValidationPipe` (also used for socket events and queue payloads) |
| Logging | `nestjs-pino` with redact list and per-request child loggers |
| Health | `@nestjs/terminus` at `/health/live` and `/health/ready` |
| Metrics | `prom-client` exposed at `/metrics` (network-ACL protected) |
| Tracing | OpenTelemetry SDK (auto-instrumentation for Express, `pg`, ioredis, axios, BullMQ) |
| CORS | Controlled by `FRONTEND_URL` env var via `app.enableCors(...)` |
| Environment | `.env` (prod), `.env.dev` (dev), `.env.test` (CI), `.env.waha` (WAHA container) — Zod-parsed at boot |
