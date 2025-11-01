import { CommonModule } from '@angular/common';
import { Component, ChangeDetectionStrategy, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, TrackByFunction, effect, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { BusinessFlow, Client } from '@interfaces/types';
import { ClientType, Quote, SimulatorMode } from '@interfaces/business';
import { PolicyClientType, PolicyMarket } from '@feature-services/configuration/market-policy.service';
import { SavingsProjectionChartComponent } from '@shared/savings-projection-chart.component';
import { TandaTimelineComponent } from '@shared/tanda-timeline.component';
import { TandaMilestone } from '@interfaces/tanda';
import { IconComponent } from '@shared/icon/icon.component';
import { IconName } from '@shared/icon/icon-definitions';
import { OfflineQueueBannerComponent } from '@shared/offline-queue-banner.component';
import { ToastService } from '@core-services/toast.service';
import { FlowCompletionService } from '@core-services/flow-completion.service';
import { EntitySyncService } from '@core-services/entity-sync.service';
import { DemoBadgeComponent } from '@shared/demo-badge.component';
import { DemoModeService } from '@core-services/demo-mode.service';
import { DemoSeedService } from '@services/demo/demo-seed.service';
import { DemoAnalyticsService } from '@services/demo/demo-analytics.service';
import { DemoReestructuraEngine } from '@services/demo/demo-reestructura.engine';
import { DemoFinanceEvent, DemoFinanceScenario, DemoScenarioId } from '@services/demo/demo-scenarios';
import { OnboardingRequirementsService } from '@feature-services/onboarding/onboarding-requirements.service';
import { OnboardingChecklistComponent } from '@shared/onboarding-checklist.component';
import { OnboardingTrackerComponent } from '@shared/onboarding-tracker.component';
import { OnboardingStatusBannerComponent } from '@shared/onboarding-status-banner.component';
import { OnboardingRequirementsSnapshot } from '@feature-services/onboarding/onboarding-requirements.models';
import { AnalyticsService } from '@core-services/analytics.service';
import {
  BusinessValidationMessage,
  BusinessValidationSeverity,
  CotizadorStore,
  CollectionUnit
} from './cotizador.store';
import { SummaryMetric } from '@shared/summary-panel.component';
import { resolveCotizadorPreset } from './cotizador-contexts';
import { Subject, takeUntil } from 'rxjs';
import { GlobalSearchService } from '@core-services/global-search.service';
import { NavigationService } from '@core-services/navigation.service';

@Component({
  selector: 'app-cotizador-main',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, SavingsProjectionChartComponent, TandaTimelineComponent, OfflineQueueBannerComponent, DemoBadgeComponent, OnboardingChecklistComponent, OnboardingTrackerComponent, OnboardingStatusBannerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cotizador-main.component.html',
  styleUrls: ['./cotizador-main.component.scss'],
})
export class CotizadorMainComponent implements OnInit, OnChanges, OnDestroy {
  private readonly store = inject(CotizadorStore);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute, { optional: true });
  private readonly destroy$ = new Subject<void>();
  private readonly completion = inject(FlowCompletionService);
  private readonly entitySync = inject(EntitySyncService);
  private readonly globalSearch = inject(GlobalSearchService);
  private readonly navigation = inject(NavigationService);
  private readonly demoMode = inject(DemoModeService);
  private readonly analytics = inject(AnalyticsService);
  private readonly demoSeeds = inject(DemoSeedService);
  private readonly demoAnalytics = inject(DemoAnalyticsService);
  private readonly demoReestructura = inject(DemoReestructuraEngine);
  private readonly onboardingRequirements = inject(OnboardingRequirementsService);
  readonly isDemoMode = this.demoMode.isDemoMode;
  readonly activeDemoScenario = this.demoMode.activeScenario;
  readonly demoScenarioSnapshot = computed(() => {
    const scenario = this.activeDemoScenario();
    if (!scenario) {
      return null;
    }
    return this.demoSeeds.scenarioSnapshot(scenario);
  });
  private readonly selectedDemoFinanceScenarioId = signal<string | null>(null);
  readonly demoFinanceScenarioSet = computed(() => this.demoScenarioSnapshot()?.financeScenarios ?? null);
  readonly activeDemoFinanceScenario = computed(() => {
    const set = this.demoFinanceScenarioSet();
    if (!set) {
      return null;
    }
    const selected = this.selectedDemoFinanceScenarioId() ?? set.baseScenarioId;
    return set.scenarios.find(item => item.id === selected) ?? set.scenarios[0] ?? null;
  });
  readonly demoProtectionNotes = computed(() => this.demoScenarioSnapshot()?.protectionNotes ?? null);
  readonly demoFinanceMessage = signal<string | null>(null);
  readonly financeEvents = computed(() => this.demoScenarioSnapshot()?.financeEvents ?? []);
  readonly isFinanceEventProcessing = signal(false);
  protected readonly validationIconMap = {
    error: 'alert-triangle',
    warning: 'alert-circle',
    info: 'information-circle'
  } as const satisfies Record<BusinessValidationSeverity, IconName>;

  private readonly marketLabels: Record<PolicyMarket, string> = {
    aguascalientes: 'Aguascalientes',
    edomex: 'EdoMex',
    otros: 'Otros mercados'
  };

  private readonly clientTypeLabels: Record<PolicyClientType, string> = {
    individual: 'Individual',
    colectivo: 'Colectivo'
  };

  protected readonly Math = Math;

  @Input() client?: Client;
  @Input() initialMode: SimulatorMode = 'acquisition';
  @Output() onFormalize = new EventEmitter<Quote | Event>();

  isProtectionDemoOpen = false;
  readonly isClientView = signal(false);
  readonly requirementsSnapshot = computed(() => this.onboardingRequirements.snapshot());
  private lastRequirementsTelemetryKey: string | null = null;
  private currentDemoConfig: DemoFinanceScenario['config'] | null = null;
  private currentDemoScenarioTitle: string | null = null;
  private appliedDemoFinanceKey: string | null = null;

  private readonly requirementsEffect = effect(() => {
    const scenarioId = this.activeDemoScenario();
    const scenario = this.demoScenarioSnapshot();
    if (this.isDemoMode() && scenarioId && scenario?.onboardingUpdate) {
      this.onboardingRequirements.update(scenario.onboardingUpdate);
      this.demoAnalytics.track('scenario_active', { scenario: scenarioId, feature: 'cotizador' });
      this.recordRequirementsTelemetry(this.onboardingRequirements.snapshot(), 'cotizador');
      return;
    }

    const market = this.store.market();
    const clientType = this.store.clientType();
    const saleType: 'contado' | 'financiero' = this.store.isVentaDirecta() ? 'contado' : 'financiero';

    if (!market || !clientType) {
      return;
    }

    const businessFlow = this.resolveBusinessFlowPreview(clientType, saleType);

    this.onboardingRequirements.update({
      context: {
        market: market as 'aguascalientes' | 'edomex',
        saleType,
        clientType,
        businessFlow,
        requiresIncomeProof: saleType === 'financiero',
        collectiveSize: clientType === 'colectivo' ? (this.store.tandaMembers() || null) : null
      },
      documents: [],
      flowContext: {
        market: market as 'aguascalientes' | 'edomex',
        saleType,
        clientType,
        businessFlow
      }
    });

    this.recordRequirementsTelemetry(this.onboardingRequirements.snapshot(), 'cotizador');
  });

  private readonly demoScenarioSyncEffect = effect(() => {
    const scenarioId = this.activeDemoScenario();
    const set = this.demoFinanceScenarioSet();
    const base = set?.baseScenarioId ?? set?.scenarios[0]?.id ?? null;
    if (!scenarioId || !set) {
      if (this.selectedDemoFinanceScenarioId() !== null) {
        this.selectedDemoFinanceScenarioId.set(null);
      }
      if (this.appliedDemoFinanceKey !== null) {
        this.appliedDemoFinanceKey = null;
        this.demoFinanceMessage.set(null);
      }
      this.currentDemoConfig = null;
      this.currentDemoScenarioTitle = null;
      return;
    }
    if (base && this.selectedDemoFinanceScenarioId() !== base) {
      this.selectedDemoFinanceScenarioId.set(base);
    }
  });

  private readonly demoFinanceEventsEffect = effect(() => {
    if (!this.isDemoMode() || !this.isFinanceDemoScenario(this.activeDemoScenario())) {
      return;
    }
    const snapshot = this.demoScenarioSnapshot();
    if (!snapshot?.financeScenarios || !this.currentDemoConfig) {
      return;
    }
    const activeScenario = this.activeDemoFinanceScenario();
    if (!activeScenario) {
      return;
    }

    const monthly = this.hydrateFinanceConfig(this.currentDemoConfig, snapshot.financeEvents ?? [], {
      trackAnalytics: false,
      title: activeScenario.title ?? activeScenario.id,
      optionId: activeScenario.id
    });

    const title = this.currentDemoScenarioTitle ?? activeScenario.title ?? activeScenario.id;
    this.demoFinanceMessage.set(this.buildDemoFinanceMessage(title, monthly));
  }, { allowSignalWrites: true });

  private readonly demoFinanceConfigEffect = effect(() => {
    if (!this.isDemoMode()) {
      return;
    }
    const scenarioId = this.activeDemoScenario();
    const selected = this.activeDemoFinanceScenario();
    if (!this.isFinanceDemoScenario(scenarioId)) {
      if (this.appliedDemoFinanceKey !== null) {
        this.appliedDemoFinanceKey = null;
      }
      this.demoFinanceMessage.set(null);
      return;
    }
    if (!selected) {
      return;
    }
    const config = selected.config;
    if (!config) {
      return;
    }
    const optionId = selected.id ?? 'default';
    const trackerKey = `${scenarioId}|${optionId}`;
    if (this.appliedDemoFinanceKey === trackerKey) {
      return;
    }
    this.appliedDemoFinanceKey = trackerKey;
    this.applyDemoFinanceScenarioConfig(optionId, config, selected.title ?? optionId, selected.terminos ?? null);
  }, { allowSignalWrites: true });

  ngOnInit(): void {
    this.store.initialize(this.client, this.initialMode);
    this.applyPresetFromRoute();
    if (this.route) {
      this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe(() => {
        this.applyPresetFromRoute();
      });
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['client'] || changes['initialMode']) {
      this.store.initialize(this.client, this.initialMode);
      this.applyPresetFromRoute();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // --- Stepper helpers ---
  get currentStep(): number {
    return this.store.currentStep();
  }

  get totalSteps(): number {
    return this.store.totalSteps;
  }

  get progressPercentage(): number {
    return (this.currentStep / this.totalSteps) * 100;
  }

  get validationMessages(): BusinessValidationMessage[] {
    return this.store.validationMessages();
  }

  get hasValidationErrors(): boolean {
    return this.validationMessages.some(message => message.severity === 'error');
  }

  get downPaymentPolicyHint(): string | null {
    return this.store.policyHint('downPayment');
  }

  get termPolicyHint(): string | null {
    return this.store.policyHint('term');
  }

  get incomePolicyHint(): string | null {
    return this.store.policyHint('income');
  }

  nextStep(): void {
    this.store.nextStep();
  }

  previousStep(): void {
    this.store.previousStep();
  }

  goToStep(step: number): void {
    this.store.goToStep(step);
  }

  private applyPresetFromRoute(): void {
    if (!this.route) {
      return;
    }

    const snapshot = this.route.snapshot;
    const query = snapshot.queryParamMap;
    const data = snapshot.data ?? {};

    const presetParam = query.get('preset') ?? (data['preset'] as string | undefined);
    const presetContext = resolveCotizadorPreset(presetParam);

    const marketParam = (query.get('market') ?? data['presetMarket'] ?? presetContext?.market) as PolicyMarket | null;
    const clientTypeParam = (query.get('clientType') ?? data['presetClientType'] ?? presetContext?.clientType) as PolicyClientType | null;

    let autoAdvanceOverride: boolean | undefined;
    if (query.has('autoAdvance')) {
      autoAdvanceOverride = query.get('autoAdvance') !== 'false';
    } else if (typeof data['autoAdvance'] === 'boolean') {
      autoAdvanceOverride = data['autoAdvance'];
    }

    const marketToApply = marketParam ?? undefined;
    const clientTypeToApply = clientTypeParam ?? undefined;
    const resolvedAutoAdvance = autoAdvanceOverride ?? presetContext?.autoAdvance ?? false;

    if (marketToApply || clientTypeToApply || resolvedAutoAdvance) {
      this.store.applyPresetContext({
        market: marketToApply,
        clientType: clientTypeToApply,
        autoAdvance: resolvedAutoAdvance
      });
    }
  }

  // --- Store-backed properties (getters/setters to keep template bindings) ---
  get market(): PolicyMarket | '' {
    return this.store.market();
  }

  set market(value: PolicyMarket | '') {
    this.store.setMarket(value);
  }

  get clientType(): PolicyClientType | '' {
    return this.store.clientType();
  }

  set clientType(value: PolicyClientType | '') {
    this.store.setClientType(value);
  }

  get marketOptions(): PolicyMarket[] {
    return this.store.marketOptions();
  }

  get clientTypeOptions(): PolicyClientType[] {
    return this.store.clientTypeOptions();
  }

  getSelectedMarketLabel(): string {
    const value = this.market;
    return value ? this.getMarketLabel(value as PolicyMarket) : 'Por definir';
  }

  getSelectedClientTypeLabel(): string {
    const value = this.clientType;
    return value ? this.getClientTypeLabel(value as PolicyClientType) : 'Por definir';
  }

  get pkg() {
    return this.store.pkg();
  }

  get isLoading(): boolean {
    return this.store.isLoading();
  }

  get selectedOptions(): Record<string, boolean> {
    return this.store.selectedOptions();
  }

  get downPaymentPercentage(): number {
    return this.store.downPaymentPercentage();
  }

  set downPaymentPercentage(value: number) {
    this.store.setDownPaymentPercentage(value);
  }

  get term(): number {
    return this.store.term();
  }

  set term(value: number) {
    this.store.setTerm(value);
  }

  get amortizationTable() {
    return this.store.amortizationTable();
  }

  get isAmortizationVisible(): boolean {
    return this.store.isAmortizationVisible();
  }

  get downPaymentAmountDirect(): string {
    return this.store.downPaymentAmountDirect();
  }

  set downPaymentAmountDirect(value: string) {
    this.store.setDownPaymentAmountDirect(value);
  }

  get initialDownPayment(): string {
    return this.store.initialDownPayment();
  }

  set initialDownPayment(value: string) {
    this.store.setInitialDownPayment(value);
  }

  get deliveryTerm(): number {
    return this.store.deliveryTerm();
  }

  set deliveryTerm(value: number) {
    this.store.setDeliveryTerm(value);
  }

  get voluntaryContribution(): string {
    return this.store.voluntaryContribution();
  }

  set voluntaryContribution(value: string) {
    this.store.setVoluntaryContribution(value);
  }

  get collectionUnits(): CollectionUnit[] {
    return this.store.collectionUnits();
  }

  get tandaMembers(): number {
    return this.store.tandaMembers();
  }

  set tandaMembers(value: number) {
    this.store.setTandaMembers(value);
  }

  get includeInsurance(): boolean {
    return this.store.includeInsurance();
  }

  set includeInsurance(value: boolean) {
    this.store.setIncludeInsurance(value);
  }

  get insuranceAmount(): string {
    return this.store.insuranceAmount();
  }

  set insuranceAmount(value: string) {
    this.store.setInsuranceAmount(value);
  }

  get insuranceMode(): 'financiado' | 'contado' {
    return this.store.insuranceMode();
  }

  set insuranceMode(value: 'financiado' | 'contado') {
    this.store.setInsuranceMode(value);
  }

  // --- Derived financial values ---
  get totalPrice(): number {
    return this.store.totalPrice();
  }

  get downPayment(): number {
    return this.store.downPayment();
  }

  get amountToFinance(): number {
    return this.store.amountToFinance();
  }

  get monthlyPayment(): number {
    return this.store.monthlyPayment();
  }

  get firstInterest(): number {
    return this.store.firstInterest();
  }

  get firstPrincipal(): number {
    return this.store.firstPrincipal();
  }

  get firstBalance(): number {
    return this.store.firstBalance();
  }

  get monthlySavings(): number {
    return this.store.monthlySavings();
  }

  get projectedCollectionSavings(): number {
    return this.store.projectedCollectionSavings();
  }

  get timeToGoal(): number {
    return this.store.timeToGoal();
  }

  // --- Actions ---
  onMarketChange(): void {
    this.store.setMarket(this.market);
  }

  onClientTypeChange(): void {
    this.store.setClientType(this.clientType);
  }

  onSavingsConfigChange(): void {
    this.store.persistFlowContextSnapshot('savings-config');
  }

  toggleComponent(componentId: string): void {
    this.store.toggleComponent(componentId);
  }

  addCollectionUnit(): void {
    this.store.addCollectionUnit();
  }

  updateCollectionUnit(id: number, patch: Partial<CollectionUnit>): void {
    this.store.updateCollectionUnit(id, patch);
  }

  removeCollectionUnit(id: number): void {
    this.store.removeCollectionUnit(id);
  }

  calculateAmortization(): void {
    this.store.calculateAmortization();
  }

  closeAmortization(): void {
    this.store.closeAmortization();
  }

  generateQuotePDF(): void {
    this.store.generatePDF();
  }

  async handleFormalizeClick(): Promise<void> {
    const pkg = this.pkg;
    const market = this.market;
    const clientType = this.clientType;

    if (!pkg || !market || !clientType) {
      this.toast.error('Completa la configuración antes de formalizar.');
      return;
    }

    const baseFlow = this.initialMode === 'savings' ? BusinessFlow.AhorroProgramado : (this.client?.flow ?? BusinessFlow.VentaPlazo);
    const flow = this.client?.flow === BusinessFlow.CreditoColectivo ? BusinessFlow.CreditoColectivo : baseFlow;

    const quote: Quote = {
      totalPrice: this.totalPrice,
      downPayment: this.downPayment,
      amountToFinance: this.amountToFinance,
      term: this.term,
      monthlyPayment: this.monthlyPayment,
      market,
      clientType: clientType as ClientType,
      flow
    };

    this.store.persistFlowContextSnapshot('formalize');

    try {
      await this.entitySync.recordQuotePrepared({
        quoteLabel: pkg.name,
        market,
        amountToFinance: this.amountToFinance,
        monthlyPayment: this.monthlyPayment,
        clientName: this.client?.name,
        businessFlow: flow
      });
    } catch (error) {
      console.error('[Cotizador] No se pudo registrar la cotización', error);
    }

    const metrics: SummaryMetric[] = [
      { label: 'Mercado', value: this.getMarketLabel(market) },
      { label: 'Tipo de cliente', value: this.getClientTypeLabel(clientType) },
      { label: 'Enganche', value: this.formatCurrency(this.downPayment) },
      { label: 'PMT estimada', value: this.formatCurrency(this.monthlyPayment) }
    ];

    const nextSteps = [
      'Crea la oportunidad para conectar con documentos y AVI.',
      'Envía la cotización al cliente o programa seguimiento.'
    ];

    this.completion.open({
      title: 'Cotización preparada',
      description: 'Selecciona el siguiente paso para continuar con el proceso comercial.',
      metrics,
      nextSteps,
      actions: [
        {
          id: 'create-opportunity',
          label: 'Crear oportunidad',
          kind: 'primary',
          execute: async () => {
            this.onFormalize.emit(quote);
            await this.navigateAfterFormalize(flow, market, clientType);
          }
        },
        {
          id: 'stay-in-cotizador',
          label: 'Seguir en cotizador',
          kind: 'secondary',
          execute: () => Promise.resolve()
        }
      ],
      breadcrumbs: ['Dashboard', 'Cotizador', 'Resumen'],
      onComplete: () => {
        this.globalSearch.refreshIndex(this.client?.name);
        this.navigation.refreshQuickActions();
      }
    });
  }

  goBack(): void {
    this.store.goToDashboard();
  }


  get isVentaDirecta(): boolean {
    return this.store.isVentaDirecta();
  }

  toggleClientView(): void {
    this.isClientView.update(active => {
      const next = !active;
      this.toast.info(next ? 'Vista cliente activada. Elementos internos ocultos.' : 'De vuelta a la vista asesor.');
      return next;
    });
  }

  resetDemoScenario(): void {
    const scenario = this.activeDemoScenario();
    if (!scenario) {
      return;
    }
    this.demoSeeds.resetScenario(scenario);
    void this.demoReestructura.resetFinanceScenario(scenario);
    const set = this.demoFinanceScenarioSet();
    if (set) {
      this.selectedDemoFinanceScenarioId.set(set.baseScenarioId ?? set.scenarios[0]?.id ?? null);
    }
    this.demoAnalytics.track('scenario_reset', { scenario, feature: 'cotizador' });
    this.appliedDemoFinanceKey = null;
    this.demoFinanceMessage.set('Escenario demo restablecido. Selecciona un preset o ajusta los valores para continuar.');
  }

  selectDemoFinanceScenario(scenarioId: string): void {
    const set = this.demoFinanceScenarioSet();
    if (!set) {
      return;
    }
    const nextId = set.scenarios.some(item => item.id === scenarioId) ? scenarioId : (set.baseScenarioId ?? null);
    if (!nextId || this.selectedDemoFinanceScenarioId() === nextId) {
      return;
    }
    this.selectedDemoFinanceScenarioId.set(nextId);
    const scenario = this.activeDemoScenario();
    if (scenario) {
      this.demoFinanceMessage.set('Aplicando escenario demo...');
      void this.demoReestructura.applyScenario(nextId, { scenarioId: scenario });
    }
    if (scenario) {
      this.demoAnalytics.track('finance_scenario_selected', {
        scenario,
        option: nextId
      });
      if (scenario === 'proteccion-reestructura') {
        this.demoAnalytics.track('protection_option_applied', {
          scenario,
          option: nextId
        });
      }
    }
  }

  simulateFinanceEvent(kind: 'late' | 'extra'): void {
    if (!this.isDemoMode() || this.isFinanceEventProcessing()) {
      return;
    }
    const scenario = this.activeDemoScenario();
    const snapshot = this.demoScenarioSnapshot();
    if (!scenario || !snapshot?.financeScenarios) {
      return;
    }

    this.isFinanceEventProcessing.set(true);
    const action = kind === 'late'
      ? this.demoReestructura.simulateLatePayment({ scenarioId: scenario })
      : this.demoReestructura.simulateExtraPayment({ scenarioId: scenario });

    void action
      .then(() => {
        this.demoAnalytics.track('finance_event', {
          scenario,
          event: kind,
          feature: 'cotizador'
        });
      })
      .finally(() => {
        this.isFinanceEventProcessing.set(false);
      });
  }

  private hydrateFinanceConfig(
    config: DemoFinanceScenario['config'] | null,
    events: DemoFinanceEvent[],
    options: { trackAnalytics?: boolean; optionId?: string; title?: string } = {}
  ): number {
    const base = (config ?? {}) as Record<string, number | undefined>;
    const deliveryMonthsSource = typeof base['deliveryMonths'] === 'number' ? base['deliveryMonths'] : this.deliveryTerm;
    let deliveryMonths = Math.max(1, Math.round(deliveryMonthsSource));

    const rawDownPayment = base['initialDownPayment'] ?? base['targetDownPayment'];
    const fallbackDownPayment = Number(this.initialDownPayment);
    const normalizedDownPayment = typeof rawDownPayment === 'number'
      ? rawDownPayment
      : (Number.isFinite(fallbackDownPayment) ? fallbackDownPayment : 0);
    let downPayment = Math.max(0, Math.round(normalizedDownPayment));

    const rawVoluntary = base['voluntaryMonthly'];
    const fallbackVoluntary = Number(this.voluntaryContribution);
    const normalizedVoluntary = typeof rawVoluntary === 'number'
      ? rawVoluntary
      : (Number.isFinite(fallbackVoluntary) ? fallbackVoluntary : 0);
    let voluntary = Math.max(0, Math.round(normalizedVoluntary));

    const unitValueBase = typeof base['unitValue'] === 'number' ? base['unitValue'] : undefined;
    const fallbackUnitValue = downPayment + this.monthlyPayment * deliveryMonths;
    const unitValue = Math.max(0, Math.round(unitValueBase ?? fallbackUnitValue));

    events.forEach(event => {
      switch (event.kind) {
        case 'late-payment':
          voluntary += Math.max(150, Math.round(voluntary * 0.25));
          deliveryMonths += 1;
          break;
        case 'extra-payment':
          downPayment += Math.abs(event.amountDelta ?? 600);
          voluntary = Math.max(0, voluntary - Math.max(120, Math.round(voluntary * 0.25)));
          deliveryMonths = Math.max(1, deliveryMonths - 1);
          break;
        default:
          break;
      }
    });

    this.initialDownPayment = String(downPayment);
    this.downPaymentAmountDirect = String(downPayment);
    this.deliveryTerm = deliveryMonths;
    this.term = deliveryMonths;
    this.voluntaryContribution = String(voluntary);

    if (unitValue > 0 && downPayment >= 0) {
      const percentage = Math.round((downPayment / unitValue) * 100);
      this.downPaymentPercentage = Math.min(95, Math.max(5, percentage));
    }

    const baseConsumption = typeof base['currentPlateConsumption'] === 'number' ? base['currentPlateConsumption'] : null;
    const baseOverprice = typeof base['overpricePerLiter'] === 'number' ? base['overpricePerLiter'] : null;

    if (baseConsumption != null || baseOverprice != null) {
      if (!this.collectionUnits.length) {
        this.addCollectionUnit();
      }
      const unit = this.collectionUnits[0];
      if (unit) {
        this.updateCollectionUnit(unit.id, {
          consumption: baseConsumption != null
            ? String(Math.round(baseConsumption))
            : unit.consumption,
          overprice: baseOverprice != null
            ? String(baseOverprice)
            : unit.overprice
        });
      }
    }

    const monthly = this.monthlyPayment;

    if (options.trackAnalytics !== false && options.optionId) {
      this.demoAnalytics.track('finanzas_autosimulated', {
        scenario: this.activeDemoScenario(),
        option: options.optionId,
        feature: 'cotizador',
        monthlyPayment: monthly
      });
    }

    return monthly;
  }

  private applyDemoFinanceScenarioConfig(optionId: string, config: DemoFinanceScenario['config'], title: string, terms: string | null): void {
    this.currentDemoConfig = config ? { ...config } : null;
    this.currentDemoScenarioTitle = title;

    if (terms) {
      const match = terms.match(/(\d+)\s*mes/i);
      if (match) {
        const parsed = Number(match[1]);
        if (!Number.isNaN(parsed) && parsed > 0) {
          this.term = parsed;
        }
      }
    }

    const events = this.demoScenarioSnapshot()?.financeEvents ?? [];
    const monthly = this.hydrateFinanceConfig(this.currentDemoConfig, events, {
      trackAnalytics: true,
      optionId,
      title
    });

    this.demoFinanceMessage.set(this.buildDemoFinanceMessage(title, monthly));
  }

  private isFinanceDemoScenario(scenarioId: DemoScenarioId | null): scenarioId is 'finanzas-whatif' | 'proteccion-reestructura' {
    return scenarioId === 'finanzas-whatif' || scenarioId === 'proteccion-reestructura';
  }

  private buildDemoFinanceMessage(title: string, monthly: number): string {
    const scenarioId = this.activeDemoScenario();
    const prefix = scenarioId === 'proteccion-reestructura'
      ? `Protección demo aplicado: ${title}`
      : `${title} aplicado`;
    return `${prefix}. PMT estimada ${this.formatCurrency(monthly)}.`;
  }

  private resolveBusinessFlowPreview(
    clientType: PolicyClientType | '',
    saleType: 'contado' | 'financiero'
  ): BusinessFlow {
    if (saleType === 'contado') {
      return BusinessFlow.VentaDirecta;
    }

    if (clientType === 'colectivo') {
      return BusinessFlow.CreditoColectivo;
    }

    return BusinessFlow.VentaPlazo;
  }

  private recordRequirementsTelemetry(
    snapshot: OnboardingRequirementsSnapshot | null,
    origin: 'documents' | 'onboarding' | 'cotizador'
  ): void {
    if (!snapshot) {
      return;
    }

    const key = `${origin}|${snapshot.context.market}|${snapshot.context.saleType}|${snapshot.context.clientType}|${snapshot.pendingCount}`;
    if (this.lastRequirementsTelemetryKey === key) {
      return;
    }

    this.lastRequirementsTelemetryKey = key;

    const analytics = this.isDemoMode() ? this.demoAnalytics : this.analytics;

    if (snapshot.pendingCount > 0) {
      analytics.track('onboarding_requirements_pending', {
        origin,
        pending: snapshot.pendingCount,
        market: snapshot.context.market,
        saleType: snapshot.context.saleType,
        clientType: snapshot.context.clientType,
        items: snapshot.pendingRequirements.slice(0, 5).map(item => ({
          id: item.id,
          title: item.title,
          status: item.status
        }))
      });
    } else {
      analytics.track('onboarding_requirements_clear', {
        origin,
        market: snapshot.context.market,
        saleType: snapshot.context.saleType,
        clientType: snapshot.context.clientType
      });
    }
  }

  onDownPaymentDirectChange(): void {
    this.store.setDownPaymentAmountDirect(this.downPaymentAmountDirect);
  }

  onDownPaymentSliderChange(): void {
    this.store.setDownPaymentPercentage(this.downPaymentPercentage);
  }

  onTermChange(): void {
    this.store.setTerm(this.term);
  }

  onTandaMembersChange(): void {
    this.store.setTandaMembers(this.tandaMembers);
  }

  openProtectionDemo(): void {
    this.isProtectionDemoOpen = true;
  }

  get tandaTimeline(): TandaMilestone[] {
    const pkg = this.pkg;
    const clientType = this.clientType;
    const initialMode = this.initialMode;

    if (!pkg || clientType !== 'colectivo' || initialMode !== 'savings' || this.totalPrice <= 0 || this.tandaMembers <= 0) {
      return [];
    }

    const downPaymentGoal = (pkg.minDownPaymentPercentage ?? 0) * this.totalPrice;
    const singleMemberMonthlySaving = this.monthlySavings;
    const individualAmountToFinance = this.totalPrice - downPaymentGoal;

    let individualMonthlyPayment = 0;
    if (individualAmountToFinance > 0 && pkg.rate > 0 && pkg.terms.length > 0) {
      const individualTerm = pkg.terms[0];
      const monthlyRate = pkg.rate / 12;
      individualMonthlyPayment = (individualAmountToFinance * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -individualTerm));
    }

    const totalGroupMonthlyIncome = this.tandaMembers * singleMemberMonthlySaving;
    const timeline: TandaMilestone[] = [];
    let accumulatedSavingsSurplus = 0;
    let membersPaying = 0;

    for (let i = 1; i <= this.tandaMembers; i++) {
      const currentMonthlyDebtPayment = membersPaying * individualMonthlyPayment;
      const netSavingsPerMonth = totalGroupMonthlyIncome - currentMonthlyDebtPayment;

      if (netSavingsPerMonth <= 0) {
        break;
      }

      const savingsNeeded = downPaymentGoal - accumulatedSavingsSurplus;
      const monthsToSave = savingsNeeded > 0 ? savingsNeeded / netSavingsPerMonth : 0;

      timeline.push({
        type: 'ahorro',
        duration: monthsToSave,
        label: `Ahorro para Enganche ${i}`,
        month: i,
        completed: false,
        current: i === 1,
        icon: 'credit-card' as IconName,
        title: `Enganche ${i}`,
        description: `Acumulando ${this.formatCurrency(downPaymentGoal)} para la entrega`,
        amount: downPaymentGoal
      });

      timeline.push({
        type: 'entrega',
        unitNumber: i,
        duration: 0.1,
        label: `Entrega Unidad ${i}`,
        month: i,
        completed: false,
        current: false,
        icon: 'truck' as IconName,
        title: `Entrega ${i}`,
        description: `Unidad #${i} entregada al grupo`
      });

      const totalSavingsGenerated = accumulatedSavingsSurplus + (monthsToSave * netSavingsPerMonth);
      accumulatedSavingsSurplus = totalSavingsGenerated - downPaymentGoal;
      membersPaying++;
    }

    return timeline;
  }

  formatCurrency(value: number): string {
    return this.store.formatCurrency(value);
  }

  get tandaLimits(): { min: number; max: number } {
    return this.store.tandaLimits();
  }

  get minDownPaymentRequired(): number {
    return this.store.minDownPaymentRequired();
  }

  get canGoPrevious(): boolean {
    return this.store.canGoPrevious();
  }

  get canGoNext(): boolean {
    return this.store.canGoNext();
  }

  getMarketLabel(option: PolicyMarket): string {
    return this.marketLabels[option] ?? option;
  }

  getClientTypeLabel(option: PolicyClientType): string {
    return this.clientTypeLabels[option] ?? option;
  }

  getDownPaymentPercentage(): number {
    const total = Math.max(this.totalPrice, 0);
    if (!total) {
      return 0;
    }
    const initialDown = this.toNumber(this.initialDownPayment) || this.downPayment;
    return Math.max(0, Math.min(100, (initialDown / total) * 100));
  }

  getSavedPercentage(): number {
    const total = Math.max(this.totalPrice, 0);
    if (!total) {
      return 0;
    }
    return Math.max(0, Math.min(100, (this.projectedCollectionSavings / total) * 100));
  }

  readonly trackValidationMessage: TrackByFunction<BusinessValidationMessage> = (index, message) =>
    message.code || `validation-${index}`;

  private navigateAfterFormalize(flow: BusinessFlow, market: PolicyMarket | '', clientType: PolicyClientType | ''): Promise<boolean> {
    if (!market || !clientType) {
      return Promise.resolve(false);
    }

    const flowParam = this.mapFlowToQuery(flow);
    const queryParams: Record<string, string> = {
      market,
      clientType,
      preselectedFlow: flowParam,
      suggestedFlow: flowParam,
      source: 'cotizador'
    };

    if (this.client?.name) {
      queryParams['clientName'] = this.client.name;
    }

    return this.router.navigate(['/nueva-oportunidad'], { queryParams });
  }

  private mapFlowToQuery(flow: BusinessFlow): string {
    switch (flow) {
      case BusinessFlow.AhorroProgramado:
        return 'ahorro_programado';
      case BusinessFlow.CreditoColectivo:
        return 'credito_colectivo';
      case BusinessFlow.VentaDirecta:
        return 'venta_directa';
      default:
        return 'venta_plazo';
    }
  }

  toNumber(value: any): number {
    const parsed = typeof value === 'number' ? value : parseFloat(value ?? '0');
    return Number.isFinite(parsed) ? parsed : 0;
  }
}
