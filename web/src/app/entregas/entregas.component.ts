import { CommonModule, DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { DeliveriesService } from '@feature-services/logistics/deliveries.service';
import {
  DeliveryEventLog,
  DeliveryListRequest,
  DeliveryOrder,
  DeliveryStatus,
  DELIVERY_EVENT_DESCRIPTIONS,
  DELIVERY_STATUS_DESCRIPTIONS,
  calculateETA
} from '@interfaces/deliveries';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FlowContextService } from '@core-services/flow-context.service';
import { IconComponent } from '@shared/icon/icon.component';

interface DeliveryCard {
  id: string;
  clientName: string;
  sku: string;
  status: DeliveryStatus;
  eta?: string;
  createdAt: string;
  market: string;
}

@Component({
  selector: 'app-entregas',
  standalone: true,
  imports: [CommonModule, IconComponent, DatePipe],
  templateUrl: './entregas.component.html',
  styleUrls: ['./entregas.component.scss']
})
export class EntregasComponent implements OnInit {
  private readonly deliveries = inject(DeliveriesService);
  private readonly flowContext = inject(FlowContextService);
  private readonly destroyRef = inject(DestroyRef);

  readonly isLoading = signal(true);
  readonly isTimelineLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly orders = signal<DeliveryOrder[]>([]);
  readonly selectedOrder = signal<DeliveryOrder | null>(null);
  readonly timeline = signal<DeliveryEventLog[]>([]);

  readonly cards = computed<DeliveryCard[]>(() => this.orders().map(order => this.mapToCard(order)));
  readonly statusDescriptions = DELIVERY_STATUS_DESCRIPTIONS;
  readonly eventDescriptions = DELIVERY_EVENT_DESCRIPTIONS;

  readonly currentStatusDescription = computed(() => {
    const current = this.selectedOrder()?.status;
    return current ? DELIVERY_STATUS_DESCRIPTIONS[current] : null;
  });

  ngOnInit(): void {
    this.flowContext.setBreadcrumbs(['Dashboard', 'Entregas']);
    this.loadDeliveries({ limit: 25 });
  }

  refresh(): void {
    this.loadDeliveries({ limit: 25, cursor: undefined });
  }

  select(orderId: string): void {
    const order = this.orders().find(item => item.id === orderId) ?? null;
    if (!order) {
      return;
    }
    this.selectedOrder.set(order);
    this.loadTimeline(order.id);
  }

  trackCard(_: number, card: DeliveryCard): string {
    return card.id;
  }

  private loadDeliveries(request: DeliveryListRequest): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.deliveries
      .list(request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          const items = response.items?.length ? response.items : this.createFallbackDeliveries();
          this.orders.set(items);
          this.isLoading.set(false);
          this.ensureSelection();
        },
        error: () => {
          const fallback = this.createFallbackDeliveries();
          this.orders.set(fallback);
          this.isLoading.set(false);
          this.ensureSelection();
          this.error.set('Mostrando datos de referencia: no fue posible sincronizar con el servicio de entregas.');
        }
      });
  }

  private loadTimeline(orderId: string): void {
    this.isTimelineLoading.set(true);
    this.timeline.set([]);

    this.deliveries
      .events(orderId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: events => {
          this.timeline.set(events.length ? events : this.createFallbackTimeline(orderId));
          this.isTimelineLoading.set(false);
        },
        error: () => {
          this.timeline.set(this.createFallbackTimeline(orderId));
          this.isTimelineLoading.set(false);
        }
      });
  }

  private ensureSelection(): void {
    const current = this.selectedOrder();
    const list = this.orders();
    if (!list.length) {
      this.selectedOrder.set(null);
      return;
    }

    if (current) {
      const refreshed = list.find(item => item.id === current.id);
      if (refreshed) {
        this.selectedOrder.set(refreshed);
        return;
      }
    }

    this.selectedOrder.set(list[0]);
    this.loadTimeline(list[0].id);
  }

  private mapToCard(order: DeliveryOrder): DeliveryCard {
    return {
      id: order.id,
      clientName: order.client.name,
      sku: order.sku,
      status: order.status,
      market: order.market,
      createdAt: order.createdAt,
      eta: order.eta ?? calculateETA(order.createdAt, order.status)
    };
  }

  private createFallbackDeliveries(): DeliveryOrder[] {
    const now = new Date();
    const iso = (offsetDays: number) => {
      const d = new Date(now);
      d.setDate(now.getDate() - offsetDays);
      return d.toISOString();
    };

    return [
      {
        id: 'DO-2405-AG-01',
        client: { id: 'CL-001', name: 'María Fernanda López', routeId: 'R-AGS-01', market: 'aguascalientes' },
        contract: { id: 'CT-1277', amount: 420000, signedAt: iso(60) },
        sku: 'VAN-15P-SIN-ASIENTOS',
        qty: 1,
        status: 'READY_FOR_HANDOVER',
        market: 'aguascalientes',
        eta: iso(-3),
        createdAt: iso(72),
        updatedAt: iso(1),
        estimatedTransitDays: 77,
        actualTransitDays: undefined,
        route: { id: 'R-AGS-01', name: 'Ruta Centro', market: 'aguascalientes' }
      },
      {
        id: 'DO-2406-ED-05',
        client: { id: 'CL-145', name: 'Soluciones Transporte MX', routeId: 'R-EDX-07', market: 'edomex' },
        contract: { id: 'CT-2301', amount: 580000, signedAt: iso(45) },
        sku: 'VAN-18P-CON-ASIENTOS',
        qty: 1,
        status: 'IN_CUSTOMS',
        market: 'edomex',
        eta: calculateETA(iso(45), 'IN_CUSTOMS'),
        createdAt: iso(58),
        updatedAt: iso(2),
        estimatedTransitDays: 77,
        route: { id: 'R-EDX-07', name: 'Ruta EdoMex Norte', market: 'edomex' }
      }
    ];
  }

  private createFallbackTimeline(orderId: string): DeliveryEventLog[] {
    const base = new Date();
    const entry = (offset: number, event: DeliveryEventLog['event']): DeliveryEventLog => ({
      id: `${orderId}-${event}`,
      deliveryId: orderId,
      at: new Date(base.getTime() - offset * 24 * 60 * 60 * 1000).toISOString(),
      event,
      actor: 'ops',
      actorName: 'Operaciones Conductores',
      meta: {}
    });

    return [
      entry(60, 'START_PROD'),
      entry(45, 'FACTORY_READY'),
      entry(40, 'LOAD_ORIGIN'),
      entry(35, 'DEPART_VESSEL'),
      entry(10, 'ARRIVE_DEST'),
      entry(7, 'CUSTOMS_CLEAR'),
      entry(5, 'ARRIVE_WH'),
      entry(1, 'SCHEDULE_HANDOVER')
    ];
  }
}
