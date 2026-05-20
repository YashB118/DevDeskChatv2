type RefreshFn = () => Promise<string>;

let inFlight: Promise<string> | null = null;
let refreshFn: RefreshFn | null = null;

export function registerRefreshHandler(fn: RefreshFn): void {
  refreshFn = fn;
}

export function clearRefreshHandler(): void {
  refreshFn = null;
}

export function refreshAccessToken(): Promise<string> {
  if (inFlight) return inFlight;
  if (!refreshFn) return Promise.reject(new Error('No refresh handler registered'));

  inFlight = refreshFn().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export function isRefreshing(): boolean {
  return inFlight !== null;
}

export function _resetRefreshState(): void {
  inFlight = null;
  refreshFn = null;
}
