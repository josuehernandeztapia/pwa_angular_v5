export function resolveBffBaseUrl(defaultUrl: string = '/api'): string {
  try {
    const globalRef = typeof globalThis !== 'undefined'
      ? (globalThis as { __BFF_BASE__?: string })
      : undefined;

    if (globalRef?.__BFF_BASE__) {
      return globalRef.__BFF_BASE__;
    }

    if (typeof window !== 'undefined' && (window as { __BFF_BASE__?: string }).__BFF_BASE__) {
      return (window as { __BFF_BASE__?: string }).__BFF_BASE__ as string;
    }
  } catch {
    // Ignore access errors (e.g., CSP sandbox) and use fallback.
  }

  return defaultUrl;
}
