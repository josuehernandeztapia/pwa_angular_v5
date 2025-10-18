import { normalizeMarketKey, resolveProductPackageKey } from './market-key.util';

describe('market-key.util', () => {
  describe('normalizeMarketKey', () => {
    it('returns canonical market for edo mex collective', () => {
      expect(normalizeMarketKey('edomex-colectivo')).toBe('edomex');
    });

    it('handles uppercase inputs', () => {
      expect(normalizeMarketKey('AGUASCALIENTES-PLAZO')).toBe('aguascalientes');
    });

    it('returns original key when mapping missing', () => {
      expect(normalizeMarketKey('otros')).toBe('otros');
    });
  });

  describe('resolveProductPackageKey', () => {
    it('selects contado package when sale type is contado', () => {
      const key = resolveProductPackageKey({ market: 'edomex', saleType: 'contado' });
      expect(key).toBe('edomex-directa');
    });

    it('selects collective package for colectivo clients', () => {
      const key = resolveProductPackageKey({ market: 'edomex', saleType: 'financiero', clientType: 'colectivo' });
      expect(key).toBe('edomex-colectivo');
    });

    it('defaults to plazo when client type is unspecified', () => {
      const key = resolveProductPackageKey({ market: 'aguascalientes', saleType: 'financiero' });
      expect(key).toBe('aguascalientes-plazo');
    });

    it('returns null when market is missing', () => {
      expect(resolveProductPackageKey({ market: '', saleType: 'financiero' })).toBeNull();
    });
  });
});
