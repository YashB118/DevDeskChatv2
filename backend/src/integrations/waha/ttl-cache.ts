/**
 * Small in-process TTL cache with single-flight loader semantics.
 *
 * Each key holds either a fresh value (returned immediately) or an
 * in-flight promise (returned to concurrent callers so the loader runs
 * exactly once per stampede window).
 */
export class TtlCache<V> {
  private readonly values = new Map<string, { value: V; expiresAt: number }>();
  private readonly inflight = new Map<string, Promise<V>>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get(key: string): V | undefined {
    const entry = this.values.get(key);
    if (entry === undefined) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.values.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V): void {
    if (this.ttlMs <= 0) return;
    this.values.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }

  invalidate(key: string): void {
    this.values.delete(key);
  }

  clear(): void {
    this.values.clear();
    this.inflight.clear();
  }

  async wrap(key: string, loader: () => Promise<V>): Promise<V> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const pending = this.inflight.get(key);
    if (pending !== undefined) return pending;
    const promise = loader()
      .then((value) => {
        this.set(key, value);
        return value;
      })
      .finally(() => {
        this.inflight.delete(key);
      });
    this.inflight.set(key, promise);
    return promise;
  }
}
