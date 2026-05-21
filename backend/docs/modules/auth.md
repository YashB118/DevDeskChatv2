## Module — Auth

> Authentication surface: login, refresh-token rotation with family revocation, logout, password change. Owns the JWT signer/verifier, the refresh-token store, and the append-only audit log.

**Files**
- `src/modules/auth/auth.module.ts` — composition (UsersModule, TypeOrm features, JwtModule.registerAsync).
- `src/modules/auth/auth.controller.ts` — HTTP surface under `/api/auth`.
- `src/modules/auth/auth.service.ts` — login / refresh / logout / change-password logic.
- `src/modules/auth/auth.repository.ts` — refresh-token + audit_log persistence.
- `src/modules/auth/refresh-token.entity.ts` — `refresh_tokens` TypeORM mapping.
- `src/modules/auth/audit-log.entity.ts` — `audit_log` TypeORM mapping (partitioned).
- `src/modules/auth/auth.schema.ts` — Zod schemas for inputs.
- `src/modules/auth/auth.types.ts` — `JwtPayload`, `AuthenticatedRequestUser`, result types, `AuditEvent` union.
- `src/modules/auth/auth.errors.ts` — `AppError` subclasses (`InvalidCredentialsError`, `InvalidRefreshTokenError`, `UserDisabledError`, `UnauthorizedError`, `ForbiddenError`).

---

## 1. Responsibility

- Authenticate users by email + password against `users.password_hash` (bcrypt).
- Issue **RS256 JWT access tokens** (TTL `JWT_ACCESS_TTL_SECONDS`, default 15 min).
- Issue **opaque refresh tokens** that rotate on every use; detect replay and revoke the entire token family.
- Persist refresh tokens hashed (bcrypt) so a database leak cannot grant session continuation.
- Set / clear the refresh cookie (`HttpOnly; Secure; SameSite=Strict; Path=/api/auth`).
- Write append-only `audit_log` rows for every auth-relevant event.
- Expose `JwtModule` so `JwtAuthGuard` (in `common/guards`) can verify access tokens elsewhere.

## 2. HTTP surface

All routes sit under `/api/auth` (the `/api` prefix is applied globally by `main.ts`). Controllers stay thin — at most a few lines each.

| Method + path | Auth | Body schema | Behaviour |
| --- | --- | --- | --- |
| `POST /api/auth/login` | `@Public()` | `LoginSchema` (`email`, `password 8–128`) | Verifies password, issues access token + refresh cookie, audits `auth.login.success` / `auth.login.failure`. |
| `POST /api/auth/refresh` | `@Public()` | — (reads refresh cookie) | Rotates the refresh token in a single `withTransaction`; revokes the family on reuse / wrong secret / expired / revoked. |
| `POST /api/auth/logout` | `JwtAuthGuard` | — | Revokes the family the presented refresh cookie belongs to and clears the cookie. No-op if the cookie is absent. |
| `PATCH /api/auth/password` | `JwtAuthGuard` | `PasswordChangeSchema` (`currentPassword`, `newPassword`) | Re-checks the current password, writes a new bcrypt hash, **revokes every refresh-token family for the user**, audits `auth.password.change`. Clears the refresh cookie so the next refresh forces a fresh login. |

Successful login / refresh responses:

```json
{
  "accessToken": "<jwt>",
  "accessTokenExpiresIn": 900,
  "user": { "id": "<uuid>", "email": "...", "role": "ADMIN", "displayName": "..." }
}
```

`logout` and `changePassword` return `204 No Content`.

## 3. Refresh token wire format

`<refresh-token-id>.<base64url-secret>` — two halves separated by a single `.`.

- `id` is the `refresh_tokens.id` UUID. Cheap to look up in O(1); avoids scanning every active token on every refresh.
- `secret` is `randomBytes(48).toString('base64url')`. Only `bcrypt(secret)` is stored.
- `parseRefreshToken` (`auth.service.ts`) rejects malformed input before any DB hit: id must be a UUIDv4 shape, secret must be ≥ 16 chars.

The wire format is a backend implementation detail — never expose either half to JS. The cookie holds the whole string; the frontend never reads it.

## 4. Rotation + family revocation

Every refresh row carries `family_id`. A login mints a fresh family; a refresh keeps the same family on the new row. The `replaced_by` self-FK links old → new for forensics. Behaviour:

| Refresh input | Outcome | Audit event |
| --- | --- | --- |
| Valid (not revoked, not expired, secret matches) | Mark old row `revoked = true, replaced_by = newId` inside `tx.run`; insert new row; return new pair. | `auth.refresh.success` |
| **Already-revoked row** (someone replayed an old token) | `revokeFamily(family_id)` — every active row in the family flips `revoked = true`. | `auth.refresh.reuse` |
| **Known id, wrong secret** (probable theft) | `revokeFamily(family_id)` for the same reason. | `auth.refresh.reuse` (`reason: secret_mismatch`) |
| Unknown id / malformed string | Reject; no DB write beyond the failed audit row. | `auth.refresh.invalid` |
| Expired row | Reject. | `auth.refresh.invalid` (`reason: expired`) |
| User has been disabled or deleted | `revokeFamily(family_id)`. | `auth.refresh.invalid` (`reason: user_disabled_or_missing`) |

`changePassword` revokes **all** of the user's active families, not just the current one.

`disabled = true` (set by future user-admin endpoints in Phase 9) takes effect on the next refresh; the existing access token finishes its 15-minute TTL.

## 5. JWT details

`JwtModule.registerAsync` consumes `APP_CONFIG`:

- `privateKey` / `publicKey` — PEM strings; literal `\n` escapes normalized by the env loader.
- `signOptions = { algorithm: 'RS256', issuer, audience, expiresIn: JWT_ACCESS_TTL_SECONDS }`.
- `verifyOptions = { algorithms: ['RS256'], issuer, audience }`.

Access token payload (`auth.types.ts:JwtPayload`):

```ts
{ sub: string;       // users.id (uuid)
  email: string;     // users.email
  role: UserRole;    // 'ADMIN' | 'DEVELOPER'
  iss?, aud?, exp?, iat? }
```

`JwtAuthGuard` reads `sub`/`email`/`role` and populates `req.user`. No other claims are consumed.

## 6. Audit log

Every state-changing operation calls `AuthRepository.writeAudit(event, userId, payload?, manager?)`. Inside a transaction, the audit write rides the same `EntityManager` so the row commits with the state change (or rolls back together).

`AuditEvent` is a string union — extend it in `auth.types.ts` when introducing a new event class; do not freelance event names. Events currently in use:

- Auth (Phase 3): `auth.login.success`, `auth.login.failure`, `auth.refresh.success`, `auth.refresh.reuse`, `auth.refresh.invalid`, `auth.logout`, `auth.password.change`.
- Users (Phase 9, written by `UsersService`): `user.create`, `user.update`, `user.disable`, `user.enable`, `user.password.reset`.
- Assignments (Phase 9, written by `AssignmentsService`): `assignment.create`, `assignment.remove`.
- Mute (Phase 9, written by `MuteService`): `mute.chat.set`, `mute.global.set`.
- Sessions (Phase 10, written by `SessionsService`): `session.create`, `session.start`, `session.stop`, `session.delete`.

`audit_log` is range-partitioned monthly by `created_at` (see [db.md](db.md) §6). New events incur no schema work — the table accepts any `event` string.

## 7. Cookies

`AuthController` is the only place that touches the refresh cookie. Set / clear go through helpers that always include the same `Path` (`/api/auth`) and the optional `Domain` so the browser's matching rules invalidate the correct entry. The cookie itself carries `HttpOnly + Secure + SameSite=Strict` unconditionally; `Secure` is configurable only for local plain-HTTP dev (`REFRESH_COOKIE_SECURE=false`).

`cookie-parser` is mounted by `main.ts` *before* route resolution so `req.cookies` is populated. The controller reads it via a small `readCookies(req)` helper that tolerates the case where the middleware did not run (e.g., a unit test that bypasses bootstrap).

## 8. Errors

| Error | Status | Code | When |
| --- | --- | --- | --- |
| `InvalidCredentialsError` | 401 | `INVALID_CREDENTIALS` | Wrong email OR wrong password (same message both ways — do not branch). |
| `InvalidRefreshTokenError` | 401 | `INVALID_REFRESH_TOKEN` | Anything wrong with the refresh attempt. |
| `UserDisabledError` | 403 | `USER_DISABLED` | Login attempt against a `disabled = true` account. |
| `UnauthorizedError` | 401 | `UNAUTHORIZED` | Used by `JwtAuthGuard`. |
| `ForbiddenError` | 403 | `FORBIDDEN` | Used by `AdminGuard` and future role checks. |

`AllExceptionsFilter` shapes them into the standard envelope; stack traces never leave the server.

## 9. Service / repository shape

- `AuthService` injects `APP_CONFIG`, `JwtService`, `UserRepository`, `AuthRepository`, `TransactionRunner`.
- `AuthRepository` works against `RefreshTokenEntity` + `AuditLogEntity` via `@InjectRepository`. Methods accept an optional `EntityManager` and default to the global one.
- A login-time dummy bcrypt compare runs in the "user not found" branch so timing roughly matches the "bad password" branch.
- `signAccessToken(user)` is exposed so other modules (e.g. an `/api/auth/me`-style endpoint added later) can mint tokens without re-implementing claim assembly.

## 10. Seeding

`scripts/seed.ts` upserts an admin user idempotently. Env overrides: `SEED_ADMIN_EMAIL` (default `admin@test.com`), `SEED_ADMIN_PASSWORD` (default `password123`), `SEED_ADMIN_NAME` (default `Default Admin`). The script uses `BCRYPT_COST` from env. Run after migrations:

```bash
npm run migrate
npm run seed
```

## 11. Tests

Unit specs (no Docker required):

- `auth.service.spec.ts` — login (happy + bad email + wrong password + disabled), rotation, **reuse detection** on a revoked replay AND on wrong-secret-on-known-id, expired-token rejection, malformed input, change-password revokes all families, logout family revoke, `parseRefreshToken` edge cases.
- `auth.schema.spec.ts` — Zod schemas (valid / short-password / bad-email shapes).
- `jwt-auth.guard.spec.ts` (in `common/guards/`) — public bypass, missing bearer, verify failure, valid token populates `req.user`.
- `admin.guard.spec.ts` (in `common/guards/`) — admin allowed, developer forbidden, `@Roles` override.

Live login → refresh → logout flow against a Testcontainers Postgres is deferred to Phase 12 alongside the rest of the e2e suite.

## 12. Common editing mistakes

| Mistake | Correct pattern |
| --- | --- |
| Returning a distinct error for "user not found" vs "wrong password". | Same `InvalidCredentialsError` for both. Branch in `audit_log.payload.reason`, never in the HTTP response. |
| Comparing full refresh tokens by string equality. | Use the `<id>.<secret>` split. Look up by id; bcrypt-compare the secret. |
| Reusing a `family_id` from a previous login. | Mint a fresh `randomUUID()` on every login. Refresh keeps the family stable — login does not. |
| Writing to `audit_log` outside `AuthRepository.writeAudit`. | Centralize through the repository so partitioning + types stay consistent. Future modules calling the helper is fine. |
| Storing access tokens server-side. | They are stateless by design; do not introduce a server-side allowlist. Use refresh-family revocation for forced logout. |
| Adding new ways to deliver the refresh token (query string, header). | The cookie is the only transport. The wire format is a backend implementation detail. |

## 13. Future evolution

- **`GET /api/auth/me`** for fetching the current user without round-tripping the access-token claims (Phase 8/9 if useful — the user is already in the login/refresh response today).
- **Per-device session naming** (display IP / UA in `/api/auth/sessions` for a future settings UI) — schema already carries enough; add a list endpoint and a friendly name column.
- **Auth-attempt rate limiting** — Phase 11 will add `@UseGuards(RateLimit({...}))` on login + refresh (5 / 15min per email with slow-down).
- **Multi-key JWT rotation** — verify-with-old-while-signing-with-new when the deploy platform exposes a multi-key verify path.
