import { CommonModule, DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, OnInit, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { Renderer2, RendererFactory2 } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DestroyRef } from '@angular/core';
import { IconComponent } from '@shared/icon/icon.component';
import { ChartDirective } from '@shared/chart.directive';
import { ChartConfiguration } from 'chart.js';
import { DemoModeService } from '@core-services/demo-mode.service';
import { DemoSeedService } from '@services/demo/demo-seed.service';
import { DemoTandaService } from '@services/demo/demo-tanda.service';
import { DemoAnalyticsService } from '@services/demo/demo-analytics.service';
import { DemoReestructuraEngine } from '@services/demo/demo-reestructura.engine';
import { SimuladorStore, SavedSimulation, SimulatorScenario, SimulationCharts } from './simulador.store';
import { DemoFinanceEvent, DemoFinanceScenario } from '@services/demo/demo-scenarios';

@Component({
  selector: 'app-simulador-main',
  standalone: true,
  imports: [CommonModule, IconComponent, ChartDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './simulador-main.component.html',
  styleUrls: ['./simulador-main.component.scss'],
})
export class SimuladorMainComponent implements OnInit {
  @ViewChild('cmpDialog') cmpDialog?: ElementRef<HTMLDivElement>;
  @ViewChild('cmpClose') cmpClose?: ElementRef<HTMLButtonElement>;

  private readonly store = inject(SimuladorStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly documentRef = inject(DOCUMENT);
  private readonly renderer: Renderer2 = inject(RendererFactory2).createRenderer(null, null);
  private readonly demoMode = inject(DemoModeService);
  private readonly demoSeeds = inject(DemoSeedService);
  private readonly demoTanda = inject(DemoTandaService);
  private readonly demoAnalytics = inject(DemoAnalyticsService);
  private readonly demoReestructura = inject(DemoReestructuraEngine);

  private readonly queryParamsSignal = toSignal(this.route.queryParams, { initialValue: {} as Params });
  private readonly selectedDemoFinanceScenarioId = signal<string | null>(null);
  private lastAppliedDemoScenario: string | null = null;
  private lastTrackedScenarioId: string | null = null;
  readonly isTandaSimulating = signal(false);
  readonly isFinanceScenarioApplying = signal(false);

  readonly isDemoMode = this.demoMode.isDemoMode;
  readonly activeDemoScenario = this.demoMode.activeScenario;
  readonly demoScenarioSnapshot = computed(() => {
    const scenario = this.activeDemoScenario();
    if (!scenario) {
      return null;
    }
    return this.demoSeeds.scenarioSnapshot(scenario);
  });
  readonly demoFinanceScenarioSet = computed(() => this.demoScenarioSnapshot()?.financeScenarios ?? null);
  readonly activeDemoFinanceScenario = computed(() => {
    const set = this.demoFinanceScenarioSet();
    if (!set) {
      return null;
    }
    const selected = this.selectedDemoFinanceScenarioId() ?? set.baseScenarioId;
    return set.scenarios.find(option => option.id === selected) ?? set.scenarios[0] ?? null;
  });
  readonly demoTandaGroup = computed(() => this.demoScenarioSnapshot()?.tandaGroup ?? null);
  readonly demoTandaSchedule = computed(() => this.demoScenarioSnapshot()?.tandaSchedule ?? this.demoScenarioSnapshot()?.tandaGroup?.deliverySchedule ?? null);
  private removeEscListener?: () => void;
  private comparisonPreviouslyFocused: HTMLElement | null = null;

  readonly scenarios = this.store.availableScenarios;
  readonly smartContext = this.store.smartContext;
  readonly isRedirecting = this.store.isRedirecting;
  readonly redirectMessage = this.store.redirectMessage;
  readonly selectedScenario = this.store.selectedScenario;
  readonly isScenarioLoading = this.store.isScenarioLoading;
  readonly ahorroChartConfig = this.store.ahorroChartConfig;
  readonly pmtChartConfig = this.store.pmtChartConfig;
  readonly savedSimulations = this.store.savedSimulations;
  readonly comparisonMode = this.store.comparisonMode;
  readonly isComparisonModalOpenSignal = this.store.isComparisonModalOpen;
  readonly selectedSimulations = this.store.selectedSimulations;
  readonly selectionIds = this.store.comparisonSelectionIds;
  readonly selectionSet = computed(() => new Set(this.selectionIds()));
  readonly selectionCount = computed(() => this.selectionIds().length);
  readonly canCompare = this.store.canCompare;

  get ahorroChart() {
    return this.ahorroChartConfig() ?? undefined;
  }

  get pmtChart() {
    return this.pmtChartConfig() ?? undefined;
  }

  private readonly defaultKpi = {
    ahorro: 15000,
    plazo: 24,
    pmt: 3250
  };
  readonly kpiData = signal({ ...this.defaultKpi });
  readonly financeEvents = computed(() => this.demoScenarioSnapshot()?.financeEvents ?? []);
  readonly isFinanceEventProcessing = signal(false);

  constructor() {
    effect(() => {
      if (!this.isDemoMode()) {
        this.lastAppliedDemoScenario = null;
        this.lastTrackedScenarioId = null;
        this.resetDemoFinanceView();
        return;
      }
      const scenarioId = this.activeDemoScenario();
      const snapshot = this.demoScenarioSnapshot();
      if (!scenarioId || !snapshot) {
        return;
      }

      if (this.lastTrackedScenarioId !== scenarioId) {
        let targetScenarioId: string | null = null;
        if (scenarioId === 'tanda-colectiva') {
          targetScenarioId = 'tanda-colectiva';
        } else if (scenarioId === 'finanzas-whatif') {
          targetScenarioId = 'edomex-individual';
        }
        if (targetScenarioId) {
          this.store.selectScenarioById(targetScenarioId);
        }
        this.lastTrackedScenarioId = scenarioId;
      }

      const activeOption = this.activeDemoFinanceScenario();
      const trackerKey = `${scenarioId}|${activeOption?.id ?? 'default'}`;
      if (this.lastAppliedDemoScenario !== trackerKey) {
        this.lastAppliedDemoScenario = trackerKey;
        this.demoAnalytics.track('scenario_active', { scenario: scenarioId, feature: 'simulador' });
      }

      const set = this.demoFinanceScenarioSet();
      if (set) {
        const nextId = set.baseScenarioId ?? set.scenarios[0]?.id ?? null;
        if (this.selectedDemoFinanceScenarioId() !== nextId) {
          this.selectedDemoFinanceScenarioId.set(nextId);
        }
      }
    }, { allowSignalWrites: true });

    effect(() => {
      if (!this.isDemoMode()) {
        return;
      }
      const snapshot = this.demoScenarioSnapshot();
      const scenarioId = this.activeDemoScenario();
      if (!scenarioId || !snapshot?.financeScenarios) {
        return;
      }

      const activeOption = this.activeDemoFinanceScenario();
      if (!activeOption) {
        return;
      }

      const events = snapshot.financeEvents ?? [];
      this.applyFinanceMetrics(activeOption, events);
    }, { allowSignalWrites: true });

    effect(() => {
      const params = this.queryParamsSignal();
      this.store.handleQueryParams(params);
    }, { allowSignalWrites: true });

    effect(() => {
      if (this.isComparisonModalOpen()) {
        queueMicrotask(() => this.focusComparisonDialog());
      }
    });

    this.destroyRef.onDestroy(() => {
      this.removeEscListener?.();
      this.removeEscListener = undefined;
      this.comparisonPreviouslyFocused = null;
    });
  }

  ngOnInit(): void {
    this.registerEscapeListener();
    this.store.hydrateScenarioAvailability();
    this.store.refreshSavedSimulations();
  }

  goBack(): void {
    this.router.navigate(['/dashboard']);
  }

  selectScenario(scenario: SimulatorScenario): void {
    this.store.selectScenarioById(scenario.id);
  }

  continueSimulation(simulation: SavedSimulation): void {
    const scenario = this.scenarios().find(s => s.id === simulation.scenarioType);
    if (!scenario) {
      return;
    }

    this.router.navigate([scenario.route], {
      queryParams: {
        market: simulation.market,
        clientType: simulation.clientType,
        clientName: simulation.clientName,
        resumeDraft: 'true',
        draftKey: simulation.draftKey
      }
    });
  }

  deleteSimulation(simulationId: string): void {
    if (typeof window !== 'undefined' && window.confirm('¿Estás seguro de eliminar esta simulación? Esta acción no se puede deshacer.')) {
      this.store.deleteSimulation(simulationId);
    }
  }

  showAllSimulations(): void {
    // Placeholder for future navigation to simulations management
  }

  toggleComparisonMode(): void {
    this.store.toggleComparisonMode();
  }

  toggleSimulationSelection(simulationId: string): void {
    this.store.toggleSimulationSelection(simulationId);
  }

  clearSelection(): void {
    this.store.clearSelection();
  }

  resetDemoScenario(): void {
    const scenario = this.activeDemoScenario();
    if (!scenario) {
      return;
    }
    this.demoSeeds.resetScenario(scenario);
    const set = this.demoFinanceScenarioSet();
    if (set) {
      this.selectedDemoFinanceScenarioId.set(set.baseScenarioId ?? set.scenarios[0]?.id ?? null);
    }
    this.demoAnalytics.track('scenario_reset', { scenario, feature: 'simulador' });
  }

  async selectDemoFinanceScenario(scenarioId: string): Promise<void> {
    const set = this.demoFinanceScenarioSet();
    if (!set) {
      return;
    }
    const exists = set.scenarios.some(item => item.id === scenarioId);
    const nextId = exists ? scenarioId : (set.baseScenarioId ?? null);
    if (!nextId || this.selectedDemoFinanceScenarioId() === nextId) {
      return;
    }
    this.selectedDemoFinanceScenarioId.set(nextId);
    const scenario = this.activeDemoScenario();
    if (!scenario) {
      return;
    }

    this.isFinanceScenarioApplying.set(true);
    try {
      await this.demoReestructura.applyScenario(nextId, { scenarioId: scenario });
      this.demoAnalytics.track('finance_scenario_selected', { scenario, option: nextId });
    } finally {
      this.isFinanceScenarioApplying.set(false);
    }
  }

  async simulateFinanceEvent(kind: 'late' | 'extra'): Promise<void> {
    if (!this.isDemoMode() || this.isFinanceEventProcessing()) {
      return;
    }
    const scenario = this.activeDemoScenario();
    const snapshot = this.demoScenarioSnapshot();
    if (!scenario || !snapshot?.financeScenarios) {
      return;
    }

    this.isFinanceEventProcessing.set(true);
    try {
      if (kind === 'late') {
        await this.demoReestructura.simulateLatePayment({ scenarioId: scenario });
      } else {
        await this.demoReestructura.simulateExtraPayment({ scenarioId: scenario });
      }
      this.demoAnalytics.track('finance_event', {
        scenario,
        event: kind,
        feature: 'simulador'
      });
    } finally {
      this.isFinanceEventProcessing.set(false);
    }
  }

  private applyFinanceMetrics(option: DemoFinanceScenario, events: DemoFinanceEvent[]): void {
    const config = option.config ?? {};
    let months = Math.max(1, Math.round(config['deliveryMonths'] ?? 12));
    let monthly = Math.max(0, Math.round(option.pagoMensual ?? 0));
    let downPayment = Math.max(0, Math.round((config['initialDownPayment'] ?? config['targetDownPayment'] ?? 0)));
    const voluntary = Math.max(0, Math.round(config['voluntaryMonthly'] ?? 0));
    let unitValue = Math.max(0, Math.round(config['unitValue'] ?? 0));

    if (monthly === 0) {
      const base = unitValue > downPayment ? unitValue - downPayment : 0;
      monthly = months > 0 ? Math.round(base / months) : 0;
    }

    events.forEach(event => {
      switch (event.kind) {
        case 'late-payment':
          monthly += Math.max(80, Math.round(monthly * 0.06));
          months += 1;
          break;
        case 'extra-payment':
          downPayment += Math.abs(event.amountDelta ?? 500);
          monthly = Math.max(0, monthly - Math.max(60, Math.round(monthly * 0.05)));
          months = Math.max(1, months - 1);
          break;
        default:
          break;
      }
    });

    const savingsProjection = downPayment + voluntary * months + monthly * months;
    if (!unitValue) {
      unitValue = savingsProjection;
    }

    this.kpiData.set({
      ahorro: Math.max(0, Math.round(savingsProjection)),
      plazo: months,
      pmt: Math.max(0, Math.round(monthly))
    });

    const chartMonths = Math.max(1, Math.min(months, 12));
    const labels = Array.from({ length: chartMonths }, (_, idx) => `Mes ${idx + 1}`);
    const ahorroSeries = labels.map((_, idx) => {
      const period = idx + 1;
      return Math.max(0, Math.round(downPayment + voluntary * period + monthly * period));
    });

    const ahorroChart: ChartConfiguration<'line'> = {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Ahorro acumulado',
            data: ahorroSeries,
            borderColor: 'var(--accent-primary)',
            backgroundColor: 'var(--token-surface-accent-alpha-12)',
            borderWidth: 2,
            fill: true,
            tension: 0.35
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: value => `$${Number(value).toLocaleString('es-MX')}`
            }
          }
        }
      }
    };

    const saldoPendiente = Math.max(0, unitValue - (downPayment + monthly * months));
    const pmtChart: ChartConfiguration<'bar'> = {
      type: 'bar',
      data: {
        labels: ['Mensualidad demo', 'Enganche acumulado', 'Saldo estimado'],
        datasets: [
          {
            label: 'Impacto financiero',
            data: [Math.round(monthly), Math.round(downPayment), Math.round(saldoPendiente)],
            backgroundColor: ['var(--accent-primary)', 'rgba(37, 99, 235, 0.45)', 'rgba(148, 163, 184, 0.65)'],
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: value => `$${Number(value).toLocaleString('es-MX')}`
            }
          }
        }
      }
    };

    const charts: SimulationCharts = {
      ahorro: ahorroChart,
      pmt: pmtChart
    };
    this.store.updateCharts(charts);
  }

  private resetDemoFinanceView(): void {
    this.kpiData.set({ ...this.defaultKpi });
    this.store.updateCharts(this.buildDefaultCharts());
  }

  private buildDefaultCharts(): SimulationCharts {
    const ahorroChart: ChartConfiguration<'line'> = {
      type: 'line',
      data: {
        labels: ['Mes 1', 'Mes 6', 'Mes 12', 'Mes 18', 'Mes 24'],
        datasets: [
          {
            label: 'Ahorro acumulado',
            data: [3250, 19500, 39000, 58500, 78000],
            borderColor: 'var(--accent-primary)',
            backgroundColor: 'var(--token-surface-accent-alpha-10)',
            borderWidth: 2,
            fill: true,
            tension: 0.4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: value => `$${Number(value).toLocaleString('es-MX')}`
            }
          }
        }
      }
    };

    const pmtChart: ChartConfiguration<'bar'> = {
      type: 'bar',
      data: {
        labels: ['Año 1', 'Año 2', 'Promedio'],
        datasets: [
          {
            label: 'PMT Mensual',
            data: [3250, 3250, 3250],
            backgroundColor: ['var(--accent-primary)', 'var(--accent-primary)', 'var(--color-success)'],
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: value => `$${Number(value).toLocaleString('es-MX')}`
            }
          }
        }
      }
    };

    return { ahorro: ahorroChart, pmt: pmtChart };
  }

  async simulateDemoSorteo(): Promise<void> {
    if (this.isTandaSimulating()) {
      return;
    }
    this.isTandaSimulating.set(true);
    try {
      await this.demoTanda.simulateSorteo();
    } finally {
      this.isTandaSimulating.set(false);
    }
  }

  async markDemoPaymentMissed(memberId: string): Promise<void> {
    if (this.isTandaSimulating()) {
      return;
    }
    this.isTandaSimulating.set(true);
    try {
      await this.demoTanda.markPaymentMissed(memberId);
    } finally {
      this.isTandaSimulating.set(false);
    }
  }

  compareSelectedSimulations(): void {
    if (!this.canCompare()) {
      return;
    }
    this.comparisonPreviouslyFocused = this.documentRef?.activeElement as HTMLElement;
    this.store.openComparisonModal();
  }

  isComparisonModalOpen(): boolean {
    return this.isComparisonModalOpenSignal();
  }

  getSelectedSimulations(): SavedSimulation[] {
    return this.selectedSimulations();
  }

  getEfficiencyScore(simulation: SavedSimulation): string {
    return this.store.getEfficiencyLabel(simulation);
  }

  getEfficiencyClass(simulation: SavedSimulation): string {
    return this.store.getEfficiencyClass(simulation);
  }

  getBestOption(): string {
    return this.store.getBestOption();
  }

  getFastestOption(): string {
    return this.store.getFastestOption();
  }

  getLowestContributionOption(): string {
    return this.store.getLowestContributionOption();
  }

  exportComparison(): void {
    this.store.downloadComparisonSnapshot();
  }

  shareComparison(): void {
    const message = this.store.createShareMessage();
    if (!message || typeof window === 'undefined') {
      return;
    }
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
  }

  closeComparisonModal(): void {
    this.store.closeComparisonModal();
    if (this.comparisonPreviouslyFocused) {
      this.comparisonPreviouslyFocused.focus();
      this.comparisonPreviouslyFocused = null;
    }
  }

  handleComparisonKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeComparisonModal();
    }
  }

  getMarketLabel(market: string): string {
    switch (market) {
      case 'aguascalientes':
        return 'Aguascalientes';
      case 'edomex':
        return 'Estado de México';
      default:
        return market;
    }
  }

  formatCurrency(value: number | undefined): string {
    if (!value && value !== 0) {
      return 'N/D';
    }
    return `$${Number(value).toLocaleString('es-MX')}`;
  }

  formatLastModified(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return 'Hace un momento';
    if (minutes < 60) return `Hace ${minutes} min`;
    if (hours < 24) return `Hace ${hours}h`;
    if (days < 7) return `Hace ${days} días`;

    return new Date(timestamp).toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'short'
    });
  }

  selectionHas(simulationId: string): boolean {
    return this.selectionSet().has(simulationId);
  }

  selectionLimitReached(): boolean {
    return this.selectionCount() >= 3;
  }

  private registerEscapeListener(): void {
    if (this.removeEscListener || !this.documentRef) {
      return;
    }

    this.removeEscListener = this.renderer.listen(this.documentRef, 'keydown', (event: KeyboardEvent) => {
      if (event.key === 'Escape' && this.isComparisonModalOpen()) {
        this.closeComparisonModal();
      }
    });
  }

  private focusComparisonDialog(): void {
    const dialog = this.cmpDialog?.nativeElement;
    if (!dialog) {
      return;
    }
    const target = this.cmpClose?.nativeElement ?? dialog;
    target.focus();
  }
}
