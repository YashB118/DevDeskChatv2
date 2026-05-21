## Module — Realtime

> Socket.IO transport for the app. Wraps `@nestjs/websockets` with a Redis adapter for horizontal fan-out, a JWT handshake guard, room conventions, a typed broadcaster, and a Redis-backed monotonic sequence counter for future missed-event resume.

**Files**
- `src/realtime/realtime.module.ts` — composition (imports `AuthModule` for `JwtService`; exports `SocketEmitter`, `SequenceService`).
- `src/realtime/realtime.gateway.ts` — `@WebSocketGateway` with JWT handshake, auto-join (`user:<id>`, `admin`), `ping/pong`, `chats:join`, `chats:leave`.
- `src/realtime/ws-jwt.guard.ts` — `CanActivate` that re-verifies tokens for `@SubscribeMessage` handlers (handshake auth runs in `handleConnection`).
- `src/realtime/socket-redis.adapter.ts` — custom `IoAdapter` that installs `@socket.io/redis-adapter` over duplicated ioredis clients.
- `src/realtime/socket.emitter.ts` — typed broadcaster injected by other modules; validates outbound payloads outside production.
- `src/realtime/events.contract.ts` — Zod schemas for inbound and outbound events.
- `src/realtime/socket.rooms.ts` — `roomFor.user(id)` / `roomFor.chat(id)` / `roomFor.admin()` builders.
- `src/realtime/sequence.ts` — Redis `INCR`-backed monotonic counter per stream.
- `src/realtime/ws-zod-validation.pipe.ts` — WS-flavored Zod pipe that throws `WsException` instead of `ValidationError`.
- `src/realtime/socket.types.ts` — `AuthedSocket` type augmenting Socket.IO's `Socket.data` with the authenticated user.

---

## 1. Responsibility

- Accept Socket.IO connections over `websocket` transport only.
- Verify the JWT presented in `handshake.auth.token` (or `Authorization: Bearer …`); disconnect immediately on failure.
- Auto-join every authenticated socket to `user:<userId>` and, for admins, `admin`.
- Route per-chat subscriptions through explicit `chats:join` / `chats:leave` messages (server-controlled room membership).
- Fan out emits across pods via `@socket.io/redis-adapter`.
- Expose a typed `SocketEmitter` so other modules emit without depending on the gateway directly.
- Maintain a Redis monotonic sequence per stream so later phases can implement missed-event resume.

## 2. Connection flow

```
Client → io({ auth: { token } })
   ↓
RealtimeGateway.handleConnection
   ├── extract token from handshake.auth.token or Authorization header
   ├── jwt.verifyAsync(token, { algorithms: ['RS256'], issuer, audience, publicKey })
   ├── on failure → client.disconnect(true)
   └── on success:
        client.data.user = { id, email, role }
        client.join('user:<id>')
        if role === ADMIN: client.join('admin')
```

`WsAuthGuard` runs on `@SubscribeMessage` handlers and short-circuits when `client.data.user` is already set (which it is after a successful handshake). It exists as a defense-in-depth check; without it a message dispatched before `handleConnection` resolves would run without an authenticated socket.

## 3. Event contract

Inbound events (client → server) are validated through `WsZodValidationPipe` applied at `@MessageBody(new WsZodValidationPipe(Schema))`:

| Event | Payload | Behavior |
|---|---|---|
| `ping` | `{ nonce: string, ts?: number }` | Server responds with `pong { nonce, serverTs, seq }` after `INCR`ing the user's sequence. |
| `chats:join` | `{ chatIds: string[] }` (uuid, 1–100) | Joins requested chat rooms. Assignment-based authorization is enforced in the HTTP path; gating the room-join itself remains permissive so the client controls subscription. |
| `chats:leave` | `{ chatIds: string[] }` (uuid, 1–100) | Leaves the rooms. |

Outbound events (server → client) flow through `SocketEmitter`. `events.contract.ts` lists the Zod schema for each — `SocketEmitter.checkPayload` validates against it in non-production builds, surfacing contract drift as a server-side error log rather than a client-side surprise.

Outbound surface today: `pong`, `error:invalid_payload`, `message:new`, `message:ack`, `message:edited`, `message:deleted`, `message:reaction`, `session:status`, `group:participants` (Phase 8), `chat:assigned`, `chat:unassigned` (Phase 9). The Phase 9 additions are routed by `AssignmentsService` to both `user:<dev>` and `admin` on every create / remove mutation.

`SocketEmitter.disconnectUser(userId)` (Phase 9) is the imperative complement: `UsersService.setDisabled(_, true, _)` and `UsersService.resetPassword(...)` call it outside their transactions so an admin disabling a developer immediately severs any live socket session.

Phase 10 metrics: every successful `SocketEmitter.emit` increments `socket_events_emitted_total{event, room_kind}` (room kind is `user` / `chat` / `admin` / `socket` / `other`, derived by `roomKindFor`). `RealtimeGateway.handleConnection` / `handleDisconnect` move `active_socket_connections` up and down so the Prom gauge always reflects authenticated clients only (rejected handshakes never enter the count).

## 4. Rooms

Centralized in `socket.rooms.ts`:

```ts
roomFor.user(userId) // → 'user:<id>'
roomFor.chat(chatId) // → 'chat:<id>'
roomFor.admin()      // → 'admin'
```

Other modules call `socketEmitter.toUser(...)`, `toChat(...)`, `toAdmins(...)`; nobody composes room strings by hand.

## 5. Redis adapter

`SocketRedisAdapter` extends `IoAdapter`. On `createIOServer`, it duplicates the application's shared ioredis client into a pub/sub pair and installs `@socket.io/redis-adapter`. This lets emits on pod A reach clients on pod B with no application-level routing.

Registered in `main.ts` after the Nest app is created but before `listen()`:

```ts
app.useWebSocketAdapter(new SocketRedisAdapter(app));
```

The duplicated clients are owned by the adapter and closed during shutdown.

## 6. Sequence counter

`SequenceService.next('chat:<id>')` issues a strictly-increasing integer per stream via Redis `INCR`. Future phases attach the value to emitted events so clients reconnecting after a gap can ask the server to replay anything past their last seen `seq`.

## 7. Security

- Transport restricted to `websocket` — no long-polling fallback in production.
- CORS mirrored from `CORS_ORIGINS` onto the io engine so the upgrade is rejected pre-auth for disallowed origins.
- `maxHttpBufferSize` capped at 1 MB.
- `pingTimeout` 30s / `pingInterval` 25s for backpressure.
- JWT verification uses the same RS256 public key as the HTTP `JwtAuthGuard` — there is no separate trust path for WebSocket auth.
- Failed handshakes disconnect immediately with no error payload sent to the client.

## 8. Testing

- `socket.rooms.spec.ts` — room name conventions.
- `sequence.spec.ts` — `INCR`/`GET`/`DEL` semantics against a fake redis.
- `socket.emitter.spec.ts` — routing into the right room and Zod payload validation gating.
- `ws-jwt.guard.spec.ts` — handshake-auth and message-time short-circuit.
- `test/realtime.e2e-spec.ts` — end-to-end with `socket.io-client` against a Nest test app:
  - rejects missing / invalid tokens (disconnect),
  - accepts valid token and round-trips `ping`/`pong`,
  - auto-joins user and admin rooms,
  - `chats:join` lets `SocketEmitter.toChat(...)` reach the client,
  - invalid `chats:join` payload is rejected by the WS Zod pipe.

A cross-pod Redis fan-out test (two Nest processes sharing one Redis container) is deferred to the Phase 12 Testcontainers suite alongside the rest of the live-infra integration tests.
