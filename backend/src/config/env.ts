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
