import { z } from 'zod';

const envSchema = z.object({
  VITE_API_BASE_URL: z.string().url(),
  VITE_SOCKET_URL: z.string().url(),
  VITE_APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  VITE_SENTRY_DSN: z.string().optional().default(''),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(source: Record<string, unknown>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid frontend env config:\n${issues}`);
  }
  return result.data;
}

export const env: Env = parseEnv(import.meta.env);

export { parseEnv };
