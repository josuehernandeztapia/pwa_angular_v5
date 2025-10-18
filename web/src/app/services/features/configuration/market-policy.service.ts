import { Injectable, Optional } from '@angular/core';
import { firstValueFrom, Observable, of, throwError } from 'rxjs';
import { catchError, map, take, tap } from 'rxjs/operators';

import { BusinessFlow, Document, DocumentStatus, DOC_NAME_KYC_CONTAINS } from '@interfaces/types';
import { ConfigurationService } from '@core-services/configuration.service';
import { HttpClientService } from '@core-services/http-client.service';

export type PolicyMarket = 'aguascalientes' | 'edomex' | 'otros';
export type PolicyClientType = 'individual' | 'colectivo';
export type ProtectionCoverageType = 'standard' | 'premium' | 'group';

export interface ProtectionPolicyMetadata {
  required: boolean;
  coverageOptions: ProtectionCoverageType[];
  defaultCoverage?: ProtectionCoverageType;
  simulateEndpoint?: string;
  applyEndpoint?: string;
  scoreEndpoint?: string;
  fallbackScoreEndpoint?: string;
}

export interface TandaPolicyMetadata {
  minMembers: number;
  maxMembers: number;
  minContribution: number;
  maxContribution: number;
  minRounds: number;
  maxRounds: number;
  validationEndpoint?: string;
  scheduleEndpoint?: string;
}

export interface IncomePolicyMetadata {
  threshold: number;
  documentId?: string;
}

export interface MarketPolicyContext {
  market: PolicyMarket;
  clientType: PolicyClientType;
  saleType: 'contado' | 'financiero';
  businessFlow?: BusinessFlow;
  requiresIncomeProof?: boolean;
  collectiveSize?: number;
  incomeThreshold?: number;
  incomeThresholdRatio?: number;
  metadata?: {
    tanda?: TandaPolicyMetadata;
  };
}

export interface MarketPolicyDocument {
  id: string;
  label: string;
  tooltip?: string;
  optional?: boolean;
  group?: 'member';
}

export interface MarketPolicyMetadata {
  ocrThreshold: number;
  expiryRules?: Record<string, string>;
  protection?: ProtectionPolicyMetadata;
  tanda?: TandaPolicyMetadata;
  income?: IncomePolicyMetadata;
}

export interface MarketPolicyResult {
  documents: MarketPolicyDocument[];
  metadata: MarketPolicyMetadata;
}

type PolicyKey = `${PolicyMarket}:${PolicyClientType}`;
type PolicyBuilder = (context: MarketPolicyContext) => MarketPolicyResult;

export interface MarketPolicyConfigEntry {
  market: PolicyMarket;
  clientType: PolicyClientType;
  documents: MarketPolicyDocument[];
  metadata: MarketPolicyMetadata;
}

interface RemoteMarketPolicyConfigEntry {
  documents: MarketPolicyDocument[];
  metadata: MarketPolicyMetadata;
}

export type RemoteMarketPolicyConfig = Record<string, RemoteMarketPolicyConfigEntry>;

const POLICY_KEY_MAPPINGS: Record<string, { market: PolicyMarket; clientType: PolicyClientType }> = {
  ags: { market: 'aguascalientes', clientType: 'individual' },
  'aguascalientes': { market: 'aguascalientes', clientType: 'individual' },
  'aguascalientes-individual': { market: 'aguascalientes', clientType: 'individual' },
  edomex: { market: 'edomex', clientType: 'individual' },
  'edomex-individual': { market: 'edomex', clientType: 'individual' },
  'edomex-colectivo': { market: 'edomex', clientType: 'colectivo' },
  otros: { market: 'otros', clientType: 'individual' },
  'otros-individual': { market: 'otros', clientType: 'individual' },
  'otros-colectivo': { market: 'otros', clientType: 'colectivo' }
};

function normalizePolicyKey(key: string): { market: PolicyMarket; clientType: PolicyClientType } | undefined {
  const normalized = key
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/_/g, '-');

  return POLICY_KEY_MAPPINGS[normalized];
}

@Injectable({ providedIn: 'root' })
export class MarketPolicyService {
  private readonly defaultThreshold = 0.85;
  private readonly defaultCollectiveSize = 5;

  private readonly policyBuilders: Partial<Record<PolicyKey, PolicyBuilder>> = {
    'aguascalientes:individual': context => this.buildAguascalientesIndividual(context),
    'edomex:individual': context => this.buildEdomexIndividual(context),
    'edomex:colectivo': context => this.buildEdomexColectivo(context),
    'otros:individual': context => this.buildOtrosIndividual(context),
    'otros:colectivo': context => this.buildOtrosColectivo(context),
  };

  private remoteConfig: RemoteMarketPolicyConfig | null = null;
  private remoteConfigUpdatedAt: number | null = null;

  constructor(
    @Optional() private readonly configurationService?: ConfigurationService,
    @Optional() private readonly httpClient?: HttpClientService,
  ) {
    this.bootstrapRemotePolicies();
  }

  getPolicyDocuments(context: MarketPolicyContext): MarketPolicyResult {
    const key: PolicyKey = `${context.market}:${context.clientType}` as PolicyKey;
    const builder = this.policyBuilders[key];

    if (builder) {
      return builder({
        ...context,
        businessFlow: context.businessFlow ?? BusinessFlow.VentaPlazo
      });
    }

    return this.buildFallbackPolicy();
  }

  toDocuments(result: MarketPolicyResult): Document[] {
    return result.documents.map(doc => ({
      id: doc.id,
      name: doc.label,
      tooltip: doc.tooltip,
      isOptional: doc.optional,
      group: doc.group,
      status: DocumentStatus.Pendiente
    }));
  }

  isRequiredDocument(docId: string, policy: MarketPolicyResult): boolean {
    const entry = policy.documents.find(doc => doc.id === docId);
    if (!entry) {
      return false;
    }
    return !entry.optional;
  }

  getRequiredDocs(context: MarketPolicyContext): MarketPolicyDocument[] {
    const policy = this.getPolicyDocuments(context);
    return policy.documents.filter(doc => !doc.optional);
  }

  getConditionalDocs(context: MarketPolicyContext): MarketPolicyDocument[] {
    const policy = this.getPolicyDocuments(context);
    return policy.documents.filter(doc => doc.optional);
  }

  getPolicyMetadata(context: MarketPolicyContext): MarketPolicyMetadata {
    return this.cloneMetadata(this.getPolicyDocuments(context).metadata);
  }

  getAvailablePolicies(): Array<{ market: PolicyMarket; clientType: PolicyClientType }> {
    const combos = new Map<PolicyKey, { market: PolicyMarket; clientType: PolicyClientType }>();

    Object.entries(this.policyBuilders).forEach(([key, builder]) => {
      if (!builder) {
        return;
      }

      const [market, clientType] = key.split(':') as [PolicyMarket, PolicyClientType];
      combos.set(`${market}:${clientType}` as PolicyKey, { market, clientType });
    });

    return Array.from(combos.values()).sort((a, b) => {
      if (a.market === b.market) {
        return a.clientType.localeCompare(b.clientType);
      }
      return a.market.localeCompare(b.market);
    });
  }

  getAvailableMarkets(): PolicyMarket[] {
    const markets = new Set<PolicyMarket>();
    this.getAvailablePolicies().forEach(policy => markets.add(policy.market));
    return Array.from(markets.values()).sort();
  }

  getClientTypesForMarket(market: PolicyMarket): PolicyClientType[] {
    const clientTypes = new Set<PolicyClientType>();
    this.getAvailablePolicies()
      .filter(policy => policy.market === market)
      .forEach(policy => clientTypes.add(policy.clientType));

    return Array.from(clientTypes.values()).sort();
  }

  getOcrThreshold(context: MarketPolicyContext): number {
    return this.getPolicyMetadata(context).ocrThreshold;
  }

  getExpiryRules(context: MarketPolicyContext): Record<string, string> | undefined {
    return this.getPolicyMetadata(context).expiryRules;
  }

  getDocumentById(context: MarketPolicyContext, documentId: string): MarketPolicyDocument | undefined {
    return this.getPolicyDocuments(context).documents.find(doc => doc.id === documentId);
  }

  requiresProtection(context: MarketPolicyContext): boolean {
    return this.getPolicyMetadata(context).protection?.required ?? false;
  }

  getProtectionCoverageOptions(context: MarketPolicyContext): ProtectionCoverageType[] {
    return [...(this.getPolicyMetadata(context).protection?.coverageOptions ?? [])];
  }

  getProtectionMetadata(context: MarketPolicyContext): ProtectionPolicyMetadata | undefined {
    const protection = this.getPolicyMetadata(context).protection;
    return protection ? { ...protection, coverageOptions: [...protection.coverageOptions] } : undefined;
  }

  getTandaRules(context: MarketPolicyContext): TandaPolicyMetadata | undefined {
    const tanda = this.getPolicyMetadata(context).tanda;
    return tanda ? { ...tanda } : undefined;
  }

  getIncomeThreshold(context: MarketPolicyContext): number | undefined {
    return this.getPolicyMetadata(context).income?.threshold;
  }

  getIncomeDocumentId(context: MarketPolicyContext): string | undefined {
    return this.getPolicyMetadata(context).income?.documentId;
  }

  registerPoliciesFromConfig(entries: MarketPolicyConfigEntry[]): void {
    entries.forEach(entry => this.registerPolicyFromConfig(entry));
  }

  // Permite cargar políticas desde JSONs que usan claves abreviadas ("AGS", "EdoMex-Individual").
  registerPoliciesFromRemoteConfig(config: RemoteMarketPolicyConfig): void {
    Object.entries(config).forEach(([rawKey, entry]) => {
      const resolved = normalizePolicyKey(rawKey) ?? { market: 'otros', clientType: 'individual' };

      this.registerPolicyFromConfig({
        market: resolved.market,
        clientType: resolved.clientType,
        documents: entry.documents,
        metadata: entry.metadata,
      });
    });

    this.remoteConfig = JSON.parse(JSON.stringify(config));
    this.remoteConfigUpdatedAt = Date.now();
  }

  savePoliciesToRemote(config: RemoteMarketPolicyConfig): Observable<void> {
    if (!this.httpClient) {
      this.registerPoliciesFromRemoteConfig(config);
      return of(void 0);
    }

    return this.httpClient.put('config/market-policies', config, {
      showLoading: true,
      showError: true,
      successMessage: 'Políticas guardadas'
    }).pipe(
      map(() => void 0),
      tap(() => this.registerPoliciesFromRemoteConfig(config)),
      catchError(error => {
        this.registerPoliciesFromRemoteConfig(config);
        return throwError(() => error);
      })
    );
  }


  registerPolicyFromConfig(entry: MarketPolicyConfigEntry): void {
    const key: PolicyKey = `${entry.market}:${entry.clientType}` as PolicyKey;

    this.policyBuilders[key] = () => ({
      documents: entry.documents.map(doc => ({ ...doc })),
      metadata: this.cloneMetadata(entry.metadata),
    });
  }

  private bootstrapRemotePolicies(): void {
    if (!this.configurationService) {
      return;
    }

    this.reloadRemotePolicies().catch(() => undefined);
  }

  getRemoteConfigSnapshot(): RemoteMarketPolicyConfig | null {
    return this.remoteConfig ? JSON.parse(JSON.stringify(this.remoteConfig)) : null;
  }

  getRemoteConfigUpdatedAt(): number | null {
    return this.remoteConfigUpdatedAt;
  }

  async reloadRemotePolicies(): Promise<void> {
    if (!this.configurationService) {
      return;
    }

    try {
      const config = await firstValueFrom(
        this.configurationService
          .loadNamespace<RemoteMarketPolicyConfig>('markets/market-policies', {})
          .pipe(take(1))
      );

      if (config && Object.keys(config).length) {
        this.registerPoliciesFromRemoteConfig(config);
      }
    } catch {
      // Preserve existing policies when remote config cannot be fetched.
    }
  }

  private buildAguascalientesIndividual(context: MarketPolicyContext): MarketPolicyResult {
    const baseDocs: readonly MarketPolicyDocument[] = [
      { id: 'doc-ine', label: 'INE anverso/reverso', tooltip: 'Debe estar vigente al menos 90 días' },
      { id: 'doc-proof', label: 'Comprobante de domicilio', tooltip: 'Factura o recibo no mayor a 3 meses' },
      { id: 'doc-csf', label: 'Constancia de situación fiscal', tooltip: 'Descargar desde el portal del SAT (máx. 90 días)' }
    ] as const;

    const conditionalDocs: MarketPolicyDocument[] = [];

    if (context.saleType === 'financiero') {
      conditionalDocs.push(
        {
          id: 'doc-rfc',
          label: 'RFC del cliente',
          tooltip: 'Requerido solo para planes con financiamiento'
        },
        {
          id: 'doc-tarjeta-circulacion',
          label: 'Tarjeta de circulación',
          tooltip: 'Tarjeta vigente de la unidad titular'
        },
        {
          id: 'doc-concesion',
          label: 'Copia de la concesión',
          tooltip: 'Documento que acredita la concesión activa de la ruta'
        },
        {
          id: 'doc-kyc',
          label: `${DOC_NAME_KYC_CONTAINS} (Metamap)`,
          tooltip: 'Verificación biométrica obligatoria en Metamap'
        }
      );
    }

    conditionalDocs.push(this.buildIncomeDocument(context));

    return {
      documents: [...baseDocs, ...conditionalDocs],
      metadata: {
        ocrThreshold: this.defaultThreshold,
        expiryRules: {
          'doc-ine': 'vigencia >= 90d',
          'doc-proof': '<= 3m',
          'doc-csf': '<= 90d',
          'doc-tarjeta-circulacion': 'vigencia >= 90d',
          'doc-concesion': 'vigencia >= 1a'
        },
        protection: {
          required: false,
          coverageOptions: ['standard', 'premium'],
          defaultCoverage: 'standard',
          simulateEndpoint: '/v1/protection/simulate',
          applyEndpoint: '/v1/protection/apply',
          scoreEndpoint: '/v1/health/score',
          fallbackScoreEndpoint: '/v1/health/cache'
        },
        income: {
          threshold: 0.4,
          documentId: 'doc-income'
        }
      }
    };
  }

  private buildEdomexIndividual(context: MarketPolicyContext): MarketPolicyResult {
    const baseDocs: MarketPolicyDocument[] = [
      { id: 'doc-ine', label: 'INE anverso/reverso', tooltip: 'Debe estar vigente al menos 90 días' },
      { id: 'doc-proof', label: 'Comprobante de domicilio', tooltip: 'Factura o recibo no mayor a 3 meses' },
      { id: 'doc-rfc', label: 'RFC del cliente', tooltip: 'Validación obligatoria en EdoMex' },
      { id: 'doc-csf', label: 'Constancia de situación fiscal', tooltip: 'Descargar desde el portal del SAT (máx. 90 días)' },
      { id: 'doc-tarjeta-circulacion', label: 'Tarjeta de circulación', tooltip: 'Tarjeta vigente de la unidad titular' },
      { id: 'doc-concesion', label: 'Copia de la concesión', tooltip: 'Documento emitido por la autoridad local' },
      { id: 'doc-carta-aval', label: 'Carta Aval de Ruta', tooltip: 'Documento emitido y validado por el ecosistema/ruta' },
      { id: 'doc-convenio-dacion', label: 'Convenio de Dación en Pago', tooltip: 'Anexo que formaliza el colateral social' }
    ];

    const documents: MarketPolicyDocument[] = [...baseDocs];

    if (context.saleType === 'financiero') {
      documents.push({
        id: 'doc-kyc',
        label: `${DOC_NAME_KYC_CONTAINS} (Metamap)`,
        tooltip: 'Verificación biométrica obligatoria en Metamap'
      });
    }

    documents.push(this.buildIncomeDocument(context));

    return {
      documents,
      metadata: {
        ocrThreshold: this.defaultThreshold,
        expiryRules: {
          'doc-ine': 'vigencia >= 90d',
          'doc-proof': '<= 3m',
          'doc-csf': '<= 90d',
          'doc-tarjeta-circulacion': 'vigencia >= 90d',
          'doc-concesion': 'vigencia >= 1a'
        },
        protection: {
          required: false,
          coverageOptions: ['standard', 'premium'],
          defaultCoverage: 'standard',
          simulateEndpoint: '/v1/protection/simulate',
          applyEndpoint: '/v1/protection/apply',
          scoreEndpoint: '/v1/health/score',
          fallbackScoreEndpoint: '/v1/health/cache'
        },
        income: {
          threshold: 0.38,
          documentId: 'doc-income'
        }
      }
    };
  }

  private buildEdomexColectivo(context: MarketPolicyContext): MarketPolicyResult {
    const maxMembers = 12;
    const memberCount = Math.max(
      Math.min(context.collectiveSize ?? this.defaultCollectiveSize, maxMembers),
      1
    );
    const docs: MarketPolicyDocument[] = [
      {
        id: 'doc-consent',
        label: 'Carta consentimiento colectivo',
        tooltip: 'Debe contener nombre del grupo, cuotas y firma responsable'
      }
    ];

    for (let i = 0; i < memberCount; i++) {
      const memberLabel = `Integrante ${i + 1}`;
      docs.push({
        id: `doc-ine-${i + 1}`,
        label: `${memberLabel}: INE`,
        group: 'member',
        tooltip: 'INE vigente y legible de cada integrante'
      });
      docs.push({
        id: `doc-rfc-${i + 1}`,
        label: `${memberLabel}: RFC`,
        group: 'member',
        tooltip: 'RFC validado ante SAT por integrante'
      });
    }

    docs.push({
      id: 'doc-proof-leader',
      label: 'Comprobante domicilio líder',
      optional: true,
      tooltip: 'Solo si el flujo requiere validar domicilio del líder'
    });
    docs.push({
      id: 'doc-roster',
      label: 'Lista de miembros firmada',
      optional: true,
      tooltip: 'Documento QA con firmas de todos los integrantes'
    });

    return {
      documents: docs,
      metadata: {
        ocrThreshold: 0.80,
        expiryRules: {
          'doc-ine-*': 'vigencia >= 90d'
        },
        protection: {
          required: true,
          coverageOptions: ['group'],
          defaultCoverage: 'group',
          simulateEndpoint: '/v1/protection/simulate',
          applyEndpoint: '/v1/protection/apply',
          scoreEndpoint: '/v1/health/score',
          fallbackScoreEndpoint: '/v1/health/cache'
        },
        tanda: {
          minMembers: 5,
          maxMembers,
          minContribution: 500,
          maxContribution: 3500,
          minRounds: 5,
          maxRounds: 24,
          validationEndpoint: '/v1/tanda/validate',
          scheduleEndpoint: '/v1/tanda/schedule'
        }
      }
    };
  }

  private buildOtrosIndividual(context: MarketPolicyContext): MarketPolicyResult {
    const baseDocs: MarketPolicyDocument[] = [
      { id: 'doc-ine', label: 'Identificación oficial (INE/Pasaporte)', tooltip: 'Documento vigente del titular' },
      { id: 'doc-proof', label: 'Comprobante de domicilio', tooltip: 'Estado de cuenta o servicio no mayor a 60 días' },
      { id: 'doc-csf', label: 'Constancia de situación fiscal', tooltip: 'Emitida por el SAT en los últimos 90 días' },
      { id: 'doc-licencia', label: 'Licencia de conducir', tooltip: 'Con vigencia y categoría acorde al vehículo' }
    ];

    const conditionalDocs: MarketPolicyDocument[] = [];

    if (context.saleType === 'financiero') {
      conditionalDocs.push(
        {
          id: 'doc-buro',
          label: 'Reporte de Buró de Crédito',
          tooltip: 'Consulta completa con fecha menor a 30 días'
        },
        {
          id: 'doc-bank',
          label: 'Estados de cuenta bancarios (3 meses)',
          tooltip: 'Usados para validar flujo de efectivo'
        }
      );
    }

    conditionalDocs.push(
      this.buildIncomeDocument({ ...context, requiresIncomeProof: true }),
      {
        id: 'doc-curp',
        label: 'CURP',
        optional: true,
        tooltip: 'Se solicita cuando la identificación no incluye CURP'
      }
    );

    return {
      documents: [...baseDocs, ...conditionalDocs],
      metadata: {
        ocrThreshold: 0.82,
        expiryRules: {
          'doc-ine': 'vigencia >= 90d',
          'doc-proof': '<= 60d',
          'doc-csf': '<= 90d',
          'doc-licencia': 'vigencia >= 6m'
        },
        protection: {
          required: false,
          coverageOptions: ['standard', 'premium'],
          defaultCoverage: 'standard',
          simulateEndpoint: '/v1/protection/simulate',
          applyEndpoint: '/v1/protection/apply',
          scoreEndpoint: '/v1/health/score',
          fallbackScoreEndpoint: '/v1/health/cache'
        },
        income: {
          threshold: 0.35,
          documentId: 'doc-income'
        }
      }
    };
  }

  private buildOtrosColectivo(context: MarketPolicyContext): MarketPolicyResult {
    const targetMembers = Math.max(3, Math.min(context.collectiveSize ?? this.defaultCollectiveSize, 25));
    const documents: MarketPolicyDocument[] = [
      {
        id: 'doc-consent-group',
        label: 'Acta constitutiva o carta constitutiva del grupo',
        tooltip: 'Documento firmado por el representante legal o líderes del colectivo'
      },
      {
        id: 'doc-rfc-group',
        label: 'RFC del colectivo / cooperativa',
        tooltip: 'Registro ante el SAT vigente'
      },
      {
        id: 'doc-legal-power',
        label: 'Poder legal del representante',
        tooltip: 'Instrumento notarial con facultades para celebrar contratos'
      },
      {
        id: 'doc-domicile-group',
        label: 'Comprobante de domicilio del grupo',
        tooltip: 'Contrato de arrendamiento o servicio fijo (<= 60 días)'
      }
    ];

    for (let index = 0; index < targetMembers; index++) {
      documents.push(
        {
          id: `doc-ine-miembro-${index + 1}`,
          label: `Integrante ${index + 1}: Identificación oficial`,
          group: 'member',
          tooltip: 'INE o pasaporte vigente'
        },
        {
          id: `doc-proof-miembro-${index + 1}`,
          label: `Integrante ${index + 1}: Comprobante de domicilio`,
          group: 'member',
          tooltip: 'Servicio fijo o estado de cuenta (<= 60 días)'
        }
      );
    }

    documents.push(
      {
        id: 'doc-roster-signed',
        label: 'Padrón de integrantes firmado',
        optional: true,
        tooltip: 'Lista nominal con firmas y teléfonos de contacto'
      },
      this.buildIncomeDocument({ ...context, requiresIncomeProof: context.saleType === 'financiero' })
    );

    return {
      documents,
      metadata: {
        ocrThreshold: 0.80,
        expiryRules: {
          'doc-ine-miembro-*': 'vigencia >= 90d',
          'doc-proof-miembro-*': '<= 60d',
          'doc-domicile-group': '<= 60d'
        },
        protection: {
          required: true,
          coverageOptions: ['group', 'premium'],
          defaultCoverage: 'group',
          simulateEndpoint: '/v1/protection/simulate',
          applyEndpoint: '/v1/protection/apply',
          scoreEndpoint: '/v1/health/score',
          fallbackScoreEndpoint: '/v1/health/cache'
        },
        tanda: {
          minMembers: 3,
          maxMembers: 25,
          minContribution: 400,
          maxContribution: 5000,
          minRounds: 4,
          maxRounds: 36,
          validationEndpoint: '/v1/tanda/validate',
          scheduleEndpoint: '/v1/tanda/schedule'
        },
        income: {
          threshold: 0.3,
          documentId: 'doc-income'
        }
      }
    };
  }

  private buildFallbackPolicy(): MarketPolicyResult {
    return {
      documents: [
        { id: 'doc-ine', label: 'INE anverso/reverso' },
        { id: 'doc-proof', label: 'Comprobante de domicilio' }
      ],
      metadata: {
        ocrThreshold: this.defaultThreshold,
        protection: {
          required: false,
          coverageOptions: ['standard'],
          defaultCoverage: 'standard',
          simulateEndpoint: '/v1/protection/simulate',
          applyEndpoint: '/v1/protection/apply'
        }
      }
    };
  }

  private buildIncomeDocument(context: MarketPolicyContext): MarketPolicyDocument {
    const optional = context.requiresIncomeProof !== true;
    return {
      id: 'doc-income',
      label: 'Comprobante de ingresos',
      optional,
      tooltip: optional
        ? 'Se solicita cuando el pago mensual supera el umbral configurado'
        : 'Obligatorio: el pago mensual supera el umbral configurado'
    };
  }

  private cloneMetadata(metadata: MarketPolicyMetadata): MarketPolicyMetadata {
    return {
      ocrThreshold: metadata.ocrThreshold,
      expiryRules: metadata.expiryRules ? { ...metadata.expiryRules } : undefined,
      protection: metadata.protection
        ? {
            ...metadata.protection,
            coverageOptions: [...metadata.protection.coverageOptions]
          }
        : undefined,
      tanda: metadata.tanda ? { ...metadata.tanda } : undefined,
      income: metadata.income ? { ...metadata.income } : undefined,
    };
  }
}
