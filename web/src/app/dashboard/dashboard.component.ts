import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, inject, signal, computed, effect } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { ChartConfiguration } from 'chart.js';
import { ActionableClient, ActionableGroup, ActivityFeedItem, DashboardStats, Market, OpportunityStage } from '@interfaces/types';
import { ConnectionIndicatorComponent } from '@shared/connection-indicator.component';
import { IconComponent } from '@shared/icon/icon.component';
import { IconName } from '@shared/icon/icon-definitions';
import { ToastService } from '@core-services/toast.service';
import { environment } from '@environments/environment';
import { FlowContextService } from '@core-services/flow-context.service';
import { DashboardStore } from './dashboard.store';
import { ChartDirective } from '@shared/chart.directive';
import { DesignTokensService } from '@core-services/design-tokens.service';
import { FlowCompletionService } from '@core-services/flow-completion.service';
import { NavigationService } from '@core-services/navigation.service';
import { DemoModeService } from '@core-services/demo-mode.service';
import { DemoBadgeComponent } from '@shared/demo-badge.component';
import { DemoFavoritesStore } from '@services/demo/demo-favorites.store';
import { DemoAnalyticsService } from '@services/demo/demo-analytics.service';
import { DemoFavoriteSeed } from '@services/demo/demo-scenarios';

type QuickAccessId = 'productos' | 'expedientes' | 'reportes' | 'pipeline' | 'usage' | 'flow-builder';

interface KPIAction {
  label: string;
  dataCy: string;
  variant: 'primary' | 'secondary';
  route?: string | any[];
  queryParams?: Record<string, any>;
  externalUrl?: string;
  action?: 'recalculateEta' | 'downloadSavings';
}

interface KPICard {
  title: string;
  value: string;
  subValue?: string;
  iconName: IconName;
  iconClass?: string;
  dataCy: string;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: string;
  primaryAction?: KPIAction;
  secondaryAction?: KPIAction;
}

interface QuickAccessItem {
  id: QuickAccessId;
  title: string;
  subtitle: string;
  iconName: IconName;
  iconClass: string;
  route: string;
  type: 'escenario' | 'documento' | 'cliente';
}

interface FavoriteItem {
  id: string;
  label: string;
  type: 'cliente' | 'escenario' | 'documento' | 'shortcut';
  icon: IconName;
  context?: string;
  addedAt: number;
}

interface ExportColumn {
  id: string;
  label: string;
  selected: boolean;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    DragDropModule,
    ConnectionIndicatorComponent,
    IconComponent,
    ChartDirective,
    DemoBadgeComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit, OnDestroy {
  private readonly store = inject(DashboardStore);
  private readonly tokensService = inject(DesignTokensService);
  private readonly completion = inject(FlowCompletionService);
  private readonly navigation = inject(NavigationService);
  private readonly demoMode = inject(DemoModeService);
  private readonly demoFavorites = inject(DemoFavoritesStore);
  private readonly demoAnalytics = inject(DemoAnalyticsService);
  readonly tokens = this.tokensService.tokens;
  private readonly trendIconMap: Record<'up' | 'down' | 'stable', IconName> = {
    up: 'trending-up',
    down: 'trending-down',
    stable: 'minus'
  };
  private readonly defaultTrendIcon: IconName = 'minus';

  // State management
  readonly userName = signal('Ricardo');
  readonly selectedMarket = this.store.selectedMarket;
  readonly isLoading = this.store.isLoading;
  readonly showMobileActions = signal(false);
  readonly isEtaRecalculating = this.store.isEtaRecalculating;
  readonly isDemoMode = this.demoMode.isDemoMode;
  readonly isEditMode = signal(false);
  readonly showFavoritesPanel = signal(false);
  readonly favorites = signal<FavoriteItem[]>([]);
  private readonly demoFavoritesEffect = effect(() => {
    if (!this.isDemoMode()) {
      return;
    }
    const seeds = this.demoFavorites.favorites();
    this.favorites.set(seeds.map(seed => this.mapDemoSeedToFavorite(seed)));
  });
  readonly exportModalOpen = signal(false);
  readonly exportColumns = signal<ExportColumn[]>([
    { id: 'clientName', label: 'Cliente', selected: true },
    { id: 'market', label: 'Mercado', selected: true },
    { id: 'flow', label: 'Flujo', selected: true },
    { id: 'advisor', label: 'Asesor asignado', selected: false },
    { id: 'status', label: 'Estatus oportunidad', selected: true },
    { id: 'nextStep', label: 'Próximo paso', selected: false }
  ]);
  readonly exportFormat = signal<'pdf' | 'xlsx'>('pdf');
  readonly exportIncludeBranding = signal(true);
  readonly isExporting = signal(false);
  readonly exportProgress = signal(0);
  readonly canPrepareExport = computed(() => this.exportColumns().some(column => column.selected));

  // Dashboard data
  readonly stats = this.store.stats;
  readonly activityFeed = this.store.activityFeed;
  readonly funnelData = this.store.funnelData;
  readonly actionableGroups = this.store.actionableGroups;
  readonly allClients = this.store.allClients;

  readonly pmtChartConfig = computed<ChartConfiguration<'line'>>(() => this.buildPmtChartConfig());
  readonly revenueChartConfig = computed<ChartConfiguration<'bar'>>(() => this.buildRevenueChartConfig());

  // KPI Cards Data
  readonly kpiCards = signal<KPICard[]>([
    {
      title: 'PMT Mensual',
      value: '$8,450',
      subValue: 'Promedio móvil',
      iconName: 'currency-dollar',
      iconClass: 'kpi-icon--money',
      dataCy: 'kpi-pmt',
      trend: 'up',
      trendValue: '+5.2%',
      primaryAction: {
        label: 'Crear cotización',
        dataCy: 'dashboard-pmt-create-quote',
        variant: 'primary',
        route: ['/cotizador'],
        queryParams: { source: 'dashboard', view: 'new-quote' }
      },
      secondaryAction: {
        label: 'Ver pipeline',
        dataCy: 'dashboard-pmt-open-pipeline',
        variant: 'secondary',
        route: ['/cotizador'],
        queryParams: { filter: 'pipeline', source: 'dashboard' }
      }
    },
    {
      title: 'TIR',
      value: '27.1%',
      subValue: 'Tasa Interna de Retorno',
      iconName: 'chart',
      iconClass: 'kpi-icon--chart-up',
      dataCy: 'kpi-tir',
      trend: 'up',
      trendValue: '+2.1%',
      primaryAction: {
        label: 'Abrir simulador',
        dataCy: 'dashboard-tir-open-simulator',
        variant: 'primary',
        route: ['/simulador'],
        queryParams: { preset: 'tir', source: 'dashboard' }
      },
      secondaryAction: {
        label: 'Ver protección',
        dataCy: 'dashboard-tir-open-proteccion',
        variant: 'secondary',
        route: ['/proteccion'],
        queryParams: { source: 'dashboard' }
      }
    },
    {
      title: 'Ahorro Proyectado',
      value: '$32,500',
      subValue: 'Próximos 12 meses',
      iconName: 'target',
      iconClass: 'kpi-icon--target',
      dataCy: 'kpi-ahorro',
      trend: 'up',
      trendValue: '+12.8%',
      primaryAction: {
        label: 'Comparar escenarios',
        dataCy: 'dashboard-ahorro-compare',
        variant: 'primary',
        route: ['/simulador'],
        queryParams: { view: 'compare', source: 'dashboard' }
      },
      secondaryAction: {
        label: 'Exportar ahorro',
        dataCy: 'dashboard-ahorro-export',
        variant: 'secondary',
        action: 'downloadSavings'
      }
    },
    {
      title: 'Unidades Entregadas',
      value: '12',
      subValue: 'Este mes',
      iconName: 'truck',
      iconClass: 'kpi-icon--delivery',
      dataCy: 'kpi-entregas',
      trend: 'stable',
      trendValue: '0%',
      primaryAction: {
        label: 'Revisar entregas',
        dataCy: 'dashboard-entregas-open',
        variant: 'primary',
        route: ['/entregas'],
        queryParams: { source: 'dashboard' }
      },
      secondaryAction: {
        label: 'Recalcular ETA',
        dataCy: 'dashboard-entregas-recalculate',
        variant: 'secondary',
        action: 'recalculateEta'
      }
    }
  ]);
  private initialKpiTemplate: KPICard[] = [];

  readonly quickAccessItems: QuickAccessItem[] = [
    {
      id: 'productos',
      title: 'Productos',
      subtitle: 'Catálogo y configuración',
      iconName: 'cube',
      iconClass: 'quick-access-icon--productos',
      route: '/productos',
      type: 'escenario'
    },
    {
      id: 'expedientes',
      title: 'Expedientes',
      subtitle: 'Gestión documental',
      iconName: 'folder',
      iconClass: 'quick-access-icon--expedientes',
      route: '/expedientes',
      type: 'documento'
    },
    {
      id: 'reportes',
      title: 'Reportes',
      subtitle: 'Análisis y estadísticas',
      iconName: 'document-text',
      iconClass: 'quick-access-icon--reportes',
      route: '/reportes',
      type: 'escenario'
    },
    {
      id: 'pipeline',
      title: 'Pipeline',
      subtitle: 'Oportunidades de venta',
      iconName: 'trending-up',
      iconClass: 'quick-access-icon--pipeline',
      route: '/oportunidades',
      type: 'escenario'
    },
    {
      id: 'usage',
      title: 'Uso del Sistema',
      subtitle: 'Métricas de uso',
      iconName: 'activity',
      iconClass: 'quick-access-icon--usage',
      route: '/usage',
      type: 'escenario'
    },
    {
      id: 'flow-builder',
      title: 'Flow Builder',
      subtitle: 'Constructor de flujos',
      iconName: 'activity',
      iconClass: 'quick-access-icon--flow-builder',
      route: '/configuracion/flow-builder',
      type: 'escenario'
    }
  ];

  private exportTimers: number[] = [];

  constructor(
    private router: Router,
    private toast: ToastService,
    private flowContext: FlowContextService
  ) {
    this.initialKpiTemplate = this.cloneCards(this.kpiCards());
    effect(() => {
      const stats = this.stats();
      if (stats) {
        this.updateKPIsFromStats(stats);
      }
    }, { allowSignalWrites: true });
  }

  ngOnInit(): void {
    this.flowContext.setBreadcrumbs(['Dashboard']);
    this.loadDashboardData();
  }

  createNewOpportunity(): void {
    const market = this.selectedMarket();
    const smartContext = {
      market: market !== 'all' ? market : undefined,
      suggestedFlow: this.getSuggestedFlowFromStats(),
      timestamp: Date.now(),
      returnContext: 'dashboard-filtered'
    };

    this.router.navigate(['/nueva-oportunidad'], {
      queryParams: smartContext
    });
  }

  toggleMobileActions(): void {
    this.showMobileActions.update(open => !open);
  }

  toggleEditMode(): void {
    const nextState = !this.isEditMode();
    this.isEditMode.set(nextState);
    if (nextState) {
      this.toast.info('Modo edición activado. Arrastra las tarjetas para reorganizar tu dashboard.');
    } else {
      this.toast.info('Modo edición desactivado.');
    }
  }

  onKpiDrop(event: CdkDragDrop<KPICard[]>): void {
    if (!this.isEditMode()) {
      return;
    }

    this.kpiCards.update(cards => {
      const next = [...cards];
      moveItemInArray(next, event.previousIndex, event.currentIndex);
      return next;
    });

    this.toast.info('Orden modificado (vista actual).');
  }

  saveKpiLayout(): void {
    this.isEditMode.set(false);
    this.initialKpiTemplate = this.cloneCards(this.kpiCards());
    this.toast.success('Orden guardado. Personalización disponible solo en esta sesión.');
  }

  resetKpiLayout(): void {
    this.kpiCards.set(this.cloneCards(this.initialKpiTemplate));
    this.toast.info('Orden restaurado a la vista original.');
  }

  openFavoritesPanel(): void {
    this.showFavoritesPanel.update(open => !open);
  }

  closeFavoritesPanel(): void {
    this.showFavoritesPanel.set(false);
  }

  toggleFavorite(
    type: FavoriteItem['type'],
    rawId: string,
    label: string,
    icon: IconName,
    context?: string,
    event?: Event
  ): void {
    event?.stopPropagation();

    const key = this.buildFavoriteKey(type, rawId);

    if (this.isDemoMode()) {
      const seed: DemoFavoriteSeed = {
        id: key,
        label,
        route: context ?? this.resolveDemoFavoriteRoute(type, rawId),
        category: this.mapFavoriteTypeToCategory(type)
      };
      const existed = this.demoFavorites.favoriteIds().has(key);
      this.demoFavorites.toggleFavorite(seed);
      this.demoAnalytics.track('favorite_toggle', { id: key, added: !existed });
      this.toast[existed ? 'info' : 'success'](existed ? `${label} removido de favoritos.` : `${label} agregado a favoritos.`);
      return;
    }

    const existing = this.favorites().find(favorite => favorite.id === key);

    if (existing) {
      this.favorites.update(items => items.filter(item => item.id !== key));
      this.toast.info(`${label} removido de favoritos.`);
      return;
    }

    const favorite: FavoriteItem = {
      id: key,
      label,
      type,
      icon,
      context,
      addedAt: Date.now()
    };

    this.favorites.update(items => [favorite, ...items.filter(item => item.id !== key)].slice(0, 12));
    this.toast.success(`${label} agregado a favoritos.`);
  }

  removeFavorite(id: string): void {
    if (this.isDemoMode()) {
      const existing = this.favorites().find(item => item.id === id);
      if (existing) {
        this.demoFavorites.toggleFavorite(this.mapFavoriteToDemoSeed(existing));
      }
      return;
    }
    this.favorites.update(items => items.filter(item => item.id !== id));
  }

  clearFavorites(): void {
    if (this.isDemoMode()) {
      this.demoFavorites.clear();
      return;
    }
    this.favorites.set([]);
  }

  restoreDemoFavorites(): void {
    if (!this.isDemoMode()) {
      return;
    }
    this.demoFavorites.restoreDefaults();
    const scenario = this.demoMode.activeScenario();
    if (scenario) {
      this.demoAnalytics.track('favorites_restored', { scenario });
    }
    this.toast.success('Favoritos demo restaurados.');
  }

  isFavorite(type: FavoriteItem['type'], rawId: string): boolean {
    const key = this.buildFavoriteKey(type, rawId);
    if (this.isDemoMode()) {
      return this.demoFavorites.favoriteIds().has(key);
    }
    return this.favorites().some(item => item.id === key);
  }

  openExportModal(): void {
    this.exportModalOpen.set(true);
    this.exportProgress.set(0);
    this.isExporting.set(false);
  }

  closeExportModal(): void {
    this.clearExportTimers();
    this.exportModalOpen.set(false);
    this.isExporting.set(false);
    this.exportProgress.set(0);
  }

  toggleExportColumn(columnId: string): void {
    const current = this.exportColumns();
    const next = current.map(column => column.id === columnId ? { ...column, selected: !column.selected } : column);

    if (!next.some(column => column.selected)) {
      this.toast.warning('Selecciona al menos una columna para exportar.');
      return;
    }

    this.exportColumns.set(next);
  }

  setExportFormat(format: 'pdf' | 'xlsx'): void {
    this.exportFormat.set(format);
  }

  toggleExportBranding(): void {
    this.exportIncludeBranding.update(current => !current);
  }

  prepareExport(): void {
    if (this.isExporting() || !this.canPrepareExport()) {
      if (!this.canPrepareExport()) {
        this.toast.warning('Selecciona al menos una columna antes de exportar.');
      }
      return;
    }

    this.clearExportTimers();
    this.isExporting.set(true);
    this.exportProgress.set(10);

    const steps = [45, 80, 100];
    steps.forEach((value, index) => {
      const handle = window.setTimeout(() => {
        this.exportProgress.set(value);
        if (value === 100) {
          this.isExporting.set(false);
          this.toast.success('Exportación generada. Descárgala desde tu bandeja (demo).');
        }
      }, 400 * (index + 1));
      this.exportTimers.push(handle);
    });
  }

  private buildPmtChartConfig(): ChartConfiguration<'line'> {
    return {
      type: 'line',
      data: {
        labels: ['Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
        datasets: [
          {
            label: 'PMT',
            data: [7800, 8200, 8300, 8450, 8600, 8750],
            borderColor: this.tokensService.dataColor('primary'),
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointBackgroundColor: this.tokensService.dataColor('primary'),
            pointBorderColor: this.tokens.color.panel.light,
            pointBorderWidth: 2,
            pointRadius: 4,
            tension: 0.1
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
            beginAtZero: false,
            ticks: {
              callback: value => this.formatCurrency(typeof value === 'number' ? value : Number(value ?? 0)),
              color: this.tokensService.chartColor('line', 'axis')
            },
            grid: {
              color: this.tokensService.chartColor('line', 'grid')
            }
          },
          x: {
            ticks: { color: this.tokensService.chartColor('line', 'axis') },
            grid: {
              color: this.tokensService.chartColor('line', 'grid')
            }
          }
        },
        elements: {
          point: {
            hoverRadius: 6
          }
        }
      }
    };
  }

  private buildRevenueChartConfig(): ChartConfiguration<'bar'> {
    return {
      type: 'bar',
      data: {
        labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun'],
        datasets: [
          {
            label: 'Ingresos Reales',
            data: [45000, 52000, 48000, 61000, 55000, 67000],
            backgroundColor: this.tokensService.dataColor('primary'),
            borderRadius: 2
          },
          {
            label: 'Proyección',
            data: [50000, 55000, 53000, 65000, 60000, 70000],
            backgroundColor: this.tokensService.dataColor('secondary'),
            borderRadius: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              usePointStyle: true,
              color: this.tokens.color.text.secondary,
              font: { size: 12 }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: value => this.formatCurrency(typeof value === 'number' ? value : Number(value ?? 0)),
              color: this.tokensService.chartColor('bar', 'primary')
            },
            grid: {
              color: this.tokensService.chartColor('line', 'grid')
            }
          },
          x: {
            ticks: { color: this.tokensService.chartColor('bar', 'primary') },
            grid: {
              color: this.tokensService.chartColor('line', 'grid')
            }
          }
        }
      }
    };
  }

  private getSuggestedFlowFromStats(): string | undefined {
    const stats = this.stats();
    if (!stats) return undefined;

    const { nuevas, expediente, aprobado } = stats.opportunitiesInPipeline;

    if (nuevas > expediente + aprobado) {
      return 'COTIZACION';
    } else if (aprobado > nuevas) {
      return 'SIMULACION';
    }

    return undefined;
  }

  onMarketFilter(market: Market): void {
    this.selectedMarket.set(market);
    this.loadDashboardData();
  }

  onMarketChanged(market: Market): void {
    this.selectedMarket.set(market);
    this.loadDashboardData();
  }

  navigateToClient(clientId: string): void {
    this.router.navigate(['/clientes', clientId]);
  }

  navigateToClients(): void {
    this.router.navigate(['/clientes']);
  }

  navigateToOpportunities(): void {
    this.router.navigate(['/opportunities']);
  }

  navigateToRoute(route: string, queryParams?: any): void {
    this.router.navigate([route], { queryParams }).catch(() => {
      this.toast.warning('No fue posible navegar a la sección seleccionada.');
    });
  }

  openQuickAccess(id: QuickAccessId, route: string): void {
    const config = this.quickAccessOverlayConfig(id);
    if (!config) {
      this.navigateToRoute(route);
      return;
    }

    this.completion.open({
      title: config.title,
      description: config.description,
      metrics: config.metrics,
      nextSteps: config.nextSteps,
      actions: [
        {
          id: 'open-section',
          label: config.primaryLabel,
          kind: 'primary',
          execute: () => this.navigateToRoute(route)
        },
        {
          id: 'open-new-tab',
          label: 'Abrir en nueva pestaña',
          kind: 'ghost',
          autoClose: false,
          execute: () => {
            window?.open?.(route, '_blank', 'noopener');
            return Promise.resolve();
          }
        }
      ],
      onComplete: () => this.navigation.refreshQuickActions()
    });
  }

  private quickAccessOverlayConfig(id: QuickAccessId): {
    title: string;
    description: string;
    metrics: { label: string; value: string; badge?: 'success' | 'warning' | 'error' }[];
    nextSteps: string[];
    primaryLabel: string;
  } | null {
    const demoBadge = this.isDemoMode() ? 'DEMO' : 'REAL';
    switch (id) {
      case 'expedientes':
        return {
          title: 'Expedientes listos',
          description: 'Revisa documentos pendientes y utiliza el flujo de finalización para formalizar contratos.',
          metrics: [
            { label: 'Modo de datos', value: demoBadge, badge: this.isDemoMode() ? 'warning' : 'success' },
            { label: 'Etapas activas', value: `${this.funnelData().length || 0}` }
          ],
          nextSteps: [
            'Prioriza expedientes con AVI completado.',
            'Completa documentación y lanza el overlay de contratos desde Documentos.'
          ],
          primaryLabel: 'Ir a expedientes'
        };
      case 'pipeline':
        return {
          title: 'Pipeline actualizado',
          description: 'Explora las oportunidades con actividad reciente y coordina el siguiente paso.',
          metrics: [
            { label: 'Total etapas', value: `${this.funnelData().length || 0}` },
            { label: 'Modo de datos', value: demoBadge, badge: this.isDemoMode() ? 'warning' : 'success' }
          ],
          nextSteps: [
            'Enfócate en “Expediente en Proceso” para cerrar más rápido.',
            'Formaliza cotizaciones o registra actividad directamente desde cada tarjeta.'
          ],
          primaryLabel: 'Ver pipeline'
        };
      case 'usage':
        return {
          title: 'Insights de uso',
          description: 'Consulta métricas de adopción y detecta módulos con baja actividad.',
          metrics: [
            { label: 'Usuarios activos', value: '42' },
            { label: 'Modo de datos', value: demoBadge, badge: this.isDemoMode() ? 'warning' : 'success' }
          ],
          nextSteps: [
            'Identifica equipos con baja adopción para planear capacitación.',
            'Comparte hallazgos con el equipo operativo desde la sección de reportes.'
          ],
          primaryLabel: 'Ver métricas de uso'
        };
      default:
        return null;
    }
  }

  handleKpiAction(action: KPIAction): void {
    if (!action) {
      return;
    }

    if (action.route) {
      const commands = Array.isArray(action.route) ? action.route : [action.route];
      this.router.navigate(commands, { queryParams: action.queryParams ?? undefined });
      return;
    }

    if (action.externalUrl && typeof window !== 'undefined') {
      window.open(action.externalUrl, '_blank', 'noopener');
      return;
    }

    if (action.action === 'downloadSavings') {
      this.downloadSavingsReport();
      return;
    }

    if (action.action === 'recalculateEta') {
      this.store.recalculateEta();
      return;
    }
  }

  getTrendIcon(trend: KPICard['trend']): IconName {
    if (!trend) {
      return this.defaultTrendIcon;
    }

    return this.trendIconMap[trend] ?? this.defaultTrendIcon;
  }

  getTrendSymbol(trend: KPICard['trend']): string {
    switch(trend) {
      case 'up': return '↗';
      case 'down': return '↘';
      case 'stable': return '→';
      default: return '→';
    }
  }

  private loadDashboardData(): void {
    this.store.loadDashboard();
  }

  private updateKPIsFromStats(stats: DashboardStats): void {
    const pmtValue = this.formatCurrency(stats.monthlyRevenue.collected / 30);
    this.kpiCards.update(cards => {
      const next = this.cloneCards(cards);
      if (next[0]) {
        next[0] = { ...next[0], value: pmtValue };
      }
      if (next[2]) {
        next[2] = {
          ...next[2],
          value: this.formatCurrency(stats.monthlyRevenue.projected - stats.monthlyRevenue.collected)
        };
      }
      if (next[3]) {
        next[3] = { ...next[3], value: stats.activeContracts.toString() };
      }
      return next;
    });
    this.initialKpiTemplate = this.cloneCards(this.kpiCards());
  }

  private downloadSavingsReport(range: string = '30d'): void {
    if (typeof window === 'undefined') {
      return;
    }

    const url = `${environment.apiUrl}/dashboard/savings/export?range=${range}`;
    window.open(url, '_blank', 'noopener');
    this.toast.info('Exportando ahorro proyectado (últimos 30 días)...');
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  }

  formatTimeAgo(timestamp: Date): string {
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - timestamp.getTime()) / 60000);

    if (diffMinutes < 1) return 'Ahora mismo';
    if (diffMinutes < 60) return `Hace ${diffMinutes} minutos`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `Hace ${diffHours} horas`;

    const diffDays = Math.floor(diffHours / 24);
    return `Hace ${diffDays} días`;
  }

  getCompletionPercentage(): number {
    const stats = this.stats();
    if (!stats) return 0;
    const collected = stats.monthlyRevenue.collected;
    const projected = stats.monthlyRevenue.projected || 1;
    return Math.round((collected / projected) * 100);
  }

  getNextBestAction(): { title: string } {
    return { title: 'Siguiente acción sugerida' };
  }

  getHighPriorityClients(): any[] {
    return (this.actionableGroups()[0]?.clients as any[]) || [];
  }

  private mapDemoSeedToFavorite(seed: DemoFavoriteSeed): FavoriteItem {
    return {
      id: seed.id,
      label: seed.label,
      type: this.mapDemoCategoryToType(seed.category),
      icon: this.mapDemoCategoryToIcon(seed.category),
      context: seed.route,
      addedAt: Date.now()
    };
  }

  private mapFavoriteToDemoSeed(favorite: FavoriteItem): DemoFavoriteSeed {
    return {
      id: favorite.id,
      label: favorite.label,
      route: favorite.context ?? this.resolveDemoFavoriteRoute(favorite.type, favorite.id),
      category: this.mapFavoriteTypeToCategory(favorite.type)
    };
  }

  private mapDemoCategoryToType(category: DemoFavoriteSeed['category']): FavoriteItem['type'] {
    switch (category) {
      case 'cliente':
        return 'cliente';
      case 'documentos':
        return 'documento';
      case 'cotizador':
      case 'reportes':
        return 'escenario';
      case 'postventa':
        return 'shortcut';
      default:
        return 'shortcut';
    }
  }

  private mapFavoriteTypeToCategory(type: FavoriteItem['type']): DemoFavoriteSeed['category'] {
    switch (type) {
      case 'cliente':
        return 'cliente';
      case 'documento':
        return 'documentos';
      case 'escenario':
        return 'cotizador';
      case 'shortcut':
      default:
        return 'reportes';
    }
  }

  private mapDemoCategoryToIcon(category: DemoFavoriteSeed['category']): IconName {
    switch (category) {
      case 'cliente':
        return 'user';
      case 'documentos':
        return 'file-text';
      case 'cotizador':
        return 'calculator';
      case 'postventa':
        return 'truck';
      case 'reportes':
      default:
        return 'star';
    }
  }

  private resolveDemoFavoriteRoute(type: FavoriteItem['type'], rawId: string): string {
    switch (type) {
      case 'cliente':
        return `/clientes/${rawId}`;
      case 'documento':
        return '/documentos';
      case 'escenario':
        return '/simulador';
      case 'shortcut':
      default:
        return '/dashboard';
    }
  }

  ngOnDestroy(): void {
    this.clearExportTimers();
  }

  private buildFavoriteKey(type: FavoriteItem['type'], rawId: string): string {
    return `${type}:${this.sanitizeId(rawId)}`;
  }

  private sanitizeId(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
  }

  private cloneCards(cards: KPICard[]): KPICard[] {
    return cards.map(card => ({
      ...card,
      primaryAction: card.primaryAction ? { ...card.primaryAction } : undefined,
      secondaryAction: card.secondaryAction ? { ...card.secondaryAction } : undefined
    }));
  }

  private clearExportTimers(): void {
    this.exportTimers.forEach(timer => clearTimeout(timer));
    this.exportTimers = [];
  }

}
