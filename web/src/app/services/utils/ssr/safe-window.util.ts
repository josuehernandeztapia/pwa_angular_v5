/**
 * Obtain a reference to the browser window when available.
 * Returns null during SSR, tests, or any non-DOM runtime.
 */
export function safeWindow(): (Window & typeof globalThis) | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window;
}
