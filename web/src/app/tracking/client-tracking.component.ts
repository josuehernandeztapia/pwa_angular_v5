import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DeliveriesService } from '@feature-services/logistics/deliveries.service';
import { ClientDeliveryInfo } from '@interfaces/deliveries';
import { FlowContextService } from '@core-services/flow-context.service';
import { IconComponent } from '@shared/icon/icon.component';

@Component({
  selector: 'app-client-tracking',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './client-tracking.component.html',
  styleUrls: ['./client-tracking.component.scss']
})
export class ClientTrackingComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly deliveries = inject(DeliveriesService);
  private readonly flowContext = inject(FlowContextService);
  private readonly destroyRef = inject(DestroyRef);

  readonly clientId = signal<string | null>(null);
  readonly orders = signal<ClientDeliveryInfo[]>([]);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const clientId = params.get('clientId');
        this.clientId.set(clientId);
        if (clientId) {
          this.flowContext.setBreadcrumbs(['Dashboard', 'Tracking', clientId]);
          this.loadTracking(clientId);
        }
      });
  }

  trackOrder(_: number, order: ClientDeliveryInfo): string {
    return order.orderId;
  }

  private loadTracking(clientId: string): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.deliveries
      .getClientTracking(clientId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: info => {
          this.orders.set(info);
          this.isLoading.set(false);
        },
        error: () => {
          this.orders.set([]);
          this.isLoading.set(false);
          this.error.set('No fue posible recuperar el tracking del cliente.');
        }
      });
  }
}
