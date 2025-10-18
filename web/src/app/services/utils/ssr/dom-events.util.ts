/**
 * Dispatch a DOM event only when running in a browser context.
 */
export function safeDispatchEvent(event: Event): boolean {
  const win = typeof window !== 'undefined' ? window : null;
  if (!win || typeof win.dispatchEvent !== 'function') {
    return false;
  }
  return win.dispatchEvent(event);
}
