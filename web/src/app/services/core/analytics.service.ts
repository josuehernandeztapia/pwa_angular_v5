import { DestroyRef, Injectable, Optional, PLATFORM_ID, inject } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Subject, fromEvent } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { environment } from '@environments/environment';
import { HttpClientService } from '@core-services/http-client.service';
import { MonitoringService } from '@core-services/monitoring.service';

export interface AnalyticsEventPayload {
  [key: string]: any;
}

interface AnalyticsEnvelope {
  id: string;
  type: 'event' | 'metric';
  endpoint: string;
  body: Record<string, any>;
  createdAt: string;
  attempts: number;
}

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly documentRef = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly windowRef: (Window & typeof globalThis) | null = this.isBrowser ? (this.documentRef.defaultView as Window & typeof globalThis | null) : null;
  private readonly queueStorageKey = `${environment.storage?.prefix ?? ''}analytics_queue`;
  private readonly maxAttempts = 5;
  private readonly flushIntervalMs = environment.analytics?.flushIntervalMs ?? 20000;
  private queue: AnalyticsEnvelope[] = [];
  private flushHandle: ReturnType<typeof setInterval> | null = null;
  private readonly eventsSubject = new Subject<AnalyticsEnvelope>();
  private readonly metricsSubject = new Subject<AnalyticsEnvelope>();

  readonly events$ = this.eventsSubject.asObservable();
  readonly metrics$ = this.metricsSubject.asObservable();

  constructor(
    @Optional() private readonly httpClient?: HttpClientService,
    @Optional() private readonly monitoring?: MonitoringService,
  ) {
    this.restoreQueue();

    if (this.isBrowser) {
      this.setupOnlineListener();
      this.setupFlushTimer();
    }

    this.destroyRef.onDestroy(() => {
      if (this.flushHandle) {
        clearInterval(this.flushHandle);
        this.flushHandle = null;
      }
    });
  }

  track(event: string, payload: AnalyticsEventPayload = {}): void {
    if (!this.isEnabled()) {
      this.debug('event', event, payload);
      return;
    }

    const envelope = this.createEnvelope('event', {
      event,
      payload,
      timestamp: new Date().toISOString(),
      appVersion: environment.version,
    });

    this.eventsSubject.next(envelope);
    this.dispatch(envelope);
  }

  metric(name: string, value: number, tags: AnalyticsEventPayload = {}): void {
    if (!this.isEnabled()) {
      this.debug('metric', name, { value, ...tags });
      return;
    }

    const envelope = this.createEnvelope('metric', {
      metric: name,
      value,
      tags,
      timestamp: new Date().toISOString(),
      appVersion: environment.version,
    });

    this.metricsSubject.next(envelope);
    this.dispatch(envelope);
  }

  private createEnvelope(type: 'event' | 'metric', body: Record<string, any>): AnalyticsEnvelope {
    return {
      id: `analytics-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type,
      endpoint: this.resolveEndpoint(type),
      body,
      createdAt: new Date().toISOString(),
      attempts: 0,
    };
  }

  private dispatch(envelope: AnalyticsEnvelope): void {
    this.debug('dispatch', envelope.type, envelope.body);

    if (this.isMockEndpoint(envelope.endpoint)) {
      this.debug('mock-deliver', envelope.type, envelope.body);
      this.onDelivered(envelope);
      return;
    }

    if (!this.httpClient || !this.isOnline()) {
      this.enqueue(envelope, false);
      return;
    }

    this.httpClient
      .post(envelope.endpoint, envelope.body, {
        showLoading: false,
        showError: false,
      })
      .subscribe({
        next: () => {
          this.onDelivered(envelope);
          this.deliverToAuxSinks(envelope);
        },
        error: error => {
          this.monitoring?.captureWarning('analytics', 'dispatch_failed', 'No se pudo enviar evento de analytics', {
            endpoint: envelope.endpoint,
            type: envelope.type,
            error,
          });
          this.enqueue(envelope, true);
        }
      });
  }

  private onDelivered(envelope: AnalyticsEnvelope): void {
    this.debug('delivered', envelope.type, envelope.body);
  }

  private enqueue(envelope: AnalyticsEnvelope, incrementAttempt: boolean): void {
    const attempts = incrementAttempt ? (envelope.attempts ?? 0) + 1 : envelope.attempts ?? 0;
    if (attempts > this.maxAttempts) {
      this.monitoring?.captureWarning('analytics', 'dropped_event', 'Evento descartado tras múltiples intentos', {
        endpoint: envelope.endpoint,
        type: envelope.type,
      });
      return;
    }

    const queued: AnalyticsEnvelope = { ...envelope, attempts };
    this.queue.push(queued);
    this.persistQueue();
  }

  private flushQueue(): void {
    if (!this.queue.length || !this.httpClient || !this.isOnline()) {
      return;
    }

    const pending = [...this.queue];
    this.queue = [];
    this.persistQueue();

    pending.forEach(item => this.dispatch(item));
  }

  private setupOnlineListener(): void {
    const windowRef = this.windowRef;
    if (!windowRef) {
      return;
    }

    fromEvent(windowRef, 'online')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.flushQueue());
  }

  private setupFlushTimer(): void {
    if (this.flushIntervalMs <= 0) {
      return;
    }

    this.flushHandle = setInterval(() => this.flushQueue(), this.flushIntervalMs);
  }

  private restoreQueue(): void {
    const storage = this.windowRef?.localStorage;
    if (!storage) {
      return;
    }

    try {
      const stored = storage.getItem(this.queueStorageKey);
      if (!stored) {
        return;
      }

      const parsed = JSON.parse(stored) as AnalyticsEnvelope[];
      if (Array.isArray(parsed)) {
        this.queue = parsed.map(item => ({
          ...item,
          attempts: item.attempts ?? 0,
          endpoint: item.endpoint || this.resolveEndpoint(item.type),
        }));
      }
    } catch {
      this.queue = [];
    }
  }

  private persistQueue(): void {
    const storage = this.windowRef?.localStorage;
    if (!storage) {
      return;
    }

    try {
      storage.setItem(this.queueStorageKey, JSON.stringify(this.queue));
    } catch {
      // Ignore storage errors (quota, private mode, etc.)
    }
  }

  private resolveEndpoint(type: 'event' | 'metric'): string {
    const config = environment.analytics ?? {};
    if (type === 'metric') {
      return config.metricsEndpoint ?? 'analytics/metrics';
    }
    return config.eventsEndpoint ?? 'analytics/events';
  }

  private isEnabled(): boolean {
    return environment.features?.enableAnalytics === true;
  }

  private isOnline(): boolean {
    const windowRef = this.windowRef;
    if (!windowRef) {
      return true;
    }

    return windowRef.navigator?.onLine ?? true;
  }


  private deliverToAuxSinks(envelope: AnalyticsEnvelope): void {
    const payload = {
      ...envelope.body,
      analyticsId: envelope.id,
      deliveredAt: new Date().toISOString(),
    };

    this.monitoring?.captureInfo('analytics', envelope.type === 'event' ? 'event_delivered' : 'metric_delivered', 'Analytics data delivered to aux sinks', payload);

    if (!this.httpClient) {
      return;
    }

    const datadogEndpoint = environment.monitoring?.datadogEndpoint;
    if (datadogEndpoint) {
      this.fireAndForget(datadogEndpoint, {
        source: 'pwa-analytics',
        channel: envelope.type,
        body: payload,
      });
    }

    if (envelope.type !== 'event') {
      return;
    }

    const eventName = String(envelope.body['event'] ?? '').toLowerCase();
    if (!this.shouldNotifyAux(eventName)) {
      return;
    }

    const slackWebhook = environment.monitoring?.slackWebhook;
    if (slackWebhook) {
      this.fireAndForget(slackWebhook, {
        text: ':satellite: Evento ' + envelope.body['event'] + ' registrado',
        details: payload
      });
    }
  }

  private shouldNotifyAux(eventName?: string): boolean {
    if (!eventName) {
      return false;
    }
    return eventName.includes('avi') || eventName.includes('protection') || eventName.includes('tanda');
  }

  private fireAndForget(endpoint: string, body: Record<string, any>): void {
    this.httpClient!.post(endpoint, body, {
      showLoading: false,
      showError: false,
    }).subscribe({
      error: error => {
        this.monitoring?.captureWarning('analytics', 'aux_sink_failed', 'No se pudo notificar sink auxiliar', {
          endpoint,
          error,
        });
      }
    });
  }

  private debug(label: string, name: string, payload: AnalyticsEventPayload): void {
    if (environment.production) {
      return;
    }
    // eslint-disable-next-line no-console
    console.debug(`[analytics:${label}]`, name, payload);
  }

  private isMockEndpoint(endpoint: string): boolean {
    return /mock-[a-z]+$/i.test(endpoint.replace(/\?.*/, ''));
  }
}
