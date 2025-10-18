import { CommonModule, DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, OnInit, ViewChild, computed, effect, inject } from '@angular/core';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { Renderer2, RendererFactory2 } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DestroyRef } from '@angular/core';
import { IconComponent } from '@shared/icon/icon.component';
import { ChartDirective } from '@shared/chart.directive';
import { SimuladorStore, SavedSimulation, SimulatorScenario } from './simulador.store';

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

  private readonly queryParamsSignal = toSignal(this.route.queryParams, { initialValue: {} as Params });
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

  readonly kpiData = {
    ahorro: 15000,
    plazo: 24,
    pmt: 3250
  };

  constructor() {
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
