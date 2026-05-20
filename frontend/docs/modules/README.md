# Module Index

Per-module context files. Add a new file here only when actual code for that module lands — empty stub folders do not get docs (progressive build rule).

## Built modules (after Phase 2)

| Module | Doc | Source |
|---|---|---|
| App Shell — boot orchestration, providers, error boundary, dev styleguide route | [`app-shell.md`](app-shell.md) | `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/app/` |
| Environment Configuration | [`env.md`](env.md) | `frontend/src/lib/env.ts` |
| Branded ID Types | [`shared-ids.md`](shared-ids.md) | `frontend/src/shared/types/ids.ts` |
| Design System — tokens, theme, motion, primitives, compounds, icons | [`design-system.md`](design-system.md) | `frontend/src/design-system/`, `frontend/src/styles/`, `frontend/public/theme-bootstrap.js`, `frontend/src/shared/utils/cn.ts`, `frontend/.storybook/` |
| Tooling & Build | [`tooling.md`](tooling.md) | `frontend/package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `.storybook/`, `.github/workflows/frontend.yml` |

## Not yet built

The following modules have empty stub folders but no implementation. Docs land when the implementation does.

- `features/auth` (Phase 3)
- `app/router` + guards (Phase 4)
- `realtime` (Phase 5)
- `lib/http`, `lib/storage` (Phase 3, 6)
- TanStack Query / Zustand state foundation (Phase 6)
- `features/chats` (Phase 7)
- `features/messages` (Phase 8)
- `features/sessions`, `features/assignments`, `features/admin`, `features/feedback`, `features/mute` (Phase 9)
- `features/notifications`, `features/settings` (Phase 10)
- Observability (`lib/observability`) (Phase 11)

See [`../context.md`](../context.md) §10 for the full phase status table.
