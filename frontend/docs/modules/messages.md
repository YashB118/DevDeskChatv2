# Module: Messages Feature (`features/messages`)

> Chat window — reverse-virtualized list, composer, optimistic send + reconcile, edit/delete/react. Offline-aware via `lib/offline/sendQueue`.

**Status:** Phase 8 — core complete. Media + MentionAutocomplete + ForwardDialog deferred.

## Files

```
frontend/src/features/messages/
├── api/messages.api.ts                # list/send/edit/delete/react/forward/participants
├── types.ts                           # MessageDTO + MessagePage + Reaction + Quoted + SendMessageInput Zod schemas
├── store/messages.store.ts            # per-chat drafts + reply/edit targets + search
├── hooks/
│   ├── useMessages.ts                 # useInfiniteQuery keyed by keys.messages(chatId)
│   └── useMessageMutations.ts         # useSendMessage / useEditMessage / useDeleteMessage / useReactToMessage
├── optimistic/index.ts                # pure helpers (buildPending/appendOptimistic/reconcileSend/markFailed/applyAck/applyEdit/applyDelete/applyReaction/applyMessageNew/prependOlderPage)
├── sync/messages.sync.ts              # registers socket handlers
├── components/
│   ├── MessageList/                   # react-virtuoso reverse w/ day dividers
│   ├── MessageBubble/                 # memoized; mine/other styling, ACK ticks, search highlight, pending/failed badges
│   ├── MessageComposer/               # Enter/Shift+Enter, IME-safe, draft persistence
│   ├── MessageReactions/ · MessageQuotedPreview/ · MessageSearch/
└── index.ts
```

## Send flow (online)

`useSendMessage(chatId).send(input)`:

1. `makeTempId()` generates a temp stanza id.
2. `onMutate` — `buildPending(chatId, userId, input, tempId)` → `appendOptimistic(cache, pending)` via `setQueryData(keys.messages(chatId))`.
3. `mutationFn` — `messagesApi.send(chatId, input, tempId)`.
4. `onSuccess` — `reconcileSend(cache, tempId, serverMessage)` swaps the pending entry for the server-confirmed one.
5. `message:new` socket event later carries the same server message; `applyMessageNew` dedupes by id.

On failure: `markFailed(cache, tempId)` flips the bubble status to `failed` + retry affordance.

## Send flow (offline)

If `useConnectivityStore.getState().online === false`, `useSendMessage`:

1. Appends optimistic locally as before.
2. `enqueueSend(async () => messagesApi.send(...) → reconcileSend(...))` into [`lib/offline/sendQueue`](../../src/lib/offline/sendQueue.ts).
3. `subscribeConnectivity` flushes the queue when `online` → reconciliation runs as if online.

## Sync handlers

| Event | Effect |
|---|---|
| `message:new` | `applyMessageNew` (id-dedupe). Bumps unread on the chats cache via [`chats.sync.ts`](../../src/features/chats/sync/chats.sync.ts). |
| `message:ack` | `applyAck` updates ACK state (SENT/DELIVERED/READ/PLAYED). |
| `message:edited` | `applyEdit`. |
| `message:deleted` | `applyDelete` (tombstone). |
| `message:reaction` | `applyReaction`. |

## Composer behavior

- Local component state — keystrokes never re-render `MessageList`.
- `Enter` submits; `Shift+Enter` inserts newline; IME composition guarded via `nativeEvent.isComposing`.
- Drafts auto-saved per chat via [`messages.store.ts`](../../src/features/messages/store/messages.store.ts) with 300 ms debounce; restored on send failure.

## Bubble features

- Mine vs. other styling, sender name in groups, forwarded label.
- ACK ticks via `Check`/`CheckCheck` icons; READ/PLAYED uses accent color.
- Quoted reply preview.
- Search match highlight via `<mark>`.
- Deleted-tombstone, pending "…", failed retry button.
- Edited timestamp suffix.

## Current-user lookup

Cross-feature read via `useCurrentUserId()` from [`shared/state/currentUser.ts`](../../src/shared/state/currentUser.ts) — auth feature writes, messages reads. Boundaries plugin keeps direct feature→feature imports out.

## Tests

| File | Coverage |
|---|---|
| `optimistic/optimistic.test.ts` | 11 pure cases (makeTempId, buildPending, appendOptimistic, reconcileSend match & append-on-miss, markFailed, applyMessageNew dedupe, applyAck/Edit/Delete/Reaction, prependOlderPage). |
| `MessageComposer.test.tsx` | Enter submits, Shift+Enter inserts newline, whitespace-only blocked. |

## Deferred

`MentionAutocomplete`, `ForwardDialog`, `MediaLightbox`/`MediaPlayer`/`MediaUploadDialog`, `useDecryptMedia` (Dexie `mediaBlobs` table ready), in-chat search prev/next navigation.

## References

- Architecture: [`FRONTEND_ARCHITECTURE.md`](../../../FRONTEND_ARCHITECTURE.md) §16.2.
- Implementation plan: [`FRONTEND_IMPLEMENTATION_PLAN.md`](../../../FRONTEND_IMPLEMENTATION_PLAN.md) Phase 8.
- Realtime: [`realtime.md`](realtime.md). Chats: [`chats.md`](chats.md). Offline: [`offline.md`](offline.md).
