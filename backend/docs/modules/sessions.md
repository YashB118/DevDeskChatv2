## Module — Sessions

> Admin-gated control plane for WAHA sessions. Mirrors session state into Postgres so we can reason about it without a WAHA round-trip, drives WAHA via `WahaService`, and pushes `session:status` to the admin room on every webhook update.

**Files**
- `src/modules/sessions/sessions.module.ts` — providers + controller; imports `WahaModule` + `RealtimeModule` (`AuthRepository` resolves via the global `AuthModule`).
- `src/modules/sessions/sessions.controller.ts` — `@UseGuards(JwtAuthGuard, AdminGuard)`; routes under `/api/sessions`. Plumbs `@CurrentUser()` into every mutating call so audit rows carry the acting admin.
- `src/modules/sessions/sessions.service.ts` — orchestrates DB + WAHA + `SocketEmitter`; Phase 10 added `AuthRepository.writeAudit` calls for `session.create / session.start / session.stop / session.delete`.
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

## 3. Audit trail (Phase 10)

Every admin mutation (`create / start / stop / delete`) writes to `audit_log` via `AuthRepository.writeAudit(event, actorId, { name })`. The `AuditEvent` union now includes `session.create / session.start / session.stop / session.delete`; the controller passes `UserId(actor.id)` from `@CurrentUser()` so the row is attributable. `applyStatusUpdate` is webhook-driven and intentionally does not write an audit row (it is not an admin action).

## 4. Tests (`src/modules/sessions/sessions.service.spec.ts`)

- `get` throws `SessionNotFoundError` when row missing.
- `create` upserts STARTING + calls `wahaService.startSession`.
- `stop` refuses unknown sessions.
- `applyStatusUpdate` updates the row, invalidates WAHA cache, emits to admins.
- `applyStatusUpdate` upserts when the local row is missing.
- Phase 10: spec injects an `AuthRepository` stub so the audit writes are exercised on the same call paths.
