import { PolicyClientType, PolicyMarket } from '@feature-services/configuration/market-policy.service';
import { IconName } from '@shared/icon/icon-definitions';

export type QuickActionColor = 'primary' | 'secondary' | 'success' | 'warning' | 'danger';

export interface CotizadorContextDefinition {
  id: string;
  preset: string;
  label: string;
  description?: string;
  route: string;
  iconType: IconName;
  dataCy: string;
  tooltip?: string;
  color?: QuickActionColor;
  queryParams?: Record<string, any>;
  market: PolicyMarket;
  clientType: PolicyClientType;
  autoAdvance?: boolean;
  showInNavigation?: boolean;
  showInQuickActions?: boolean;
}

export const COTIZADOR_CONTEXTS: ReadonlyArray<CotizadorContextDefinition> = [
  {
    id: 'cotizador-ags-individual',
    preset: 'ags-individual',
    label: 'AGS Individual',
    route: '/cotizador',
    iconType: 'truck',
    dataCy: 'nav-cotizador-ags',
    tooltip: 'Cotizar plan individual de Aguascalientes',
    color: 'primary',
    market: 'aguascalientes',
    clientType: 'individual',
    autoAdvance: true,
    showInNavigation: true,
    showInQuickActions: true,
    queryParams: {
      preset: 'ags-individual',
      market: 'aguascalientes',
      clientType: 'individual',
      autoAdvance: true
    }
  },
  {
    id: 'cotizador-edomex-colectivo',
    preset: 'edomex-colectivo',
    label: 'EdoMex Colectivo',
    route: '/cotizador',
    iconType: 'handshake',
    dataCy: 'nav-cotizador-edomex',
    tooltip: 'Cotizar plan colectivo Estado de México',
    color: 'success',
    market: 'edomex',
    clientType: 'colectivo',
    autoAdvance: true,
    showInNavigation: true,
    showInQuickActions: true,
    queryParams: {
      preset: 'edomex-colectivo',
      market: 'edomex',
      clientType: 'colectivo',
      autoAdvance: true
    }
  }
];

export function getCotizadorNavigationItems(): CotizadorContextDefinition[] {
  return COTIZADOR_CONTEXTS.filter(context => context.showInNavigation !== false);
}

export function getCotizadorQuickActions(): CotizadorContextDefinition[] {
  return COTIZADOR_CONTEXTS.filter(context => context.showInQuickActions);
}

export function resolveCotizadorPreset(preset: string | null | undefined): CotizadorContextDefinition | undefined {
  if (!preset) {
    return undefined;
  }

  const normalized = preset.startsWith('cotizador-') ? preset.replace('cotizador-', '') : preset;

  return COTIZADOR_CONTEXTS.find(context =>
    context.preset === normalized ||
    context.id === preset ||
    context.id.endsWith(normalized)
  );
}
