# Module — Shared

> Framework-agnostic primitives reused across feature modules. Nothing here depends on Nest, on Express, or on any concrete adapter. Anything in `shared/` must compile and run in a plain Node script.

**Files**
- `src/shared/errors/app.error.ts`
- `src/shared/errors/not-found.error.ts`
- `src/shared/errors/validation.error.ts`
- `src/shared/errors/conflict.error.ts`
- `src/shared/errors/external-service.error.ts`
- `src/shared/errors/index.ts` — barrel re-exports.
- `src/shared/types/ids.ts`
- `src/shared/types/express.d.ts`
- `src/shared/utils/result.ts`

---

## 1. Error hierarchy

### `AppError` (base class)

- Extends `Error`. Constructor takes `{ code, statusCode, message, details?, cause? }`.
- `code` is a stable string identifier (e.g., `NOT_FOUND`). Consumers branch on it.
- `statusCode` is the HTTP status to return.
- `details` is an optional `Record<string, unknown>` surfaced verbatim in the error envelope.
- `cause` is preserved on the underlying `Error` for server-side logging only. The exception filter never serialises it.
- The constructor sets `name = new.target.name`, so log lines show `NotFoundError` rather than the generic `AppError`.

### Subclasses

| Class | `code` | `statusCode` | Use when |
| --- | --- | --- | --- |
| `NotFoundError` | `NOT_FOUND` | 404 | A specific record/entity that the caller asked for cannot be located. |
| `ValidationError` | `VALIDATION_ERROR` | 400 | Input failed a Zod parse or any inline check. `details.issues` is the agreed payload shape. |
| `ConflictError` | `CONFLICT` | 409 | A concurrent edit, unique-constraint violation, or a lock that could not be acquired. |
| `ExternalServiceError` | `EXTERNAL_SERVICE_ERROR` | 502 | A downstream provider (WAHA, Redis, Postgres, etc.) failed or refused. Always preserve `cause`. |

Module-local subclasses live next to the module that owns them (e.g. `modules/auth/auth.errors.ts` adds `InvalidCredentialsError`, `InvalidRefreshTokenError`, `UserDisabledError`, `UnauthorizedError`, `ForbiddenError`). The "live in `shared/`" rule applies only to errors that are themselves cross-cutting. Each subclass — wherever it lives — must extend `AppError` so `AllExceptionsFilter` picks it up.

### Authoring rules

- New subclasses must extend `AppError` directly. Do not chain through other subclasses.
- The `code` must be UPPER_SNAKE and globally unique. Search the codebase before picking one.
- Prefer adding `details` over enriching `message`. Messages are user-facing; details are machine-readable.
- Never set `cause` to a payload object — only to an actual `Error`/`unknown` thrown upstream.

### Use from controllers/services

`throw new NotFoundError('Chat missing', { chatId })`. The global filter handles the HTTP shape. There is no need to catch and rethrow.

## 2. Branded ID types

`src/shared/types/ids.ts` declares four branded string types and matching constructors:

- `UserId`
- `ChatId`
- `MessageId`
- `SessionId`

Brand semantics are achieved via a `Brand<T, K>` helper using a unique symbol. The constructors (`UserId('…')`, `ChatId('…')`, …) are the only sanctioned way to coerce a plain string into a branded one. They perform no runtime validation — they are pure type-level assertions.

### Rules

- Any function that crosses a module boundary and accepts/returns an identifier must use the branded type.
- Inside a single module you may write `string` for brevity.
- Validation that a string is actually a UUID (or some other format) happens at the HTTP boundary via Zod. Once that succeeds, brand it once and stop re-checking.
- Do not introduce new branded types in `shared/` unless the identifier is genuinely cross-cutting. Per-module identifiers belong in the module's own types file.

`UserId` is in active use today: `UserRepository` returns it on every `UserDomain`, and `AuthController` brands `req.user.id` before passing it to service methods (`changePassword(UserId(user.id), ...)`). `ChatId`, `MessageId`, `SessionId` are reserved for the Phase 8 domain modules.

## 3. `Result<T, E>`

A discriminated union for functions that prefer returning rather than throwing.

- `type Result<T, E> = Ok<T> | Err<E>`.
- Constructors `ok(value)`, `err(error)`.
- Type guards `isOk(r)`, `isErr(r)`.
- `unwrap(r)` returns the success value or throws the error (the error is wrapped in `new Error(String(...))` if not already an `Error`).

### When to use it

- Pure functions that can fail in known, well-typed ways (e.g., parse helpers, lookup functions inside a service).
- Hot paths where throwing is undesirable.
- Anywhere the caller wants to compose multiple fallible steps without try/catch.

### When *not* to use it

- HTTP controllers — throw `AppError` subclasses instead so the filter shapes the response.
- Anywhere asynchrony is the dominant concern — prefer `async` + `try`/`catch` for clarity.
- Cross-module boundaries where the failure modes are already conveyed by `AppError` subclasses.

## 4. Express type augmentation (`shared/types/express.d.ts`)

Adds two optional fields to `express-serve-static-core.Request`:

- `correlationId?: string` — set by `CorrelationMiddleware`.
- `log?: Logger` — attached by `pino-http`.

Both are intentionally optional because:

- TypeScript's `strict` mode would otherwise treat them as always-defined, but middleware ordering means they are not guaranteed in every code path (e.g., unit-test mocks).
- Marking them optional forces consumers to handle the absence explicitly (`req.log?.error(...)` or `req.correlationId ?? 'unknown'`).

When introducing additional request augmentations (e.g., `req.user` for auth), add them to this declaration file — do not redeclare the `Request` interface elsewhere.

## 5. Conventions

- **No NestJS imports.** `shared/` must remain framework-free. Anything Nest-specific (decorators, modules, interceptors) belongs in `common/` or in a feature module.
- **No I/O.** Pure types, classes, and helpers only. No DB calls, no `fetch`, no logging.
- **Re-export via the barrel.** Add new error classes to `src/shared/errors/index.ts`. Other folders may add barrels if it helps but do not force one.

## 6. Tests

There are no tests dedicated to `shared/` today; the behaviour is exercised transitively by the exception-filter test (it constructs `NotFoundError` and a custom `AppError`) and the env test (covered separately in [config.md](config.md)).

If `Result` or branded ID helpers gain non-trivial logic, add focused unit tests under `src/shared/`.

## 7. Future evolution

- A `Domain` namespace for shared DTO types once Phase 8 introduces chats and messages.
- A clock abstraction (so timestamps are testable) added when scheduling-sensitive logic appears.
- A small `assert(condition, AppErrorSubclass, message)` helper if/when the same throw-on-falsy pattern repeats more than three times.
