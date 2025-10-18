import { resolveBffBaseUrl } from './resolve-bff-base-url.util';

describe('resolveBffBaseUrl', () => {
  const originalOverride = (globalThis as { __BFF_BASE__?: string | undefined }).__BFF_BASE__;

  afterEach(() => {
    (globalThis as { __BFF_BASE__?: string | undefined }).__BFF_BASE__ = originalOverride;
    if (typeof window !== 'undefined') {
      (window as { __BFF_BASE__?: string | undefined }).__BFF_BASE__ = originalOverride;
    }
  });

  it('returns the global override when present', () => {
    (globalThis as { __BFF_BASE__?: string }).__BFF_BASE__ = '/custom-api';
    expect(resolveBffBaseUrl()).toBe('/custom-api');
  });

  it('falls back to the provided default when no override is defined', () => {
    (globalThis as { __BFF_BASE__?: string | undefined }).__BFF_BASE__ = undefined;
    if (typeof window !== 'undefined') {
      (window as { __BFF_BASE__?: string | undefined }).__BFF_BASE__ = undefined;
    }

    expect(resolveBffBaseUrl('/fallback')).toBe('/fallback');
  });
});
