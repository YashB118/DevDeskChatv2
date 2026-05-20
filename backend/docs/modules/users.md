# Module — Users

> Owns the `users` table, the `UserRepository`, and the admin CRUD HTTP surface (`/api/admin/users`). AuthModule still drives credential checks; Phase 9 added the admin lifecycle (create, update, enable/disable, password reset, list).

**Files**
- `src/modules/users/users.module.ts` — composition: `TypeOrmModule.forFeature([UserEntity])`, `forwardRef(() => AuthModule)` (so `UsersService` can inject `AuthRepository` for refresh-family revocation + audit writes), `RealtimeModule` (for `SocketEmitter.disconnectUser`). Exports `UserRepository` + `UsersService`.
- `src/modules/users/user.entity.ts` — `users` table mapping (`citext` email, `user_role` enum, soft-disable flag).
- `src/modules/users/user.repository.ts` — find / create / upsert / update-password / list / update / setDisabled. All write methods accept an optional `EntityManager`.
- `src/modules/users/user.types.ts` — `UserRole` enum, `UserDomain` / `UserWithCredentials` interfaces.
- `src/modules/users/users.service.ts` — admin CRUD: `create`, `update`, `setDisabled`, `resetPassword`. Disable + reset run inside `TransactionRunner.run` and call `SocketEmitter.disconnectUser` outside the transaction.
- `src/modules/users/users.controller.ts` — `/api/admin/users` (guarded by `JwtAuthGuard + AdminGuard`).
- `src/modules/users/users.schema.ts` — `CreateUserSchema`, `UpdateUserSchema`, `AdminPasswordResetSchema`, `ListUsersQuerySchema`.
- `src/modules/users/users.errors.ts` — `UserAlreadyExistsError` (409), `UserNotFoundError` (404).

---

## 1. Responsibility

- Map the `users` Postgres table to a typed domain object.
- Provide repository methods scoped to a caller-supplied `EntityManager` so writes can participate in a `withTransaction` block (e.g. the auth login flow inserts a refresh token in the same transaction as the audit row).
- Expose `UserRepository` from `UsersModule` for downstream modules (AuthModule today, AssignmentsModule / FeedbackModule / MuteModule in Phase 9).
- Never expose the TypeORM entity outside the repository — every method returns `UserDomain` or `UserWithCredentials`.

## 2. Domain types

```ts
enum UserRole { ADMIN = 'ADMIN', DEVELOPER = 'DEVELOPER' }

interface UserDomain {
  id: UserId;             // branded uuid
  email: string;          // lowercased, citext-compared
  role: UserRole;
  displayName: string;
  disabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface UserWithCredentials extends UserDomain {
  passwordHash: string;   // bcrypt hash — never serialized to HTTP
}
```

`UserWithCredentials` is the credentials-bearing variant used by `AuthService` during login and password change. Use plain `UserDomain` everywhere else; the bcrypt hash should never leave the auth + users layer.

## 3. Repository methods

All methods accept an optional `EntityManager` so the caller can pin the operation to a transaction:

| Method | Returns | Notes |
| --- | --- | --- |
| `findById(id)` | `UserDomain \| null` | No credentials. |
| `findByIdWithCredentials(id)` | `UserWithCredentials \| null` | Used by password-change verify. |
| `findByEmail(email)` | `UserWithCredentials \| null` | Email lowercased before lookup; `citext` makes the query case-insensitive but normalization keeps logs consistent. |
| `create(input)` | `UserDomain` | Email lowercased on insert. |
| `updatePasswordHash(id, hash)` | `void` | Bcrypt hash supplied by the caller; never accepts plaintext. |
| `upsertByEmail(input)` | `UserDomain` | Idempotent. Used by `scripts/seed.ts`. |
| `list(options)` | `UserDomain[]` | `includeDisabled` filters the partial active index; cursor / pagination via `limit + offset`. |
| `update(id, patch)` | `UserDomain \| null` | Only `displayName` and `role` are accepted — email + password go through dedicated endpoints. |
| `setDisabled(id, disabled)` | `void` | Flips the soft-delete flag. Service layer pairs this with refresh-family revocation + socket disconnect. |

## 3a. HTTP surface (`/api/admin/users`, admin-only)

| Verb | Path | Body / Query | Result |
| --- | --- | --- | --- |
| `GET` | `/api/admin/users` | `includeDisabled?`, `limit?`, `offset?` | `{ users: UserDomain[] }` |
| `GET` | `/api/admin/users/:id` | — | `{ user: UserDomain }` |
| `POST` | `/api/admin/users` | `CreateUserSchema` | `{ user: UserDomain }`; audits `user.create`. |
| `PATCH` | `/api/admin/users/:id` | `UpdateUserSchema` | `{ user: UserDomain }`; audits `user.update`. |
| `POST` | `/api/admin/users/:id/disable` | — | `withTransaction(setDisabled + revokeAllForUser + writeAudit('user.disable'))`, then `SocketEmitter.disconnectUser`. Returns `{ user: UserDomain }`. |
| `POST` | `/api/admin/users/:id/enable` | — | Single `setDisabled(false)` inside `withTransaction` + `writeAudit('user.enable')`. No socket disconnect (re-login is unnecessary). Returns `{ user: UserDomain }`. |
| `POST` | `/api/admin/users/:id/password-reset` | `AdminPasswordResetSchema` | bcrypt-hash, `withTransaction(updatePasswordHash + revokeAllForUser + writeAudit('user.password.reset'))`, then disconnect sockets. Returns 204. |
| `DELETE` | `/api/admin/users/:id` | — | Soft delete via `setDisabled(true)` (preserves audit history). Returns `{ user: UserDomain }`. |

All routes sit behind `@UseGuards(JwtAuthGuard, AdminGuard)`. Bodies are Zod-validated via `ZodValidationPipe`. UUID params go through `ParseUUIDPipe`.

## 4. Schema (recap — see [db.md](db.md) for the migration)

```sql
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role user_role NOT NULL,
  display_name text NOT NULL,
  disabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_active ON users (disabled) WHERE disabled = false;
```

Notes:

- `email` is `citext` — case-insensitive equality at the database layer. Application code still lowercases before insert/lookup to keep audit/log payloads consistent.
- `disabled` is a soft flag. Phase 9 will wire UI to flip it; AuthService refuses login when true and refresh-rotation revokes the user's families if the flag flips between sessions.
- The partial index supports the eventual "list active developers" query without scanning disabled rows.

## 5. Editing rules

- All entity properties are camelCase. Do **not** add `@Column({ name: '...' })`; the naming strategy already maps them.
- New repository methods must return domain DTOs via the `toDomain(entity)` mapper. No `UserEntity` leaks beyond `user.repository.ts`.
- New columns (e.g. `lastLoginAt`, `avatarUrl` in later phases) require a migration; never enable `synchronize`.
- Password handling stays in AuthService. UsersRepository accepts bcrypt hashes; never accepts plaintext.

## 6. Tests

`users.service.spec.ts` covers: duplicate-email rejection, bcrypt + audit write on create, disable revokes refresh-token families and severs sockets while enable does neither, missing-target rejection, admin password reset rehashes / revokes / disconnects. AuthService's `users.service.spec.ts` still exercises `findByEmail` / `findById` / `findByIdWithCredentials` / `updatePasswordHash` transitively. Live Testcontainers coverage lands in Phase 12.

## 7. Future evolution

- A future `lastLoginAt` column may be added for the admin UI; populate from `AuthService.login` inside the existing `withTransaction` block so it does not race with audit-log writes.
- Phase 11 will likely add login-attempt + admin-CRUD rate limiters on the controller.
