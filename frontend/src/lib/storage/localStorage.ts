import type { ZodTypeAny, z } from 'zod';

/**
 * Typed localStorage wrapper. Reads pass through a Zod schema; on parse
 * failure the entry is deleted and `null` returned.
 *
 * Use for small UI preferences (filters, theme); business data belongs in
 * IndexedDB via `persistence.service`.
 */

function safeStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readLocal<Schema extends ZodTypeAny>(
  key: string,
  schema: Schema,
): z.infer<Schema> | null {
  const store = safeStorage();
  if (!store) return null;
  const raw = store.getItem(key);
  if (raw === null) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      store.removeItem(key);
      return null;
    }
    return parsed.data as z.infer<Schema>;
  } catch {
    store.removeItem(key);
    return null;
  }
}

export function writeLocal(key: string, value: unknown): void {
  const store = safeStorage();
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    // quota or serialization failure — silently skip
  }
}

export function removeLocal(key: string): void {
  const store = safeStorage();
  if (!store) return;
  store.removeItem(key);
}
