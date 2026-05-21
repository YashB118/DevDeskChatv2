import { z } from 'zod';

const csv = z
  .string()
  .min(1)
  .transform((v) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

const boolish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');

// PEM keys frequently arrive with literal `\n` sequences when dotenv loads them
// from a single-line .env. Normalize so callers receive a real PEM document.
const pem = z
  .string()
  .min(1)
  .transform((v) => v.replace(/\\n/g, '\n'))
  .refine((v) => v.includes('-----BEGIN') && v.includes('-----END'), 'must be a PEM-encoded key');

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3005),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  APP_NAME: z.string().min(1).default('devdeskchat-backend'),
  CORS_ORIGINS: csv.default('http://localhost:5173'),
  BODY_LIMIT: z.string().min(1).default('2mb'),
  TRUST_PROXY: boolish.default('false'),

  // Postgres
  DATABASE_URL: z.string().url(),
  PG_POOL_MAX: z.coerce.number().int().positive().max(200).default(20),
  PG_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  PG_IDLE_IN_TX_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  PG_SSL: boolish.default('false'),
  // Verify the server certificate chain. Default true (secure).
  // Set false ONLY for local dev against a cloud DB whose CA is not in Node's trust store
  // (e.g. Aiven, Supabase). Production: keep true and supply PG_SSL_CA instead.
  PG_SSL_REJECT_UNAUTHORIZED: boolish.default('true'),
  // PEM-encoded CA certificate (or chain). When set, pinned as the trust anchor.
  // Takes precedence over PG_SSL_REJECT_UNAUTHORIZED.
  PG_SSL_CA: z.string().min(1).optional(),

  // Redis
  REDIS_URL: z.string().url(),
  REDIS_KEY_PREFIX: z.string().min(1).default('devdesk:'),

  // Auth — JWT (RS256)
  JWT_PRIVATE_KEY: pem,
  JWT_PUBLIC_KEY: pem,
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_ISSUER: z.string().min(1).default('devdeskchat'),
  JWT_AUDIENCE: z.string().min(1).default('devdeskchat-clients'),

  // Auth — refresh + cookies
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
  REFRESH_COOKIE_NAME: z.string().min(1).default('dd_refresh'),
  REFRESH_COOKIE_PATH: z.string().min(1).default('/api/auth'),
  REFRESH_COOKIE_SECURE: boolish.default('true'),
  REFRESH_COOKIE_DOMAIN: z.string().min(1).optional(),

  // Auth — password hashing
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),

  // Queues — BullMQ
  QUEUE_PREFIX: z.string().min(1).default('devdesk-bull'),
  QUEUE_DEFAULT_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  QUEUE_DEFAULT_BACKOFF_MS: z.coerce.number().int().positive().default(1000),
  QUEUE_REMOVE_ON_COMPLETE: z.coerce.number().int().min(0).default(1000),
  QUEUE_REMOVE_ON_FAIL: z.coerce.number().int().min(0).default(5000),

  // WAHA HTTP client
  WAHA_BASE_URL: z.string().url(),
  WAHA_API_KEY: z.string().min(1).optional(),
  WAHA_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  WAHA_MEDIA_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  WAHA_RETRY_MAX: z.coerce.number().int().min(0).max(10).default(3),
  WAHA_RETRY_BASE_MS: z.coerce.number().int().positive().default(150),
  WAHA_CB_FAILURE_THRESHOLD: z.coerce.number().int().positive().default(5),
  WAHA_CB_COOLDOWN_MS: z.coerce.number().int().positive().default(30000),
  WAHA_SESSIONS_CACHE_TTL_MS: z.coerce.number().int().nonnegative().default(10000),
  WAHA_CHATS_CACHE_TTL_MS: z.coerce.number().int().nonnegative().default(10000),
  WAHA_STATUS_CACHE_TTL_MS: z.coerce.number().int().nonnegative().default(5000),

  // WAHA NOWEB SQLite store (read-only)
  WAHA_STORE_PATH: z.string().min(1),
  WAHA_STORE_REQUIRE_READONLY: boolish.default('false'),
  WAHA_STORE_CACHE_TTL_MS: z.coerce.number().int().nonnegative().default(60000),

  // WAHA webhook ingestion (Phase 7)
  // Optional HMAC shared secret. When set, every webhook request must carry
  // a matching `X-Webhook-Hmac` (hex SHA-256) header.
  WAHA_WEBHOOK_HMAC_SECRET: z.string().min(1).optional(),
  // Header name WAHA uses to deliver the HMAC signature.
  WAHA_WEBHOOK_HMAC_HEADER: z.string().min(1).default('x-webhook-hmac'),
  // Pending-send reconciliation window (must outlive the WAHA round-trip).
  PENDING_MESSAGE_TTL_MS: z.coerce.number().int().positive().default(9000),

  // Observability (Phase 10)
  // Master switch — defaults off so unit tests / local dev don't pay the
  // auto-instrumentation startup cost. Enable in staging / production.
  OTEL_ENABLED: boolish.default('false'),
  OTEL_SERVICE_NAME: z.string().min(1).default('devdeskchat-backend'),
  // OTLP HTTP exporter endpoint (e.g. http://otel-collector:4318/v1/traces).
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  // Sample rate 0..1 — defaults to "always" so an unsampled deploy is the
  // explicit choice, not the accidental one.
  OTEL_TRACES_SAMPLER_RATIO: z.coerce.number().min(0).max(1).default(1),
  // Token gating `/metrics`. When unset the endpoint refuses every request —
  // never accidentally expose it on a public ingress.
  METRICS_BEARER_TOKEN: z.string().min(8).optional(),
  // WAHA reachability probe — added to /health/ready. Result cached for this
  // many ms so terminus pings don't hammer the upstream.
  HEALTH_WAHA_CACHE_TTL_MS: z.coerce.number().int().nonnegative().default(15000),
  HEALTH_WAHA_TIMEOUT_MS: z.coerce.number().int().positive().default(2500),

  // Security hardening (Phase 11)
  // Global toggle. Off in unit tests so route handlers stay deterministic.
  RATE_LIMIT_ENABLED: boolish.default('true'),
  // Hard 30s request budget. Express `req.setTimeout` + interceptor enforce.
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  // Per-layer windows + caps. Defaults mirror BACKEND_ARCHITECTURE.md §15.
  RATE_LIMIT_IP_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_IP_MAX: z.coerce.number().int().positive().default(600),
  RATE_LIMIT_USER_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_USER_MAX: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_AUTH_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_SEND_WINDOW_SECONDS: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_SEND_MAX: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_CHATS_WINDOW_SECONDS: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_CHATS_MAX: z.coerce.number().int().positive().default(10),
  // Strict-Transport-Security max-age (seconds). 2 years default.
  HSTS_MAX_AGE_SECONDS: z.coerce.number().int().nonnegative().default(63072000),
});

export type AppConfig = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    const message = `Invalid environment configuration:\n${issues}`;
    // Cannot use the logger here — it depends on parsed env.

    console.error(message);
    throw new Error(message);
  }
  return result.data;
}
