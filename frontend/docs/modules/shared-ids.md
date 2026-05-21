# Module: Branded ID Types (`shared/types/ids`)

> Compile-time-distinct string types for every domain identifier in the app, plus parser/constructor functions that validate format at runtime boundaries. Prevents whole classes of bugs where one ID accidentally flows into another's slot.

**Status:** Phase 1 — covers the four identifier kinds used across every shipped feature. `useChatIdParam()` (Phase 4), `keys` factory (Phase 6), `events.contract.ts` (Phase 5+) all consume these.

---

## Purpose

In a chat application, the codebase juggles `UserId`, `ChatId`, `MessageId`, and `SessionId` constantly. If they're all just `string`, the compiler can't catch a function that expects a `ChatId` but is handed a `UserId`. With branded types, every ID gets a phantom type tag — the runtime value is still a string, but the compiler tracks which kind of string it is.

This is the foundation that makes `useChatIdParam()` (Phase 4), query keys (Phase 6), and socket event payloads (Phase 5) type-safe end to end.

## File

| Path | Role |
|---|---|
| `frontend/src/shared/types/ids.ts` | Defines `Brand<T, B>` helper, exports the four ID types and their constructor functions. |

## Defined types

| Type | Brand tag | Used to identify |
|---|---|---|
| `UserId` | `'UserId'` | A developer or admin in the system. |
| `ChatId` | `'ChatId'` | A conversation thread (1:1 or group). |
| `MessageId` | `'MessageId'` | A single message within a chat. |
| `SessionId` | `'SessionId'` | A backend session connecting an external chat provider. |

The brand is enforced via `{ readonly __brand: B }`. The `__brand` property only exists in the type system; at runtime the value is an ordinary string.

## Constructors

The module exports `toUserId`, `toChatId`, `toMessageId`, `toSessionId`. Each:
- Accepts a `string`.
- Validates against a shared regex (`/^[\w@.:+-]+$/`) that permits the character set used by the backend's identifier formats (e.g. WhatsApp JIDs like `12345@s.whatsapp.net`, colon-separated user IDs).
- Throws `Error('Invalid <Kind>: <value>')` on rejection.
- Returns the value cast to the branded type on success.

These constructors are the **only** place where a raw `string` should turn into a branded ID. Direct `as ChatId` casts in feature code are forbidden by convention (and will be caught in review). The architecture document is explicit: "No `any`, no `as` casts outside type-guard functions and Zod parsers."

## Where IDs come from

Branded IDs appear at the boundaries of the app:
1. **URL params** — Phase 4 introduces `useChatIdParam()` which Zod-parses route params and returns `ChatId`.
2. **HTTP responses** — Phase 3+ Zod schemas use `z.string().transform(toChatId)` (or equivalent) so DTOs surface with branded fields.
3. **Socket payloads** — Phase 5+ `events.contract.ts` schemas apply the same transform.
4. **Persistent storage reads** — Phase 6 IndexedDB hydration re-validates through Zod, which re-brands.

Inside features, IDs always carry their brand. No untyped string IDs are stored in TanStack Query keys, Zustand slices, or component props.

## Validation regex

The current pattern `/^[\w@.:+-]+$/` permits:
- Alphanumerics and underscore (`\w`)
- `@`, `.`, `:`, `+`, `-`

This matches every identifier format observed from the backend's session abstraction. **Do not loosen the regex without coordinating with the backend team** — the regex is the client-side defense against malicious or malformed IDs reaching feature code. If a new identifier format requires additional characters, update the regex and document why here.

## How to use

- In a function signature that expects a chat ID: declare the parameter as `ChatId`, not `string`. The compiler will reject any caller passing an un-branded value.
- When constructing an ID from an unknown source (URL, JSON, user input): call the appropriate `to*` constructor and let it validate.
- When constructing from a value you already know is a branded ID of a different kind: don't. There is no legitimate path from `UserId` to `ChatId` that doesn't involve looking up data.

## Testing

Phase 1 ships these types without a dedicated test file — the constructors are simple enough that their behavior is exercised in feature tests as branded IDs flow through the app. When adding new ID kinds, add at least one test confirming that invalid inputs throw.

## Adding a new ID kind

1. Add a new `Brand<string, 'NewId'>` type export.
2. Add a `toNewId(s: string): NewId` constructor that calls the shared `assertId` helper.
3. Update this doc's "Defined types" table.
4. If the new ID has a stricter format than the shared regex permits, define a dedicated regex inside the constructor; do not loosen the shared one.

## Conventions

- One file holds every branded ID — keeps the regex shared and the discoverability high.
- Constructor names follow the `to<Kind>` pattern.
- No `unbrand` helper exists by design: extracting the raw string from a branded ID is almost always a mistake. If a third-party API genuinely needs the raw string, pass the branded value directly — it's structurally a string and JS doesn't care.

## References

- Architectural rationale: [`FRONTEND_ARCHITECTURE.md`](../../../FRONTEND_ARCHITECTURE.md) §10.1.
- Implementation phase: [`FRONTEND_IMPLEMENTATION_PLAN.md`](../../../FRONTEND_IMPLEMENTATION_PLAN.md) Phase 1.
- Master context: [`../context.md`](../context.md).
