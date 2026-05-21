# Module: Settings

> Cross-feature user preferences. Store lives in `shared/state/` (not `features/`) so notifications + UI both read without crossing boundaries.

**Status:** Phase 10 — complete.

## Files

```
frontend/src/shared/state/
├── settings.ts                  # useSettingsStore (Zustand) + Zod-guarded localStorage persistence
└── settings.types.ts            # SettingsSchema + DEFAULT_SETTINGS

frontend/src/features/settings/
├── components/SettingsScreen/   # theme select + 3 notification switches + language + Preview button
└── index.ts
```

## Schema

```ts
Settings = {
  notifications: { desktopEnabled: boolean; soundEnabled: boolean; faviconBadgeEnabled: boolean };
  language: string;
}
```

Defaults: `desktopEnabled: false`, `soundEnabled: true`, `faviconBadgeEnabled: true`, `language: 'en'`.

## Store API

```ts
useSettingsStore((s) => s.settings)
useSettingsStore.getState().setNotifications({ desktopEnabled: true })
useSettingsStore.getState().setLanguage('en')
useSettingsStore.getState().reset()
```

Persistence: `localStorage['settings:v1']` w/ Zod read-guard; corrupt blob is removed on read + defaults returned. No `lib/storage/localStorage` import because `shared/` cannot import from `lib/` per boundaries policy — inlined `window.localStorage` access w/ try/catch.

## `SettingsScreen`

Sections:

- **Appearance** — theme `<select>` bound to `useTheme().setPreference`.
- **Notifications** — three Switches (desktop / sound / favicon badge) + Preview button for sound.
- **Language** — single-option `<select>` placeholder.

Enabling desktop notifications auto-triggers `requestNotificationPermission()` if current state is `'default'` — single round-trip, no second click.

Mounted in [`SettingsPage`](../../src/app/router/pages/SettingsPage.tsx) above the existing `PasswordChangeForm`.

## Tests

| File | Coverage |
|---|---|
| `shared/state/settings.test.ts` | Persist notifications patch, reset returns defaults, corrupt-blob fallback. |

## References

- Implementation plan: [`FRONTEND_IMPLEMENTATION_PLAN.md`](../../../FRONTEND_IMPLEMENTATION_PLAN.md) Phase 10.
- Notifications consumer: [`notifications.md`](notifications.md).
