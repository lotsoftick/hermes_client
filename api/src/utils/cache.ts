export interface TTLCache<T> {
  get(): T;
  peek(): T | null;
  invalidate(): void;
}

/**
 * TTL-cached loader. On loader error, the stale cached value is returned if
 * present; otherwise the error is rethrown.
 */
export function withCache<T>(ttlMs: number, loader: () => T): TTLCache<T> {
  let cache: { data: T; ts: number } | null = null;
  return {
    get(): T {
      if (cache && Date.now() - cache.ts < ttlMs) return cache.data;
      try {
        const data = loader();
        cache = { data, ts: Date.now() };
        return data;
      } catch (err) {
        if (cache) return cache.data;
        throw err;
      }
    },
    peek(): T | null {
      return cache ? cache.data : null;
    },
    invalidate(): void {
      cache = null;
    },
  };
}
