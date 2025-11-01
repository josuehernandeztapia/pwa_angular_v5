import { Pipe, PipeTransform } from '@angular/core';
import { BusinessFlow } from '@interfaces/types';
import {
  MarketPolicyContext,
  MarketPolicyMetadata,
  MarketPolicyService,
  PolicyClientType,
  PolicyMarket,
  TandaPolicyMetadata
} from '@services/features/configuration/market-policy.service';

export type PolicyHintType = 'income' | 'downPayment' | 'documentExpiry' | 'tandaContribution' | 'term';

export interface PolicyHintContext extends Partial<MarketPolicyContext> {
  market: PolicyMarket;
}

export interface PolicyHintOptions {
  context: PolicyHintContext;
  totalPrice?: number;
  minDownPaymentPct?: number;
  maxDownPaymentPct?: number;
  monthlyPayment?: number;
  documentId?: string;
}

@Pipe({
  name: 'policyHint',
  standalone: true
})
export class PolicyHintPipe implements PipeTransform {
  constructor(private readonly marketPolicy: MarketPolicyService) {}

  transform(kind: PolicyHintType, options: PolicyHintOptions | null | undefined): string | null {
    if (!options?.context?.market) {
      return null;
    }

    const context = this.resolveContext(options.context);
    const metadata = this.marketPolicy.getPolicyMetadata(context);

    switch (kind) {
      case 'income':
        return this.buildIncomeHint(metadata, options);
      case 'downPayment':
        return this.buildDownPaymentHint(metadata, options);
      case 'documentExpiry':
        return this.buildDocumentExpiryHint(context, metadata, options);
      case 'tandaContribution':
        return this.buildTandaContributionHint(metadata);
      case 'term':
        return this.buildTermHint(metadata);
      default:
        return null;
    }
  }

  private buildIncomeHint(metadata: MarketPolicyMetadata, options: PolicyHintOptions): string | null {
    const threshold = metadata.income?.threshold;
    if (!threshold) {
      return null;
    }

    const ratio = Math.round(threshold * 100);
    let message = `El pago mensual no debe superar ${ratio}% del ingreso comprobable.`;

    if (options.monthlyPayment && threshold > 0) {
      const requiredIncome = options.monthlyPayment / threshold;
      message += ` Ingreso sugerido: ${this.formatCurrency(requiredIncome)}.`;
    }

    return message;
  }

  private buildDownPaymentHint(metadata: MarketPolicyMetadata, options: PolicyHintOptions): string | null {
    const minPct = options.minDownPaymentPct;
    if (minPct === undefined || minPct === null) {
      return null;
    }

    const minPercent = Math.round(minPct * 100);
    let hint = `Enganche mínimo ${minPercent}%`;

    if (options.totalPrice) {
      const minAmount = options.totalPrice * minPct;
      hint += ` (${this.formatCurrency(minAmount)})`;
    }

    if (options.maxDownPaymentPct) {
      const maxPercent = Math.round(options.maxDownPaymentPct * 100);
      hint += `. Máximo sugerido ${maxPercent}%`;
    }

    return `${hint}.`;
  }

  private buildDocumentExpiryHint(
    context: MarketPolicyContext,
    metadata: MarketPolicyMetadata,
    options: PolicyHintOptions
  ): string | null {
    if (!options.documentId) {
      return null;
    }

    const document = this.marketPolicy.getDocumentById(context, options.documentId);
    if (document?.tooltip) {
      return document.tooltip;
    }

    const expiry = this.marketPolicy.getExpiryRules(context)?.[options.documentId];
    if (expiry) {
      return `Vigencia: ${expiry}.`;
    }

    return null;
  }

  private buildTandaContributionHint(metadata: MarketPolicyMetadata): string | null {
    const tanda = metadata.tanda;
    if (!tanda) {
      return null;
    }

    return this.formatTandaHint(tanda);
  }

  private buildTermHint(metadata: MarketPolicyMetadata): string | null {
    if (!metadata.protection?.coverageOptions?.length) {
      return null;
    }
    return null;
  }

  private resolveContext(context: PolicyHintContext): MarketPolicyContext {
    const {
      market,
      clientType = 'individual',
      saleType = 'financiero',
      businessFlow = BusinessFlow.VentaPlazo,
      requiresIncomeProof,
      collectiveSize,
      incomeThreshold,
      incomeThresholdRatio,
      metadata
    } = context;

    return {
      market,
      clientType: clientType as PolicyClientType,
      saleType,
      businessFlow,
      requiresIncomeProof,
      collectiveSize,
      incomeThreshold,
      incomeThresholdRatio,
      metadata
    };
  }

  private formatTandaHint(tanda: TandaPolicyMetadata): string {
    const min = this.formatCurrency(tanda.minContribution);
    const max = tanda.maxContribution ? this.formatCurrency(tanda.maxContribution) : null;
    const members = `${tanda.minMembers}-${tanda.maxMembers} integrantes`;

    if (max) {
      return `Aportación por integrante: entre ${min} y ${max}. Grupos de ${members}.`;
    }

    return `Aportación por integrante: desde ${min}. Grupos de ${members}.`;
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      maximumFractionDigits: 0
    }).format(value ?? 0);
  }
}
