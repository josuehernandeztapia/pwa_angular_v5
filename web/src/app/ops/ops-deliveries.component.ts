import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DeliveriesService } from '@feature-services/logistics/deliveries.service';
import { DeliveryListResponse, DeliveryOrder, DeliveryStatus, Market, DELIVERY_STATUS_DESCRIPTIONS } from '@interfaces/deliveries';
import { FlowContextService } from '@core-services/flow-context.service';
import { IconComponent } from '@shared/icon/icon.component';

@Component({
  selector: 'app-ops-deliveries',
  standalone: true,
  imports: [CommonModule, RouterModule, IconComponent],
  templateUrl: './ops-deliveries.component.html',
  styleUrls: ['./ops-deliveries.component.scss']
})
export class OpsDeliveriesComponent implements OnInit {
  private readonly deliveries = inject(DeliveriesService);
  private readonly flowContext = inject(FlowContextService);
  private readonly destroyRef = inject(DestroyRef);

  readonly marketFilter = signal<Market | 'all'>('all');
  readonly statusFilter = signal<DeliveryStatus | 'all'>('all');
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly response = signal<DeliveryListResponse | null>(null);

  readonly orders = computed<DeliveryOrder[]>(() => this.response()?.items ?? []);
  readonly statusDescriptions = DELIVERY_STATUS_DESCRIPTIONS;

  readonly markets: Array<{ value: Market | 'all'; label: string }> = [
    { value: 'all', label: 'Todos' },
    { value: 'aguascalientes', label: 'AGS' },
    { value: 'edomex', label: 'EdoMex' }
  ];

  readonly statuses: Array<{ value: DeliveryStatus | 'all'; label: string }> = [
    { value: 'all', label: 'Todos' },
    { value: 'READY_FOR_HANDOVER', label: 'Listos' },
    { value: 'ON_VESSEL', label: 'En tránsito' },
    { value: 'IN_CUSTOMS', label: 'En aduana' },
    { value: 'AT_WH', label: 'En almacén' }
  ];

  ngOnInit(): void {
    this.flowContext.setBreadcrumbs(['Operaciones', 'Entregas']);
    this.loadDeliveries();
  }

  setMarket(market: Market | 'all'): void {
    this.marketFilter.set(market);
    this.loadDeliveries();
  }

  setStatus(status: DeliveryStatus | 'all'): void {
    this.statusFilter.set(status);
    this.loadDeliveries();
  }

  trackOrder(_: number, order: DeliveryOrder): string {
    return order.id;
  }

  trackOption(_: number, option: { value: string }): string {
    return option.value;
  }

  private loadDeliveries(): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.deliveries
      .list({
        market: this.marketFilter() === 'all' ? undefined : (this.marketFilter() as Market),
        status: this.statusFilter() === 'all' ? undefined : [this.statusFilter() as DeliveryStatus],
        limit: 25
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          this.response.set(response);
          this.isLoading.set(false);
        },
        error: () => {
          this.response.set({ items: [], nextCursor: undefined, total: 0 });
          this.isLoading.set(false);
          this.error.set('No fue posible cargar las entregas del BFF.');
        }
      });
  }
}
