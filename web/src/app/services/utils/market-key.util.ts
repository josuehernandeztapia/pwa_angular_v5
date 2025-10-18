export function normalizeMarketKey(marketKey: string): string {
  const normalized = marketKey?.toLowerCase?.() ?? marketKey;
  const keyMap: Record<string, string> = {
    'edomex-colectivo': 'edomex',
    'edomex-individual': 'edomex',
    'edomex-plazo': 'edomex',
    'aguascalientes-plazo': 'aguascalientes',
    'aguascalientes-directa': 'aguascalientes',
    'aguascalientes-ahorro': 'aguascalientes',
  };
  return keyMap[normalized] ?? normalized;
}

export interface MarketContext {
  market: string;
  saleType: 'contado' | 'financiero';
  clientType?: string | null;
}

export function resolveProductPackageKey(context: MarketContext | null | undefined): string | null {
  if (!context?.market) {
    return null;
  }

  const market = context.market;
  if (context.saleType === 'contado') {
    return `${market}-directa`;
  }

  if (context.clientType === 'colectivo') {
    return `${market}-colectivo`;
  }

  if (context.clientType === 'individual') {
    return `${market}-plazo`;
  }

  return `${market}-plazo`;
}
