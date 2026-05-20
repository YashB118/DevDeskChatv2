## Module — Queues (BullMQ)

> Background-work substrate. Wraps `@nestjs/bullmq` with a Zod-validated worker harness, a dedicated ioredis connection (separate from the app client because BullMQ workers require `maxRetriesPerRequest: null` for blocking commands), and a `jobId`-based idempotency convention. Phase 5 ships the harness + an `example` smoke queue; Phase 7 adds the `webhook:waha` queue + `WebhookProcessor`.

**Files**
- `src/queues/queue.module.ts` — `BullModule.forRootAsync` reads `REDIS_URL`, applies `prefix` + `defaultJobOptions` from env; `registerQueue` for `example` + `webhook:waha`.
- `src/queues/worker.harness.ts` — invoked from every `@Processor`; parses payload with a Zod schema, attaches `queue/jobId/jobName/attempt/correlationId` structured fields to start/success/failure logs, emits `durationMs`, rethrows so BullMQ retries.
- `src/queues/job.types.ts` — `JobEnvelope<T> = { correlationId?, payload: T }` (carried by every job; the harness unwraps it before calling the handler).
- `src/queues/constants.ts` — `EXAMPLE_QUEUE` token; the `WEBHOOK_QUEUE` token lives in `modules/webhooks/constants.ts`.
- `src/queues/example.queue.ts` — `ExampleQueueProducer` (`@InjectQueue(EXAMPLE_QUEUE)`) + `ExamplePayloadSchema`; verifies the round-trip.
- `src/queues/example.processor.ts` — `@Processor(EXAMPLE_QUEUE)` extending `WorkerHost`; calls `harness.run(job, schema, handler)`.
- `src/queues/webhook.processor.ts` — `@Processor('webhook:waha')`; normalizes phone-format JIDs via `WahaStoreService.phoneToLid`, then dispatches through `WebhookDispatch`.

---

## 1. Responsibility

- Own the BullMQ root connection (one ioredis instance with `maxRetriesPerRequest: null`).
- Apply env-driven defaults to every queue: `attempts`, exponential `backoff`, retain counts for completed/failed jobs.
- Run a `WorkerHarness` around every handler so payload validation, correlation propagation, and per-job duration logging are uniform (Phase 10 will swap the log-based duration for a Prom histogram in one place).
- Provide a path for producers (`@InjectQueue(name)`) and consumers (`@Processor(name)` extending `WorkerHost`).

## 2. Job envelope

Every job carries:

```ts
type JobEnvelope<T> = { correlationId?: string; payload: T };
```

Producers wrap their domain payload before calling `queue.add(name, envelope, { jobId })`; the harness unwraps it and runs the handler with the typed `payload` plus a `HarnessContext` (`{ correlationId, jobId, attempt }`).

## 3. Idempotency

`jobId` is the dedupe key. BullMQ rejects a second `add` with the same id while the prior job still exists. Convention:

- `example` queue: caller-supplied unique key.
- `webhook:waha`: `jobId = event.id` (WAHA event UUID).

## 4. Retry + failure

`defaultJobOptions` from env:

```ts
{
  attempts: env.QUEUE_DEFAULT_ATTEMPTS,                      // default 5
  backoff: { type: 'exponential', delay: env.QUEUE_DEFAULT_BACKOFF_MS }, // 1s base
  removeOnComplete: { count: env.QUEUE_REMOVE_ON_COMPLETE },  // 1000
  removeOnFail: { count: env.QUEUE_REMOVE_ON_FAIL },          // 5000
}
```

Failed handlers throw; the harness records a structured `queue.job.failure` log carrying `errName`, `errMessage`, and `durationMs`, then rethrows so BullMQ schedules the next attempt.

## 5. Shutdown

`@nestjs/bullmq` implements `OnApplicationShutdown` on every `WorkerHost`, and `app.enableShutdownHooks()` is called in `main.ts`. SIGTERM drains in-flight jobs before exit.

## 6. Tests (`src/queues/*.spec.ts`)

- Worker harness: payload parsed, ctx carries `correlationId`/`jobId`/`attempt`, invalid payload throws `ValidationError`, handler errors rethrow, success log carries `durationMs`.
- Example producer: `queue.add` called with `(jobName, envelope, { jobId })`; correlationId omitted when not provided.
- Example processor: harness invoked, malformed payload rejected.
- `buildQueueOptions`: URL parsing (host/port/db), credentials decoded, `maxRetriesPerRequest: null` forced, prefix + defaults applied.
- WebhookProcessor: phone→LID across nested payloads, already-LID values pass through, envelope validation, error propagation.
