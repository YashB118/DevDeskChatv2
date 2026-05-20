## Module — Sessions

> Admin-gated control plane for WAHA sessions. Mirrors session state into Postgres so we can reason about it without a WAHA round-trip, drives WAHA via `WahaService`, and pushes `session:status` to the admin room on every webhook update.

**Files**
- `src/modules/sessions/sessions.module.ts` — providers + controller; imports `WahaModule` + `RealtimeModule`.
- `src/modules/sessions/sessions.controller.ts` — `@UseGuards(JwtAuthGuard, AdminGuard)`; routes under `/api/sessions`.
- `src/modules/sessions/sessions.service.ts` — orchestrates DB + WAHA + `SocketEmitter`.
- `src/modules/sessions/session.repository.ts` — `toDomain` mapper, `upsertByName`, `updateStatus`, `deleteByName`.
- `src/modules/sessions/session.entity.ts` — `@Entity('sessions')` with `name uniq + status enum + config jsonb`.
- `src/modules/sessions/session.types.ts` — `SessionStatus` literal type + `SessionDomain` DTO.
- `src/modules/sessions/session.schema.ts` — Zod for the create body + name param (`/^[A-Za-z0-9_-]+$/`).
- `src/modules/sessions/sessions.errors.ts` — `SessionNotFoundError` (404, code `SESSION_NOT_FOUND`).

---

## 1. HTTP surface (all admin-gated)

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| `GET` | `/api/sessions` | — | `{ sessions: SessionResponse[] }` |
| `GET` | `/api/sessions/:name` | — | `SessionResponse` |
| `POST` | `/api/sessions` | `{ name, config? }` | `SessionResponse` (201) |
| `POST` | `/api/sessions/:name/start` | — | `SessionResponse` |
| `POST` | `/api/sessions/:name/stop` | — | `SessionResponse` |
| `DELETE` | `/api/sessions/:name` | — | 204 |
| `GET` | `/api/sessions/:name/qr` | — | `{ mimetype, data }` (base64 QR from WAHA) |

`SessionResponse = { id, name, status, config, createdAt, updatedAt }` (timestamps ISO strings).

## 2. Status reconciliation

- `applyStatusUpdate(name, status)` is called from the `session.status` webhook handler. It upserts the row (creating one if WAHA pushes a status for a session we don't have locally), invalidates the WAHA session cache, and emits `session:status` to the `admin` room.
- The status enum (`STARTING | SCAN_QR_CODE | WORKING | STOPPED | FAILED`) is owned by both the DB (`session_status` Postgres enum) and the realtime contract — they must stay aligned.

## 3. Tests (`src/modules/sessions/sessions.service.spec.ts`)

- `get` throws `SessionNotFoundError` when row missing.
- `create` upserts STARTING + calls `wahaService.startSession`.
- `stop` refuses unknown sessions.
- `applyStatusUpdate` updates the row, invalidates WAHA cache, emits to admins.
- `applyStatusUpdate` upserts when the local row is missing.
