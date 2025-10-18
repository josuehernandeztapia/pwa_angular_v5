import { CommonModule, DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ContractTriggersService, TriggerEvent } from '@feature-services/contracts/contract-triggers.service';
import { FlowContextService } from '@core-services/flow-context.service';
import { IconComponent } from '@shared/icon/icon.component';

@Component({
  selector: 'app-triggers-monitor',
  standalone: true,
  imports: [CommonModule, DatePipe, IconComponent],
  templateUrl: './triggers-monitor.component.html',
  styleUrls: ['./triggers-monitor.component.scss']
})
export class TriggersMonitorComponent implements OnInit {
  private readonly triggers = inject(ContractTriggersService);
  private readonly flowContext = inject(FlowContextService);
  private readonly destroyRef = inject(DestroyRef);

  readonly metrics = signal<{ totalTriggers: number; successfulTriggers: number; failedTriggers: number } | null>(null);
  readonly history = signal<TriggerEvent[]>([]);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.flowContext.setBreadcrumbs(['Operaciones', 'Triggers']);
    this.loadMetrics();
    this.loadHistory();
  }

  refresh(): void {
    this.loadMetrics();
    this.loadHistory();
  }

  trackEvent(_: number, event: TriggerEvent): string {
    return event.id;
  }

  resultBadge(event: TriggerEvent): 'success' | 'warning' {
    return event.deliveryOrderCreated ? 'success' : 'warning';
  }

  private loadMetrics(): void {
    this.triggers
      .getTriggerMetrics()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(metrics => this.metrics.set(metrics));
  }

  private loadHistory(): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.triggers
      .getTriggerHistory(25)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: events => {
          this.history.set(events);
          this.isLoading.set(false);
        },
        error: () => {
          this.history.set([]);
          this.isLoading.set(false);
          this.error.set('No fue posible recuperar el historial de triggers.');
        }
      });
  }
}
