# Frontend Architecture

> Production-grade reference architecture for the DevChatDesk frontend. This document defines the boot sequence, state model, real-time sync engine, design system, and engineering standards. The goal is a WhatsApp-class real-time UI — premium, predictable, and built for scale.

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
│   │   │   ├── QueryProvider.tsx
│   │   │   ├── ThemeProvider.tsx
│   │   │   ├── SocketProvider.tsx     # Lives ABOVE the router
│   │   │   ├── AuthProvider.tsx
│   │   │   └── ToastProvider.tsx
│   │   ├── router/
│   │   │   ├── AppRouter.tsx
│   │   │   ├── routes.ts              # Typed route table
│   │   │   ├── guards/
│   │   │   │   ├── ProtectedRoute.tsx
│   │   │   │   ├── AdminRoute.tsx
│   │   │   │   ├── PublicRoute.tsx
│   │   │   │   └── RootRedirect.tsx
│   │   │   └── lazyRoutes.ts          # Code-split routes
│   │   └── errors/
│   │       ├── AppErrorBoundary.tsx
│   │       └── RouteErrorBoundary.tsx
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
│   │   │   │   └── MessageSearch/
│   │   │   ├── hooks/
│   │   │   ├── api/messages.api.ts
│   │   │   ├── store/messages.store.ts
│   │   │   ├── sync/messages.sync.ts
│   │   │   ├── optimistic/            # Optimistic update strategies
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
│   │   ├── eventBus.ts                # Cross-feature event router
│   │   ├── reconnect.ts               # Backoff + resume-after-disconnect
│   │   ├── sync.controller.ts         # Orchestrates per-feature sync handlers
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
│   │   │   └── retry.ts
│   │   ├── storage/
│   │   │   ├── memory.ts              # Access token in memory only
│   │   │   ├── localStorage.ts        # User prefs only
│   │   │   └── indexedDB.ts           # Dexie schemas
│   │   ├── time/
│   │   ├── format/
│   │   └── env.ts                     # Zod-parsed VITE_* env
│   │
│   ├── shared/
│   │   ├── types/
│   │   │   ├── ids.ts                 # Branded ID types
│   │   │   ├── dto.ts                 # Shared DTOs (zod-derived)
│   │   │   └── ui.ts
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
   │ <AppProviders>                                             │
   │   ├── <QueryProvider>      ← TanStack Query client         │
   │   ├── <ThemeProvider>      ← reads pref, applies CSS vars  │
   │   ├── <AuthProvider>       ← bootstraps access token       │
   │   ├── <SocketProvider>     ← connects ONCE after auth      │
   │   ├── <SyncController>     ← wires socket → caches         │
   │   ├── <ToastProvider>                                      │
   │   └── <AppRouter>          ← only NOW does routing start   │
   └────────────────────────────────────────────────────────────┘
```

**Why the socket lives above the router:** route changes (e.g. switching between two chats) must NOT tear down and rebuild the connection. Reconnects are expensive; missed events during a tear-down are unacceptable. The socket is bound to the user session, not the URL.

### 4.1 Detailed Boot Flow

1. **`main.tsx`** mounts `<App />`.
2. **`AuthProvider`** attempts a silent refresh via `POST /api/auth/refresh`. If successful, populates `accessToken` in memory and emits `auth:ready`.
3. **`SocketProvider`** waits for `auth:ready`, then opens the Socket.IO connection with the token in the handshake auth payload.
4. **`SyncController`** registers per-feature sync handlers against the connected socket (see §6).
5. **Initial cache hydration** is *deferred* until a route mounts that needs it. Routes use TanStack Query loaders to fetch their initial slice; from that point on, only socket events update the cache.
6. **`AppRouter`** renders only after providers are ready. Loading states are unified through a `<BootGate />` to avoid flicker.

### 4.2 Disconnect Resilience

- On `disconnect`, the socket layer marks a `lastSeq` value per stream.
- On `reconnect`, the client calls `GET /api/sync?since=<seq>` and merges the delta into the relevant caches before resuming live event consumption. Users see a brief "Reconnecting…" indicator, never a stale UI.

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

**Query key conventions** (all keys are tuples for type safety):

```ts
const keys = {
  chats:           (filters: ChatFilters)  => ['chats', filters] as const,
  chat:            (id: ChatId)            => ['chat', id] as const,
  messages:        (id: ChatId)            => ['messages', id] as const,
  participants:    (id: ChatId)            => ['participants', id] as const,
  sessions:        ()                      => ['sessions'] as const,
  assignments:     ()                      => ['assignments'] as const,
  me:              ()                      => ['me'] as const,
};
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

One store per feature, composed at the root:

```ts
// features/chats/store/chats.store.ts
export const useChatsUIStore = create<ChatsUIState>()(
  devtools(
    immer((set) => ({
      activeChatId: null,
      filters: { unreadOnly: false, mutedHidden: false, /*...*/ },
      selectedMessageIds: new Set<MessageId>(),
      setActiveChat: (id) => set((s) => { s.activeChatId = id; }),
      // ...
    })),
    { name: 'chats-ui' }
  )
);
```

Zustand slices NEVER hold server data. They hold the UI's interpretation of it (which chat is active, what's selected, what filters are applied). Selectors are colocated to keep components renderable from a single hook.

### 5.3 Persistent State

- **localStorage:** filter preferences, theme, notification sound preference, last-opened chat.
- **IndexedDB (Dexie):** last-known chat list snapshot, last-known message page per chat, decrypted media blobs (LRU, capped at 200 MB). On boot, these populate the TanStack cache instantly while the socket reconnects and reconciles.
- **Access token:** memory only, NEVER persisted.

---

## 6. Real-Time Sync Engine

The sync engine is the heart of this architecture. It transforms socket events into deterministic cache mutations so that no component ever needs to manually refetch.

### 6.1 Single Socket, Typed Subscriptions

```ts
// realtime/socket.ts
let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export const getSocket = () => {
  if (!socket) {
    socket = io(env.VITE_BACKEND_URL, {
      transports: ['websocket'],
      autoConnect: false,
      auth: (cb) => cb({ token: getAccessToken() }),
    });
  }
  return socket;
};
```

The `ServerToClientEvents` interface is generated from the backend's Zod event contract — frontend and backend share the same event vocabulary, statically.

### 6.2 Sync Controller

A single React component, mounted above the router, registers per-feature handlers. Handlers are pure functions: `(event, queryClient, stores) => void`. They mutate caches and stores; they never render.

```ts
// realtime/sync.controller.ts
export const SyncController = () => {
  const queryClient = useQueryClient();
  const socket = useSocket();

  useEffect(() => {
    const handlers = [
      registerChatsSync(socket, queryClient),
      registerMessagesSync(socket, queryClient),
      registerAssignmentsSync(socket, queryClient),
      registerSessionsSync(socket, queryClient),
      registerNotificationsSync(socket, queryClient),
    ];
    return () => handlers.forEach((unbind) => unbind());
  }, [socket, queryClient]);

  return null;
};
```

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

Sends, edits, deletes, and reactions all use TanStack Query mutations with optimistic cache updates:

```ts
export const useSendMessage = (chatId: ChatId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SendMessageInput) => messagesApi.send(chatId, input),
    onMutate: async (input) => {
      const tempId = makeTempId();
      const optimistic: PendingMessage = { ...input, id: tempId, status: 'pending', ts: Date.now() };
      qc.setQueryData(keys.messages(chatId), (prev) => appendOptimistic(prev, optimistic));
      return { tempId };
    },
    onSuccess: (server, _input, ctx) => {
      qc.setQueryData(keys.messages(chatId), (prev) => reconcile(prev, ctx!.tempId, server));
    },
    onError: (_e, _input, ctx) => {
      qc.setQueryData(keys.messages(chatId), (prev) => markFailed(prev, ctx!.tempId));
    },
  });
};
```

**Reconciliation rule:** when the corresponding `message:new` socket event arrives (echoed back from WAHA via the backend), the sync handler matches by stanza ID and de-duplicates with the optimistic entry. There is exactly one rendered message in the end.

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

| Scenario | Behavior |
|---|---|
| Cold start, recently online | Hydrate from IndexedDB snapshot for instant UI, then reconcile from network |
| Mid-session disconnect | Banner: "Reconnecting…"; UI remains interactive; queued sends marked "pending" |
| Long disconnect | On reconnect, `GET /api/sync?since=<seq>` replays missed events |
| Failed send | Message shows red status, retry button; user can edit and retry |
| Stale media | Decrypted blobs cached in IndexedDB with LRU eviction at 200 MB |

A small service worker handles asset caching and a fallback offline page. It does not intercept API calls — that road leads to stale-state bugs.

---

## 12. Notifications

Centralized notification orchestration in `features/notifications/notification.service.ts`:

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

The service subscribes to `eventBus.on('message:received')` so notification logic stays decoupled from sync logic. Sounds, badges, and toasts are independent concerns that can be disabled individually.

---

## 13. Observability (Frontend)

Production frontends are silently broken until you measure them.

- **Error tracking** via Sentry: every unhandled rejection, every error boundary trip, every failed mutation. PII redacted at the source.
- **Performance metrics** via the Web Vitals API: LCP, INP, CLS reported per-route.
- **Custom metrics:** socket reconnection rate, optimistic-reconcile divergence count, query-cache hit/miss ratio, time-to-first-message-render after route mount.
- **Correlation:** every HTTP request carries an `X-Correlation-Id` header echoed in Sentry breadcrumbs so a frontend error can be matched to backend logs.
- **Debug overlay** (dev only): `Cmd+Shift+D` opens a panel showing socket state, last 50 events, active queries, and cache snapshots.

---

## 14. Testing Strategy

| Layer | Tool | Scope |
|---|---|---|
| Unit | Vitest | Pure functions, reducers, optimistic/reconcile logic, Zod parsers |
| Component | Vitest + React Testing Library | Individual components in isolation, with mocked queries |
| Integration | Vitest + MSW | Full feature flows with mocked network + simulated socket events |
| Visual | Storybook + Chromatic | Every primitive and key compound component |
| E2E | Playwright | Login → open chat → send message → receive ack |
| Accessibility | axe-core in component tests | Zero violations on rendered components |

Coverage thresholds (line/branch): 75% for `features/*`, 90% for `realtime/*` and `lib/*`. Coverage is a floor; meaningful assertions are the actual bar.

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

### 16.3 Sessions (Admin)

- Hydrate sessions on admin entry.
- `sessions.sync.ts` handles `session:status` events; QR panel listens and refreshes when status flips to `SCAN_QR_CODE`.
- Code-split: the admin bundle is only loaded for admin users.

### 16.4 Assignments

- Cache is fully driven by `chat:assigned` / `chat:unassigned` events.
- Re-assigning a chat triggers an optimistic update; on server confirmation the optimistic record is reconciled.

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
