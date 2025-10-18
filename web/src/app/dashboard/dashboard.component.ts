import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal, computed, effect } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
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

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ConnectionIndicatorComponent,
    IconComponent,
    ChartDirective
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  private readonly store = inject(DashboardStore);
  private readonly tokensService = inject(DesignTokensService);
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

  // Dashboard data
  readonly stats = this.store.stats;
  readonly activityFeed = this.store.activityFeed;
  readonly funnelData = this.store.funnelData;
  readonly actionableGroups = this.store.actionableGroups;
  readonly allClients = this.store.allClients;

  readonly pmtChartConfig = computed<ChartConfiguration<'line'>>(() => this.buildPmtChartConfig());
  readonly revenueChartConfig = computed<ChartConfiguration<'bar'>>(() => this.buildRevenueChartConfig());

  // KPI Cards Data
  kpiCards: KPICard[] = [
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
  ];

  constructor(
    private router: Router,
    private toast: ToastService,
    private flowContext: FlowContextService
  ) {
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

  navigateToRoute(route: string): void {
    this.router.navigate([route]);
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
    // Update KPI cards with real data
    const pmtValue = this.formatCurrency(stats.monthlyRevenue.collected / 30);
    const updates = [...this.kpiCards];
    updates[0] = { ...updates[0], value: pmtValue };
    updates[2] = {
      ...updates[2],
      value: this.formatCurrency(stats.monthlyRevenue.projected - stats.monthlyRevenue.collected)
    };
    updates[3] = { ...updates[3], value: stats.activeContracts.toString() };
    this.kpiCards = updates;
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

}
