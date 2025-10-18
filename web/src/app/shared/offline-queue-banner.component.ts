import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, Input, OnDestroy, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, timer } from 'rxjs';

import { OfflineData, OfflineService } from '@core-services/offline.service';
import { AnalyticsService } from '@core-services/analytics.service';
import { IconComponent } from '@shared/icon/icon.component';

@Component({
  selector: 'app-offline-queue-banner',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './offline-queue-banner.component.html',
  styleUrls: ['./offline-queue-banner.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OfflineQueueBannerComponent implements OnInit, OnDestroy {
  @Input() contextLabel = 'acciones';
  @Input() endpointPrefix?: string;
  @Input() featureTag?: string;

  isOffline = false;
  pendingCount = 0;
  lastSyncMessage: string | null = null;

  private flushTimerSub: Subscription | null = null;

  constructor(
    private readonly offline: OfflineService,
    private readonly analytics: AnalyticsService,
    private readonly destroyRef: DestroyRef
  ) {
  }

  ngOnInit(): void {
    this.offline.online$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(isOnline => {
        this.isOffline = !isOnline;
      });

    this.offline.pendingRequests$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(requests => {
        const relevant = requests.filter(request => this.isRelevant(request));
        this.pendingCount = relevant.length;
      });

    this.offline.processedRequests$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(result => {
        if (!this.isRelevant(result.request)) {
          return;
        }

        if (result.success && this.pendingCount === 0) {
          this.lastSyncMessage = `Sincronizamos la cola de ${this.contextLabel}.`;
          this.analytics.track('offline_queue_flush', {
            feature: this.featureTag ?? this.contextLabel,
            processed: (result.request.attempts ?? 0) + 1,
            remaining: this.pendingCount
          });
          if (this.flushTimerSub) {
            this.flushTimerSub.unsubscribe();
          }
          this.flushTimerSub = timer(4000)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => {
              this.lastSyncMessage = null;
              this.flushTimerSub = null;
            });
        }
      });
  }

  ngOnDestroy(): void {
    this.flushTimerSub?.unsubscribe();
    this.flushTimerSub = null;
  }

  private isRelevant(request: OfflineData): boolean {
    if (this.endpointPrefix) {
      return typeof request.endpoint === 'string' && request.endpoint.includes(this.endpointPrefix);
    }
    return true;
  }
}
