import { Injectable, signal } from '@angular/core';

import { AnalyticsService } from '@core-services/analytics.service';

export interface DemoAnalyticsEvent {
  name: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

@Injectable({ providedIn: 'root' })
export class DemoAnalyticsService {
  private readonly eventsSignal = signal<DemoAnalyticsEvent[]>([]);
  readonly events = this.eventsSignal.asReadonly();

  constructor(private readonly analytics: AnalyticsService) {}

  track(event: string, payload: Record<string, unknown> = {}): void {
    const eventName = `demo_${event}`;
    const enrichedPayload = {
      ...payload,
      demo: true,
      timestamp: Date.now()
    };
    this.analytics.track(eventName, enrichedPayload);
    this.recordEvent(eventName, enrichedPayload);
  }

  trackFlowStart(details: { scenario?: string | null; feature: string; step?: string }): void {
    this.track('flow_start', {
      scenario: details.scenario ?? this.resolveScenario(),
      feature: details.feature,
      step: details.step ?? null
    });
  }

  trackDocumentStatusChange(details: { scenario?: string | null; documentId: string; status: string }): void {
    this.track('document_status_change', {
      scenario: details.scenario ?? this.resolveScenario(),
      documentId: details.documentId,
      status: details.status
    });
  }

  trackDocumentFix(details: { scenario?: string | null; documentId: string; previousStatus?: string | null }): void {
    this.track('document_fix', {
      scenario: details.scenario ?? this.resolveScenario(),
      documentId: details.documentId,
      previousStatus: details.previousStatus ?? null
    });
  }

  trackExportSuccess(details: { scenario?: string | null; format?: string; total?: number }): void {
    this.track('export_success', {
      scenario: details.scenario ?? this.resolveScenario(),
      format: details.format ?? 'demo',
      total: details.total ?? null
    });
  }

  trackFinanceScenarioApplied(details: { scenario?: string | null; optionId: string }): void {
    this.track('finance_scenario_applied', {
      scenario: details.scenario ?? this.resolveScenario(),
      optionId: details.optionId
    });
  }

  trackTandaEvent(details: { scenario?: string | null; event: 'sorteo' | 'penalizacion'; memberId?: string }): void {
    this.track('tanda_event', {
      scenario: details.scenario ?? this.resolveScenario(),
      event: details.event,
      memberId: details.memberId ?? null
    });
  }

  trackDocumentMatchOption(details: { scenario?: string | null; optionId: string }): void {
    this.track('document_match_option', {
      scenario: details.scenario ?? this.resolveScenario(),
      optionId: details.optionId
    });
  }

  trackScenarioReset(scenario: string): void {
    this.track('scenario_reset', { scenario });
  }

  clearHistory(): void {
    this.eventsSignal.set([]);
  }

  private resolveScenario(): string | null {
    // Consumers can override scenario explicitly; fallback keeps compatibility.
    return null;
  }

  private recordEvent(name: string, payload: Record<string, unknown>): void {
    const timestampValue = typeof payload['timestamp'] === 'number' ? (payload['timestamp'] as number) : Date.now();
    const event: DemoAnalyticsEvent = {
      name,
      payload,
      timestamp: timestampValue
    };

    this.eventsSignal.update(events => [event, ...events].slice(0, 50));
  }
}
