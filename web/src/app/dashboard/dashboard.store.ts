import { inject, Injectable, signal, computed, DestroyRef } from '@angular/core';
import { take, finalize } from 'rxjs/operators';
import { of, forkJoin } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DashboardService } from '@feature-services/dashboard/dashboard.service';
import { DeliveriesService } from '@feature-services/logistics/deliveries.service';
import { ToastService } from '@core-services/toast.service';
import { DashboardStats, ActivityFeedItem, OpportunityStage, ActionableGroup, ActionableClient, Market } from '@interfaces/types';

@Injectable({
  providedIn: 'root'
})
export class DashboardStore {
  private readonly dashboardService = inject(DashboardService);
  private readonly deliveriesService = inject(DeliveriesService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly selectedMarket = signal<Market>('all');
  readonly isLoading = signal(true);
  readonly isEtaRecalculating = signal(false);
  readonly stats = signal<DashboardStats | null>(null);
  readonly funnelData = signal<OpportunityStage[]>([]);
  readonly actionableGroups = signal<ActionableGroup[]>([]);
  readonly allClients = signal<ActionableClient[]>([]);
  readonly activityFeed = this.dashboardService.activityFeed;

  readonly completionPercentage = computed(() => {
    const value = this.stats();
    if (!value) {
      return 0;
    }
    const collected = value.monthlyRevenue.collected;
    const projected = value.monthlyRevenue.projected || 1;
    return Math.round((collected / projected) * 100);
  });

  constructor() {}

  loadDashboard(): void {
    this.isLoading.set(true);
    const market = this.selectedMarket();
    const stats$ = this.dashboardService.getDashboardStats(market);
    const funnel$ = this.dashboardService.getOpportunityStages(market);
    const groups$ = this.dashboardService.getActionableGroups(market);
    const clients$ = this.dashboardService.getAllClients?.(market) ?? of([]);

    if (this.dashboardService.activityFeed().length === 0) {
      this.dashboardService.loadInitialFeed();
    }

    forkJoin({ stats: stats$, funnel: funnel$, groups: groups$, clients: clients$ })
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ stats, funnel, groups, clients }) => {
          this.stats.set(stats ?? null);
          this.funnelData.set(funnel ?? []);
          this.actionableGroups.set(groups ?? []);
          this.allClients.set(clients ?? []);
          this.isLoading.set(false);
        },
        error: () => {
          this.dashboardService.invalidateStatsCache(market);
          this.isLoading.set(false);
          this.setMockData();
        }
      });
  }

  recalculateEta(): void {
    if (this.isEtaRecalculating()) {
      this.toast.info('Ya se está recalculando el ETA...');
      return;
    }

    this.isEtaRecalculating.set(true);
    this.deliveriesService.validateEtaCalculations()
      .pipe(
        take(1),
        finalize(() => this.isEtaRecalculating.set(false))
      )
      .subscribe({
        next: result => {
          if (result.calculationsAccurate) {
            this.toast.success('ETA recalculado y validado correctamente.');
          } else {
            this.toast.warning(`ETA recalculado con ${result.accuracyPercentage}% de precisión.`);
          }
        },
        error: () => {
          this.toast.error('No fue posible recalcular el ETA. Inténtalo de nuevo.');
        }
      });
  }

  private setMockData(): void {
    const stats: DashboardStats = {
      opportunitiesInPipeline: {
        nuevas: 12,
        expediente: 8,
        aprobado: 5
      },
      pendingActions: {
        clientsWithMissingDocs: 7,
        clientsWithGoalsReached: 3
      },
      activeContracts: 28,
      monthlyRevenue: {
        collected: 1250000,
        projected: 1800000
      }
    };

    const groups: ActionableGroup[] = [
      {
        title: 'Documentos Faltantes',
        description: 'Clientes que necesitan completar documentación',
        clients: [
          { id: 'c1', name: 'Juan Pérez', avatarUrl: '', status: 'Pendiente' },
          { id: 'c2', name: 'María López', avatarUrl: '', status: 'Pendiente' }
        ]
      },
      {
        title: 'Seguimiento Requerido',
        description: 'Clientes que requieren seguimiento',
        clients: [
          { id: 'c3', name: 'Ana López', avatarUrl: '', status: 'Sin respuesta 5 días' }
        ]
      }
    ];

    const feed: ActivityFeedItem[] = [
      {
        id: 'activity-1',
        type: 'payment_received',
        timestamp: new Date(Date.now() - 5 * 60000),
        message: 'Pago de enganche recibido',
        clientName: 'Carlos Mendoza',
        amount: 150000,
        iconType: 'currency-dollar'
      },
      {
        id: 'activity-2',
        type: 'doc_approved',
        timestamp: new Date(Date.now() - 15 * 60000),
        message: 'INE Aprobado por el sistema',
        clientName: 'María González',
        iconType: 'check'
      }
    ];

    this.stats.set(stats);
    this.funnelData.set([
      { name: 'Nuevas Oportunidades', clientIds: ['c1', 'c2', 'c3'], count: 3 },
      { name: 'Expediente en Proceso', clientIds: ['c4', 'c5'], count: 2 },
      { name: 'Aprobado', clientIds: ['c6'], count: 1 }
    ]);
    this.actionableGroups.set(groups);
    this.allClients.set([
      { id: 'c1', name: 'Juan Pérez', avatarUrl: '', status: 'Activo' },
      { id: 'c2', name: 'María López', avatarUrl: '', status: 'Expediente' },
      { id: 'c3', name: 'Carlos Ruiz', avatarUrl: '', status: 'Pendiente' }
    ]);
    this.dashboardService.setActivityFeed(feed);
  }
}
