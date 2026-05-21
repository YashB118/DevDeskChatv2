# Frontend Architecture

> Production-grade reference architecture for the DevChatDesk frontend. This document defines the boot sequence, state model, real-time sync engine, design system, and engineering standards. The goal is a WhatsApp-class real-time UI — premium, predictable, and built for scale.
>
> **Code alignment.** Phases 1–8 from `FRONTEND_IMPLEMENTATION_PLAN.md` are merged; sections describing observability (§13), notifications (§12), and the offline service worker (§11) are forward-looking targets for Phases 10–11. Where the merged code diverged from the original spec, this document has been updated in place (e.g. §3 folder structure, §4 boot diagram, §5.1 query keys, §6.2 SyncController). The deferred sections are clearly tagged below.

---

## 1. Architectural Philosophy

The frontend is a single-page React application that, after authentication, behaves like a long-lived realtime client: one persistent WebSocket connection feeds an in-memory store that the UI subscribes to. HTTP is used only to hydrate the initial state and to handle commands (send message, assign chat, etc.). Polling is forbidden by design.

**Six non-negotiable principles**

1. **One socket, many tabs (logically).** A single Socket.IO connection is established at the application root — above the router — and survives every route change. Every realtime event flows through it.
2. **Hydrate once, sync forever.** Each domain (chats, messages, sessions, assignments) is fetched exactly once on entry. After that, the cache is mutated only by socket events and user commands. No refetch-on-focus, no interval polling.
3. **Channel ID is the universal addressing key.** Whether routing a socket event, updating a query cache, or scoping a Zustand slice, `chatId` (always LID-format) is the canonical key. The same value identifies the room on the server and the cache key on the client.
4. **Optimistic by default, reconciled on confirmation.** Sends, edits, deletes, and reactions all update the cache before the server confirms. The reconciliation layer matches confirmations and resolves divergence deterministically.
5. **Strictly typed end to end.** Zod schemas at the network boundary, branded ID types throughout, no `any`, no implicit `unknown` leaking into render paths.
6. **Composition over inheritance, features over folders.** The codebase is feature-modular. Cross-feature reuse goes through the design system or shared services, never through deep relative imports.

---

## 2. Technology Stack

| Concern | Choice | Rationale |
|---|---|---|
| Framework | React 19 | Concurrent rendering, transitions, `use` for promises |
| Build | Vite 6 | Instant HMR, native ESM, Rollup output |
| Language | TypeScript (strict) | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` |
| Routing | React Router 7 | Data routers, nested loaders, type-safe links |
| Server state | TanStack Query v5 | Cache, mutations, suspense, infinite queries |
| Client state | Zustand + Immer | Slice-based, devtools-friendly, no provider hell |
| Real-time | Socket.IO client | Matches backend, automatic reconnect, room semantics |
| Validation | Zod | Shared schemas with backend |
| Styling | Tailwind v4 + CSS variables | Design tokens, zero-runtime, theme-able |
| Components | Radix UI + CVA | Accessible primitives, variant-driven |
| Animation | Framer Motion + tailored CSS | Spring physics for gestures, CSS for micro |
| Virtualization | react-virtuoso | Sustained 60fps for large message and chat lists |
| Persistence | IndexedDB via Dexie | Offline cache and resume-after-reload |
| Forms | React Hook Form + Zod resolver | Performant, typed |
| Testing | Vitest + React Testing Library + Playwright | Unit, component, E2E |

---

## 3. Folder Structure

Feature-modular, with shared infrastructure separated from feature code. Cross-feature access only through `shared/` or each feature's `index.ts` public API.

```
frontend/
├── src/
│   ├── main.tsx                       # Entry: render <App />
│   ├── App.tsx                        # Boot orchestrator (see §4)
│   │
│   ├── app/
│   │   ├── providers/
│   │   │   ├── AppProviders.tsx       # Composes all root providers
│   │   │   └── QueryProvider.tsx
│   │   │   # ThemeProvider lives in design-system/theme;
│   │   │   # AuthProvider lives in features/auth/components;
│   │   │   # SocketProvider + SyncController live in realtime/.
│   │   ├── router/
│   │   │   ├── AppRouter.tsx
│   │   │   ├── routes.ts              # Typed route table
│   │   │   ├── RouteErrorBoundary.tsx
│   │   │   ├── guards/
│   │   │   │   ├── ProtectedRoute.tsx
│   │   │   │   ├── AdminRoute.tsx
│   │   │   │   ├── PublicRoute.tsx
│   │   │   │   └── RootRedirect.tsx
│   │   │   ├── layouts/{DashboardLayout,AdminLayout}.tsx
│   │   │   ├── pages/                 # Route-level pages (admin sub-tree code-split)
│   │   │   ├── hooks/useChatIdParam.ts
│   │   │   └── lazyRoutes.ts          # Typed loader for the admin chunk
│   │   ├── sync/
│   │   │   └── featureSync.ts         # Registers every feature's sync handler once at boot
│   │   ├── errors/
│   │   │   └── AppErrorBoundary.tsx
│   │   └── ui/BootGate.tsx
│   │
│   ├── features/
│   │   ├── auth/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   ├── api/
│   │   │   ├── store/
│   │   │   ├── types.ts
│   │   │   └── index.ts               # Public API
│   │   ├── chats/
│   │   │   ├── components/
│   │   │   │   ├── ChatList/
│   │   │   │   ├── ChatListItem/
│   │   │   │   ├── ChatFilters/
│   │   │   │   └── ChatContextMenu/
│   │   │   ├── hooks/
│   │   │   │   ├── useChatList.ts
│   │   │   │   ├── useChatPresence.ts
│   │   │   │   └── useChatActions.ts
│   │   │   ├── api/chats.api.ts
│   │   │   ├── store/chats.store.ts
│   │   │   ├── sync/chats.sync.ts     # Socket → cache bridge
│   │   │   ├── types.ts
│   │   │   └── index.ts
│   │   ├── messages/
│   │   │   ├── components/
│   │   │   │   ├── MessageList/
│   │   │   │   ├── MessageBubble/
│   │   │   │   ├── MessageComposer/
│   │   │   │   ├── MessageReactions/
│   │   │   │   ├── MessageQuotedPreview/
│   │   │   │   └── MessageSearch/
│   │   │   ├── hooks/
│   │   │   │   ├── useMessages.ts
│   │   │   │   └── useMessageMutations.ts
│   │   │   ├── api/messages.api.ts
│   │   │   ├── store/messages.store.ts
│   │   │   ├── sync/messages.sync.ts
│   │   │   ├── optimistic/index.ts    # Pure helpers (send/edit/delete/react + reconcile)
│   │   │   ├── types.ts
│   │   │   └── index.ts
│   │   ├── sessions/
│   │   ├── assignments/
│   │   ├── notifications/
│   │   ├── mute/
│   │   ├── feedback/
│   │   ├── admin/
│   │   └── settings/
│   │
│   ├── realtime/
│   │   ├── socket.ts                  # Singleton Socket.IO client
│   │   ├── SocketContext.tsx
│   │   ├── useSocket.ts
│   │   ├── useSocketEvent.ts          # Typed event subscription hook
│   │   ├── eventBus.ts                # Cross-feature event router (mitt-backed)
│   │   ├── reconnect.ts               # Manager backoff config (cap 30s)
│   │   ├── connectionStatusStore.ts   # Zustand: idle|connecting|connected|reconnecting|offline
│   │   ├── ConnectionBanner.tsx       # Renders status when ≠ connected
│   │   ├── sync.controller.ts         # Invokes registered handlers w/ (socket, queryClient)
│   │   └── events.contract.ts         # Zod-mirrored types from backend
│   │
│   ├── design-system/
│   │   ├── tokens/
│   │   │   ├── colors.ts
│   │   │   ├── typography.ts
│   │   │   ├── spacing.ts
│   │   │   ├── radius.ts
│   │   │   ├── motion.ts              # Easings, durations, springs
│   │   │   └── themes/
│   │   │       ├── light.css
│   │   │       ├── dark.css
│   │   │       └── highContrast.css
│   │   ├── primitives/                # Button, Input, Dialog, etc.
│   │   ├── compounds/                 # Avatar, Tag, EmptyState, etc.
│   │   ├── motion/
│   │   │   ├── variants.ts            # Reusable Framer variants
│   │   │   ├── transitions.ts
│   │   │   └── usePrefersReducedMotion.ts
│   │   └── icons/
│   │
│   ├── lib/
│   │   ├── http/
│   │   │   ├── client.ts              # Axios instance + interceptors
│   │   │   ├── errors.ts
│   │   │   └── retry.ts               # Single-flight refresh queue
│   │   ├── storage/
│   │   │   ├── memory.ts              # Access token in memory only
│   │   │   ├── localStorage.ts        # User prefs only (Zod-guarded)
│   │   │   ├── indexedDB.ts           # Dexie schemas + degrade-to-memory
│   │   │   └── persistence.service.ts # readSnapshot/writeSnapshot/clearAll + mediaBlobs LRU
│   │   ├── query/
│   │   │   └── usePersistentQuery.ts  # useQuery wrapper: IndexedDB hydrate + writeback
│   │   ├── data/
│   │   │   └── useDirectory.ts        # /api/users read keyed by keys.users() (cross-feature consumer)
│   │   ├── notifications/
│   │   │   ├── permission.ts          # getNotificationPermission / showDesktopNotification
│   │   │   ├── sound.ts               # preloaded Audio
│   │   │   └── favicon.ts             # canvas unread badge (throttled)
│   │   ├── offline/
│   │   │   ├── connectivity.ts        # Zustand store + subscribeConnectivity + bindConnectivityListeners
│   │   │   ├── sendQueue.ts           # FIFO + flush on online
│   │   │   └── OfflineBanner.tsx      # status-aware banner
│   │   ├── time/                      # (placeholder)
│   │   ├── format/                    # (placeholder)
│   │   └── env.ts                     # Zod-parsed VITE_* env
│   │
│   ├── shared/
│   │   ├── types/
│   │   │   └── ids.ts                 # Branded ID types
│   │   ├── state/
│   │   │   ├── queryKeys.ts           # Central as-const query key factory
│   │   │   ├── currentUser.ts         # Cross-feature {id, displayName} accessor
│   │   │   ├── settings.ts            # User preferences (notifications, language) — Zustand + Zod localStorage
│   │   │   └── settings.types.ts
│   │   ├── hooks/
│   │   ├── utils/
│   │   └── constants/
│   │
│   ├── styles/
│   │   ├── globals.css
│   │   ├── reset.css
│   │   └── tailwind.css
│   │
│   └── tests/
│       ├── setup.ts
│       ├── mocks/
│       └── e2e/
│
├── public/
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
└── package.json
```

**Import rules** (enforced by `eslint-plugin-boundaries`):

- A feature may import from `design-system`, `lib`, `shared`, `realtime`.
- A feature may NOT import from another feature except through that feature's `index.ts`.
- `design-system`, `lib`, `shared` never import from `features`.

---

## 4. Application Boot Sequence

The boot order is fixed. Every component subscribes downstream of guarantees made by upstream layers.

```
   ┌────────────────────────────────────────────────────────────┐
   │ <AppErrorBoundary>                                         │
   │   <AppProviders>                                           │
   │     <QueryProvider>      ← TanStack Query client           │
   │       <ThemeProvider>    ← reads pref, applies CSS vars    │
   │         <AuthProvider>   ← silent refresh; emits auth:ready│
   │           <SocketProvider>  ← connects ONCE on auth:ready  │
   │             <SyncController>  ← invokes registered handlers│
   │               <ToastProvider>                              │
   │                 <AppRouter>  ← only NOW does routing start │
   └────────────────────────────────────────────────────────────┘
```

`ensureFeatureSyncRegistered()` is called once at module load in `App.tsx` and pushes each feature's handler into the `SyncController` registry. Handlers have the signature `(socket, queryClient) => () => void` and are invoked when the socket connects, torn down on disconnect or logout.

**Why the socket lives above the router:** route changes (e.g. switching between two chats) must NOT tear down and rebuild the connection. Reconnects are expensive; missed events during a tear-down are unacceptable. The socket is bound to the user session, not the URL.

### 4.1 Detailed Boot Flow

1. **`main.tsx`** mounts `<App />`.
2. **`AuthProvider`** attempts a silent refresh via `POST /api/auth/refresh`. If successful, populates `accessToken` in memory and emits `auth:ready`.
3. **`SocketProvider`** waits for `auth:ready`, then opens the Socket.IO connection with the token in the handshake auth payload.
4. **`SyncController`** registers per-feature sync handlers against the connected socket (see §6).
5. **Initial cache hydration** is *deferred* until a route mounts that needs it. Routes use TanStack Query loaders to fetch their initial slice; from that point on, only socket events update the cache.
6. **`AppRouter`** renders only after providers are ready. Loading states are unified through a `<BootGate />` to avoid flicker.

### 4.2 Disconnect Resilience

- The `SocketProvider` binds `connect`/`disconnect`/`connect_error` on the socket and `reconnect_attempt`/`reconnect`/`reconnect_failed` on the `socket.io` manager.
- A local `'io client disconnect'` (provider teardown, logout) does NOT flip status to reconnecting.
- The "Reconnecting…" indicator is rendered by [`ConnectionBanner`](#) reading from a Zustand store (`idle | connecting | connected | reconnecting | offline`).
- On successful manager reconnect, the provider emits `sync:resume` on the event bus.
- **Sequence resume (`GET /api/sync?since=<seq>`)** — the event bus signal is in place; the resume endpoint is deferred (frontend hook is ready, awaits backend implementation).

---

## 5. State Management Model

The frontend has three distinct state layers, each with a clearly defined responsibility. Mixing them is the most common architectural mistake; the boundaries are strict.

```
   ┌────────────────────────────────────────────────────────────┐
   │ Server state (canonical, mutated by socket + commands)     │
   │   → TanStack Query cache                                   │
   │     - Chat list, message lists, sessions, assignments      │
   │     - Keyed by chatId / sessionId / userId                 │
   ├────────────────────────────────────────────────────────────┤
   │ Client state (UI ephemera, never round-trips)              │
   │   → Zustand slices                                         │
   │     - Active chat, composer drafts, filter state           │
   │     - Selection, hover, modal-open                         │
   ├────────────────────────────────────────────────────────────┤
   │ Persistent state (survives reload)                         │
   │   → IndexedDB (Dexie) + localStorage                       │
   │     - User preferences, theme, last opened chat            │
   │     - Cached chat list for instant reload                  │
   └────────────────────────────────────────────────────────────┘
```

### 5.1 Server State (TanStack Query)

**Query key conventions** (all keys are tuples for type safety, defined in `shared/state/queryKeys.ts`):

```ts
export const keys = {
  me:                () => ['me'] as const,
  chats:             (filters?: Readonly<Record<string, unknown>>) => ['chats', filters ?? {}] as const,
  chat:              (chatId: ChatId) => ['chats', 'detail', chatId] as const,
  messages:          (chatId: ChatId) => ['messages', chatId] as const,
  message:           (chatId: ChatId, messageId: MessageId) => ['messages', chatId, messageId] as const,
  assignments:       () => ['assignments'] as const,
  assignmentsByUser: (userId: UserId) => ['assignments', 'user', userId] as const,
  sessions:          () => ['sessions'] as const,
  session:           (sessionId: SessionId) => ['sessions', sessionId] as const,
  users:             () => ['users'] as const,
  user:              (userId: UserId) => ['users', userId] as const,
  feedback:          () => ['feedback'] as const,
} as const;
```

**Defaults that make socket-driven sync correct:**

```ts
new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,           // never auto-refetch
      gcTime: 1000 * 60 * 30,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,     // we have our own resume logic
      retry: 1,
    },
    mutations: { retry: 0 },
  },
});
```

Caches are mutated directly via `queryClient.setQueryData` from sync handlers and from optimistic mutations. The query keys are the single source of truth for "what does the UI think exists".

### 5.2 Client State (Zustand)

One store per feature, plus a slim `shared/state/currentUser.ts` accessor that any feature can read without crossing feature boundaries:

```ts
// features/chats/store/chats.store.ts
export const useChatsUIStore = create<ChatsUIState>((set) => ({
  activeChatId: null,
  filters: loadFilters(),                // hydrated from localStorage
  search: '',
  selectedChatIds: new Set<ChatId>(),
  setActiveChatId: (id) => set({ activeChatId: id }),
  setFilters: (patch) => set((prev) => {
    const next = { ...prev.filters, ...patch };
    writeLocal(FILTERS_KEY, next);       // persists through ChatFiltersSchema
    return { filters: next };
  }),
  // ...
}));

// shared/state/currentUser.ts
export const useCurrentUserStore = create<CurrentUserState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));
export const useCurrentUserId = () => useCurrentUserStore((s) => s.user?.id ?? null);
```

Zustand slices NEVER hold server data — they hold the UI's interpretation of it (which chat is active, what's selected, what filters are applied). Selectors are colocated to keep components renderable from a single hook. `devtools` + `immer` middleware are not currently wired (re-introduce as the store count grows).

### 5.3 Persistent State

- **localStorage** ([`lib/storage/localStorage.ts`](#)) — Zod-validated read/write wrapper for small preferences: theme, chat filters, per-chat composer drafts. Corrupt payloads are silently deleted and re-fetched.
- **IndexedDB** ([`lib/storage/indexedDB.ts`](#) + [`persistence.service.ts`](#)) — Dexie v1 with two tables: `snapshots(&key, updatedAt)` for normalized DTOs and `mediaBlobs(&messageId, accessedAt, size)` for decrypted blobs (200 MB LRU eviction by `accessedAt`). Reads pass through Zod; schema drift drops the row. Writes are debounced 500 ms.
- **Generic hook** ([`lib/query/usePersistentQuery.ts`](#)) — wraps `useQuery`; on mount, primes the cache from IndexedDB if empty; writes successful network results back debounced. Used today by the chats list.
- **Access token:** memory only ([`lib/storage/memory.ts`](#)), NEVER persisted.
- **Logout** triggers `clearAllPersistedData()` so the next user's session can't see the previous user's snapshots.

---

## 6. Real-Time Sync Engine

The sync engine is the heart of this architecture. It transforms socket events into deterministic cache mutations so that no component ever needs to manually refetch.

### 6.1 Single Socket, Typed Subscriptions

```ts
// realtime/socket.ts
let socket: AppSocket | null = null;

export function getSocket(): AppSocket {
  socket ??= io(env.VITE_SOCKET_URL, {
    transports: ['websocket'],
    autoConnect: false,
    withCredentials: true,
    auth: (cb) => cb({ token: getAccessToken() }),
    ...RECONNECT_CONFIG,                    // reconnect cap 30s
  });
  return socket;
}
```

Event payloads are validated through [`events.contract.ts`](#) at runtime (`useSocketEvent` Zod-parses every incoming event — DEV throws on bad shape; prod logs `app:error` and drops). The contract mirrors the backend's `events.contract.ts` shape-for-shape.

### 6.2 Sync Controller

A single component, mounted above the router, invokes the handlers that each feature registered at module load. Handlers have the signature `(socket, queryClient) => () => void`; they mutate caches and stores, they never render.

```ts
// realtime/sync.controller.ts
export type SyncHandler = (socket: AppSocket, queryClient: QueryClient) => () => void;

const registry: SyncHandler[] = [];
export function registerSyncHandler(handler: SyncHandler): void {
  registry.push(handler);
}

export function SyncController({ children }: { children?: ReactNode }) {
  const socket = useSocket();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!socket) return;
    const teardown = registry.map((register) => register(socket, queryClient));
    return () => { for (const t of teardown) t(); };
  }, [socket, queryClient]);
  return children ?? null;
}
```

Feature handlers are registered exactly once, at boot, via `app/sync/featureSync.ts`:

```ts
// app/sync/featureSync.ts
let registered = false;
export function ensureFeatureSyncRegistered(): void {
  if (registered) return;
  registered = true;
  registerSyncHandler(registerChatsSync);
  registerSyncHandler(registerMessagesSync);
  // future: registerSessionsSync, registerAssignmentsSync, registerNotificationsSync
}
```

`App.tsx` invokes `ensureFeatureSyncRegistered()` at module load before rendering. This pattern keeps the `SyncController` in `realtime/` agnostic to features (preserves boundaries-plugin isolation) while still giving features a single place to declare what they sync.

### 6.3 Channel-Keyed Routing

Because `chatId` is the same value as the room key on the server AND the cache key on the client, an inbound event maps to a cache update with zero indirection:

```ts
// features/messages/sync/messages.sync.ts
export const registerMessagesSync = (socket: AppSocket, qc: QueryClient) => {
  const onNew = (payload: MessageNewPayload) => {
    qc.setQueryData<InfiniteData<MessagePage>>(
      keys.messages(payload.chatId),
      (prev) => prependMessage(prev, payload.message)
    );
    qc.setQueryData<ChatListData>(
      keys.chats(/* current filters */),
      (prev) => bumpChatToTop(prev, payload.chatId, payload.message)
    );
    eventBus.emit('message:received', payload);  // for notifications, sounds, etc.
  };

  socket.on('message:new', onNew);
  return () => socket.off('message:new', onNew);
};
```

### 6.4 Optimistic Mutations

Sends, edits, deletes, and reactions use TanStack Query mutations with optimistic cache updates. Pure helpers live in `features/messages/optimistic/index.ts` so they can be tested without React:

```ts
export function useSendMessage(chatId: ChatId): UseSendMessageReturn {
  const qc = useQueryClient();
  const userId = useCurrentUserId();
  const mutation = useMutation({
    mutationFn: ({ input, tempId }) => messagesApi.send(chatId, input, tempId),
    onMutate: ({ input, tempId }) => {
      if (!userId) return { tempId };
      const optimistic = buildPending(chatId, userId, input, tempId);
      qc.setQueryData(keys.messages(chatId), (data) => appendOptimistic(data, optimistic));
      return { tempId };
    },
    onSuccess: (server, vars) => {
      qc.setQueryData(keys.messages(chatId), (data) => reconcileSend(data, vars.tempId, server));
    },
    onError: (_err, vars) => {
      qc.setQueryData(keys.messages(chatId), (data) => markFailed(data, vars.tempId));
    },
  });
  return {
    send: async (input) => { await mutation.mutateAsync({ input, tempId: makeTempId() }); },
    isSending: mutation.isPending,
  };
}
```

**Reconciliation rule:** when the corresponding `message:new` socket event arrives (echoed back from WAHA via the backend), `applyMessageNew` dedupes by id; the send mutation reconciles by `tempId`. Either way there is exactly one rendered message in the end.

### 6.5 Event Bus

A small typed pub/sub (`mitt`-backed) exists for cross-feature signals that aren't cache mutations — e.g. "play notification sound", "show toast", "bump tab unread badge". This avoids tangling notification logic into the message-sync code.

---

## 7. UI System

### 7.1 Design Tokens

All visual properties are tokens. Tokens are defined once and referenced everywhere — components never use literal colors, sizes, or durations.

```css
/* design-system/tokens/themes/light.css */
:root {
  --color-bg-canvas: hsl(0 0% 100%);
  --color-bg-elevated: hsl(220 14% 98%);
  --color-fg-primary: hsl(220 20% 12%);
  --color-fg-muted: hsl(220 10% 45%);
  --color-accent: hsl(202 90% 50%);
  --color-accent-fg: hsl(0 0% 100%);
  --color-success: hsl(142 70% 42%);
  --color-warning: hsl(38 92% 50%);
  --color-danger: hsl(0 84% 60%);

  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;

  --shadow-1: 0 1px 2px rgba(15,23,42,.06);
  --shadow-2: 0 4px 16px rgba(15,23,42,.08);
  --shadow-3: 0 12px 32px rgba(15,23,42,.12);

  --motion-fast: 120ms;
  --motion-base: 220ms;
  --motion-slow: 360ms;
  --easing-standard: cubic-bezier(0.2, 0, 0, 1);
  --easing-emphasized: cubic-bezier(0.3, 0, 0, 1);
}
```

Dark theme overrides the same variables. High-contrast theme overrides token-by-token. Tailwind reads tokens via `theme.extend.colors.bg-canvas: 'var(--color-bg-canvas)'`.

### 7.2 Theme Switching

```ts
// design-system/ThemeProvider.tsx
type Theme = 'light' | 'dark' | 'system' | 'high-contrast';

const applyTheme = (theme: Theme) => {
  const resolved = theme === 'system' ? prefersDark() ? 'dark' : 'light' : theme;
  document.documentElement.dataset.theme = resolved;
};
```

Theme switches are instant — they swap the `data-theme` attribute. Components don't re-render; only CSS variables resolve to different values. No FOUC: theme is applied via a synchronous inline script in `index.html` before React boots.

### 7.3 Component Primitives

Every primitive is built on Radix UI for accessibility and styled with class-variance-authority:

```ts
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size }))} {...props} />
));

const buttonVariants = cva('inline-flex items-center justify-center font-medium transition-colors focus-visible:ring', {
  variants: {
    variant: {
      primary:   'bg-accent text-accent-fg hover:bg-accent/90',
      secondary: 'bg-bg-elevated text-fg-primary hover:bg-bg-elevated/80',
      ghost:     'hover:bg-bg-elevated',
      danger:    'bg-danger text-white hover:bg-danger/90',
    },
    size: {
      sm: 'h-8 px-3 text-sm rounded-sm',
      md: 'h-10 px-4 text-sm rounded-md',
      lg: 'h-12 px-6 text-base rounded-md',
    },
  },
  defaultVariants: { variant: 'primary', size: 'md' },
});
```

Compound components (Avatar, Tag, EmptyState, MessageBubble) are built from primitives. No one-off styled `<div>` blocks in feature code.

### 7.4 Motion System

All animation goes through `design-system/motion`. Three rules:

1. **Express intent, not pixels.** Components reference `variants.slideUp`, `variants.popIn`, never raw `animate={{ y: 0 }}`.
2. **Respect `prefers-reduced-motion`.** A `usePrefersReducedMotion` hook collapses transitions to instant.
3. **Use the right tool.** Framer Motion for interactive gestures (drag, layout transitions, springs). CSS `transition` for hover, focus, and theme swaps. View Transitions API for route changes where supported.

```ts
// design-system/motion/variants.ts
export const slideUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.2, 0, 0, 1] } },
  exit:    { opacity: 0, y: 8, transition: { duration: 0.16 } },
};
```

### 7.5 Accessibility

Non-negotiable baseline:

- All interactive elements reachable by keyboard with visible focus rings.
- Dialogs trap focus and restore it on close (Radix Dialog).
- Live regions for incoming messages and toasts (`aria-live="polite"`).
- Color contrast meets WCAG AA (verified by tokens; checked in CI via a token-contrast lint rule).
- Screen-reader announcements for ACK transitions ("Message sent. Delivered. Read.").
- All form fields have `<label>` association and inline error text.
- Reduced-motion fallbacks for every animated component.

### 7.6 High-Performance Rendering

| Concern | Strategy |
|---|---|
| Chat list (1000+ items) | `react-virtuoso` with stable item keys, dynamic row heights |
| Message list (10k+ items) | `react-virtuoso` reverse list, `followOutput` for auto-scroll |
| Avoiding re-renders | Selector-scoped Zustand subscriptions; `useShallow` for object slices |
| Heavy computations | `useMemo` only when measured; otherwise rely on referential stability |
| Image and media | Lazy decryption on viewport intersection, LRU blob cache |
| Code splitting | Route-level `lazy()` for admin and feedback panels |
| Bundle size | Per-route chunks, dynamic imports for emoji picker, video player |
| Tree-shaking | All barrel files use `export type {}` for types, avoid side effects |

The frontend targets a sustained 60fps on a mid-tier laptop with 5,000 messages loaded in a chat. The CI bundle-size budget is 250KB initial JS, 500KB total per route.

---

## 8. Routing

Type-safe route table:

```ts
export const routes = {
  login:       '/login',
  dashboard:   '/dashboard',
  chat:        (chatId: ChatId) => `/dashboard/${chatId}`,
  admin:       '/admin',
  adminSessions:    '/admin/sessions',
  adminAssign:      '/admin/assignments',
  adminUsers:       '/admin/users',
  adminFeedback:    '/admin/feedback',
  settings:    '/settings',
} as const;
```

- **Guards** are composable: `<ProtectedRoute><AdminRoute>{children}</AdminRoute></ProtectedRoute>`.
- **Loaders** prefetch via TanStack Query so route transitions feel instant.
- **Lazy chunks** for admin routes — non-admins never download them.
- **View Transitions API** wraps route changes where the browser supports it for a smooth visual handoff.

---

## 9. API & Data Layer

### 9.1 HTTP Client

A single axios instance with three responsibilities:

1. Attach the access token from in-memory storage.
2. On 401, attempt a silent refresh through a dedicated `/api/auth/refresh` interceptor; queue concurrent requests during the refresh; retry on success, log out on failure.
3. Translate backend error envelopes (`{ error: { code, message, correlationId } }`) into typed `AppApiError` instances.

```ts
// lib/http/client.ts
export const apiClient = axios.create({ baseURL: env.VITE_BACKEND_URL, withCredentials: true });

apiClient.interceptors.request.use((cfg) => {
  const token = getAccessToken();
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

apiClient.interceptors.response.use(undefined, async (err) => {
  if (err.response?.status === 401 && !err.config._retried) {
    err.config._retried = true;
    await refreshAccessToken();
    return apiClient(err.config);
  }
  throw AppApiError.fromAxios(err);
});
```

### 9.2 Feature API Modules

Each feature owns a `xxx.api.ts` with one function per endpoint. Functions return Zod-parsed DTOs — never `any`, never raw axios responses:

```ts
export const chatsApi = {
  list: async (filters: ChatFilters): Promise<ChatList> => {
    const { data } = await apiClient.get('/api/chats', { params: filters });
    return ChatListSchema.parse(data);
  },
  // ...
};
```

### 9.3 Mutation Contract

All mutations follow the same shape: `mutationFn → onMutate (optimistic) → onSuccess (reconcile) → onError (rollback)`. The optimistic and reconcile steps are pure functions tested in isolation — no UI involved.

---

## 10. Type Safety

### 10.1 Branded IDs

```ts
type Brand<T, B> = T & { readonly __brand: B };
export type UserId    = Brand<string, 'UserId'>;
export type ChatId    = Brand<string, 'ChatId'>;
export type MessageId = Brand<string, 'MessageId'>;
export type SessionId = Brand<string, 'SessionId'>;

export const toChatId = (s: string): ChatId => {
  if (!/^[\w@.-]+$/.test(s)) throw new Error('Invalid ChatId');
  return s as ChatId;
};
```

The router, query keys, socket events, and component props all use these brands. The compiler enforces that a `UserId` never accidentally flows into a `ChatId` slot.

### 10.2 Shared DTOs

A `shared/types/dto.ts` file mirrors the backend's Zod response schemas. Where possible (monorepo or git submodule), the schemas are imported directly from the backend; otherwise they're hand-mirrored and contract-tested in CI.

### 10.3 TypeScript Configuration

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "useUnknownInCatchVariables": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "target": "ES2022"
  }
}
```

No `any`, no `as` casts outside type-guard functions and Zod parsers. ESLint enforces.

---

## 11. Offline & Persistence Patterns

The app is not a strict offline app — it cannot send messages without a connection — but it degrades gracefully.

| Scenario | Status | Behavior |
|---|---|---|
| Cold start, recently online | ✅ | Hydrate from IndexedDB snapshot via `usePersistentQuery` for instant UI, then reconcile from network |
| Mid-session disconnect | ✅ | `ConnectionBanner` shows "Reconnecting…"; UI remains interactive |
| Long disconnect — sequence resume | ⏳ | `sync:resume` event hook is wired (emitted on manager reconnect); `GET /api/sync?since=<seq>` endpoint TBD on backend |
| Failed send | ✅ | Bubble status flips to `failed`; "Failed — retry" affordance present |
| Stale media | ⏳ | Dexie `mediaBlobs` LRU is in place; `useDecryptMedia` hook not yet implemented |
| Queued sends while `navigator.onLine === false` | ✅ Phase 10 | [lib/offline/sendQueue.ts](frontend/src/lib/offline/sendQueue.ts) holds tasks; `subscribeConnectivity` flushes on `online`. [useSendMessage](frontend/src/features/messages/hooks/useMessageMutations.ts) branches on connectivity and reconciles after flush. |

A service worker for asset caching is queued for Phase 12; today the app does not register one.

---

## 12. Notifications ✅ Phase 10

Shipped. [features/notifications/notification.service.ts](frontend/src/features/notifications/notification.service.ts) exports a pure `shouldNotify(payload, gates)` gate (every branch unit-tested) and `createNotificationService(gates, outputs)` which subscribes to `eventBus.on('message:received')`. [chats.sync.ts](frontend/src/features/chats/sync/chats.sync.ts) emits `message:received` for non-self `message:new` events. [NotificationController](frontend/src/app/notifications/NotificationController.tsx) wires settings + global mute + chat-cache lookups + active-chat store into the gates, and outputs to [lib/notifications/permission.ts](frontend/src/lib/notifications/permission.ts), [sound.ts](frontend/src/lib/notifications/sound.ts), [favicon.ts](frontend/src/lib/notifications/favicon.ts). Permission banner only appears when desktop notifications are opted-in AND permission is `'default'`.

```ts
class NotificationService {
  handleIncomingMessage(payload: MessageNewPayload) {
    if (this.isOwnMessage(payload)) return;
    if (this.isChatMuted(payload.chatId)) return;
    if (this.isChatActive(payload.chatId)) return;       // user already looking
    if (!this.globalSoundsEnabled()) return;
    if (!this.permissionGranted()) return;

    this.playSound('incoming');
    this.showDesktopNotification(payload);
    this.bumpFaviconBadge();
  }
}
```

The service will subscribe to a `message:received` event on the bus so notification logic stays decoupled from sync logic. Sounds, badges, and toasts will be independent concerns that can be disabled individually.

---

## 13. Observability (Frontend) ⏳ Phase 11

Today the app ships an `AppErrorBoundary` + per-route `RouteErrorBoundary` and a typed `AppApiError` mapper, but no Sentry/Web Vitals/beacon wiring. The target below is the Phase 11 deliverable.

- **Error tracking** via Sentry: every unhandled rejection, every error boundary trip, every failed mutation. PII redacted at the source via `beforeSend`.
- **Performance metrics** via the Web Vitals API: LCP, INP, CLS, TTFB reported per-route via `navigator.sendBeacon`.
- **Custom metrics:** socket reconnection rate, optimistic-reconcile divergence count, query-cache hit/miss ratio, time-to-first-message-render after route mount.
- **Correlation:** every HTTP request will carry an `X-Correlation-Id` header echoed in Sentry breadcrumbs so a frontend error can be matched to backend logs.
- **Debug overlay** (dev only): `Cmd+Shift+D` opens a panel showing socket state, last 50 events, active queries, and cache snapshots.

---

## 14. Testing Strategy

| Layer | Tool | Status | Scope |
|---|---|---|---|
| Unit | Vitest | ✅ | Pure functions, optimistic/reconcile logic, Zod parsers, stores |
| Component | Vitest + RTL | ✅ | Individual components in isolation (primitives, composer, banner, …) |
| Integration | Vitest + MSW | ✅ | Refresh queue, login flow, optimistic mutations, composer submit |
| Visual | Storybook + Chromatic | 🟡 | Storybook present; Chromatic wiring in Phase 12 |
| E2E | Playwright | ⏳ | Phase 12 — golden-path flows |
| Accessibility | `vitest-axe` + Storybook a11y | 🟡 | Primitives + compounds covered; full per-route sweep + Chromatic in Phase 12 |

Today: **171 tests pass across 44 files**. Coverage thresholds (line/branch — 75% for `features/*`, 90% for `realtime/*` and `lib/*`) are not yet gated in CI; the gate lands in Phase 12. Coverage is a floor; meaningful assertions are the actual bar.

---

## 15. Engineering Standards

### 15.1 Linting & Formatting

- ESLint with `@typescript-eslint/strict-type-checked`, `react-hooks`, `jsx-a11y`, `eslint-plugin-boundaries`.
- Prettier for formatting.
- Tailwind class sorting via `prettier-plugin-tailwindcss`.

### 15.2 Component Conventions

- One component per file. File name matches component name (`MessageBubble.tsx`).
- Component prop types are exported alongside (`MessageBubbleProps`).
- Custom hooks live in `hooks/` and start with `use`.
- Internal helpers under `_internal/` and not exported from `index.ts`.
- No default exports for components — named exports only, for refactor-safety.

### 15.3 Naming

- Hooks: `useXxx`.
- Stores: `useXxxStore`.
- Mutations: `useXxxMutation` or `useXxx` if intent is obvious.
- Events: `domain:verb` (e.g. `message:received`).
- Query keys: tuples starting with the domain name (`['chats', filters]`).

### 15.4 Pull Request Checklist

Every PR must:

1. Pass type-check, lint, tests, and bundle-size budget.
2. Include a screenshot or screen recording for any visual change.
3. Update Storybook if a primitive or compound is added or changed.
4. Update sync handlers if a new socket event is consumed.
5. Update the design-token contrast snapshot if tokens changed.

---

## 16. Feature Snapshots

A quick tour of how the principles compose in each feature.

### 16.1 Chats

- Hydrate `chats` query once on dashboard mount.
- `chats.sync.ts` registers `message:new`, `chat:assigned`, `chat:unassigned`, `chat:read`, `chat:muted` handlers that mutate the cache.
- Chat list is virtualized; each `ChatListItem` selects its own slice with `useShallow` so a single chat's update doesn't re-render the rest.
- Active chat selection lives in `chatsUIStore`; navigating to `/dashboard/:chatId` syncs URL and store both ways.

### 16.2 Messages

- Hydrate via `useInfiniteQuery` on chat mount; pages keyed by cursor.
- `messages.sync.ts` handles `message:new`, `message:ack`, `message:edited`, `message:deleted`, `message:reaction`.
- Optimistic send appends a `PendingMessage`; the reconciliation step swaps it for the server-confirmed version on `message:new` arrival.
- Virtualized reverse list with date dividers injected during render, not stored.

### 16.3 Sessions (Admin) ✅ Phase 9

- Hydrate sessions on admin entry via `useSessions()` (`keys.sessions()`).
- `sessions.sync.ts` handles `session:status` events: pure mutation `applySessionStatus` updates the cache, then the bus emits `sessions:status` so the QR panel hook (`useSessionQR`) invalidates its query whenever the named session flips to `SCAN_QR_CODE`.
- Code-split: the admin chunk (`assets/index-*.js`, ~25 KB raw / 6.5 KB gz) is only loaded for admin users.

### 16.4 Assignments ✅ Phase 9

- Cache is fully driven by `chat:assigned` / `chat:unassigned` events.
- Re-assigning a chat triggers an optimistic update via `useAssignmentActions`; failure paths roll back to a per-key snapshot.
- The assignee `<select>` is sourced from `lib/data/useDirectory` (same `keys.users()` cache as admin `useUsers`) to keep feature boundaries intact.

### 16.7 Admin (Users / Feedback / Mute) ✅ Phase 9

- User CRUD via `useUsers` + `useUserActions` against `/api/users`; `user:updated` socket events flip cached `disabled`/`role` without refetching.
- Feedback inbox via cursor-paginated `useFeedback`; `feedback:new` socket events refetch the latest item (`limit=1`) to materialize the body while keeping the rest of the cache untouched.
- Global mute is a single Boolean against `/api/mute/global`, optimistic with rollback. Consumed by the notification service (Phase 10) — `NotificationController` reads `useGlobalMute().data?.muted` to suppress every notification when on.

### 16.5 Notifications

- Pure listener on the event bus, no UI ownership.
- Permission prompt deferred until user explicitly opts in via settings.

### 16.6 Settings

- User preferences stored in localStorage with a write-through to the backend.
- Theme switch is the simplest case in the system: update `data-theme`, persist, done.

---

## 17. Performance Budgets

| Metric | Budget |
|---|---|
| Initial JS (gzipped) | ≤ 250 KB |
| Per-route async chunk | ≤ 120 KB |
| First Contentful Paint | < 1.0s on broadband, < 2.0s on 4G |
| Time to Interactive | < 2.0s on broadband |
| INP (95th percentile) | < 200 ms |
| Memory after 1h idle session | < 250 MB |
| Sustained scroll FPS (chat list) | ≥ 58 fps |

CI fails the build if any budget is exceeded.

---

## 18. Definition of Done

A feature ships when, and only when:

1. Initial hydration is wired (TanStack Query loader or eager fetch).
2. All relevant socket events have sync handlers registered.
3. Optimistic mutations have a paired reconciliation strategy with unit tests.
4. The feature is covered by at least one Playwright E2E scenario.
5. Components have Storybook entries; visual regression baseline is updated.
6. Accessibility audit (axe) passes with zero violations.
7. The feature respects `prefers-reduced-motion` and `prefers-color-scheme`.
8. Performance budgets are not exceeded.
9. Error boundaries are present at the feature root.
10. The feature degrades gracefully on socket disconnect.

Anything less is incomplete, regardless of whether the happy path works.

---

## 19. Why This Architecture Scales

- **One socket, one source of truth.** Real-time updates flow through a single, observable bottleneck instead of dozens of polling loops or scattered listeners.
- **Channel-keyed everything.** Cache keys, room keys, store slices, and URL params all use the same `ChatId`. No translation layers to drift out of sync.
- **Optimistic + reconciled.** The UI always feels instant; the source of truth always wins.
- **Pure sync layer.** Socket-to-cache handlers are pure functions, trivially testable, and decoupled from rendering. Adding a feature is "register a handler", not "rewire the app".
- **Strict types end to end.** Backend Zod schemas → frontend Zod parsers → branded IDs → typed query keys. Refactors are mechanical; runtime drift is structurally impossible.
- **Render where it matters.** Selectors keep re-renders local; virtualization keeps lists fast; code splitting keeps bundles small.
- **Premium feel by default.** Motion tokens, theme tokens, accessibility baked into the design system mean every new screen looks and feels like the last.

This architecture is built so that adding the hundredth feature looks exactly like adding the first, and so that the application running with one user looks identical, conceptually, to the application running with ten thousand.
