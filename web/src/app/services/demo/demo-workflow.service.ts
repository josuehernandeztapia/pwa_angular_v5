import { Injectable } from '@angular/core';

import { DocumentStatus } from '@interfaces/types';
import { AviDocumentMatchSnapshot } from '@feature-services/onboarding/onboarding-requirements.models';

import { DemoScenarioId, DemoAviDecision } from './demo-scenarios';
import { DemoSeedService } from './demo-seed.service';
import { DemoAnalyticsService } from './demo-analytics.service';

interface DemoDocumentMutationOptions {
  autoToggleAvi?: boolean;
}

@Injectable({ providedIn: 'root' })
export class DemoWorkflowService {
  constructor(
    private readonly seeds: DemoSeedService,
    private readonly analytics: DemoAnalyticsService
  ) {}

  markDocumentStatus(
    scenario: DemoScenarioId,
    documentId: string,
    status: DocumentStatus,
    options: DemoDocumentMutationOptions = {}
  ): void {
    const currentSnapshot = this.seeds.getScenario(scenario);
    const previousStatus = currentSnapshot.documents?.find(doc => doc.id === documentId)?.status ?? null;

    this.seeds.updateScenario(scenario, current => {
      if (!current.documents) {
        return current;
      }

      const documents = current.documents.map(doc =>
        doc.id === documentId
          ? {
              ...doc,
              status,
              reviewedAt: new Date()
            }
          : doc
      );

      return {
        ...current,
        documents,
        onboardingUpdate: current.onboardingUpdate
          ? {
              ...current.onboardingUpdate,
              documents
            }
          : current.onboardingUpdate
      };
    });

    this.analytics.trackDocumentStatusChange({
      scenario,
      documentId,
      status
    });

    if (status === DocumentStatus.Aprobado && previousStatus !== DocumentStatus.Aprobado) {
      this.analytics.trackDocumentFix({
        scenario,
        documentId,
        previousStatus: previousStatus?.toString?.() ?? null
      });
    }

    if (options.autoToggleAvi) {
      const isAllApproved = this.areAllDocumentsApproved(scenario);
      if (isAllApproved) {
        this.activateAviScenario(scenario);
      }
    }
  }

  async fixDocument(scenario: DemoScenarioId, documentId: string): Promise<void> {
    await this.simulateLatency();
    this.markDocumentStatus(scenario, documentId, DocumentStatus.Aprobado, { autoToggleAvi: true });
  }

  async flagDocumentAsPending(scenario: DemoScenarioId, documentId: string): Promise<void> {
    await this.simulateLatency(250);
    this.markDocumentStatus(scenario, documentId, DocumentStatus.Pendiente);
  }

  async rejectDocument(
    scenario: DemoScenarioId,
    documentId: string,
    reason: string = 'Documento inválido (demo)'
  ): Promise<void> {
    await this.simulateLatency(350);
    this.seeds.updateScenario(scenario, current => {
      if (!current.documents) {
        return current;
      }

      const documents = current.documents.map(doc =>
        doc.id === documentId
          ? {
              ...doc,
              status: DocumentStatus.Rechazado,
              rejectionReason: reason,
              reviewedAt: new Date()
            }
          : doc
      );

      return {
        ...current,
        documents,
        onboardingUpdate: current.onboardingUpdate
          ? {
              ...current.onboardingUpdate,
              documents
            }
          : current.onboardingUpdate
      };
    });

    this.analytics.trackDocumentStatusChange({
      scenario,
      documentId,
      status: DocumentStatus.Rechazado
    });
  }

  toggleDocumentCompletion(scenario: DemoScenarioId, documentId: string): void {
    const current = this.seeds.getScenario(scenario);
    const document = current.documents?.find(item => item.id === documentId);
    if (!document) {
      return;
    }

    const nextStatus = document.status === DocumentStatus.Aprobado ? DocumentStatus.Pendiente : DocumentStatus.Aprobado;
    this.markDocumentStatus(scenario, documentId, nextStatus, { autoToggleAvi: true });
  }

  resetScenario(scenario: DemoScenarioId): void {
    this.seeds.resetScenario(scenario);
  }

  simulateAviDecision(scenario: DemoScenarioId, decision: DemoAviDecision): void {
    this.seeds.updateScenario(scenario, current => {
      const notePrefix = 'Entrevista AVI demo:';
      const baseNotes = current.protectionNotes ?? [];
      const cleanedNotes = baseNotes.filter(note => !note.startsWith(notePrefix));
      const decisionNote = `${notePrefix} ${decision}`;

      return {
        ...current,
        aviDecision: decision,
        aviDecisionUpdatedAt: Date.now(),
        protectionNotes: [...cleanedNotes, decisionNote]
      };
    });

    this.analytics.track('avi_decision_simulated', {
      scenario,
      decision
    });
  }

  setDocumentMatchOption(scenario: DemoScenarioId, optionId: string): void {
    const snapshot = this.seeds.getScenario(scenario);
    const option = snapshot.documentMatchOptions?.find(item => item.id === optionId);
    if (!option) {
      return;
    }

    const matchSnapshot = this.cloneMatchSnapshot(option.snapshot ?? null);

    this.seeds.updateScenario(scenario, current => ({
      ...current,
      aviDocumentMatch: matchSnapshot,
      activeDocumentMatchOption: option.id,
      onboardingUpdate: current.onboardingUpdate
        ? {
            ...current.onboardingUpdate,
            aviDocumentMatch: matchSnapshot
          }
        : current.onboardingUpdate
    }));

    this.analytics.trackDocumentMatchOption({
      scenario,
      optionId: option.id
    });
  }

  private areAllDocumentsApproved(scenario: DemoScenarioId): boolean {
    const docs = this.seeds.getScenario(scenario).documents;
    if (!docs?.length) {
      return false;
    }
    return docs.every(doc => doc.status === DocumentStatus.Aprobado || doc.isOptional);
  }

  private activateAviScenario(scenario: DemoScenarioId): void {
    this.seeds.updateScenario(scenario, current => ({
      ...current,
      protectionNotes: [
        ...(current.protectionNotes ?? []),
        'Todos los documentos aprobados. AVI listo para ejecutarse.'
      ]
    }));
  }

  private simulateLatency(ms = 300): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private cloneMatchSnapshot(snapshot: AviDocumentMatchSnapshot | null): AviDocumentMatchSnapshot | null {
    if (!snapshot) {
      return null;
    }
    return {
      ...snapshot,
      fields: snapshot.fields.map(field => ({ ...field }))
    };
  }
}
