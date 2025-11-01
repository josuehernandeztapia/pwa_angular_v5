import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { ToastService } from '@core-services/toast.service';
import { FlowContextService } from '@core-services/flow-context.service';
import { FinancialCalculatorService } from '@feature-services/cotizador/financial-calculator.service';
import { CotizadorEngineService, ProductComponent, ProductPackage, ProductPackageContext } from '@feature-services/cotizador/cotizador-engine.service';
import { MarketPolicyContext, MarketPolicyMetadata, MarketPolicyService, PolicyClientType, PolicyMarket } from '@feature-services/configuration/market-policy.service';
import { BusinessFlow, Client, Document, Market } from '@interfaces/types';
import { ClientType, SimulatorMode, Quote } from '@interfaces/business';
import { QuotesApiService } from '@data-access/quotes/quotes-api.service';
import { MathValidationSnapshot } from '@interfaces/math-validation';
import { PdfExportService } from '@feature-services/documents/pdf-export.service';
import { DocumentRequirementsService } from '@feature-services/documents/document-requirements.service';
import { normalizeMarketKey, resolveProductPackageKey } from '@services/utils/market-key.util';

export interface CollectionUnit {
  id: number;
  consumption: string;
  overprice: string;
}

export interface AmortizationRow {
  paymentNumber: number;
  monthlyPayment: number;
  principal: number;
  interest: number;
  balance: number;
}

interface TandaLimits {
  min: number;
  max: number;
}

export type BusinessValidationSeverity = 'error' | 'warning' | 'info';
export type PolicyHintField = 'downPayment' | 'term' | 'income';

export interface BusinessValidationMessage {
  code: string;
  field?:
    | 'market'
    | 'clientType'
    | 'downPayment'
    | 'term'
    | 'insurance'
    | 'tandaMembers'
    | 'savings';
  severity: BusinessValidationSeverity;
  message: string;
  hint?: string;
}

@Injectable({ providedIn: 'root' })
export class CotizadorStore {
  private readonly cotizadorEngine = inject(CotizadorEngineService);
  private readonly marketPolicy = inject(MarketPolicyService);
  private readonly toast = inject(ToastService);
  private readonly financialCalc = inject(FinancialCalculatorService);
  private readonly pdfExport = inject(PdfExportService);
  private readonly router = inject(Router);
  private readonly flowContext = inject(FlowContextService, { optional: true });
  private readonly quotesApi = inject(QuotesApiService);
  private readonly documentRequirements = inject(DocumentRequirementsService, { optional: true });
  private readonly marketLabels: Record<PolicyMarket, string> = {
    aguascalientes: 'Aguascalientes',
    edomex: 'EdoMex',
    otros: 'Otros mercados'
  };

  readonly currentStep = signal(1);
  readonly totalSteps = 4;
  readonly client = signal<Client | undefined>(undefined);
  readonly initialMode = signal<SimulatorMode>('acquisition');

  readonly market = signal<PolicyMarket | ''>('');
  readonly clientType = signal<PolicyClientType | ''>('');
  readonly marketOptions = signal<PolicyMarket[]>([]);
  readonly clientTypeOptions = signal<PolicyClientType[]>([]);
  readonly pkg = signal<ProductPackage | null>(null);
  readonly isLoading = signal(false);

  private readonly policyClientTypeIndex = signal<Map<PolicyMarket, PolicyClientType[]>>(new Map());
  readonly tandaLimits = signal<TandaLimits>({ min: 2, max: 20 });
  readonly currentPolicyMetadata = signal<MarketPolicyMetadata | undefined>(undefined);
  readonly currentPolicyContext = signal<MarketPolicyContext | null>(null);

  readonly selectedOptions = signal<Record<string, boolean>>({});
  readonly downPaymentPercentage = signal(20);
  readonly downPaymentAmountDirect = signal('0');
  readonly term = signal(0);
  readonly initialDownPayment = signal('0');

  readonly deliveryTerm = signal(3);
  readonly voluntaryContribution = signal('0');
  readonly collectionUnits = signal<CollectionUnit[]>([]);
  readonly tandaMembers = signal(5);

  readonly includeInsurance = signal(false);
  readonly insuranceAmount = signal('0');
  readonly insuranceMode = signal<'financiado' | 'contado'>('financiado');

  readonly amortizationTable = signal<AmortizationRow[]>([]);
  readonly isAmortizationVisible = signal(false);

  readonly selectedPackageContext = signal<ProductPackageContext | null>(null);
  private readonly autoAdvanceStep = signal(false);

  readonly totalPrice = computed(() => {
    const pkg = this.pkg();
    if (!pkg) {
      return 0;
    }

    const term = this.term();
    const years = term > 0 ? term / 12 : 0;
    const options = this.selectedOptions();

    return pkg.components.reduce((total, component) => {
      const include = !component.isOptional || Boolean(options[component.id]);
      if (!include) {
        return total;
      }

      const multiplier = component.isMultipliedByTerm ? Math.ceil(years || 1) : 1;
      return total + (component.price * multiplier);
    }, 0);
  });

  private readonly minDownPaymentRequiredSignal = computed(() => this.totalPrice() * (this.pkg()?.minDownPaymentPercentage ?? 0));

  readonly downPayment = computed(() => {
    if (this.isVentaDirecta()) {
      return this.toNumber(this.downPaymentAmountDirect());
    }

    return this.totalPrice() * (this.downPaymentPercentage() / 100);
  });

  readonly amountToFinance = computed(() => {
    const base = this.totalPrice() - this.downPayment();
    if (this.isVentaDirecta()) {
      return Math.max(0, base);
    }

    const insurance = this.includeInsurance() ? this.toNumber(this.insuranceAmount()) : 0;
    const financedInsurance = this.includeInsurance() && this.insuranceMode() === 'financiado' ? insurance : 0;
    return Math.max(0, base + financedInsurance);
  });

  private readonly lastValidMonthlyPayment = signal(0);

  private readonly validationMessagesSignal = computed<BusinessValidationMessage[]>(() => {
    const pkg = this.pkg();
    const messages: BusinessValidationMessage[] = [];

    if (!pkg) {
      return messages;
    }

    const market = this.market();
    const marketLabel = market ? this.getMarketLabel(market) : 'este mercado';
    const minDownPaymentPct = pkg.minDownPaymentPercentage ?? 0;
    const minDownPaymentPercentValue = Math.round(minDownPaymentPct * 100);
    const totalPrice = this.totalPrice();
    const requiredDownPayment = totalPrice * minDownPaymentPct;

    if (totalPrice > 0 && minDownPaymentPct > 0) {
      if (this.isVentaDirecta()) {
        const directDownPayment = this.toNumber(this.downPaymentAmountDirect());
        if (directDownPayment < requiredDownPayment - 0.5) {
          messages.push({
            code: 'downPayment.min.direct',
            field: 'downPayment',
            severity: 'error',
            message: `El pago inicial mínimo en ${marketLabel} es ${minDownPaymentPercentValue}% (${this.financialCalc.formatCurrency(requiredDownPayment)}).`,
            hint: 'Ajusta el monto para cumplir con la política de enganche.'
          });
        }
      } else {
        const effectiveDownPayment = this.downPayment();
        if (effectiveDownPayment < requiredDownPayment - 0.5) {
          messages.push({
            code: 'downPayment.min.financing',
            field: 'downPayment',
            severity: 'error',
            message: `El enganche mínimo en ${marketLabel} es ${minDownPaymentPercentValue}% (${this.financialCalc.formatCurrency(requiredDownPayment)}).`,
            hint: 'Incrementa el enganche para poder continuar.'
          });
        } else if (Math.abs(effectiveDownPayment - requiredDownPayment) <= 0.5) {
          messages.push({
            code: 'downPayment.at-minimum',
            field: 'downPayment',
            severity: 'warning',
            message: 'Estás utilizando el enganche mínimo permitido por política.',
            hint: 'Considera incrementar el enganche para mejorar la mensualidad.'
          });
        }
      }
    }

    if (!this.isVentaDirecta()) {
      const term = this.term();
      const allowedTerms = pkg.terms ?? [];
      if (!term) {
        messages.push({
          code: 'term.required',
          field: 'term',
          severity: 'error',
          message: 'Selecciona un plazo para continuar con la simulación.',
          hint: 'Elige una opción de la lista de plazos disponibles.'
        });
      } else if (allowedTerms.length && !allowedTerms.includes(term)) {
        const formattedTerms = allowedTerms.map(t => `${t} meses`).join(', ');
        messages.push({
          code: 'term.invalid',
          field: 'term',
          severity: 'error',
          message: `El plazo seleccionado no está disponible. Opciones válidas: ${formattedTerms}.`,
          hint: 'Selecciona uno de los plazos autorizados por el producto.'
        });
      }
    }

    if (!this.isVentaDirecta()) {
      const amountToFinance = this.amountToFinance();
      if (amountToFinance <= 0) {
        messages.push({
          code: 'financing.amount',
          field: 'downPayment',
          severity: 'warning',
          message: 'No hay monto a financiar con la configuración actual.',
          hint: 'Verifica enganche, seguros y componentes seleccionados.'
        });
      }
    }

    return messages;
  });

  private readonly policyHintsSignal = computed<Record<PolicyHintField, string>>(() => {
    const pkg = this.pkg();
    if (!pkg) {
      return {} as Record<PolicyHintField, string>;
    }

    const hints: Partial<Record<PolicyHintField, string>> = {};
    const market = this.market();
    const marketLabel = market ? this.getMarketLabel(market) : 'este mercado';
    const totalPrice = this.totalPrice();
    const minDownPaymentPct = pkg.minDownPaymentPercentage ?? 0;

    if (minDownPaymentPct > 0 && totalPrice > 0) {
      const minPercent = Math.round(minDownPaymentPct * 100);
      const minAmount = this.financialCalc.formatCurrency(totalPrice * minDownPaymentPct);
      const maxPct = pkg.maxDownPaymentPercentage ? Math.round(pkg.maxDownPaymentPercentage * 100) : null;
      const maxSuffix = maxPct ? ` Máximo sugerido ${maxPct}%.` : '';
      hints.downPayment = `Política ${marketLabel}: enganche mínimo ${minPercent}% (${minAmount}).${maxSuffix}`.trim();
    }

    if (!this.isVentaDirecta()) {
      const terms = pkg.terms ?? [];
      if (terms.length) {
        const termList = terms.map(term => `${term} meses`).join(', ');
        const annualRate = pkg.rate ? (pkg.rate * 100).toFixed(2) : null;
        const monthlyRate = pkg.rate ? ((pkg.rate / 12) * 100).toFixed(2) : null;
        const rateNote = annualRate && monthlyRate
          ? ` Tasa anual ${annualRate}% (mensual ${monthlyRate}%).`
          : '';
        hints.term = `Plazos autorizados: ${termList}.${rateNote}`.trim();
      }
    }

    const incomePolicy = this.currentPolicyMetadata()?.income;
    if (incomePolicy?.threshold) {
      const incomePct = Math.round(incomePolicy.threshold * 100);
      hints.income = `El pago mensual no debe superar ${incomePct}% del ingreso comprobable.`;
    }

    return hints as Record<PolicyHintField, string>;
  });

  private readonly rawMonthlyPayment = computed(() => {
    const amount = this.amountToFinance();
    const term = this.term();
    const pkg = this.pkg();
    const rate = pkg?.rate ?? 0;

    if (amount <= 0 || term <= 0 || rate <= 0) {
      return 0;
    }

    const monthlyRate = rate / 12;
    const payment = (amount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -term));
    return Math.round(payment * 100) / 100;
  });

  private readonly monthlyPaymentTracker = effect(() => {
    const payment = this.rawMonthlyPayment();
    if (payment > 0) {
      this.lastValidMonthlyPayment.set(payment);
    }
  }, { allowSignalWrites: true });

  readonly monthlyPayment = computed(() => {
    const payment = this.rawMonthlyPayment();
    if (payment > 0) {
      return payment;
    }

    const amount = this.amountToFinance();
    const rate = this.pkg()?.rate ?? 0;
    const fallback = amount > 0 && rate > 0
      ? Math.round((amount * (rate / 12)) * 100) / 100
      : 0;

    if (fallback > 0) {
      return fallback;
    }

    return this.lastValidMonthlyPayment();
  });

  readonly firstInterest = computed(() => {
    const rate = this.pkg()?.rate ?? 0;
    const term = this.term();
    if (!rate || term <= 0) {
      return 0;
    }
    return this.amountToFinance() * (rate / 12);
  });

  readonly firstPrincipal = computed(() => {
    if (this.term() <= 0) {
      return 0;
    }
    return Math.max(0, this.monthlyPayment() - this.firstInterest());
  });
  readonly firstBalance = computed(() => Math.max(0, this.amountToFinance() - this.firstPrincipal()));

  readonly monthlySavings = computed(() => {
    const voluntary = this.toNumber(this.voluntaryContribution());
    const collection = this.collectionUnits().reduce((sum, unit) => {
      const consumption = this.toNumber(unit.consumption);
      const overprice = this.toNumber(unit.overprice);
      return sum + (consumption * overprice);
    }, 0);
    return voluntary + collection;
  });

  readonly projectedCollectionSavings = computed(() => {
    const collection = this.collectionUnits().reduce((sum, unit) => {
      return sum + (this.toNumber(unit.consumption) * this.toNumber(unit.overprice));
    }, 0);
    return collection * this.deliveryTerm();
  });

  readonly timeToGoal = computed(() => {
    const goal = this.downPayment();
    const savings = this.monthlySavings();
    return goal > 0 && savings > 0 ? goal / savings : 0;
  });

  readonly isVentaDirecta = computed(() => this.client()?.flow === BusinessFlow.VentaDirecta);

  readonly canGoNext = computed(() => {
    const step = this.currentStep();
    switch (step) {
      case 1:
        return Boolean(this.market() && this.clientType());
      case 2:
        return this.pkg() !== null;
      case 3:
        return this.totalPrice() > 0;
      case 4:
        return true;
      default:
        return false;
    }
  });

  readonly canGoPrevious = computed(() => this.currentStep() > 1);

  minDownPaymentRequired(): number {
    return this.minDownPaymentRequiredSignal();
  }

  validationMessages(): BusinessValidationMessage[] {
    return this.validationMessagesSignal();
  }

  policyHint(field: PolicyHintField): string | null {
    return this.policyHintsSignal()[field] ?? null;
  }

  initialize(client: Client | undefined, initialMode: SimulatorMode): void {
    this.client.set(client);
    this.initialMode.set(initialMode);
    this.collectionUnits.set([]);
    this.currentStep.set(1);
    this.downPaymentPercentage.set(20);
    this.term.set(0);
    this.downPaymentAmountDirect.set('0');
    this.deliveryTerm.set(3);
    this.voluntaryContribution.set('0');
    this.includeInsurance.set(false);
    this.insuranceAmount.set('0');
    this.insuranceMode.set('financiado');
    this.amortizationTable.set([]);
    this.isAmortizationVisible.set(false);

    this.refreshPolicyOptions();

    if (client) {
      const clientMarket: PolicyMarket = client.ecosystemId ? 'edomex' : 'aguascalientes';
      const clientType: PolicyClientType = client.flow === BusinessFlow.CreditoColectivo ? 'colectivo' : 'individual';
      this.market.set(clientMarket);
      this.clientType.set(clientType);
    } else {
      this.market.set('');
      this.clientType.set('');
      this.pkg.set(null);
    }

    if (this.market() && this.clientType()) {
      this.fetchPackage();
    }

    this.persistFlowContextSnapshot('init');
  }

  setMarket(value: PolicyMarket | ''): void {
    this.market.set(value);
    const defaultClientType = this.client()
      ? (this.client()!.flow === BusinessFlow.CreditoColectivo ? 'colectivo' : 'individual')
      : '';
    this.clientType.set(defaultClientType);
    this.pkg.set(null);
    this.selectedOptions.set({});
    this.currentPolicyContext.set(null);
    this.applyPolicyMetadata(undefined, defaultClientType || 'individual');
    this.updateClientTypeOptions();

    if (!this.clientType() && !this.isVentaDirecta() && this.clientTypeOptions().length === 1) {
      this.clientType.set(this.clientTypeOptions()[0]);
    }

    if (this.clientType()) {
      this.fetchPackage();
    }

    this.persistFlowContextSnapshot('market-change');
  }

  setClientType(value: PolicyClientType | ''): void {
    const previous = this.clientType();
    const options = this.clientTypeOptions();
    const resolvedValue = (!value && options.length === 1) ? options[0] : value;

    if (previous === resolvedValue) {
      this.persistFlowContextSnapshot('client-type-change');
      return;
    }

    this.clientType.set(resolvedValue);

    if (this.market() && this.clientType()) {
      this.fetchPackage();
    }
    this.persistFlowContextSnapshot('client-type-change');
  }

  setDownPaymentPercentage(value: number): void {
    this.downPaymentPercentage.set(value);
    this.persistFlowContextSnapshot('downpayment-slider');
  }

  setDownPaymentAmountDirect(value: string): void {
    this.downPaymentAmountDirect.set(value);
    this.persistFlowContextSnapshot('downpayment-direct');
  }

  setInitialDownPayment(value: string): void {
    this.initialDownPayment.set(value);
    this.persistFlowContextSnapshot('savings-config');
  }

  setTerm(value: number): void {
    this.term.set(value);
    this.persistFlowContextSnapshot('term-change');
  }

  setDeliveryTerm(value: number): void {
    this.deliveryTerm.set(value);
    this.persistFlowContextSnapshot('savings-config');
  }

  setVoluntaryContribution(value: string): void {
    this.voluntaryContribution.set(value);
    this.persistFlowContextSnapshot('savings-config');
  }

  setIncludeInsurance(value: boolean): void {
    this.includeInsurance.set(value);
    this.persistFlowContextSnapshot('insurance-toggle');
  }

  setInsuranceAmount(value: string): void {
    this.insuranceAmount.set(value);
    this.persistFlowContextSnapshot('insurance-amount');
  }

  setInsuranceMode(value: 'financiado' | 'contado'): void {
    this.insuranceMode.set(value);
    this.persistFlowContextSnapshot('insurance-mode');
  }

  setTandaMembers(value: number): void {
    this.tandaMembers.set(value);
    this.persistFlowContextSnapshot('tanda-members');
  }

  toggleComponent(componentId: string): void {
    const current = { ...this.selectedOptions() };
    current[componentId] = !current[componentId];
    this.selectedOptions.set(current);
    this.persistFlowContextSnapshot('component-toggle');
  }

  addCollectionUnit(): void {
    const units = [...this.collectionUnits()];
    units.push({
      id: Date.now(),
      consumption: '',
      overprice: ''
    });
    this.collectionUnits.set(units);
    this.persistFlowContextSnapshot('collection-add');
  }

  updateCollectionUnit(id: number, patch: Partial<CollectionUnit>): void {
    const units = this.collectionUnits().map(unit =>
      unit.id === id
        ? { ...unit, ...patch }
        : unit
    );
    this.collectionUnits.set(units);
    this.persistFlowContextSnapshot('collection-update');
  }

  removeCollectionUnit(id: number): void {
    const units = this.collectionUnits().filter(unit => unit.id !== id);
    this.collectionUnits.set(units);
    this.persistFlowContextSnapshot('collection-remove');
  }

  nextStep(): void {
    if (!this.canGoNext()) {
      return;
    }
    const current = this.currentStep();
    if (current < this.totalSteps) {
      this.currentStep.set(current + 1);
    }
  }

  previousStep(): void {
    if (!this.canGoPrevious()) {
      return;
    }
    this.currentStep.set(this.currentStep() - 1);
  }

  goToStep(step: number): void {
    if (step >= 1 && step <= this.totalSteps) {
      this.currentStep.set(step);
    }
  }

  async fetchPackage(): Promise<void> {
    const market = this.market();
    if (!market) {
      this.pkg.set(null);
      return;
    }

    const clientType = this.resolveClientType() ?? 'individual';
    const saleType: 'contado' | 'financiero' = this.isVentaDirecta() ? 'contado' : 'financiero';
    const businessFlow = this.resolveBusinessFlow(clientType, saleType);
    const policyContext = this.buildPolicyContext(
      market,
      clientType,
      saleType,
      businessFlow,
      this.resolveCollectiveMembers(clientType)
    );

    try {
      const metadata = policyContext ? this.marketPolicy.getPolicyMetadata(policyContext) : undefined;
      this.applyPolicyMetadata(metadata, clientType);
    } catch {
      this.applyPolicyMetadata(undefined, clientType);
    }

    const normalizedCollectiveMembers = this.resolveCollectiveMembers(clientType);
    this.currentPolicyContext.set({
      ...(policyContext || {}),
      collectiveSize: normalizedCollectiveMembers,
      market,
      clientType
    } as MarketPolicyContext);

    const context: ProductPackageContext = {
      market,
      clientType,
      saleType
    };

    this.isLoading.set(true);
    this.selectedPackageContext.set(context);

    try {
      const pkg = await firstValueFrom(this.cotizadorEngine.getProductPackageForContext(context));
      this.pkg.set(pkg);
      this.setupPackageDefaults(pkg);
      if (this.autoAdvanceStep()) {
        this.currentStep.set(2);
        this.autoAdvanceStep.set(false);
      }
      this.persistFlowContextSnapshot('package-load');
    } catch (error) {
      console.error('[CotizadorStore] Error loading package', error);
      this.toast.error(`Error al cargar el paquete para ${market}`);
      this.pkg.set(null);
      this.autoAdvanceStep.set(false);
    } finally {
      this.isLoading.set(false);
    }
  }

  calculateAmortization(): void {
    const remainder = this.amountToFinance();
    const pkg = this.pkg();

    if (!pkg) {
      this.toast.error('Selecciona un paquete antes de calcular amortización.');
      return;
    }

    if (remainder <= 0) {
      this.toast.error('El monto a financiar debe ser mayor a cero.');
      return;
    }

    const annualRate = pkg.rate;
    const term = this.term();
    if (annualRate <= 0 || term <= 0) {
      this.toast.error('Define el plazo y la tasa antes de calcular amortización.');
      return;
    }

    const monthlyRate = annualRate / 12;
    const monthlyPayment = (remainder * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -term));

    const table: AmortizationRow[] = [];
    let balance = remainder;

    for (let i = 1; i <= term; i++) {
      const interest = balance * monthlyRate;
      const principal = monthlyPayment - interest;
      balance = Math.max(0, balance - principal);
      table.push({
        paymentNumber: i,
        monthlyPayment,
        principal,
        interest,
        balance
      });
    }

    this.amortizationTable.set(table);
    this.isAmortizationVisible.set(true);
    this.toast.success('Tabla de amortización calculada.');
  }

  closeAmortization(): void {
    this.isAmortizationVisible.set(false);
  }

  async generatePDF(): Promise<void> {
    try {
      const pkg = this.pkg();
      if (!pkg) {
        this.toast.error('Selecciona un paquete primero');
        return;
      }

      const quote = await this.buildQuoteSnapshot('pdf');
      if (!quote) {
        this.toast.error('No se pudo construir la cotización para generar PDF');
        return;
      }

      try {
        await firstValueFrom(this.quotesApi.createQuote(quote));
      } catch (error) {
        console.error('[CotizadorStore] Error registrando la cotización', error);
        this.toast.error('No se pudo registrar la cotización');
        return;
      }

      const pdfGenerated = await this.pdfExport
        .generateQuotePDF(quote as any)
        .then(() => true)
        .catch(error => {
          console.error('[CotizadorStore] Error al generar el PDF', error);
          this.toast.error('No se pudo generar el PDF');
          return false;
        });

      if (pdfGenerated) {
        this.toast.success('PDF generado');
      }
    } catch (error) {
      console.error('[CotizadorStore] Error inesperado al generar PDF', error);
      this.toast.error('No se pudo generar el PDF');
    }
  }

  goToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  applyPresetContext(preset: { market?: PolicyMarket; clientType?: PolicyClientType; autoAdvance?: boolean }): void {
    const desiredMarket = preset.market;
    const desiredClientType = preset.clientType;
    const shouldAutoAdvance = Boolean(preset.autoAdvance);

    const willChangeMarket = Boolean(desiredMarket && desiredMarket !== this.market());
    const willChangeClientType = Boolean(desiredClientType && desiredClientType !== this.clientType());

    if (shouldAutoAdvance) {
      const shouldWaitForFetch = willChangeMarket || willChangeClientType || !this.pkg();
      if (shouldWaitForFetch) {
        this.autoAdvanceStep.set(true);
      } else {
        this.currentStep.set(2);
      }
    }

    if (willChangeMarket && desiredMarket) {
      this.setMarket(desiredMarket);
    }

    if (willChangeClientType && desiredClientType) {
      this.setClientType(desiredClientType);
    }
  }

  persistFlowContextSnapshot(origin: string): void {
    if (!this.flowContext) {
      return;
    }

    const market = this.market() || 'aguascalientes';
    const clientType = this.resolveClientType() ?? 'individual';
    const saleType: 'contado' | 'financiero' = this.isVentaDirecta() ? 'contado' : 'financiero';
    const businessFlow = this.resolveBusinessFlow(clientType, saleType);
    const normalizedCollectiveMembers = this.resolveCollectiveMembers(clientType);
    const monthlyPayment = this.monthlyPayment();
    const tandaRules = this.currentPolicyMetadata()?.tanda;

    const basePolicyContext = this.currentPolicyContext() ?? this.buildPolicyContext(
      market,
      clientType,
      saleType,
      businessFlow,
      normalizedCollectiveMembers
    );

    const policyContextSnapshot = basePolicyContext ? this.clonePolicyContext(basePolicyContext) : undefined;

    let incomeThreshold = this.currentPolicyMetadata()?.income?.threshold;
    if (!incomeThreshold && basePolicyContext) {
      const threshold = this.marketPolicy.getIncomeThreshold(basePolicyContext);
      if (typeof threshold === 'number' && Number.isFinite(threshold)) {
        incomeThreshold = threshold;
      }
    }

    const existing = this.flowContext.getContextData<any>('cotizador') ?? {};
    const existingQuotation = existing.quotationData ?? {};

    const requiresIncomeProof = saleType === 'financiero'
      ? (incomeThreshold ? monthlyPayment > incomeThreshold : false)
      : false;

    const quotationData = {
      ...existingQuotation,
      market,
      clientType,
      saleType,
      businessFlow,
      totalPrice: this.totalPrice(),
      downPayment: this.downPayment(),
      amountToFinance: this.amountToFinance(),
      term: this.term(),
      monthlyPayment,
      includeInsurance: this.includeInsurance(),
      insuranceAmount: this.includeInsurance() ? this.toNumber(this.insuranceAmount()) : 0,
      insuranceMode: this.includeInsurance() ? this.insuranceMode() : 'contado',
      incomeThreshold,
      incomeThresholdRatio: existingQuotation.incomeThresholdRatio,
      requiresIncomeProof,
      collectiveMembers: normalizedCollectiveMembers,
      origin,
      updatedAt: Date.now(),
      policyContext: policyContextSnapshot
    };

    const payload = {
      ...existing,
      market,
      clientType,
      saleType,
      businessFlow,
      quotationData,
      policyContext: policyContextSnapshot,
      monthlyPayment,
      incomeThreshold,
      incomeThresholdRatio: existingQuotation.incomeThresholdRatio,
      requiresIncomeProof,
      collectiveMembers: normalizedCollectiveMembers,
      tandaLimits: tandaRules ?? this.tandaLimits()
    };

    this.flowContext.saveContext('cotizador', payload, {
      breadcrumbs: ['Dashboard', 'Cotizador']
    });

    this.persistDocumentContextSnapshot({
      quotationData,
      policyContext: policyContextSnapshot,
      saleType,
      businessFlow,
      requiresIncomeProof,
      collectiveMembers: normalizedCollectiveMembers,
      market,
      incomeThreshold,
      monthlyPayment
    });
  }


  private persistDocumentContextSnapshot(snapshot: {
    quotationData: any;
    policyContext?: MarketPolicyContext | undefined;
    saleType: 'contado' | 'financiero';
    businessFlow: BusinessFlow;
    requiresIncomeProof: boolean;
    collectiveMembers?: number | null;
    market: string;
    incomeThreshold?: number;
    monthlyPayment: number;
  }): void {
    if (!this.flowContext) {
      return;
    }

    const normalizedMarket = normalizeMarketKey(snapshot.quotationData?.market ?? snapshot.market ?? this.market() ?? 'aguascalientes');
    const clientType = (snapshot.quotationData?.clientType ?? snapshot.policyContext?.clientType ?? 'individual') as PolicyClientType;
    const mathValidation: MathValidationSnapshot = {
      principal: snapshot.quotationData?.amountToFinance ?? this.amountToFinance(),
      monthlyPayment: snapshot.monthlyPayment,
      term: snapshot.quotationData?.term ?? this.term(),
      annualRate: this.pkg()?.rate,
      expectedMonthlyPayment: snapshot.monthlyPayment,
      withinTolerance: true,
      lastUpdated: Date.now()
    };

    const basePayload = {
      flowContext: {
        market: normalizedMarket,
        clientType,
        saleType: snapshot.saleType,
        businessFlow: snapshot.businessFlow,
        collectiveMembers: snapshot.collectiveMembers,
        requiresIncomeProof: snapshot.requiresIncomeProof,
        monthlyPayment: snapshot.monthlyPayment,
        incomeThreshold: snapshot.incomeThreshold,
        quotationData: snapshot.quotationData
      },
      policyContext: snapshot.policyContext,
      mathValidation
    };

    const saveContext = (documents?: Document[]) => {
      this.flowContext!.saveContext('documentos', {
        ...basePayload,
        documents,
        lastSyncedAt: Date.now()
      }, {
        breadcrumbs: ['Dashboard', 'Documentos']
      });
    };

    const requirementsService = this.documentRequirements;
    const supportsDocuments = normalizedMarket === 'edomex' || normalizedMarket === 'aguascalientes';

    if (!requirementsService || !supportsDocuments) {
      saveContext();
      return;
    }

    requirementsService
      .getDocumentRequirements({
        market: normalizedMarket as 'aguascalientes' | 'edomex',
        saleType: snapshot.saleType,
        businessFlow: snapshot.businessFlow,
        clientType: clientType as 'individual' | 'colectivo',
        requiresIncomeProof: snapshot.requiresIncomeProof,
        collectiveSize: snapshot.collectiveMembers ?? undefined
      })
      .pipe(take(1))
      .subscribe({
        next: documents => saveContext(documents),
        error: () => saveContext()
      });
  }


  private refreshPolicyOptions(): void {
    const policies = this.marketPolicy.getAvailablePolicies();
    const index = new Map<PolicyMarket, Set<PolicyClientType>>();

    policies.forEach(({ market, clientType }) => {
      if (!index.has(market)) {
        index.set(market, new Set<PolicyClientType>());
      }
      index.get(market)!.add(clientType);
    });

    const map = new Map<PolicyMarket, PolicyClientType[]>(Array.from(index.entries()).map(([market, set]) => [
      market,
      Array.from(set.values()).sort((a, b) => {
        if (a === b) {
          return 0;
        }
        if (a === 'individual') {
          return -1;
        }
        if (b === 'individual') {
          return 1;
        }
        return a.localeCompare(b);
      })
    ]));

    this.policyClientTypeIndex.set(map);
    this.marketOptions.set(Array.from(map.keys()).sort());
    this.updateClientTypeOptions();
  }

  private updateClientTypeOptions(): void {
    const market = this.market();
    const isVentaDirecta = this.isVentaDirecta();

    if (!market || isVentaDirecta) {
      this.clientTypeOptions.set([]);
      if (!isVentaDirecta) {
        this.clientType.set(this.clientType() || 'individual');
      }
      return;
    }

    const options = [...(this.policyClientTypeIndex().get(market as PolicyMarket) ?? ['individual'])];

    if (options.length === 1) {
      this.clientTypeOptions.set([]);
      this.clientType.set(options[0]);
      return;
    }

    this.clientTypeOptions.set(options);
    if (this.clientType() && !options.includes(this.clientType() as PolicyClientType)) {
      this.clientType.set('');
    }
  }

  private applyPolicyMetadata(metadata: MarketPolicyMetadata | undefined, clientType: PolicyClientType): void {
    this.currentPolicyMetadata.set(metadata);
    const defaultLimits = { min: 2, max: 20 };

    if (!metadata?.tanda || clientType !== 'colectivo') {
      this.tandaLimits.set(defaultLimits);
      return;
    }

    const min = Math.max(metadata.tanda.minMembers ?? defaultLimits.min, 1);
    const max = Math.max(metadata.tanda.maxMembers ?? Math.max(defaultLimits.max, min), min);
    this.tandaLimits.set({ min, max });

    const currentMembers = this.tandaMembers();
    if (!Number.isFinite(currentMembers) || currentMembers <= 0) {
      this.tandaMembers.set(metadata.tanda.minMembers ?? min);
    } else {
      this.tandaMembers.set(Math.min(Math.max(currentMembers, min), max));
    }
  }

  private setupPackageDefaults(pkg: ProductPackage): void {
    const selected: Record<string, boolean> = {};
    pkg.components.forEach(component => {
      if (!component.isOptional) {
        selected[component.id] = true;
      }
    });
    this.selectedOptions.set(selected);

    if (pkg.terms.length > 0) {
      this.term.set(pkg.terms[0]);
    }

    this.downPaymentPercentage.set(Math.round((pkg.minDownPaymentPercentage ?? 0) * 100));
  }

  private resolveClientType(): PolicyClientType | null {
    if (this.clientType()) {
      return this.clientType() as PolicyClientType;
    }
    if (this.isVentaDirecta()) {
      return 'individual';
    }
    return null;
  }

  private resolveCollectiveMembers(clientType: PolicyClientType): number | undefined {
    if (clientType !== 'colectivo') {
      return undefined;
    }

    const members = this.tandaMembers();
    const limits = this.tandaLimits();
    if (!Number.isFinite(members) || members <= 0) {
      return limits.min;
    }
    return Math.min(Math.max(Math.floor(members), limits.min), limits.max);
  }

  private resolveBusinessFlow(clientType: PolicyClientType, saleType: 'contado' | 'financiero'): BusinessFlow {
    if (saleType === 'contado') {
      return BusinessFlow.VentaDirecta;
    }
    return clientType === 'colectivo'
      ? BusinessFlow.CreditoColectivo
      : BusinessFlow.Individual;
  }

  private buildPolicyContext(
    market: PolicyMarket,
    clientType: PolicyClientType,
    saleType: 'contado' | 'financiero',
    businessFlow: BusinessFlow,
    collectiveMembers?: number
  ): MarketPolicyContext {
    const context: MarketPolicyContext = {
      market,
      clientType,
      saleType,
      businessFlow,
    };

    if (collectiveMembers) {
      context.collectiveSize = collectiveMembers;
    }

    return context;
  }

  private clonePolicyContext(context: MarketPolicyContext): MarketPolicyContext {
    return JSON.parse(JSON.stringify(context));
  }

  private toNumber(value: any): number {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : 0;
    }
    const parsed = parseFloat(value ?? '0');
    return Number.isFinite(parsed) ? parsed : 0;
  }

  formatCurrency(value: number): string {
    return this.financialCalc.formatCurrency(value);
  }

  getMarketLabel(market: PolicyMarket): string {
    return this.marketLabels[market] ?? market;
  }

  private async buildQuoteSnapshot(origin: string): Promise<Quote | null> {
    const pkg = this.pkg();
    if (!pkg) {
      return null;
    }

    const packageKey = this.resolvePackageKeyForSnapshot(this.selectedPackageContext());
    if (!packageKey) {
      return null;
    }

    let quote: (Quote & { packageData: ProductPackage }) | null;
    try {
      quote = await firstValueFrom(this.cotizadorEngine.generateQuoteWithPackage(
        packageKey,
        Object.keys(this.selectedOptions()).filter(key => this.selectedOptions()[key]),
        this.downPayment(),
        this.term()
      ));
    } catch (error) {
      console.error('[CotizadorStore] Error al generar snapshot de cotización', error);
      quote = null;
    }

    if (!quote) {
      return null;
    }

    const monthlyPayment = this.monthlyPayment();

    return {
      ...quote,
      totalPrice: this.totalPrice(),
      downPayment: this.downPayment(),
      amountToFinance: this.amountToFinance(),
      monthlyPayment,
      metadata: {
        ...(quote as any).metadata,
        origin
      }
    } as Quote;
  }

  private resolvePackageKeyForSnapshot(context: ProductPackageContext | null): string | null {
    if (!context) {
      return null;
    }

    const explicitKey = resolveProductPackageKey(context);
    if (explicitKey) {
      return explicitKey;
    }

    try {
      return this.cotizadorEngine.resolvePackageKey(context);
    } catch (error) {
      console.error('[CotizadorStore] No se pudo resolver el paquete seleccionado', error);
      return null;
    }
  }
}
