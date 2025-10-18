import { CommonModule, DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DeliveriesService } from '@feature-services/logistics/deliveries.service';
import { DeliveryEventLog, DeliveryOrder, DELIVERY_EVENT_DESCRIPTIONS, DELIVERY_STATUS_DESCRIPTIONS } from '@interfaces/deliveries';
import { FlowContextService } from '@core-services/flow-context.service';
import { IconComponent } from '@shared/icon/icon.component';

@Component({
  selector: 'app-delivery-detail',
  standalone: true,
  imports: [CommonModule, DatePipe, IconComponent],
  templateUrl: './delivery-detail.component.html',
  styleUrls: ['./delivery-detail.component.scss']
})
export class DeliveryDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly deliveries = inject(DeliveriesService);
  private readonly flowContext = inject(FlowContextService);
  private readonly destroyRef = inject(DestroyRef);

  readonly isLoading = signal(true);
  readonly isTimelineLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly delivery = signal<DeliveryOrder | null>(null);
  readonly timeline = signal<DeliveryEventLog[]>([]);

  readonly statusDescription = computed(() => {
    const status = this.delivery()?.status;
    return status ? DELIVERY_STATUS_DESCRIPTIONS[status] : null;
  });

  readonly eventDescriptions = DELIVERY_EVENT_DESCRIPTIONS;

  ngOnInit(): void {
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const id = params.get('id');
        if (!id) {
          this.error.set('Entrega no encontrada.');
          this.isLoading.set(false);
          return;
        }
        this.fetchDelivery(id);
      });
  }

  trackEvent(_: number, event: DeliveryEventLog): string {
    return event.id;
  }

  goBack(): void {
    this.router.navigate(['/ops/deliveries']);
  }

  statusClass(status: DeliveryOrder['status'] | undefined): string {
    if (!status) {
      return 'status--unknown';
    }
    switch (status) {
      case 'READY_FOR_HANDOVER':
      case 'RELEASED':
      case 'AT_WH':
        return 'status--ready';
      case 'IN_CUSTOMS':
      case 'ON_VESSEL':
      case 'AT_DEST_PORT':
      case 'AT_ORIGIN_PORT':
      case 'IN_PRODUCTION':
      case 'PO_ISSUED':
      case 'READY_AT_FACTORY':
        return 'status--in-progress';
      case 'DELIVERED':
        return 'status--done';
      default:
        return 'status--default';
    }
  }

  private loadTimeline(id: string): void {
    this.isTimelineLoading.set(true);
    this.timeline.set([]);

    this.deliveries
      .events(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: events => {
          this.timeline.set(events);
          this.isTimelineLoading.set(false);
        },
        error: () => {
          this.timeline.set([]);
          this.isTimelineLoading.set(false);
        }
      });
  }

  private fetchDelivery(id: string): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.deliveries
      .get(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: delivery => {
          if (!delivery) {
            this.router.navigate(['/ops/deliveries']);
            return;
          }

          this.delivery.set(delivery);
          this.isLoading.set(false);
          this.flowContext.setBreadcrumbs(['Operaciones', 'Entregas', delivery.id]);
          this.loadTimeline(delivery.id);
        },
        error: () => {
          this.error.set('No fue posible cargar la entrega.');
          this.isLoading.set(false);
        }
      });
  }
}
