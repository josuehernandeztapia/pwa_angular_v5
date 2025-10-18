import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DeliveriesService } from '@feature-services/logistics/deliveries.service';
import { DeliveryOrder, Market, calculateETA } from '@interfaces/deliveries';
import { FlowContextService } from '@core-services/flow-context.service';
import { IconComponent } from '@shared/icon/icon.component';

type MarketFilter = Market | 'all';

@Component({
  selector: 'app-ops-import-tracker',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './ops-import-tracker.component.html',
  styleUrls: ['./ops-import-tracker.component.scss']
})
export class OpsImportTrackerComponent implements OnInit {
  private readonly deliveries = inject(DeliveriesService);
  private readonly flowContext = inject(FlowContextService);
  private readonly destroyRef = inject(DestroyRef);

  readonly market = signal<MarketFilter>('all');
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly orders = signal<DeliveryOrder[]>([]);

  readonly markets: Array<{ value: MarketFilter; label: string }> = [
    { value: 'all', label: 'Todos' },
    { value: 'aguascalientes', label: 'AGS' },
    { value: 'edomex', label: 'EdoMex' }
  ];

  ngOnInit(): void {
    this.flowContext.setBreadcrumbs(['Operaciones', 'Import Tracker']);
    this.loadData();
  }

  setMarket(market: MarketFilter): void {
    this.market.set(market);
    this.loadData();
  }

  eta(order: DeliveryOrder): string {
    if (order.eta) {
      return order.eta;
    }
    return calculateETA(order.createdAt, order.status) ?? 'Sin calcular';
  }

  trackOrder(_: number, order: DeliveryOrder): string {
    return order.id;
  }

  trackMarket(_: number, option: { value: MarketFilter }): string {
    return option.value;
  }

  private loadData(): void {
    this.isLoading.set(true);
    this.error.set(null);

    const selectedMarket = this.market();
    this.deliveries
      .getReadyForHandover(selectedMarket === 'all' ? undefined : selectedMarket)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: orders => {
          this.orders.set(orders);
          this.isLoading.set(false);
        },
        error: () => {
          this.orders.set([]);
          this.isLoading.set(false);
          this.error.set('No fue posible recuperar las unidades en 77-day tracking.');
        }
      });
  }
}
