# Module: Notifications

> Pure gating logic + `NotificationController` wiring + side-effect helpers (Notification API, Audio, canvas favicon). Subscribes to `eventBus.on('message:received')` emitted by [`chats.sync.ts`](../../src/features/chats/sync/chats.sync.ts).

**Status:** Phase 10 — complete.

## Files

```
frontend/src/features/notifications/
├── notification.service.ts            # shouldNotify (pure) + createNotificationService (subscribe)
├── components/NotificationPermissionBanner/
└── index.ts

frontend/src/app/notifications/
└── NotificationController.tsx         # wires settings + mute + chat cache + active chat into outputs

frontend/src/lib/notifications/
├── permission.ts                      # getNotificationPermission / requestNotificationPermission / showDesktopNotification
├── sound.ts                           # preloaded inline-WAV; playNotificationSound (silent on autoplay block)
└── favicon.ts                         # canvas 32x32 badge; throttled; restore original on count=0
```

## Pure gate

```ts
shouldNotify(payload, gates) → { desktop, sound, badge }
```

Decision tree (in order):

1. `fromSelf` → all false.
2. `globalMuted()` → all false.
3. `chatMuted(payload.chatId)` → all false.
4. `activeChatId() === payload.chatId && documentHasFocus()` → all false.
5. Otherwise:
   - `desktop = desktopEnabled() && permissionGranted()`
   - `sound  = soundEnabled()`
   - `badge  = faviconBadgeEnabled()`

Every branch unit-tested in [`notification.service.test.ts`](../../src/features/notifications/notification.service.test.ts).

## Controller wiring

`NotificationController` (mounted inside `AppProviders`, ABOVE the router) constructs gates from:

| Gate | Source |
|---|---|
| `desktopEnabled` / `soundEnabled` / `faviconBadgeEnabled` | `useSettingsStore.getState().settings.notifications.*` |
| `globalMuted` | `useGlobalMute()` (TanStack Query subscription) |
| `chatMuted(chatId)` | Lookup in chats cache via `qc.getQueriesData<ChatsCache>({ queryKey: ['chats'] })` |
| `activeChatId` | `useChatsUIStore.getState().activeChatId` |
| `documentHasFocus` | `document.hasFocus()` |
| `permissionGranted` | `getNotificationPermission() === 'granted'` |

Outputs:

- `showDesktop(payload)` → `showDesktopNotification(chatTitle, preview)`.
- `playSound()` → preloaded audio rewind + play.
- `bumpBadge()` → `setFaviconBadge(totalUnreadFromCache)`.

A second `useEffect` subscribes to `qc.getQueryCache().subscribe(...)` to keep the favicon in sync with every chat-cache mutation (read, mute toggle, new message arrival, etc.).

## Permission banner

`NotificationPermissionBanner` (in `DashboardLayout`) shows iff `desktopEnabled === true` AND `Notification.permission === 'default'` AND user hasn't dismissed it (`localStorage` key `notifications:banner-dismissed`). Calls `requestNotificationPermission()` on Allow.

## Sound

Tiny inline-WAV data URL preloaded into a single `Audio` element. `play()` rewinds on every call so consecutive notifications still ding. Browser autoplay-block failures swallowed.

## Favicon

Canvas-based circle + count text. Capped at `"99+"`. Throttled — only redraws when count differs from last drawn. Original href restored when count drops to 0.

## Tests

| File | Coverage |
|---|---|
| `notification.service.test.ts` | 8 `shouldNotify` branches + `createNotificationService` lifecycle (event-bus wire + teardown). |
| `favicon.test.ts` | data URL on count>0, restore on 0, throttle no-redraw. Canvas + toDataURL stubbed for jsdom. |

## References

- Architecture: [`FRONTEND_ARCHITECTURE.md`](../../../FRONTEND_ARCHITECTURE.md) §12.
- Implementation plan: [`FRONTEND_IMPLEMENTATION_PLAN.md`](../../../FRONTEND_IMPLEMENTATION_PLAN.md) Phase 10.
- Settings store: [`settings.md`](settings.md). Mute: [`mute.md`](mute.md). Chats sync emit: [`chats.md`](chats.md).
