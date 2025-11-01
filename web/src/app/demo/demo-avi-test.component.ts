import { CommonModule } from '@angular/common';
import { Component, OnInit, signal, computed } from '@angular/core';

import { DemoModeService } from '@core-services/demo-mode.service';
import { DemoAnalyticsService } from '@services/demo/demo-analytics.service';
import { DemoWorkflowService } from '@services/demo/demo-workflow.service';
import { DemoScenarioId } from '@services/demo/demo-scenarios';
import { AVIInterviewComponent } from '@app/avi-interview/avi-interview.component';
import { StepperComponent, StepperStep } from '@shared/stepper.component';
import { IconComponent } from '@shared/icon/icon.component';
import { DemoErrorBannerComponent } from '@shared/demo-error-banner.component';

interface AviValidationResultPayload {
  validationResult: {
    session_id: string;
    compliance_score: number;
    session_duration: number;
    questions_missing: string[];
    risk_flags: Array<{ type: string; severity: string; description: string }> | null;
  };
}

const AVI_SCENARIO_ID: DemoScenarioId = 'avi-perfecto';

@Component({
  selector: 'app-demo-avi-test',
  standalone: true,
  imports: [
    CommonModule,
    AVIInterviewComponent,
    StepperComponent,
    IconComponent,
    DemoErrorBannerComponent
  ],
  templateUrl: './demo-avi-test.component.html',
  styleUrls: ['./demo-avi-test.component.scss']
})
export class DemoAviTestComponent implements OnInit {
  readonly scenarioId = AVI_SCENARIO_ID;
  readonly activeScenario = this.demoMode.activeScenario;
  readonly scenarioState = this.demoMode.activeScenarioState;

  readonly steps: StepperStep[] = [
    { id: 'briefing', label: 'Briefing', icon: 'clipboard-list' },
    { id: 'interview', label: 'Entrevista', icon: 'microphone' },
    { id: 'resultado', label: 'Resultados', icon: 'sparkles' }
  ];

  readonly currentStepIndex = signal(0);
  readonly aviResult = signal<AviValidationResultPayload['validationResult'] | null>(null);
  readonly bannerMessage = signal('Lista para ejecutar entrevista demo');
  readonly isInterviewActive = signal(false);
  readonly showCompletionToast = signal(false);
  readonly hasIssues = computed(() => {
    const result = this.aviResult();
    if (!result) {
      return false;
    }
    const riskyScore = result.compliance_score < 80;
    const flagged = (result.risk_flags?.length ?? 0) > 0;
    return riskyScore || flagged;
  });

  private startedAt: number | null = null;

  constructor(
    private readonly demoMode: DemoModeService,
    private readonly demoAnalytics: DemoAnalyticsService,
    private readonly demoWorkflow: DemoWorkflowService
  ) {}

  ngOnInit(): void {
    this.demoMode.enableDemoMode();
    this.demoMode.setScenario(AVI_SCENARIO_ID);
    this.demoAnalytics.track('avi_test_viewed', {
      scenario: AVI_SCENARIO_ID,
      source: 'sidebar'
    });
  }

  get currentStepId(): string {
    const index = this.currentStepIndex();
    return this.steps[Math.max(0, Math.min(this.steps.length - 1, index))].id;
  }

  onInterviewStarted(): void {
    this.startedAt = Date.now();
    this.isInterviewActive.set(true);
    this.currentStepIndex.set(1);
    this.bannerMessage.set('Entrevista en curso · captura notas y respuestas clave');
    this.demoAnalytics.track('avi_test_started', {
      scenario: AVI_SCENARIO_ID,
      stage: 'interview'
    });
  }

  onInterviewCancelled(): void {
    this.isInterviewActive.set(false);
    this.bannerMessage.set('Entrevista cancelada · puedes reiniciar cuando gustes');
    this.currentStepIndex.set(0);
    this.demoAnalytics.track('avi_test_cancelled', {
      scenario: AVI_SCENARIO_ID
    });
  }

  onInterviewCompleted(payload: AviValidationResultPayload): void {
    const result = payload?.validationResult;
    this.isInterviewActive.set(false);
    this.currentStepIndex.set(2);
    this.aviResult.set(result ?? null);
    this.bannerMessage.set('Test AVI demo completado');

    const elapsed = this.startedAt ? Date.now() - this.startedAt : result?.session_duration ?? 0;
    this.startedAt = null;

    this.demoAnalytics.track('avi_test_completed', {
      scenario: AVI_SCENARIO_ID,
      compliance: result?.compliance_score ?? null,
      missingQuestions: result?.questions_missing?.length ?? 0,
      riskFlags: result?.risk_flags?.length ?? 0,
      durationMs: elapsed
    });

    this.showCompletionToast.set(true);
  }

  resetTest(): void {
    this.demoMode.resetScenario(AVI_SCENARIO_ID);
    this.currentStepIndex.set(0);
    this.aviResult.set(null);
    this.bannerMessage.set('Lista para ejecutar entrevista demo');
    this.isInterviewActive.set(false);
    this.startedAt = null;
    this.showCompletionToast.set(false);

    this.demoAnalytics.track('avi_test_reset', {
      scenario: AVI_SCENARIO_ID
    });
  }

  resolveIssues(): void {
    this.demoWorkflow.simulateAviDecision(AVI_SCENARIO_ID, 'GO');
    const result = this.aviResult();
    if (result) {
      this.aviResult.set({
        ...result,
        compliance_score: Math.max(result.compliance_score, 92),
        risk_flags: []
      });
    }
    this.demoAnalytics.track('avi_test_autofix', {
      scenario: AVI_SCENARIO_ID
    });
  }
}
