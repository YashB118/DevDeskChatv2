# Module: Environment Configuration (`lib/env`)

> Single typed entry point for every `VITE_*` env variable. Validates at module load with Zod and throws on misconfiguration, so the rest of the codebase can rely on a frozen, fully-typed `env` object.

**Status:** Phase 1 — schema covers the variables needed through Phase 11. Add new keys to the schema as features need them.

---

## Purpose

Frontends fail silently when env vars are misnamed, missing, or malformed — the bug surfaces deep in a feature where the var is read for the first time. This module flips that: misconfiguration crashes the app at startup with a precise, multi-line error listing every issue. No feature ever reads `import.meta.env.VITE_*` directly; everything goes through the typed `env` export.

## File

| Path | Role |
|---|---|
| `frontend/src/lib/env.ts` | Defines the Zod schema, parses `import.meta.env`, exports `env: Env` and `parseEnv(source)` for tests. |

## Variables in the schema (Phase 1)

| Key | Type | Required | Default | Used by |
|---|---|---|---|---|
| `VITE_API_BASE_URL` | URL | Yes | — | ✅ Phase 3 — read by `lib/http/client.ts` as the axios `baseURL`. |
| `VITE_SOCKET_URL` | URL | Yes | — | ✅ Phase 5 — read by `realtime/socket.ts` (`io(env.VITE_SOCKET_URL, ...)`). |
| `VITE_APP_ENV` | `'development' \| 'staging' \| 'production'` | No | `'development'` | Logging, Sentry env tag (Phase 11) |
| `VITE_SENTRY_DSN` | string | No | `''` | Sentry init (Phase 11). Empty string disables Sentry. |

When a new feature needs an env var:
1. Add the key to the Zod schema.
2. Add it to `.env.example` with a representative value.
3. Add it to the CI workflow's build step env block if the production build requires it.
4. Document it in the table above.

## Behavior

- `env.ts` evaluates immediately on import. The eager parse is intentional — Phase 1's validation strategy specifies "failures throw at module load." This means any module that transitively imports `env` will fail fast in misconfigured environments.
- A failed parse throws a single `Error` whose message lists every Zod issue as `  - <path>: <message>`. This is what surfaces in the browser console and in test output.
- `parseEnv(source)` is exported separately so tests can exercise the validator with synthetic inputs without triggering the eager parse path.
- The default for `VITE_APP_ENV` is `'development'`; production deployments must explicitly set it to `'production'` for Sentry environment tagging to be correct.

## Vitest interaction

Vitest evaluates ES modules eagerly, which means the eager `parseEnv(import.meta.env)` at module bottom runs whenever any test imports anything from `env.ts`. The test environment provides the required `VITE_*` values via `vitest.config.ts`'s `test.env` block. If a contributor adds a new required env key to the schema, they **must** also add it to that block — otherwise unrelated tests will fail with an env validation error.

The CI workflow's build step also sets these variables explicitly because `vite build` re-evaluates them at build time.

## How to consume `env` in feature code

Import the `env` constant. Treat its properties as fully-typed, non-optional (except the explicitly optional ones above). Never read `import.meta.env.VITE_*` directly — the boundaries rule does not enforce this yet, but code review will reject it.

## Error mode example

A misconfigured deploy without `VITE_API_BASE_URL` produces output similar to:

```
Invalid frontend env config:
  - VITE_API_BASE_URL: Required
  - VITE_SOCKET_URL: Required
```

The error surfaces immediately on app boot — the app cannot render past this point.

## Testing

`src/lib/env.test.ts` covers three scenarios:
1. A fully-valid env parses and produces the expected typed object.
2. An empty input rejects with the "Invalid frontend env config" prefix.
3. Malformed URL values reject with the same prefix.

When adding a new env key, add at least one test that exercises its validation rule (required vs. optional, format constraint, default value).

## Conventions

- Schema lives at the top of the file; types derive from the schema via `z.infer`.
- The eager-parse line is the last statement in the module.
- `parseEnv` accepts `Record<string, unknown>` and returns the strongly-typed `Env` shape on success.
- New keys must follow the `VITE_` prefix (Vite's contract for client-exposed env vars).

## References

- Schema entries match the env table in [`FRONTEND_ARCHITECTURE.md`](../../../FRONTEND_ARCHITECTURE.md) (HTTP client + observability sections).
- Implementation phase: [`FRONTEND_IMPLEMENTATION_PLAN.md`](../../../FRONTEND_IMPLEMENTATION_PLAN.md) Phase 1 validation strategy.
- Master context: [`../context.md`](../context.md).
