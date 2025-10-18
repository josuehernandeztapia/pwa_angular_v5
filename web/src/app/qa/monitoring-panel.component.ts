import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FlowContextService } from '@core-services/flow-context.service';
import { MonitoringEvent, MonitoringMetrics, MonitoringService } from '@core-services/monitoring.service';
import { IconComponent } from '@shared/icon/icon.component';

@Component({
  selector: 'app-monitoring-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  templateUrl: './monitoring-panel.component.html',
  styleUrls: ['./monitoring-panel.component.scss']
})
export class MonitoringPanelComponent implements OnInit {
  private readonly monitoring = inject(MonitoringService);
  private readonly flowContext = inject(FlowContextService);
  private readonly destroyRef = inject(DestroyRef);

  readonly events = signal<MonitoringEvent[]>([]);
  readonly metrics = signal<MonitoringMetrics | null>(null);
  readonly levelFilter = signal<'all' | MonitoringEvent['level']>('all');
  readonly serviceFilter = signal<'all' | string>('all');
  readonly search = signal('');

  readonly filteredEvents = computed(() => {
    const events = this.events();
    const level = this.levelFilter();
    const service = this.serviceFilter();
    const needle = this.search().toLowerCase().trim();

    return events.filter(event => {
      if (level !== 'all' && event.level !== level) {
        return false;
      }
      if (service !== 'all' && event.service !== service) {
        return false;
      }
      if (needle) {
        const haystack = `${event.message} ${event.operation} ${event.service}`.toLowerCase();
        return haystack.includes(needle);
      }
      return true;
    });
  });

  readonly services = computed(() => {
    const list = this.events().map(event => event.service);
    return Array.from(new Set(list)).sort();
  });

  ngOnInit(): void {
    this.flowContext.setBreadcrumbs(['Dashboard', 'QA Monitoring']);
    this.monitoring.events$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(events => {
        // Sort newest first for display purposes
        const sorted = [...events].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        this.events.set(sorted);
      });

    this.monitoring.metrics$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(metrics => this.metrics.set(metrics));

    this.seedDemoEvents();
  }

  trackEvent(_: number, event: MonitoringEvent): string {
    return event.id;
  }

  trackService(_: number, service: string): string {
    return service;
  }

  private seedDemoEvents(): void {
    if (this.events().length > 0) {
      return;
    }

    this.monitoring.captureInfo('qa-monitor', 'seed', 'QA Monitoring listo para recibir eventos demo.');
    this.monitoring.captureWarning('bff-integrations', 'webhook/retry', 'Incremento de reintentos (>5) detectado en las últimas 2 horas.', {
      retryCount: 7,
      lastWebhookId: 'wh_12345'
    });
    this.monitoring.captureError('documents', 'upload', new Error('Timeout al subir documentos a S3'), {
      documentId: 'doc_789',
      attempt: 3
    }, 'medium');
  }
}
