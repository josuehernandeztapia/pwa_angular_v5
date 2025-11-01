import { Injectable, computed } from '@angular/core';

import { DemoSeedService } from './demo-seed.service';
import { DemoAnalyticsService } from './demo-analytics.service';
import { DemoScenarioId, DemoDeliveryEvidence, DemoDeliveryIncident } from './demo-scenarios';

export interface DemoIncidentUpdate {
  incident: DemoDeliveryIncident;
  wasChanged: boolean;
}

@Injectable({ providedIn: 'root' })
export class DemoPostventaService {
  private readonly scenarioId: DemoScenarioId = 'postventa-entrega';
  private readonly scenario = this.seeds.scenarioSignal(this.scenarioId);

  readonly notes = computed(() => this.scenario()?.deliveryNotes ?? []);
  readonly incidents = computed(() => this.scenario()?.deliveryIncidents ?? []);
  readonly evidence = computed(() => this.scenario()?.deliveryEvidence ?? []);

  constructor(
    private readonly seeds: DemoSeedService,
    private readonly analytics: DemoAnalyticsService
  ) {}

  loadEvidence(): DemoDeliveryEvidence[] {
    const snapshot = this.scenario();
    const evidence = snapshot?.deliveryEvidence ?? [];
    if (!evidence.length) {
      return [];
    }

    const timestamp = new Date().toISOString();

    this.seeds.updateScenario(this.scenarioId, current => ({
      ...current,
      deliveryEvidence: (current.deliveryEvidence ?? []).map(item => ({
        ...item,
        loadedAt: timestamp
      })),
      deliveryNotes: [
        ...(current.deliveryNotes ?? []),
        `Evidencia demo cargada (${evidence.length} fotos) - ${new Date().toLocaleTimeString()}`
      ]
    }));

    this.analytics.track('postventa_evidence_loaded', {
      scenario: this.scenarioId,
      total: evidence.length
    });

    return this.scenario()?.deliveryEvidence ?? evidence;
  }

  simulateIncident(incidentId: string): DemoIncidentUpdate | null {
    let updated: DemoDeliveryIncident | undefined;
    let changed = false;
    const timestamp = new Date().toISOString();

    this.seeds.updateScenario(this.scenarioId, current => {
      const incidents = (current.deliveryIncidents ?? []).map(incident => {
        if (incident.id !== incidentId) {
          return incident;
        }
        if (incident.status === 'open') {
          updated = incident;
          return incident;
        }
        changed = true;
        updated = {
          ...incident,
          status: 'open',
          lastUpdatedAt: timestamp
        };
        return updated;
      });

      if (!changed) {
        return current;
      }

      return {
        ...current,
        deliveryIncidents: incidents,
        deliveryNotes: [
          ...(current.deliveryNotes ?? []),
          `Incidencia demo abierta: ${updated?.title ?? incidentId}`
        ]
      };
    });

    if (changed && updated) {
      this.analytics.track('postventa_incident_opened', {
        scenario: this.scenarioId,
        incidentId,
        severity: updated.severity
      });
      return { incident: updated, wasChanged: true };
    }

    return updated ? { incident: updated, wasChanged: false } : null;
  }

  resolveIncident(incidentId: string): DemoIncidentUpdate | null {
    let updated: DemoDeliveryIncident | undefined;
    let changed = false;
    const timestamp = new Date().toISOString();

    this.seeds.updateScenario(this.scenarioId, current => {
      const incidents = (current.deliveryIncidents ?? []).map(incident => {
        if (incident.id !== incidentId) {
          return incident;
        }
        if (incident.status === 'resolved') {
          updated = incident;
          return incident;
        }
        changed = true;
        updated = {
          ...incident,
          status: 'resolved',
          lastUpdatedAt: timestamp
        };
        return updated;
      });

      if (!changed) {
        return current;
      }

      return {
        ...current,
        deliveryIncidents: incidents,
        deliveryNotes: [
          ...(current.deliveryNotes ?? []),
          `Incidencia demo resuelta: ${updated?.title ?? incidentId}`
        ]
      };
    });

    if (changed && updated) {
      this.analytics.track('postventa_incident_resolved', {
        scenario: this.scenarioId,
        incidentId,
        severity: updated.severity
      });
      return { incident: updated, wasChanged: true };
    }

    return updated ? { incident: updated, wasChanged: false } : null;
  }

  appendNote(note: string): void {
    if (!note.trim()) {
      return;
    }
    this.seeds.updateScenario(this.scenarioId, current => ({
      ...current,
      deliveryNotes: [...(current.deliveryNotes ?? []), note]
    }));
    this.analytics.track('postventa_note_appended', {
      scenario: this.scenarioId
    });
  }

  resetScenario(): void {
    this.seeds.resetScenario(this.scenarioId);
    this.analytics.track('postventa_demo_reset', { scenario: this.scenarioId });
  }
}
