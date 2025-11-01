import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';

import { DemoModeService } from '@core-services/demo-mode.service';
import { DemoAnalyticsService } from '@services/demo/demo-analytics.service';
import { DemoScenarioId } from '@services/demo/demo-scenarios';
import { StepperComponent, StepperStep } from '@shared/stepper.component';
import { IconComponent } from '@shared/icon/icon.component';
import { DemoErrorBannerComponent } from '@shared/demo-error-banner.component';
import { DocumentStatus } from '@interfaces/types';

interface DemoKycDocumentState {
  id: string;
  name: string;
  status: DocumentStatus;
  tooltip?: string;
}

interface KycEventLogEntry {
  id: number;
  label: string;
  kind: 'info' | 'warning' | 'success';
  timestamp: number;
}

const KYC_SCENARIO_ID: DemoScenarioId = 'kyc-demo';

@Component({
  selector: 'app-demo-kyc-test',
  standalone: true,
  imports: [CommonModule, StepperComponent, IconComponent, DemoErrorBannerComponent],
  templateUrl: './demo-kyc-test.component.html',
  styleUrls: ['./demo-kyc-test.component.scss']
})
export class DemoKycTestComponent implements OnInit {
  readonly scenarioState = this.demoMode.activeScenarioState;
  readonly steps: StepperStep[] = [
    { id: 'contexto', label: 'Contexto', icon: 'clipboard-list' },
    { id: 'biometria', label: 'Verificación biométrica', icon: 'shield-check' },
    { id: 'cierre', label: 'Cierre y métricas', icon: 'chart' }
  ];

  readonly currentStepIndex = signal(0);
  readonly documents = signal<DemoKycDocumentState[]>([]);
  readonly hasFraudFlag = signal(false);
  readonly isCompleted = signal(false);
  readonly events = signal<KycEventLogEntry[]>([]);
  readonly bannerMessage = signal('Prepara el entorno demo para validar KYC.');

  readonly currentStepId = computed(() => {
    const step = this.steps[this.currentStepIndex()] ?? this.steps[0];
    return step.id;
  });

  private logCounter = 0;
  private stageStartedAt: number | null = null;

  constructor(
    private readonly demoMode: DemoModeService,
    private readonly demoAnalytics: DemoAnalyticsService
  ) {}

  ngOnInit(): void {
    this.demoMode.enableDemoMode();
    this.demoMode.setScenario(KYC_SCENARIO_ID);
    this.demoMode.resetScenario(KYC_SCENARIO_ID);
    this.bootstrapDocuments();

    this.demoAnalytics.track('kyc_test_viewed', {
      scenario: KYC_SCENARIO_ID,
      source: 'sidebar'
    });
  }

  prepareUploads(): void {
    const docs = this.documents().map(doc => {
      if (doc.id === 'doc-kyc') {
        return { ...doc, status: DocumentStatus.Pendiente };
      }
      return { ...doc, status: DocumentStatus.Aprobado };
    });
    this.documents.set(docs);
    this.currentStepIndex.set(1);
    this.stageStartedAt = Date.now();
    this.bannerMessage.set('Documentos demo listos, procede con la simulación biométrica.');

    this.trackEvent('kyc_test_stage_progressed', {
      scenario: KYC_SCENARIO_ID,
      stage: 'uploads_prepared',
      approvals: docs.filter(doc => doc.status === DocumentStatus.Aprobado).length
    });
    this.pushLog('Documentos base preparados (demo).', 'info');
  }

  simulateBiometricSuccess(): void {
    const docs = this.documents().map(doc =>
      doc.id === 'doc-kyc'
        ? { ...doc, status: DocumentStatus.Aprobado }
        : doc
    );
    this.documents.set(docs);
    this.hasFraudFlag.set(false);
    this.currentStepIndex.set(2);
    this.isCompleted.set(true);
    const duration = this.consumeStageDuration();
    this.bannerMessage.set('Verificación biométrica aprobada en demo.');

    this.trackEvent('kyc_test_biometric_success', {
      scenario: KYC_SCENARIO_ID,
      durationMs: duration
    });
    this.trackCompletion();
    this.pushLog('Biometría aprobada con éxito en modo demo.', 'success');
  }

  simulateBiometricAlert(): void {
    const docs = this.documents().map(doc =>
      doc.id === 'doc-kyc'
        ? { ...doc, status: DocumentStatus.Rechazado }
        : doc
    );
    this.documents.set(docs);
    this.hasFraudFlag.set(true);
    this.currentStepIndex.set(2);
    const duration = this.consumeStageDuration();
    this.bannerMessage.set('Se detectaron señales de fraude demo. Revisa las alertas.');

    this.trackEvent('kyc_test_biometric_alert', {
      scenario: KYC_SCENARIO_ID,
      durationMs: duration
    });
    this.pushLog('Se detectó una discrepancia biométrica demo.', 'warning');
  }

  resolveAlerts(): void {
    const docs = this.documents().map(doc =>
      doc.id === 'doc-kyc'
        ? { ...doc, status: DocumentStatus.Aprobado }
        : doc
    );
    this.documents.set(docs);
    this.hasFraudFlag.set(false);
    this.isCompleted.set(true);
    this.bannerMessage.set('Alertas resueltas. Flujo demo KYC completado.');

    this.trackEvent('kyc_test_autofix', { scenario: KYC_SCENARIO_ID });
    this.trackCompletion();
    this.pushLog('Alertas demo resueltas automáticamente.', 'success');
  }

  resetTest(): void {
    this.demoMode.resetScenario(KYC_SCENARIO_ID);
    this.bootstrapDocuments();
    this.currentStepIndex.set(0);
    this.isCompleted.set(false);
    this.hasFraudFlag.set(false);
    this.bannerMessage.set('Prepara el entorno demo para validar KYC.');
    this.events.set([]);
    this.stageStartedAt = null;

    this.trackEvent('kyc_test_reset', { scenario: KYC_SCENARIO_ID });
  }

  getStatusLabel(status: DocumentStatus): string {
    switch (status) {
      case DocumentStatus.Aprobado:
        return 'Aprobado';
      case DocumentStatus.Rechazado:
        return 'Rechazado';
      case DocumentStatus.EnRevision:
        return 'En revisión';
      default:
        return 'Pendiente';
    }
  }

  private bootstrapDocuments(): void {
    const scenario = this.demoMode.getScenarioSnapshot(KYC_SCENARIO_ID);
    const docs = scenario?.documents ?? [];
    const mapped = docs.map(doc => ({
      id: doc.id,
      name: doc.name,
      status: doc.status,
      tooltip: doc.tooltip
    }));
    this.documents.set(mapped);
  }

  private trackCompletion(): void {
    this.trackEvent('kyc_test_completed', {
      scenario: KYC_SCENARIO_ID,
      fraudFlags: this.hasFraudFlag()
    });
  }

  private consumeStageDuration(): number {
    if (!this.stageStartedAt) {
      return 0;
    }
    const diff = Date.now() - this.stageStartedAt;
    this.stageStartedAt = null;
    return diff;
  }

  private pushLog(label: string, kind: KycEventLogEntry['kind']): void {
    const entry: KycEventLogEntry = {
      id: ++this.logCounter,
      label,
      kind,
      timestamp: Date.now()
    };
    this.events.update(list => [entry, ...list].slice(0, 10));
  }

  private trackEvent(event: string, payload: Record<string, unknown>): void {
    this.demoAnalytics.track(event, {
      ...payload,
      feature: 'kyc-demo'
    });
  }
}
