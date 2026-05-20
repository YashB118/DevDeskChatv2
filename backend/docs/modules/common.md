# Module — Common

> Cross-cutting infrastructure: middleware, exception filter, validation pipe, request-scoped decorators, auth guards. Anything that applies to many controllers but is not a domain concept lives here.

**Files**
- `src/common/middleware/correlation.middleware.ts`
- `src/common/filters/all-exceptions.filter.ts`
- `src/common/pipes/zod-validation.pipe.ts`
- `src/common/decorators/correlation-id.decorator.ts`
- `src/common/decorators/current-user.decorator.ts`
- `src/common/decorators/zod-body.decorator.ts`
- `src/common/decorators/public.decorator.ts`
- `src/common/decorators/roles.decorator.ts`
- `src/common/guards/jwt-auth.guard.ts`
- `src/common/guards/admin.guard.ts`

There is no `CommonModule` class — each piece is registered where it is used. The middleware is bound by `AppModule`, the filter by `main.ts`, the pipe by individual handlers, the guards via `@UseGuards(...)` on controllers / handlers, and the decorators are pure helper functions.

---

## 1. `CorrelationMiddleware`

### Purpose

Every request must have a stable, server-known correlation id that ties together the log lines for that request, the headers sent back to the client, and (in later phases) the propagation into queue jobs and external service calls.

### Behaviour

- Reads the incoming `X-Correlation-Id` header (constant exported as `CORRELATION_HEADER`).
- Validates the value against a UUID v4-ish regex (lowercase or uppercase). If the header is missing or malformed, generates a new id via `node:crypto`'s `randomUUID()`.
- Sets `req.correlationId` to the id.
- Sets the `X-Correlation-Id` response header to the same value so clients can echo it back on retries.
- If `req.log` exists (pino-http has run), replaces it with `req.log.child({ correlationId })` so every subsequent log emitted from this request automatically carries the id.

### Registration

`AppModule.configure(consumer)` calls `consumer.apply(CorrelationMiddleware).forRoutes('*')`. This binds it to every route, including future ones. Do not bind it on a feature-module basis — health probes and webhooks both need it.

### Conventions for editors

- Never read `X-Correlation-Id` directly elsewhere. Use `req.correlationId` or the `@CorrelationId()` parameter decorator.
- If you need a correlation id outside the HTTP layer (queue producer, scheduled job, WS gateway), accept one as input rather than generating one mid-flight.

---

## 2. `AllExceptionsFilter`

### Purpose

Single, opinionated converter from "anything thrown" → the canonical error envelope (`{ error: { code, message, correlationId, details? } }`). Guarantees no stack traces leak, no body shape variants, no duplicate log lines.

### Mapping table

| Thrown value | Resulting HTTP status | Resulting `code` |
| --- | --- | --- |
| Instance of `AppError` (or subclass) | `error.statusCode` | `error.code` (e.g. `NOT_FOUND`, `VALIDATION_ERROR`, `CONFLICT`, `EXTERNAL_SERVICE_ERROR`). |
| Instance of `ZodError` | `400` | `VALIDATION_ERROR`; `details.issues` contains each `{ path, message, code }`. |
| Instance of `HttpException` (`@nestjs/common`) | `exception.getStatus()` | Derived from status: `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `UNPROCESSABLE_ENTITY`, `RATE_LIMITED`, otherwise `HTTP_ERROR`/`INTERNAL_ERROR`. |
| Anything else | `500` | `INTERNAL_ERROR`. |

`message` for `HttpException`s uses the response body's `message` if Nest produced one, otherwise the exception's own `message`. For unknown errors the response message is the generic `"Internal server error"` — the actual cause is logged server-side only.

### Logging side-effects

- 5xx responses log at `error` level. If `req.log` exists, the call is structured (`{ err, code }`); otherwise the filter falls back to NestJS's classic `Logger` (only the stack of an `Error` is forwarded — never the full cause object).
- 4xx responses log at `warn` level with `{ code, statusCode }`. The request body and details are not duplicated because the route handler is expected to have logged anything noteworthy already.
- The filter never re-throws.

### Registration

`main.ts` is the **only** place this filter is registered (`app.useGlobalFilters(new AllExceptionsFilter())`). Tests that boot a NestApplication via `@nestjs/testing` must register it explicitly — the e2e suite under `test/` does this.

### Editing checklist

- New error subclasses must extend `AppError` (see `shared.md`); they will be picked up automatically.
- Do not add new fields to the envelope without updating the contract in `context.md` section 6 and the test suite.
- Never include `cause`, `stack`, or raw upstream payloads in `details`.

---

## 3. `ZodValidationPipe`

### Purpose

Validate any single request parameter (typically the body) against a Zod schema, returning the parsed value (with coercions and defaults applied) or throwing `ValidationError`.

### Behaviour

- Constructor takes a Zod schema (`ZodSchema<unknown>` or `ZodSchema<TInferred>`).
- On `transform()`: runs `safeParse`. On success, returns `result.data`. On failure, throws `ValidationError` with `details.issues` mapped from `result.error.issues` (`path`, `message`, `code`).
- Argument metadata is ignored — the pipe is parameter-agnostic.

### Usage

Two equivalent styles:

- Inline: `@Body(new ZodValidationPipe(LoginSchema)) input: z.infer<typeof LoginSchema>`.
- Helper: `@ZodBody(LoginSchema) input: z.infer<typeof LoginSchema>` (see decorators below).

The schema and the inferred type live in the same `.schema.ts` file. The controller imports both.

### Why not a global pipe

The pipe is intentionally **not** registered globally. Each handler declares the schema it accepts; reviewers can audit validation by reading the controller. A global pipe would force a convention on every parameter and risk silently transforming values.

---

## 4. Decorators

### 4.1 `@CorrelationId()`

Parameter decorator that returns `req.correlationId` (typed `string | undefined` to match the optional property in `express.d.ts`). Use this in handlers that want to embed the id in a response body or pass it to a downstream service.

### 4.2 `@CurrentUser()`

Parameter decorator returning `req.user` typed as `AuthenticatedUser | undefined`. `JwtAuthGuard` (§5) is what actually populates `req.user`; without the guard the decorator returns `undefined`.

`AuthenticatedUser` is re-exported from `auth.types.ts` as `AuthenticatedRequestUser`: `{ id: string; email: string; role: UserRole }`. `UserRole` lives in `@app/modules/users/user.types` (`ADMIN | DEVELOPER`).

### 4.3 `@ZodBody(schema)`

Shorthand for `@Body(new ZodValidationPipe(schema))`. Returns a `ParameterDecorator`. Accepts `ZodSchema<unknown>` — the inferred type of the parameter is the responsibility of the call site, which writes `: z.infer<typeof Schema>`.

### 4.4 `@Public()`

Class- or method-level decorator that sets `auth:is-public = true` on the route's metadata. `JwtAuthGuard` short-circuits and returns `true` when it sees this marker. Use it on login, refresh, and any future public webhook handler. Do **not** apply it to anything that mutates user state.

### 4.5 `@Roles(...roles)`

Class- or method-level decorator that sets `auth:required-roles = roles[]` on the route's metadata. Consumed by `AdminGuard` (§6) to narrow which roles may invoke a handler. Default behaviour (no `@Roles`) is admin-only.

---

## 5. `JwtAuthGuard`

### Purpose

Per-controller (or per-handler) gate that decodes and verifies the access token, populates `req.user`, and short-circuits when the route opts out via `@Public()`.

### Behaviour

- Reflects `auth:is-public` metadata (`@Public()`). If present, returns `true` immediately.
- Reads the `Authorization` header (case-insensitive). Splits on whitespace; requires `Bearer <token>`. Anything else throws `UnauthorizedError('Missing access token')` (HTTP 401, code `UNAUTHORIZED`).
- Calls `jwt.verifyAsync<JwtPayload>(token, { algorithms: ['RS256'], issuer, audience, publicKey })`. Any verification failure throws `UnauthorizedError('Invalid access token')` — the underlying reason (expired, bad signature, unknown issuer) is intentionally not surfaced to the client.
- On success, sets `req.user = { id: payload.sub, email: payload.email, role: payload.role }`.

### Wiring

`AuthModule` re-exports `JwtModule`. Any controller that wants protected routes imports `AuthModule` (or relies on the global instance via DI) and uses `@UseGuards(JwtAuthGuard)`. The guard is not registered globally — protection is opt-in per controller, opt-out via `@Public()`.

### Editing rules

- Do not add new ways to extract a token (e.g. query string, cookie). The contract is `Authorization: Bearer ...`; the refresh cookie is read directly by `AuthController.refresh` and never by the guard.
- Do not log the token. The guard intentionally throws a generic message.
- If a future module needs a different audience (e.g. service-to-service), build a separate guard rather than parameterising this one.

## 6. `AdminGuard`

### Purpose

Role check that runs after `JwtAuthGuard`. Rejects requests whose `req.user.role` is not in the required set.

### Behaviour

- Reads `req.user`. If missing (e.g. the controller forgot `JwtAuthGuard`), throws `UnauthorizedError`.
- Reads `auth:required-roles` metadata (`@Roles(...)`); defaults to `[UserRole.ADMIN]` when absent.
- If the user's role is not in the set, throws `ForbiddenError('Admin role required')` (HTTP 403, code `FORBIDDEN`).
- Returns `true` on success.

### Wiring

Apply with `@UseGuards(JwtAuthGuard, AdminGuard)` so the JWT check populates `req.user` first. Combine with `@Roles(UserRole.DEVELOPER)` to expose a route to developers as well as admins, or with `@Roles()` only to lock to a non-default set.

## 7. Tests

- `src/common/middleware/correlation.middleware.spec.ts` — reuse vs generate, malformed header handling.
- `src/common/filters/all-exceptions.filter.spec.ts` — covers each branch of the mapping table, asserts no stack leaks in the body, asserts custom `AppError` codes pass through unchanged.
- `src/common/guards/jwt-auth.guard.spec.ts` — public bypass, missing bearer, verify failure, valid token populates `req.user`.
- `src/common/guards/admin.guard.spec.ts` — admin allowed, developer forbidden by default, `@Roles` override path.

Add new unit tests when adding new branches or decorators. Behavioural changes to the filter, middleware, or guards must come with a regression test.

## 8. Common editing mistakes

- **Throwing `new Error(...)` from a controller.** Use an `AppError` subclass; the generic fallback produces a 500.
- **Returning a custom error shape from a controller.** Don't — let the filter own the envelope.
- **Using `class-validator`.** The codebase standardises on Zod. Don't introduce decorators-based DTOs.
- **Mutating `req.correlationId`.** It is set once and read everywhere after.
- **Adding a global pipe.** See section 3 above.
- **Registering `JwtAuthGuard` globally.** Auth is opt-in per controller with `@UseGuards` and opt-out via `@Public()`. A global guard would make `@Public()` the load-bearing decorator and obscure the protection model.
- **Reading `Authorization` outside the guard.** Controllers should `@CurrentUser()` instead.

## 9. Future evolution

- A `RequestContextInterceptor` (Phase 10) that opens an AsyncLocalStorage scope so non-HTTP code (queue handlers, gateway events) can still reach the correlation id without explicit threading.
- A WebSocket equivalent of the validation pipe (Phase 4) and a `WsAuthGuard` that reuses `JwtService`.
- A rate-limit guard factory (Phase 11) that lives next to the auth guards.
