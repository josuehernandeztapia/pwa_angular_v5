import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DashboardService } from '@feature-services/dashboard/dashboard.service';
import { FlowContextService } from '@core-services/flow-context.service';
import { IconComponent } from '@shared/icon/icon.component';
import { Market } from '@interfaces/types';

interface UsageMetric {
  label: string;
  value: number;
  helper: string;
}

@Component({
  selector: 'app-usage-reports',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './usage-reports.component.html',
  styleUrls: ['./usage-reports.component.scss']
})
export class UsageReportsComponent implements OnInit {
  private readonly dashboard = inject(DashboardService);
  private readonly flowContext = inject(FlowContextService);
  private readonly destroyRef = inject(DestroyRef);

  readonly selectedMarket = signal<Market>('all');
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly metrics = signal<UsageMetric[]>([]);
  readonly revenue = signal<{ collected: number; projected: number } | null>(null);

  readonly markets: Array<{ value: Market; label: string }> = [
    { value: 'all', label: 'Todos' },
    { value: 'aguascalientes', label: 'AGS' },
    { value: 'edomex', label: 'EdoMex' }
  ];

  readonly projectedDelta = computed(() => {
    const data = this.revenue();
    if (!data) {
      return 0;
    }
    return data.projected - data.collected;
  });

  ngOnInit(): void {
    this.flowContext.setBreadcrumbs(['Dashboard', 'Uso del Sistema']);
    this.loadMetrics();
  }

  setMarket(market: Market): void {
    if (market === this.selectedMarket()) {
      return;
    }
    this.selectedMarket.set(market);
    this.loadMetrics();
  }

  trackMarket(_: number, item: { value: Market }): string {
    return item.value;
  }

  trackMetric(_: number, metric: UsageMetric): string {
    return metric.label;
  }

  private loadMetrics(): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.dashboard
      .getDashboardStats(this.selectedMarket())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: stats => {
          this.metrics.set([
            {
              label: 'Nuevas oportunidades',
              value: stats.opportunitiesInPipeline.nuevas,
              helper: 'Clientes captados en los últimos 30 días.'
            },
            {
              label: 'Expedientes activos',
              value: stats.opportunitiesInPipeline.expediente,
              helper: 'Clientes con documentación en proceso.'
            },
            {
              label: 'Contratos aprobados',
              value: stats.opportunitiesInPipeline.aprobado,
              helper: 'Contratos listos para entrega.'
            },
            {
              label: 'Clientes con tareas pendientes',
              value: stats.pendingActions.clientsWithMissingDocs,
              helper: 'Documentos pendientes o acciones de seguimiento.'
            }
          ]);
          this.revenue.set(stats.monthlyRevenue);
          this.isLoading.set(false);
        },
        error: () => {
          this.metrics.set([]);
          this.revenue.set(null);
          this.isLoading.set(false);
          this.error.set('No fue posible recuperar los datos de uso. Verifica la conexión o el flag enableUsageModule.');
        }
      });
  }
}
