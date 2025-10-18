/**
 * Resolve runtime feature flags that may be injected on the global scope.
 * Keeps SSR compatibility by avoiding direct window access.
 */
export function resolveFeatureFlag(flag: string, fallback = false): boolean {
  try {
    const globalRef = typeof globalThis !== 'undefined' ? (globalThis as Record<string, any>) : undefined;
    const key = `__${flag}__`;
    if (globalRef && key in globalRef) {
      return Boolean(globalRef[key]);
    }
    if (typeof window !== 'undefined' && key in (window as Record<string, any>)) {
      return Boolean((window as Record<string, any>)[key]);
    }
  } catch {
    // Ignore access errors and fall back
  }
  return fallback;
}
