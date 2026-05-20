# Module — Feedback

> Lightweight feedback inbox. Any authenticated user can submit; developers see only their own entries, admins see everything and own the read transition.

**Files**
- `src/modules/feedback/feedback.module.ts` — composition (`TypeOrmModule.forFeature([FeedbackEntity])`, `UsersModule`). Exports `FeedbackService`.
- `src/modules/feedback/feedback.entity.ts` — `feedback` mapping (UUID PK, nullable `user_id`, body, read flag, created_at).
- `src/modules/feedback/feedback.repository.ts` — insert / list / findById / markRead. Lists are role-scoped at the service layer.
- `src/modules/feedback/feedback.service.ts` — submit, role-scoped list, admin-only mark-read.
- `src/modules/feedback/feedback.controller.ts` — `/api/feedback` (guarded by `JwtAuthGuard`).
- `src/modules/feedback/feedback.schema.ts` — `SubmitFeedbackSchema`, `ListFeedbackQuerySchema`.
- `src/modules/feedback/feedback.types.ts` — `FeedbackDomain`.

---

## 1. Schema (recap — see [db.md](db.md))

```sql
CREATE TABLE feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  body text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_feedback_user_created ON feedback (user_id, created_at DESC);
CREATE INDEX idx_feedback_unread_created
  ON feedback (read, created_at DESC) WHERE read = false;
```

The `(read, created_at) WHERE read = false` partial index keeps the admin inbox cheap as the table grows.

## 2. HTTP surface (`/api/feedback`)

| Verb | Path | Body / Query | Visibility |
| --- | --- | --- | --- |
| `POST` | `/api/feedback` | `SubmitFeedbackSchema` (`body: 1..8000`) | Authenticated user; the `userId` is stamped server-side. |
| `GET` | `/api/feedback` | `unreadOnly?`, `limit?` | Admin sees all; developer only sees their own. |
| `POST` | `/api/feedback/:id/read` | — | Admin-only (404 if missing, 403 if non-admin). Returns the updated row. |

Bodies pass `ZodValidationPipe`; `:id` goes through `ParseUUIDPipe`.

## 3. Tests

`feedback.service.spec.ts` covers: developer list is auto-scoped to their `userId`, admin list omits the filter, `markRead` is admin-only (403 for developers), `NotFoundError` when the id doesn't exist, and the updated row reflects `read = true`.

## 4. Editing rules

- Always filter by `userId` for non-admin lists; admins are explicit by role check, never by "no filter on accident".
- `markRead` is the only state transition; deletion / unread-toggle is intentionally out of scope. A delete surface, if ever added, must go through soft delete + audit.
