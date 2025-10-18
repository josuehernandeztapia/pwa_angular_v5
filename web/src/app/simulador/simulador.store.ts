import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Params, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ChartConfiguration } from 'chart.js';
import { timer, Subscription } from 'rxjs';
import { DownloadService } from '@core-services/download.service';
import { MarketPolicyService, PolicyClientType } from '@feature-services/configuration/market-policy.service';
import { IconName } from '@shared/icon/icon-definitions';

export interface SimulatorScenario {
  id: string;
  title: string;
  subtitle: string;
  icon: IconName;
  description: string;
  market: 'aguascalientes' | 'edomex';
  clientType: PolicyClientType;
  route: string;
  gradient: string;
}

export interface SavedSimulation {
  id: string;
  clientName: string;
  scenarioType: string;
  scenarioTitle: string;
  market: string;
  clientType: string;
  lastModified: number;
  draftKey: string;
  summary: {
    targetAmount?: number;
    monthlyContribution?: number;
    timeToTarget?: number;
    status: 'draft' | 'completed';
  };
}

export interface SmartContextState {
  hasContext: boolean;
  market: string;
  clientType: string;
  clientName: string;
  source: string;
}

interface SimulationCharts {
  ahorro?: ChartConfiguration<'line'>;
  pmt?: ChartConfiguration<'bar'>;
}

@Injectable({ providedIn: 'root' })
export class SimuladorStore {
  private readonly router = inject(Router);
  private readonly marketPolicy = inject(MarketPolicyService);
  private readonly downloadService = inject(DownloadService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly baseScenarios: readonly SimulatorScenario[] = [
    {
      id: 'ags-ahorro',
      title: 'Proyector de Ahorro y Liquidación',
      subtitle: 'AGS Individual',
      icon: 'bank',
      description: 'Modela un plan de ahorro con aportación fuerte y recaudación para clientes de Aguascalientes.',
      market: 'aguascalientes',
      clientType: 'individual',
      route: '/simulador/ags-ahorro',
      gradient: 'ags-gradient'
    },
    {
      id: 'edomex-individual',
      title: 'Planificador de Enganche',
      subtitle: 'EdoMex Individual',
      icon: 'chart',
      description: 'Proyecta el tiempo para alcanzar la meta de enganche para un cliente individual en EdoMex.',
      market: 'edomex',
      clientType: 'individual',
      route: '/simulador/edomex-individual',
      gradient: 'edomex-individual-gradient'
    },
    {
      id: 'tanda-colectiva',
      title: 'Simulador de Tanda Colectiva',
      subtitle: 'EdoMex Colectivo',
      icon: 'users',
      description: 'Modela el "efecto bola de nieve" para un grupo de crédito colectivo.',
      market: 'edomex',
      clientType: 'colectivo',
      route: '/simulador/tanda-colectiva',
      gradient: 'edomex-collective-gradient'
    }
  ];

  private scenarioLoadSub?: Subscription;
  private smartRedirectSub?: Subscription;
  private readonly scenarioChartsCache = new Map<string, SimulationCharts>();

  readonly availableScenarios = signal<SimulatorScenario[]>([...this.baseScenarios]);
  readonly selectedScenarioId = signal<string | null>(null);
  readonly isScenarioLoading = signal(false);
  private readonly chartsState = signal<SimulationCharts>({});

  readonly smartContext = signal<SmartContextState>({
    hasContext: false,
    market: '',
    clientType: '',
    clientName: '',
    source: ''
  });
  readonly isRedirecting = signal(false);
  readonly redirectMessage = signal('');

  private readonly savedSimulationsState = signal<SavedSimulation[]>([]);
  readonly savedSimulations = computed(() => this.savedSimulationsState());

  readonly comparisonMode = signal(false);
  readonly isComparisonModalOpen = signal(false);
  private readonly selectedComparisonIds = signal<string[]>([]);

  readonly selectedScenario = computed(() => {
    const id = this.selectedScenarioId();
    return id ? this.availableScenarios().find(sc => sc.id === id) ?? null : null;
  });

  readonly ahorroChartConfig = computed(() => this.chartsState().ahorro ?? null);
  readonly pmtChartConfig = computed(() => this.chartsState().pmt ?? null);

  readonly selectedSimulations = computed(() => {
    const ids = new Set(this.selectedComparisonIds());
    return this.savedSimulationsState().filter(sim => ids.has(sim.id));
  });

  readonly comparisonSelectionIds = computed(() => this.selectedComparisonIds());

  readonly canCompare = computed(() => this.selectedComparisonIds().length >= 2);

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.cancelScenarioLoad();
      this.cancelSmartRedirect();
    });
  }

  hydrateScenarioAvailability(): void {
    const combos = new Set(
      this.marketPolicy.getAvailablePolicies().map(policy => `${policy.market}:${policy.clientType}`)
    );

    const filtered = this.baseScenarios.filter(scenario =>
      combos.has(`${scenario.market}:${scenario.clientType}`)
    );

    this.availableScenarios.set(filtered.length ? filtered : [...this.baseScenarios]);
  }

  handleQueryParams(params: Params): void {
    const market = typeof params['market'] === 'string' ? params['market'] : undefined;
    const clientType = typeof params['clientType'] === 'string' ? params['clientType'] : undefined;
    const clientName = typeof params['clientName'] === 'string' ? params['clientName'] : '';
    const source = typeof params['source'] === 'string' ? params['source'] : 'unknown';

    const previous = this.smartContext();

    if (market && clientType) {
      const contextChanged =
        !previous.hasContext ||
        previous.market !== market ||
        previous.clientType !== clientType ||
        previous.clientName !== clientName ||
        previous.source !== source;

      this.smartContext.set({
        hasContext: true,
        market,
        clientType,
        clientName,
        source
      });

      if (contextChanged) {
        this.scheduleSmartRedirection();
      }
    } else if (previous.hasContext) {
      this.smartContext.set({
        hasContext: false,
        market: '',
        clientType: '',
        clientName: '',
        source: ''
      });
      this.isRedirecting.set(false);
      this.redirectMessage.set('');
      this.cancelSmartRedirect();
    }
  }

  selectScenarioById(scenarioId: string): void {
    const scenario = this.availableScenarios().find(item => item.id === scenarioId);
    if (!scenario) {
      return;
    }

    this.selectedScenarioId.set(scenario.id);
    this.isScenarioLoading.set(true);
    this.chartsState.set({});
    this.cancelScenarioLoad();

    this.scenarioLoadSub = timer(1200)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.isScenarioLoading.set(false);
        this.loadScenarioCharts(scenario.id);
        this.scenarioLoadSub = undefined;
      });

    this.router.navigate(['/nueva-oportunidad'], {
      queryParams: {
        market: scenario.market,
        clientType: scenario.clientType,
        preselectedFlow: 'SIMULACION',
        targetSimulator: scenario.id,
        fromHub: 'true'
      }
    });
  }

  refreshSavedSimulations(): void {
    if (typeof window === 'undefined') {
      this.savedSimulationsState.set([]);
      return;
    }

    const allKeys = Object.keys(window.localStorage);
    const draftKeys = allKeys.filter(key =>
      key.includes('-draft') ||
      key.includes('Scenario') ||
      key.includes('agsScenario') ||
      key.includes('edomexScenario')
    );

    const simulations: SavedSimulation[] = [];

    draftKeys.forEach(key => {
      try {
        const raw = window.localStorage.getItem(key);
        if (!raw) {
          return;
        }
        const draftData = JSON.parse(raw);
        if (!this.isValidSimulationDraft(draftData)) {
          return;
        }
        const scenarioType = this.inferScenarioType(key, draftData);
        const scenarioTitle = this.getScenarioTitle(scenarioType);

        simulations.push({
          id: key,
          clientName: draftData.clientName || draftData.client?.name || 'Cliente sin nombre',
          scenarioType,
          scenarioTitle,
          market: draftData.market || this.inferMarket(key),
          clientType: draftData.clientType || this.inferClientType(key),
          lastModified: draftData.timestamp || draftData.lastModified || Date.now(),
          draftKey: key,
          summary: this.extractSummary(draftData)
        });
      } catch {
        // ignore malformed draft
      }
    });

    simulations.sort((a, b) => b.lastModified - a.lastModified);
    this.savedSimulationsState.set(simulations);
  }

  deleteSimulation(draftId: string): void {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.removeItem(draftId);
    this.refreshSavedSimulations();
  }

  toggleComparisonMode(): void {
    const next = !this.comparisonMode();
    this.comparisonMode.set(next);
    if (!next) {
      this.selectedComparisonIds.set([]);
      this.isComparisonModalOpen.set(false);
    }
  }

  toggleSimulationSelection(simId: string): void {
    const ids = new Set(this.selectedComparisonIds());
    if (ids.has(simId)) {
      ids.delete(simId);
    } else if (ids.size < 3) {
      ids.add(simId);
    }
    this.selectedComparisonIds.set(Array.from(ids));
  }

  clearSelection(): void {
    this.selectedComparisonIds.set([]);
  }

  openComparisonModal(): void {
    if (this.canCompare()) {
      this.isComparisonModalOpen.set(true);
    }
  }

  closeComparisonModal(): void {
    this.isComparisonModalOpen.set(false);
  }

  getBestOption(): string {
    const ranked = this.rankSimulationsByScore();
    return ranked.length ? ranked[0] : 'Sin suficientes datos';
  }

  getFastestOption(): string {
    const selected = this.selectedSimulations();
    if (!selected.length) {
      return 'Sin datos';
    }
    const fastest = [...selected].sort((a, b) =>
      (a.summary.timeToTarget ?? Number.MAX_SAFE_INTEGER) - (b.summary.timeToTarget ?? Number.MAX_SAFE_INTEGER)
    )[0];
    return this.describeSimulation(fastest);
  }

  getLowestContributionOption(): string {
    const selected = this.selectedSimulations();
    if (!selected.length) {
      return 'Sin datos';
    }
    const lowest = [...selected].sort((a, b) =>
      (a.summary.monthlyContribution ?? Number.MAX_SAFE_INTEGER) - (b.summary.monthlyContribution ?? Number.MAX_SAFE_INTEGER)
    )[0];
    return this.describeSimulation(lowest);
  }

  downloadComparisonSnapshot(): void {
    const payload = {
      generatedAt: new Date().toISOString(),
      totalCompared: this.selectedSimulations().length,
      bestOption: this.getBestOption(),
      fastestOption: this.getFastestOption(),
      lowestContribution: this.getLowestContributionOption(),
      simulations: this.selectedSimulations().map(sim => ({
        id: sim.id,
        clientName: sim.clientName,
        scenarioTitle: sim.scenarioTitle,
        summary: sim.summary
      }))
    };

    this.downloadService.downloadText(
      JSON.stringify(payload, null, 2),
      'application/json',
      {
        filename: `comparacion-simulaciones-${new Date().toISOString().split('T')[0]}.json`,
        revokeUrl: true
      }
    );
  }

  createShareMessage(): string {
    const selected = this.selectedSimulations();
    if (!selected.length) {
      return '';
    }

    const best = this.getBestOption();
    const fastest = this.getFastestOption();
    const lowest = this.getLowestContributionOption();

    const details = selected.map(sim => {
      const target = sim.summary.targetAmount ? `$${sim.summary.targetAmount.toLocaleString('es-MX')}` : 'N/D';
      const monthly = sim.summary.monthlyContribution ? `$${sim.summary.monthlyContribution.toLocaleString('es-MX')}` : 'N/D';
      const months = sim.summary.timeToTarget ? `${sim.summary.timeToTarget} meses` : 'N/D';
      return `• ${sim.clientName} (${sim.scenarioTitle})\n  Meta: ${target} | Mensual: ${monthly} | Tiempo: ${months}`;
    }).join('\n');

    return `*Comparación de Simulaciones*\n\n Analizadas: ${selected.length} opciones\n\n*Mejor Opción General:*\n${best}\n\n*Opción Más Rápida:*\n${fastest}\n\n*Menor Aportación Mensual:*\n${lowest}\n\n *Detalles:*\n${details}\n\nGenerado desde Conductores PWA`;
  }

  private scheduleSmartRedirection(): void {
    const context = this.smartContext();
    if (!context.hasContext) {
      return;
    }

    const targetScenario = this.availableScenarios().find(scenario =>
      scenario.market === context.market &&
      scenario.clientType === context.clientType
    );

    if (!targetScenario) {
      this.isRedirecting.set(false);
      this.redirectMessage.set('');
      return;
    }

    this.cancelSmartRedirect();
    this.isRedirecting.set(true);
    this.redirectMessage.set(`Detecté contexto: ${context.market} ${context.clientType}. Navegando al simulador óptimo...`);

    this.smartRedirectSub = timer(1200).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => {
      this.redirectMessage.set(`Lanzando ${targetScenario.title}...`);
      this.smartRedirectSub = timer(800)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => {
          this.router.navigate([targetScenario.route], {
            queryParams: {
              market: context.market,
              clientType: context.clientType,
              clientName: context.clientName,
              fromHub: 'true'
            }
          });
          this.isRedirecting.set(false);
          this.redirectMessage.set('');
          this.smartRedirectSub = undefined;
        });
    });
  }

  private loadScenarioCharts(scenarioId: string): void {
    const cached = this.scenarioChartsCache.get(scenarioId);
    if (cached) {
      this.chartsState.set(cached);
      return;
    }

    const charts: SimulationCharts = {
      ahorro: {
        type: 'line',
        data: {
          labels: ['Mes 1', 'Mes 6', 'Mes 12', 'Mes 18', 'Mes 24'],
          datasets: [
            {
              label: 'Ahorro Acumulado',
              data: [3250, 19500, 39000, 58500, 78000],
              borderColor: 'var(--accent-primary)',
              backgroundColor: 'var(--token-surface-accent-weak, var(--token-surface-accent-alpha-10))',
              borderWidth: 2,
              fill: true,
              tension: 0.4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: value => `$${Number(value).toLocaleString('es-MX')}`
              }
            }
          },
          plugins: {
            legend: {
              display: false
            }
          }
        }
      },
      pmt: {
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
            legend: {
              display: false
            }
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
      }
    };

    this.scenarioChartsCache.set(scenarioId, charts);
    this.chartsState.set(charts);
  }

  private rankSimulationsByScore(): string[] {
    const selected = this.selectedSimulations();
    if (!selected.length) {
      return [];
    }

    const scored = selected.map(sim => {
      const metrics = this.computeEfficiency(sim);
      return { sim, score: metrics.score };
    });

    scored.sort((a, b) => b.score - a.score);

    return scored.map(entry => this.describeSimulation(entry.sim));
  }

  getEfficiencyLabel(simulation: SavedSimulation): string {
    return this.computeEfficiency(simulation).label;
  }

  getEfficiencyClass(simulation: SavedSimulation): string {
    return this.computeEfficiency(simulation).className;
  }

  private describeSimulation(simulation: SavedSimulation): string {
    const contribution = simulation.summary.monthlyContribution ? `$${simulation.summary.monthlyContribution.toLocaleString('es-MX')}` : 'N/D';
    const time = simulation.summary.timeToTarget ? `${simulation.summary.timeToTarget} meses` : 'N/D';
    return `${simulation.clientName} · ${simulation.scenarioTitle} · Mensual: ${contribution} · Tiempo: ${time}`;
  }

  private computeEfficiency(simulation: SavedSimulation): { score: number; label: string; className: string } {
    const targetAmount = simulation.summary.targetAmount ?? 0;
    const monthlyContribution = simulation.summary.monthlyContribution ?? 0;
    const timeToTarget = simulation.summary.timeToTarget ?? Number.MAX_SAFE_INTEGER;

    if (!targetAmount || !monthlyContribution) {
      return { score: 0, label: 'N/D', className: 'poor' };
    }

    const contributionRatio = monthlyContribution / targetAmount;
    const timeEfficiency = timeToTarget > 0 ? (1 / timeToTarget) * 100 : 0;
    const score = (contributionRatio * 60000) + (timeEfficiency * 40);

    if (score >= 80) {
      return { score, label: 'Excelente', className: 'excellent' };
    }
    if (score >= 60) {
      return { score, label: 'Buena', className: 'good' };
    }
    if (score >= 40) {
      return { score, label: 'Regular', className: 'fair' };
    }
    return { score, label: 'Baja', className: 'poor' };
  }

  private extractSummary(data: any): SavedSimulation['summary'] {
    const summary: SavedSimulation['summary'] = { status: 'draft' };

    if (data.scenario) {
      summary.targetAmount = data.scenario.targetAmount;
      summary.monthlyContribution = data.scenario.monthlyContribution;
      summary.timeToTarget = data.scenario.monthsToTarget;
    }

    if (data.targetDownPayment || data.configParams?.targetDownPayment) {
      summary.targetAmount = data.targetDownPayment || data.configParams?.targetDownPayment;
    }

    if (data.simulationResult) {
      summary.targetAmount = data.simulationResult.scenario?.targetAmount;
      summary.monthlyContribution = data.simulationResult.scenario?.monthlyContribution;
      summary.timeToTarget = data.simulationResult.scenario?.monthsToTarget;
    }

    if (data.targetAmount) {
      summary.targetAmount = data.targetAmount;
    }
    if (data.monthlyContribution) {
      summary.monthlyContribution = data.monthlyContribution;
    }

    return summary;
  }

  private isValidSimulationDraft(data: any): boolean {
    if (!data) {
      return false;
    }
    return Boolean(
      data.clientName ||
      data.targetAmount ||
      data.monthlyContribution ||
      data.scenario ||
      data.configParams
    );
  }

  private inferScenarioType(key: string, data: any): string {
    if (key.includes('ags') || data.market === 'aguascalientes') {
      return 'ags-ahorro';
    }
    if (key.includes('edomex-individual') || data.type === 'EDOMEX_INDIVIDUAL') {
      return 'edomex-individual';
    }
    if (key.includes('tanda') || key.includes('collective') || data.type === 'EDOMEX_COLLECTIVE') {
      return 'tanda-colectiva';
    }
    return 'unknown';
  }

  private getScenarioTitle(scenarioType: string): string {
    return this.availableScenarios().find(s => s.id === scenarioType)?.title || 'Simulación';
  }

  private inferMarket(key: string): string {
    if (key.includes('ags')) {
      return 'aguascalientes';
    }
    if (key.includes('edomex')) {
      return 'edomex';
    }
    return 'unknown';
  }

  private inferClientType(key: string): string {
    if (key.includes('individual')) {
      return 'Individual';
    }
    if (key.includes('collective') || key.includes('tanda')) {
      return 'Colectivo';
    }
    return 'Individual';
  }

  private cancelScenarioLoad(): void {
    this.scenarioLoadSub?.unsubscribe();
    this.scenarioLoadSub = undefined;
  }

  private cancelSmartRedirect(): void {
    this.smartRedirectSub?.unsubscribe();
    this.smartRedirectSub = undefined;
  }
}
