## Module — Webhooks

> WAHA → DevChatDesk ingress. `POST /api/webhooks/waha` validates the envelope, optionally verifies an HMAC signature over the raw body, immediately enqueues to BullMQ, and returns 200. `WebhookProcessor` normalizes phone-format JIDs to LID, then routes by event type through a Symbol-keyed dispatch table. Phase 7 wired stubs; Phase 8 rebound them to real domain handlers.

**Files**
- `src/modules/webhooks/webhooks.module.ts` — providers + `useExisting` bindings that point every event-type Symbol at a real handler.
- `src/modules/webhooks/webhooks.controller.ts` — `@Public()` `POST /api/webhooks/waha`; reads `X-Webhook-Hmac`, calls `verifySignature`, enqueues.
- `src/modules/webhooks/webhooks.service.ts` — HMAC verifier (timing-safe SHA-256 over `req.rawBody`, accepts `sha256=` prefix) + enqueue helper (`jobId = event.id`).
- `src/modules/webhooks/webhook.schema.ts` — Zod envelope `{ id, event, session, payload, ... }`; `WebhookEventTypes` enumerates the routes we recognize.
- `src/modules/webhooks/dispatch.ts` — event-type → handler map. Unknown events log + ack (do not retry forever).
- `src/modules/webhooks/handler.types.ts` — Symbol tokens (`MESSAGE_HANDLER`, `MESSAGE_ACK_HANDLER`, ...) so handlers can be rebound by Phase 8 / future phases without touching the dispatch wiring.
- `src/modules/webhooks/handlers/*.handler.ts` — per-event handlers (Phase 8): `message`, `message-ack`, `message-edited`, `message-reaction`, `message-revoked`, `session-status`, `group-participants`. Each Zod-parses the payload, persists state, and emits the typed socket event via `SocketEmitter`.
- `src/queues/webhook.processor.ts` — `@Processor('webhook:waha')`; phone→LID normalization via `WahaStoreService.phoneToLid`, then `WebhookDispatch.dispatch(event)`.
- `src/modules/webhooks/constants.ts` — `WEBHOOK_QUEUE = 'webhook:waha'`, `WEBHOOK_JOB_PROCESS = 'webhook.process'`.

---

## 1. Ingress flow

```
WAHA POST /api/webhooks/waha
   ↓ helmet → body-parser (verify: capture rawBody) → CorrelationMiddleware
   ↓ Public() → JwtAuthGuard bypassed
   ↓ ZodValidationPipe(WebhookEnvelopeSchema)
   ↓ WebhooksService.verifySignature(rawBody, header)   // timing-safe; sha256= prefix accepted
   ↓ queue.add('webhook.process', envelope, { jobId: event.id })  // dedupe at queue layer
   ← 200 { accepted: true }                               // < 50ms p95
```

Worker side:

```
WebhookProcessor.process(job)
   ↓ WorkerHarness.run(job, WebhookEnvelopeSchema, async (envelope) => { … })
   ↓ normalize(envelope.payload)   // recursive walk; phone JIDs → LIDs via WahaStoreService
   ↓ WebhookDispatch.dispatch(normalized)
       ├── message       → MessageWebhookHandler        → MessagesService.upsertFromWebhook (emit message:new unless pending)
       ├── message.ack   → MessageAckWebhookHandler     → emit message:ack
       ├── message.edited→ MessageEditedWebhookHandler  → records edit + emit message:edited
       ├── message.reaction → MessageReactionWebhookHandler → upsertReactionToggle + emit message:reaction
       ├── message.revoked  → MessageRevokedWebhookHandler  → markDeleted + emit message:deleted
       ├── session.status   → SessionStatusWebhookHandler   → SessionsService.applyStatusUpdate
       └── group.v2.participants → GroupParticipantsWebhookHandler → emit group:participants
```

Unknown event types log `unhandled webhook event=<name> id=<id>` and resolve so BullMQ marks the job complete.

## 2. HMAC verification

- `WAHA_WEBHOOK_HMAC_SECRET` unset → verification is **disabled** (`verifySignature` returns `true`). Dev / test setups don't need to plumb a secret.
- Header name configurable via `WAHA_WEBHOOK_HMAC_HEADER` (default `x-webhook-hmac`).
- Signature compared via `crypto.timingSafeEqual` against the SHA-256 hex digest of `req.rawBody`.
- Optional `sha256=` prefix is stripped before comparison.
- Missing rawBody (body-parser hook didn't run) or missing header with secret configured → 401.

## 3. Idempotency

`jobId = event.id` means a redelivered WAHA event is rejected at the queue layer (BullMQ refuses a duplicate add while the prior job exists). Handlers themselves are still designed to be idempotent (`upsert` rather than `insert`, set-based reaction toggles, etc.) so a redelivery after retention rotation is also safe.

## 4. Tests (`src/modules/webhooks/*.spec.ts`, `src/queues/webhook.processor.spec.ts`)

- HMAC: disabled when no secret; matching hex SHA-256; `sha256=` prefix accepted; tampered signature rejected; missing inputs rejected.
- Controller: 200 on valid signature, `UnauthorizedException` on invalid, header lookup case-insensitive.
- Dispatch: every recognized event routes to the right handler; unknown event ack-only; handler errors propagate (so BullMQ retries).
- Processor: phone→LID normalization across nested objects and arrays, already-LID values pass through, envelope validation rejects malformed jobs.
