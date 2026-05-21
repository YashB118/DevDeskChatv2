import { type Request } from 'express';
import { type ZodSchema } from 'zod';
import { type AppConfig } from '@app/config/env';

export const RATE_LIMIT_META = 'rate-limit:descriptor';

export interface SoftCacheLookup {
  /** Cache key to read; return `null` to skip the soft fallback for this req. */
  key(req: Request): string | null;
  /** Zod schema applied to the cached value before serving. */
  schema: ZodSchema<unknown>;
  /** Optional adapter from cached value to response body. */
  wrap?(cached: unknown): unknown;
}

/**
 * Named limiter classes. The interceptor reads the matching env vars at
 * runtime so deployments can retune caps without rebuilding the image.
 */
export type RateLimitPreset = 'auth' | 'send' | 'chats';

export const ratePresetCaps: Record<
  RateLimitPreset,
  (env: AppConfig) => { windowSeconds: number; max: number }
> = {
  auth: (env) => ({
    windowSeconds: env.RATE_LIMIT_AUTH_WINDOW_SECONDS,
    max: env.RATE_LIMIT_AUTH_MAX,
  }),
  send: (env) => ({
    windowSeconds: env.RATE_LIMIT_SEND_WINDOW_SECONDS,
    max: env.RATE_LIMIT_SEND_MAX,
  }),
  chats: (env) => ({
    windowSeconds: env.RATE_LIMIT_CHATS_WINDOW_SECONDS,
    max: env.RATE_LIMIT_CHATS_MAX,
  }),
};

/**
 * Descriptor for a per-route rate limit.
 *
 * `identify` returns a stable string used as the Redis key suffix (e.g. user id,
 * email, IP). Return `null` to skip the limit for that request.
 *
 * Soft-mode descriptors must supply `softCache` so the interceptor can
 * hydrate a cached payload when the limit is hit. When the cache misses, the
 * interceptor lets the request through — the soft limit degrades to a no-op
 * rather than a 429.
 */
export interface RateLimitDescriptor {
  preset: RateLimitPreset;
  mode: 'hard' | 'soft';
  identify: (req: Request) => string | null;
  softCache?: SoftCacheLookup;
}
