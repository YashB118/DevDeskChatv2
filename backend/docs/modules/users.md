# Module — Users

> Owns the `users` table and the `UserRepository`. No HTTP surface yet — admin CRUD lands in Phase 9. AuthModule is the only consumer today.

**Files**
- `src/modules/users/users.module.ts` — composition (`TypeOrmModule.forFeature([UserEntity])`, exports `UserRepository`).
- `src/modules/users/user.entity.ts` — `users` table mapping (`citext` email, `user_role` enum, soft-disable flag).
- `src/modules/users/user.repository.ts` — find / create / upsert / update-password.
- `src/modules/users/user.types.ts` — `UserRole` enum, `UserDomain` / `UserWithCredentials` interfaces.

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
| `updatePasswordHash(id, hash)` | `void` | Bcrypt hash supplied by the caller (AuthService); never accepts plaintext. |
| `upsertByEmail(input)` | `UserDomain` | Idempotent. Used by `scripts/seed.ts`. |

No bulk operations yet — they will land alongside the admin CRUD endpoints in Phase 9.

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

Covered transitively by `auth.service.spec.ts` (in-memory user-repo fake exercises `findByEmail`, `findById`, `findByIdWithCredentials`, `updatePasswordHash`). Dedicated repository tests against a Testcontainers Postgres land with Phase 12 alongside the rest of the live integration suite.

## 7. Future evolution

- Phase 9 adds admin CRUD endpoints (`POST /api/users`, `PATCH /api/users/:id`, `DELETE /api/users/:id`, enable/disable, password reset by admin). The repository will gain `list`, `paginate`, and `setDisabled` methods; HTTP routes are gated by `@UseGuards(JwtAuthGuard, AdminGuard)`.
- Phase 9 also adds the developer-assignments side table; `users` itself stays minimal.
- A future `lastLoginAt` column may be added for the admin UI; populate from `AuthService.login` inside the existing `withTransaction` block so it does not race with audit-log writes.
