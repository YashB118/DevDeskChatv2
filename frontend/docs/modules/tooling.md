# Module: Tooling & Build

> The build, lint, type, test, and CI configuration. Not a feature module — described here so an AI editing config can understand the constraints these tools enforce on the rest of the codebase.

**Status:** Phase 1 — full toolchain in place. Subsequent phases add Tailwind (Phase 2), Storybook (Phase 2), Chromatic + Playwright + Lighthouse (Phase 12), and a bundle-budget plugin (Phase 11).

---

## Files

| Path | Role |
|---|---|
| `frontend/package.json` | Dependencies, scripts, `lint-staged` config. |
| `frontend/tsconfig.json` | TypeScript strict configuration with the architecture's required flags. |
| `frontend/vite.config.ts` | Vite dev server + production build + `@/` path alias. |
| `frontend/vitest.config.ts` | Vitest test runner config with jsdom env and test-environment `VITE_*` defaults. |
| `frontend/eslint.config.js` | Flat-config ESLint with typescript-eslint strict-type-checked, react-hooks, jsx-a11y, boundaries. |
| `frontend/.prettierrc.json` | Prettier formatting rules. |
| `frontend/index.html` | Vite HTML entry with strict CSP `<meta>` placeholder. |
| `frontend/.env.example` | Documents the required `VITE_*` keys. |
| `frontend/src/vite-env.d.ts` | Vite client types. |
| `.github/workflows/frontend.yml` | CI pipeline (repo root). |

## npm scripts

| Script | Behavior |
|---|---|
| `npm run dev` | Vite dev server on port 5173. |
| `npm run build` | `tsc --noEmit` then `vite build`. Both must succeed. |
| `npm run preview` | Serve the `dist/` output for local smoke testing. |
| `npm run lint` | ESLint across `frontend/**`. Fails on any error. |
| `npm run typecheck` | `tsc --noEmit`. No emit, just type validation. |
| `npm test` | `vitest run` (one-shot). |
| `npm run test:watch` | `vitest` (watch mode). |

CI runs lint, typecheck, test, build in that order on every PR touching `frontend/**`.

## TypeScript flags (load-bearing)

The strict configuration is non-negotiable and matches `FRONTEND_ARCHITECTURE.md §10.3`:

- `strict: true`
- `noUncheckedIndexedAccess: true` — array/object index access returns `T | undefined`; forces explicit handling.
- `exactOptionalPropertyTypes: true` — `{ x?: number }` is `number | undefined`, not `number | undefined | (missing)`; prevents accidental `undefined` reads.
- `useUnknownInCatchVariables: true` — `catch (e)` types `e` as `unknown`.
- `noFallthroughCasesInSwitch: true`
- `noImplicitOverride: true`
- `isolatedModules: true` — every file must be independently transpilable.
- `verbatimModuleSyntax: true` — `import type` is required for type-only imports; mixing values and types in one `import` is rejected.
- `moduleResolution: 'bundler'` — Vite-native resolution.
- `noUnusedLocals` / `noUnusedParameters` — leading underscore (`_foo`) silences these for intentional discards.

Path alias `@/*` resolves to `src/*` (configured in both `tsconfig.json` `paths` and `vite.config.ts` `resolve.alias`). The two must stay synchronized.

## ESLint enforcement (load-bearing)

The flat config layers:

1. `@eslint/js` recommended.
2. `typescript-eslint` strict-type-checked + stylistic-type-checked — enables type-aware rules. Requires `parserOptions.projectService: true`.
3. `eslint-plugin-react-hooks` recommended.
4. `eslint-plugin-jsx-a11y` recommended.
5. `eslint-plugin-boundaries` — enforces the import topology described in [`../context.md`](../context.md) §5.

Per-file overrides:
- Test files (`**/*.test.ts(x)`, `src/tests/**`) relax `no-explicit-any` and `no-non-null-assertion`.
- `vite.config.ts`, `vitest.config.ts` relax `no-unsafe-assignment` for plugin types.
- `eslint.config.js` itself uses `tseslint.configs.disableTypeChecked` because the config file lives outside the typed project graph.

Boundaries plugin classifies files by `boundaries/elements` patterns; rules in `boundaries/element-types` and `boundaries/entry-point` enforce allowed dependencies and the "cross-feature only via `index.ts`" rule.

`eslint-import-resolver-typescript` is required so the resolver understands `@/*` and `.ts(x)` extensions.

## Vite configuration

- React plugin via `@vitejs/plugin-react`.
- `@/` alias → `src/`.
- `build.target: 'es2022'` matches the TS target.
- `sourcemap: true` for production debugging.
- Dev server on port 5173.

A bundle-budget plugin is referenced in Phase 1's plan but actually wired in Phase 11.

## Vitest configuration

- `environment: 'jsdom'` — DOM globals available in tests.
- `globals: true` — describe/it/expect/vi available without imports.
- `setupFiles: ['./src/tests/setup.ts']` — global setup imports jest-dom matchers and runs `cleanup()` after each test.
- `test.env` block provides the `VITE_*` values that `lib/env.ts` requires for its eager parse.

The Vitest config and Vite config are separate files because Vitest 3 ships its own internal Vite types and merging the two in one file causes type conflicts with `exactOptionalPropertyTypes: true`.

## CI pipeline (`.github/workflows/frontend.yml`)

Triggers on push to `main` and on PRs that touch `frontend/**` or the workflow file itself.

Steps (all in `working-directory: frontend`):
1. Checkout
2. Setup Node 22 with npm cache keyed off `frontend/package-lock.json`
3. `npm ci`
4. `npm run lint`
5. `npm run typecheck`
6. `npm test`
7. `npm run build` (with required `VITE_*` env values inlined into the step)

Build env values in CI are placeholders for type-checking purposes; production deploys must supply real values.

## Husky / lint-staged

`lint-staged` config exists in `package.json`:
- `*.{ts,tsx}` → `eslint --fix` then `prettier --write`.
- `*.{json,md,css}` → `prettier --write`.

The Husky pre-commit hook file is not committed yet. To enable hooks locally, run `npx husky init` from the `frontend/` directory and add a `pre-commit` hook that invokes `npx lint-staged`.

## CSP

`index.html` ships a strict CSP `<meta>` that limits `default-src`, `script-src`, `connect-src`, `img-src`, `font-src` to `'self'` (with `data:` / `blob:` exceptions for images, fonts). `style-src` permits `'unsafe-inline'` only as a Phase 1 placeholder; Phase 11 tightens this with SHA-pinned inline scripts and removes the unsafe-inline allowance once the theme bootstrap script is in.

## How to extend

| Need | What to change |
|---|---|
| Add a runtime dependency | `npm install <pkg>`. If it's used in features, add it to `dependencies`; if dev-only, `--save-dev`. |
| Add a lint rule | Add a rule to the appropriate config block in `eslint.config.js`. Document the rationale in the file. |
| Add a TS path alias | Update `tsconfig.json` `paths` AND `vite.config.ts` `resolve.alias`. They must agree. |
| Add a new env var | See [`env.md`](env.md). |
| Add a new test setup step | Append to `src/tests/setup.ts`. Avoid polluting global state across tests. |
| Tighten CSP | Phase 11. Don't loosen it. |
| Add a CI step | Add a step to `.github/workflows/frontend.yml`. Keep `working-directory: frontend`. |

## Known deviations from the architecture doc

- **Bundle size**: Phase 1's plan target was "<50 KB gzipped." Current production build is ~61 KB gzipped, which is the floor of React 19 + ReactDOM. Documented; no action.
- **`eslint.config.ts` (TS) vs `eslint.config.js` (JS)**: Plan suggested a TS config file. We ship `.js` to avoid the jiti/native-TS loader friction in ESLint 9. Functionality is identical.
- **Bundle-budget Vite plugin**: Referenced in Phase 1 plan, actually implemented in Phase 11.
- **Husky pre-commit hook**: Config in `package.json` but the hook file is not committed; contributors enable it locally.

## References

- Master context: [`../context.md`](../context.md).
- Architecture: [`FRONTEND_ARCHITECTURE.md`](../../../FRONTEND_ARCHITECTURE.md) §10.3 (TypeScript) and §15.1 (linting).
- Plan: [`FRONTEND_IMPLEMENTATION_PLAN.md`](../../../FRONTEND_IMPLEMENTATION_PLAN.md) Phase 1 + "Cross-cutting checklist".
