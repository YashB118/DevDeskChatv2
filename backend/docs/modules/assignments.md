# Module — Assignments

> Admin-only mapping between developers and the chats they own. Drives chat visibility (via `ChatPolicy`) and the per-chat mute permission (via `MuteService`). Mutations emit `chat:assigned` / `chat:unassigned` socket events; every state change is audited in `audit_log` and persisted as an `assignment_history` row.

**Files**
- `src/modules/assignments/assignments.module.ts` — composition (`TypeOrmModule.forFeature([DeveloperAssignmentEntity, AssignmentHistoryEntity])`, `UsersModule`, `RealtimeModule`). Exports `AssignmentsService` + `AssignmentRepository`.
- `src/modules/assignments/developer-assignment.entity.ts` — `developer_assignments` mapping.
- `src/modules/assignments/assignment-history.entity.ts` — `assignment_history` mapping + the `AssignmentEvent` enum.
- `src/modules/assignments/assignment.repository.ts` — CRUD + history writes. All write paths accept an `EntityManager` so callers can run them inside `withTransaction`.
- `src/modules/assignments/assignments.service.ts` — orchestrates `create` / `remove`, in `TransactionRunner.run` blocks; emits socket events and audit rows.
- `src/modules/assignments/assignments.controller.ts` — `/api/admin/assignments`, guarded by `JwtAuthGuard + AdminGuard`.
- `src/modules/assignments/assignment.schema.ts` — `CreateAssignmentSchema`, `ListAssignmentsQuerySchema`.
- `src/modules/assignments/assignments.errors.ts` — `AssignmentAlreadyExistsError` (409), `AssignmentNotFoundError` (404).

---

## 1. Schema (recap — see [db.md](db.md))

```sql
CREATE TYPE assignment_event AS ENUM ('ASSIGNED','UNASSIGNED','REASSIGNED');

CREATE TABLE developer_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id varchar(128) NOT NULL,
  waha_session_id uuid NULL REFERENCES sessions(id) ON DELETE SET NULL,
  assigned_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  unassigned_at timestamptz NULL,
  is_active boolean NOT NULL DEFAULT true
);

-- the partial-unique index is the linchpin: a developer cannot hold two active
-- assignments for the same chat, but historical (is_active = false) rows are
-- preserved for the audit trail.
CREATE UNIQUE INDEX idx_developer_assignments_user_chat_active
  ON developer_assignments (user_id, chat_id) WHERE is_active = true;

CREATE TABLE assignment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES developer_assignments(id) ON DELETE CASCADE,
  event assignment_event NOT NULL,
  actor_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  payload jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
```

## 2. Mutation flow

```
POST /api/admin/assignments       ZodValidationPipe(CreateAssignmentSchema)
  ↓ UsersService-side existence check (`users.findById`)
  ↓ TransactionRunner.run
       ↓ AssignmentRepository.findActive(userId, chatId)      → 409 if present
       ↓ AssignmentRepository.insert({user, chat, assignedBy})
       ↓ AssignmentRepository.writeHistory(ASSIGNED, actor)
       ↓ AuthRepository.writeAudit('assignment.create', actor, …)
       ↓ SocketEmitter.toUser(devId, 'chat:assigned', payload)
       ↓ SocketEmitter.toAdmins('chat:assigned', payload)
  ↓ return assignment DTO

DELETE /api/admin/assignments/:id
  ↓ AssignmentRepository.findById(id)                          → 404 if absent or already inactive
  ↓ TransactionRunner.run
       ↓ AssignmentRepository.deactivate(id)                   → flips is_active, sets unassigned_at
       ↓ AssignmentRepository.writeHistory(UNASSIGNED, actor)
       ↓ AuthRepository.writeAudit('assignment.remove', actor, …)
       ↓ SocketEmitter.toUser(devId, 'chat:unassigned', payload)
       ↓ SocketEmitter.toAdmins('chat:unassigned', payload)
```

## 3. Consumers

- `ChatPolicy.filterVisibleChatIds(developer, chatIds)` calls `AssignmentRepository.listActiveChatIdsForUser` and intersects.
- `ChatPolicy.canReadChat / canWriteChat` (used by `ChatsService.markRead`, future write surfaces) calls `AssignmentRepository.findActive`.
- `MuteService.setChatMute` requires `AssignmentRepository.findActive` for non-admin actors.

## 4. Socket events

Defined in `realtime/events.contract.ts`:

```ts
ChatAssignmentSchema   = { assignmentId, userId, chatId, assignedBy, assignedAt }
ChatUnassignmentSchema = { assignmentId, userId, chatId, unassignedBy, unassignedAt }
```

Routed to two rooms per mutation: the developer's `user:<id>` room and the global `admin` room. The frontend's assignment view in `FRONTEND_ARCHITECTURE.md §6` is the primary consumer.

## 5. Tests

`assignments.service.spec.ts` covers: missing-user rejection, partial-unique conflict, history + audit + socket emission on create, deactivation lifecycle on remove, and 404 semantics for unknown / already-inactive rows. Live partial-unique enforcement (the index itself fires inside Postgres) is exercised in Phase 12's Testcontainers suite.

## 6. Editing rules

- Every state change runs through `TransactionRunner.run` so the history row and the live `is_active` flip cannot diverge.
- Never bypass `writeHistory` — the partial-unique index also guarantees the history sequence is dense per assignment id.
- The repository must never accept an arbitrary `is_active` write — only `insert` (which forces `true`) and `deactivate` (which forces `false`).
- New `AssignmentEvent` values require a migration to extend the Postgres enum.
