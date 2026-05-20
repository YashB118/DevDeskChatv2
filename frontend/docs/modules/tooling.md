# Module: Tooling & Build

> The build, lint, type, test, and CI configuration. Not a feature module — described here so an AI editing config can understand the constraints these tools enforce on the rest of the codebase.

**Status:** Phase 3 — toolchain adds runtime deps for the HTTP + auth layer (axios, react-hook-form, `@hookform/resolvers`, mitt) and the MSW node server for integration tests. Remaining toolchain work: Chromatic + Playwright + Lighthouse (Phase 12), bundle-budget plugin (Phase 11).

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
| `frontend/index.html` | Vite HTML entry with strict CSP `<meta>` placeholder. Loads `/theme-bootstrap.js` synchronously in `<head>` before the module script. |
| `frontend/public/theme-bootstrap.js` | Sets `data-theme` + `data-theme-preference` on `<html>` before React mounts. Eliminates FOUC. Static script (no inline) so CSP `script-src 'self'` covers it; SHA-pinning deferred to Phase 11. |
| `frontend/.env.example` | Documents the required `VITE_*` keys. |
| `frontend/src/vite-env.d.ts` | Vite client types. |
| `frontend/src/tests/setup.ts` | Vitest setup — jest-dom + `vitest-axe` matchers, `matchMedia` jsdom stub, `cleanup()` afterEach. |
| `frontend/src/tests/mocks/server.ts` | MSW node `setupServer()` used by HTTP / auth integration tests. Test files call `listen() / resetHandlers() / close()` themselves. |
| `frontend/src/tests/vitest-axe.d.ts` | Augments Vitest's `Assertion` interface with the axe matchers. |
| `frontend/.storybook/main.ts` | Storybook config — stories glob, addons (`essentials`, `a11y`), `react-vite` framework, `docs.autodocs: 'tag'`. |
| `frontend/.storybook/preview.ts` | Storybook preview — imports global CSS, defines the theme toolbar global, applies `data-theme` per story. |
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
| `npm run storybook` | Storybook dev server on port 6006. |
| `npm run build-storybook` | Static Storybook export to `storybook-static/`. |

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

The ignore list explicitly excludes `dist`, `node_modules`, `coverage`, `.husky`, `.storybook`, `public`, and `storybook-static` — Storybook config and the theme bootstrap script live outside the typed project graph and are not lintable under the project-service parser.

## Vite configuration

- React plugin via `@vitejs/plugin-react`.
- Tailwind v4 plugin via `@tailwindcss/vite` — replaces the legacy `tailwind.config.ts` + PostCSS pipeline. Tailwind reads CSS variables exposed by `src/styles/tailwind.css` (which `@import`s the design-system theme files and binds them via `@theme`).
- `@/` alias → `src/`.
- `build.target: 'es2022'` matches the TS target.
- `sourcemap: true` for production debugging.
- Dev server on port 5173.

A bundle-budget plugin is referenced in Phase 1's plan but actually wired in Phase 11.

Current production bundle (post Phase 3): 487.11 KB JS / 143.02 KB gzipped — Phase 2's 387 KB plus axios + react-hook-form + zodResolver + mitt. Above the 250 KB target. Pulled under budget once admin code-splitting (Phase 4 router + Phase 9 admin chunk) lands.

## Vitest configuration

- `environment: 'jsdom'` — DOM globals available in tests.
- `globals: true` — describe/it/expect/vi available without imports.
- `setupFiles: ['./src/tests/setup.ts']` — registers jest-dom matchers, registers `vitest-axe` matchers via `expect.extend(axeMatchers)`, stubs `window.matchMedia` (jsdom does not implement it), runs `cleanup()` after each test.
- `test.env` block provides the `VITE_*` values that `lib/env.ts` requires for its eager parse.

`vitest-axe`'s shipped `extend-expect` entrypoint is empty in the installed version, so we register the matchers manually in `setup.ts`. Type augmentation lives in `src/tests/vitest-axe.d.ts` (declares the matcher methods on Vitest's `Assertion` interface).

### MSW conventions (Phase 3)

`src/tests/mocks/server.ts` exports a single `setupServer()` instance. Tests that need it own their lifecycle locally — `beforeAll(() => { server.listen({ onUnhandledRequest: 'error' }); })`, `afterEach(() => { server.resetHandlers(); /* + clear app singletons */ })`, `afterAll(() => { server.close(); })`. Unmocked requests fail the test loudly, which is what we want.

We did not move the lifecycle into the global `setup.ts` because most tests don't need MSW and starting/stopping the interceptor adds setup cost.

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

`index.html` ships a strict CSP `<meta>` that limits `default-src`, `script-src`, `connect-src`, `img-src`, `font-src` to `'self'` (with `data:` / `blob:` exceptions for images, fonts). The theme bootstrap is served as a static asset at `/theme-bootstrap.js` (not inline), so `script-src 'self'` covers it without further relaxation. `style-src` still permits `'unsafe-inline'` because Radix and Tailwind v4 inject runtime styles; Phase 11 tightens this further (nonce or hash-based) and adds SHA-pinning for any inline scripts that remain.

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

- **Bundle size**: Phase 1 floor was ~61 KB gzipped; post Phase 3 the production bundle is 487.11 KB raw / 143.02 KB gzipped — over the 250 KB initial-JS target from `FRONTEND_ARCHITECTURE.md §17`. Driven by Radix primitives, Framer Motion, `lucide-react`, and the Phase 3 HTTP/auth stack (axios, react-hook-form, zodResolver, mitt). Code-splitting in Phase 4 (router) and Phase 9 (admin chunk) pulls this under budget; budget assertion lands in Phase 11.
- **`eslint.config.ts` (TS) vs `eslint.config.js` (JS)**: Plan suggested a TS config file. We ship `.js` to avoid the jiti/native-TS loader friction in ESLint 9. Functionality is identical.
- **Bundle-budget Vite plugin**: Referenced in Phase 1 plan, actually implemented in Phase 11.
- **Husky pre-commit hook**: Config in `package.json` but the hook file is not committed; contributors enable it locally.
- **Tailwind config file**: Tailwind v4 reads CSS variables via `@theme` directly inside `src/styles/tailwind.css`. No `tailwind.config.ts` is needed — the file referenced in the Phase 1 folder shape never materialized, and isn't required by Tailwind v4.
- **`vitest-axe` extend-expect**: The package's shipped `extend-expect.js` is empty (upstream issue). We extend `expect` manually in `src/tests/setup.ts`.

## References

- Master context: [`../context.md`](../context.md).
- Architecture: [`FRONTEND_ARCHITECTURE.md`](../../../FRONTEND_ARCHITECTURE.md) §10.3 (TypeScript) and §15.1 (linting).
- Plan: [`FRONTEND_IMPLEMENTATION_PLAN.md`](../../../FRONTEND_IMPLEMENTATION_PLAN.md) Phase 1 + "Cross-cutting checklist".
