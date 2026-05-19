# Backend Features Overview

DevChatDesk backend is an Express 5 + Mongoose + Socket.IO API server. It acts as the control layer between WAHA (WhatsApp HTTP API), MongoDB, Redis/BullMQ, and the React frontend. All modules live under `src/modules/<feature>/`.

---

## 1. Authentication

### Login (`POST /api/auth/login`)
- Validates email/password against bcrypt hash stored in MongoDB.
- Returns a short-lived JWT access token in the response body.
- Issues a long-lived refresh token as an HTTP-only cookie.

### Token Refresh (`POST /api/auth/refresh`)
- Validates the HTTP-only refresh token cookie.
- Issues a new access token without requiring re-login.
- Implements refresh token rotation (old token invalidated on use).

### Logout (`POST /api/auth/logout`)
- Invalidates the refresh token in the database.
- Clears the HTTP-only cookie.

### Password Change (`PATCH /api/auth/password`)
- Authenticated endpoint; validates current password, then stores new bcrypt hash.
- Available to all roles (admin and developer).

### JWT Middleware
- `authMiddleware` verifies Bearer token on all protected routes.
- `adminMiddleware` additionally asserts `role === ADMIN`.
- Token payload carries `userId` and `role`.

---

## 2. User Management

### CRUD (`/api/users`)
- Admin-only endpoints to create, list, update, and delete developer accounts.
- User schema stores: email, hashed password, role (ADMIN / DEVELOPER), display name, enabled/disabled status.
- Disabled users cannot log in.

### Seed Script
- `npm run seed` creates the initial admin account (`admin@test.com` / `password123`) for first-time setup.

---

## 3. Chat Management

### Chat List (`GET /api/chats`)
- Fetches chat list from WAHA, then applies access control:
  - **Admins**: see all chats across all sessions.
  - **Developers**: see only chats assigned to them via `DeveloperAssignment`.
- Deduplicates NOWEB dual-ID entries (removes phone-format entry when a LID entry with matching `pnJid` exists).
- Enriches each chat with: display name, last message preview, unread count, assignment info, mute status.
- Supports cursor-based pagination.
- Results cached with a 10-second TTL to reduce WAHA API pressure.

### Chat Details (`GET /api/chats/:chatId`)
- Returns metadata for a single chat.
- Enforces the same developer/admin visibility rules.

### Mark as Read (`POST /api/chats/:chatId/read`)
- Calls WAHA's mark-read endpoint and updates the internal unread counter.

### Group Participants (`GET /api/chats/:chatId/participants`)
- Returns list of participants for group chats.
- Used by the frontend `@mention` autocomplete.

### Chat Sync (`POST /api/chats/sync`)
- Forces a full re-fetch from WAHA and updates the local cache.

---

## 4. Message Management

### Fetch Messages (`GET /api/messages/:chatId`)
- Cursor-based pagination (newest first, paginate older).
- For NOWEB sessions, fetches from **both** LID-format and phone-format chat IDs in parallel, merges results by stanza ID, and deduplicates.
- Sorts by SQLite rowid (not `messageTimestamp`) because WAHA NOWEB overwrites timestamps on edited messages.
- Enriches each message with:
  - Reactions (from `MessageReaction` collection)
  - Quoted/replied-to content (from `MessageQuote` collection)
  - Deleted status (from `DeletedMessage` collection)
  - Mentions (from `MessageMentions` collection)

### Send Text Message (`POST /api/messages/:chatId/send`)
- Calls `WahaService.sendText()`.
- Supports reply-to (`quotedMessageId`).
- Persists an outbound record for reconciliation.

### Send Media (`POST /api/messages/:chatId/send-media`)
- Accepts multipart form-data (image, video, audio, document).
- Calls the appropriate WAHA media send method based on MIME type.
- Supports optional caption.

### Edit Message (`PATCH /api/messages/:chatId/:messageId`)
- Calls WAHA's edit-message endpoint.
- Stores original and updated text in `MessageEdit` for audit.

### Delete Message (`DELETE /api/messages/:chatId/:messageId`)
- Calls WAHA's delete-message endpoint.
- Marks the message in `DeletedMessage` collection so fetch enrichment can replace content with a placeholder.

### Reactions (`POST /api/messages/:chatId/:messageId/reaction`)
- Sends a reaction emoji via WAHA.
- Upserts the reaction in the `MessageReaction` collection.
- Removes the reaction if the same emoji is sent again (toggle).

### Forward Message (`POST /api/messages/forward`)
- Forwards a message from one chat to another via WAHA.
- Attaches a forwarded-message flag.

---

## 5. Session Management

### List Sessions (`GET /api/sessions`)
- Returns all WAHA sessions with their current status (WORKING, STOPPED, SCAN_QR_CODE, etc.).
- Admin-only.

### Create Session (`POST /api/sessions`)
- Creates a new WAHA session with `noweb.store.enabled = true`.
- Configures the internal webhook URL automatically to `http://backend:4000/api/webhooks/waha`.
- Stores session metadata in MongoDB `Session` collection.

### Start / Stop Session (`POST /api/sessions/:name/start`, `POST /api/sessions/:name/stop`)
- Proxies start/stop commands to WAHA API.
- Emits socket event so admin frontend updates session status live.

### Delete Session (`DELETE /api/sessions/:name`)
- Removes session from WAHA and MongoDB.

### QR Code (`GET /api/sessions/:name/qr`)
- Fetches the QR code from WAHA in SVG format (`format=raw`).
- Returns raw SVG for the frontend to render inline.

### Session Status Polling
- Status cached with a 5-second TTL.
- Socket event (`session.status`) emitted when WAHA reports a status change via webhook.

---

## 6. Chat Assignment System

### Assign Chat (`POST /api/assignments`)
- Admin assigns a specific `chatId` to a developer.
- Upserts into the `DeveloperAssignment` collection (`chats[]` embedded array).
- Emits `chat:assigned` socket event to both the developer's room and the admin room.

### Unassign Chat (`DELETE /api/assignments/:chatId`)
- Sets `isActive = false` on the assignment record (soft delete, retains history).
- Emits `chat:unassigned` socket event.

### List Assignments (`GET /api/assignments`)
- Returns all active assignments (admin) or the caller's own assignments (developer).

### Assignment History
- Stores `assignedAt`, `unassignedAt`, and `assignedBy` per assignment, enabling an audit trail.

### DeveloperAssignment Model
- One document per developer.
- Embedded `chats[]` array with fields: `chatId`, `wahaAccountId`, `assignedBy`, `assignedAt`, `unassignedAt`, `isActive`.
- All chat-listing endpoints filter against this collection for non-admin users.

---

## 7. Webhook Handler

`POST /api/webhooks/waha` receives all inbound events from WAHA.

### Webhook Queue (BullMQ)
- Incoming webhook payloads are immediately enqueued in a BullMQ job queue backed by Redis.
- Returns HTTP 200 to WAHA without waiting for processing (prevents WAHA timeout retries).
- Worker processes jobs asynchronously with concurrency control.

### Supported Event Types

| Event | Action |
|---|---|
| `message` | Persist new inbound message; resolve chat room; emit `message:new` |
| `message.any` | Catch-all for outbound self-messages (fromMe); same persist + emit pipeline |
| `message.ack` | Update delivery/read receipt; emit `message:ack` |
| `message.edited` | Update message text in cache; emit `message:edited` |
| `message.reaction` | Upsert reaction in `MessageReaction`; emit `message:reaction` |
| `session.status` | Emit `session:status` to admin room; update session document |
| `group.v2.participants` | Persist group event; emit `group:participants` |

### Phone→LID Normalization
- All incoming events carry phone-format chat IDs (`917046900859@s.whatsapp.net`).
- Handler calls `phoneToLid()` from `waha-store.service.ts` before emitting any socket event.
- Ensures frontend only ever deals with LID-format IDs, avoiding duplicate chat entries.

### Pending Message Reconciliation
- Outbound messages sent via the app are tracked as "pending" with a 9-second TTL.
- When the corresponding `message.any` webhook arrives, the pending record is matched by stanza ID and resolved.
- Prevents duplicate display of optimistic UI + real message.

---

## 8. Real-Time (Socket.IO)

### Server Initialization
- `initSocket(server)` creates the Socket.IO server with CORS from `FRONTEND_URL`.
- Runs `socketAuth` JWT middleware on every connection; rejects unauthenticated sockets.

### Rooms
- On connect, each socket automatically joins `user:<userId>` (personal room) and, for admins, the `admin` room.
- Clients emit `chats:join` with an array of chat IDs to join per-chat rooms (`chat:<chatId>`).
- Per-chat rooms enable targeted delivery — only users with that chat open receive granular message events.

### Emit Rules
- Multi-room emits use chained `.to()` calls (`io.to(room1).to(room2).emit(...)`) — Socket.IO deduplicates per-socket.

### Key Emitted Events

| Event | Payload | Recipients |
|---|---|---|
| `message:new` | Full message object | All members of `chat:<chatId>` |
| `message:ack` | `{messageId, ack}` | Chat room |
| `message:edited` | Updated message | Chat room |
| `message:deleted` | `{messageId}` | Chat room |
| `message:reaction` | `{messageId, reaction, fromMe}` | Chat room |
| `chat:assigned` | Assignment record | Developer's room + admin room |
| `chat:unassigned` | `{chatId}` | Developer's room + admin room |
| `session:status` | `{name, status}` | Admin room |
| `group:participants` | Group event | Chat room + admin room |

---

## 9. WAHA Integration Service (`waha.service.ts`)

Single singleton wrapping all outbound calls to the WAHA HTTP API.

### Authentication
- Supports `X-Api-Key` header or HTTP Basic Auth, configured via environment variables.

### In-Memory Caching
- Session list: 10-second TTL.
- Chat list: 10-second TTL.
- Session status: 5-second TTL.
- Reduces WAHA API load during burst activity.

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

Reads WAHA's NOWEB SQLite database directly (mounted read-only at `/app/.sessions`).

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

### Per-Chat Mute (`AdminChatMute` model)
- Admin or developer can mute a specific chat.
- Muted chats are excluded from desktop notification delivery.
- Mute status returned in chat list enrichment so frontend can reflect it.

### Global Mute (`AdminGlobalMute` model)
- Admin-level toggle to silence all notification sounds globally.
- Single document per admin user; toggled via `PATCH /api/mute/global`.
- Checked before any notification emit.

---

## 12. Feedback Module

### Submit Feedback (`POST /api/feedback`)
- Authenticated developers submit text feedback/bug reports.
- Stored in `Feedback` collection with `userId`, `body`, `createdAt`, `read` flag.

### List Feedback (`GET /api/feedback`)
- Admin: returns all submissions.
- Developer: returns own submissions only.

### Mark Read (`PATCH /api/feedback/:id/read`)
- Admin marks a submission as read.

---

## 13. Rate Limiting

All limiters defined in `src/middlewares/rate.limiter.ts` using `express-rate-limit`.

| Limiter | Applied To | Behavior |
|---|---|---|
| `authLimiter` | Login endpoint | Hard 429 after threshold |
| `apiLimiter` | All `/api` routes | Hard 429 after threshold |
| `messageSendLimiter` | Send message endpoints | Per-user rate limit |
| `chatListLimiter` | Chat list endpoint | Soft fallback — returns cached data, not 429 |

- IP-based limiters use `ipKeyGenerator()`.
- Authenticated limiters key on `req.user.userId`.

---

## 14. NOWEB Dual-ID Resolution

WAHA NOWEB represents one contact as two chat entries — outbound messages under LID format (`12345@lid`), inbound under phone format (`917046900859@s.whatsapp.net`). The backend resolves this at three layers:

1. **Chat list dedup** — `enrichChatsWithNames` removes phone-format entries when a LID entry with matching `pnJid` exists.
2. **Message merge** — `getChatMessages` fetches from both JID formats in parallel, merges by stanza ID, sorts by SQLite rowid.
3. **Webhook normalization** — `handleWebhookEvent` calls `phoneToLid()` on every incoming event before persisting or emitting, so all downstream code uses a single canonical ID.

---

## 15. Infrastructure & Configuration

| Concern | Detail |
|---|---|
| Database | MongoDB via Mongoose; 12 collections |
| Job Queue | BullMQ backed by Redis |
| SQLite | better-sqlite3 for direct WAHA store reads |
| Auth | JWT (jsonwebtoken) + bcrypt |
| ETag | Disabled (`app.set("etag", false)`) — prevents 304 empty-body responses breaking axios clients |
| CORS | Controlled by `FRONTEND_URL` env var |
| Session Store | Redis for BullMQ; no Express session (stateless JWT) |
| Environment | `.env` (prod), `.env.dev` (dev), `.env.waha` (WAHA container) |
