import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FlowContextService } from '@core-services/flow-context.service';
import { IconComponent } from '@shared/icon/icon.component';
import { OnboardingEngineService } from '@feature-services/simulador/onboarding-engine.service';
import { OnboardingRequirementsService } from '@feature-services/onboarding/onboarding-requirements.service';
import { BusinessFlow, Client, Document } from '@interfaces/types';
import { OnboardingChecklistComponent } from '@shared/onboarding-checklist.component';
import { OnboardingTrackerComponent } from '@shared/onboarding-tracker.component';
import { OnboardingStatusBannerComponent } from '@shared/onboarding-status-banner.component';
import { AnalyticsService } from '@core-services/analytics.service';
import { DemoModeService } from '@core-services/demo-mode.service';
import { DemoSeedService } from '@services/demo/demo-seed.service';
import { DemoWorkflowService } from '@services/demo/demo-workflow.service';
import { DemoAnalyticsService } from '@services/demo/demo-analytics.service';
import { OnboardingRequirementsSnapshot, AviDocumentMatchSnapshot, AviDocumentMatchOverride, RequirementContext } from '@feature-services/onboarding/onboarding-requirements.models';
import { DemoAviDecision } from '@services/demo/demo-scenarios';

@Component({
  selector: 'app-onboarding-main',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IconComponent, OnboardingChecklistComponent, OnboardingTrackerComponent, OnboardingStatusBannerComponent],
  templateUrl: './onboarding-main.component.html',
  styleUrls: ['./onboarding-main.component.scss']
})
export class OnboardingMainComponent {
  private readonly flowContext = inject(FlowContextService);
  private readonly onboardingEngine = inject(OnboardingEngineService);
  private readonly onboardingRequirements = inject(OnboardingRequirementsService);
  private readonly analytics = inject(AnalyticsService);
  private readonly demoMode = inject(DemoModeService);
  private readonly demoSeeds = inject(DemoSeedService);
  private readonly demoWorkflow = inject(DemoWorkflowService);
  private readonly demoAnalytics = inject(DemoAnalyticsService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly markets = [
    { value: 'edomex', label: 'Edo. de México' },
    { value: 'aguascalientes', label: 'Aguascalientes' }
  ] as const;

  readonly saleTypes = [
    { value: 'financiero', label: 'Financiamiento' },
    { value: 'contado', label: 'Contado' }
  ] as const;

  readonly clientTypes = [
    { value: 'individual', label: 'Individual' },
    { value: 'colectivo', label: 'Colectivo' }
  ] as const;

  readonly onboardingSteps = [
    { icon: 'user-plus', title: 'Identifica al cliente', description: 'Define mercado, flujo y tipo de cliente.' },
    { icon: 'clipboard-list', title: 'Genera checklist inteligente', description: 'Calculamos documentos requeridos automáticamente.' },
    { icon: 'sparkles', title: 'Automatiza oportunidades', description: 'Creamos la oportunidad y registramos los eventos clave.' }
  ] as const;

  readonly form = this.fb.group({
    name: this.fb.control('', { validators: [Validators.required, Validators.minLength(3)] }),
    market: this.fb.control<'edomex' | 'aguascalientes'>('edomex'),
    saleType: this.fb.control<'contado' | 'financiero'>('financiero'),
    clientType: this.fb.control<'individual' | 'colectivo'>('individual'),
    ecosystemId: this.fb.control('')
  });

  readonly creationState = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  readonly errorMessage = signal<string | null>(null);
  readonly lastCreatedClient = signal<Client | null>(null);
  readonly isLoading = computed(() => this.creationState() === 'loading');
  readonly requirementsSnapshot = computed(() => this.onboardingRequirements.snapshot());
  readonly isDemo = this.demoMode.isDemoMode;
  readonly activeDemoScenario = this.demoMode.activeScenario;
  readonly demoScenarioSnapshot = computed(() => {
    const scenario = this.activeDemoScenario();
    if (!scenario) {
      return null;
    }
    return this.demoSeeds.scenarioSnapshot(scenario);
  });
  readonly demoAviDecision = computed(() => this.demoScenarioSnapshot()?.aviDecision ?? null);
  readonly demoAviDecisionUpdatedAt = computed(() => this.demoScenarioSnapshot()?.aviDecisionUpdatedAt ?? null);
  readonly aviDecisionOptions: DemoAviDecision[] = ['GO', 'REVIEW', 'NO_GO'];
  readonly isSimulatingAviDecision = signal(false);
  readonly activeDemoDocumentMatchOption = computed(() => this.demoScenarioSnapshot()?.activeDocumentMatchOption ?? null);
  private lastRequirementsTelemetryKey: string | null = null;
  private lastDocumentMatchTelemetryKey: string | null = null;

  constructor() {
    this.flowContext.setBreadcrumbs(['Dashboard', 'Onboarding']);
    this.updateRequirementsPreview();

    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.updateRequirementsPreview());

    effect(() => {
      if (!this.isDemo()) {
        return;
      }
      const scenarioId = this.activeDemoScenario();
      const snapshot = this.demoScenarioSnapshot();
      if (!scenarioId || !snapshot) {
        return;
      }

      if (snapshot.onboardingUpdate) {
        this.onboardingRequirements.update(snapshot.onboardingUpdate);
      }

      if (snapshot.client) {
        this.form.patchValue({
          name: snapshot.client.name,
          market: (snapshot.onboardingUpdate?.context.market ?? this.form.value.market) as 'edomex' | 'aguascalientes',
          saleType: (snapshot.onboardingUpdate?.context.saleType ?? this.form.value.saleType) as 'contado' | 'financiero',
          clientType: (snapshot.onboardingUpdate?.context.clientType ?? this.form.value.clientType) as 'individual' | 'colectivo'
        }, { emitEvent: false });
      }

      this.demoAnalytics.track('scenario_active', {
        scenario: scenarioId,
        feature: 'onboarding'
      });
    });

    effect(() => {
      const snapshot = this.requirementsSnapshot();
      if (!snapshot?.aviDocumentMatch) {
        return;
      }
      this.trackDocumentMatchTelemetry(snapshot.aviDocumentMatch, snapshot.context, snapshot.aviDocumentMatchOverride ?? null);
    });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Completa los campos obligatorios para generar la oportunidad.');
      return;
    }

    const { name, market, saleType, clientType, ecosystemId } = this.form.value;
    if (!name || !market || !saleType || !clientType) {
      this.errorMessage.set('Los campos seleccionados no son válidos.');
      return;
    }

    this.creationState.set('loading');
    this.errorMessage.set(null);

    const target$ = clientType === 'colectivo'
      ? this.onboardingEngine.createSavingsOpportunity({
          name,
          market,
          ecosystemId: ecosystemId || undefined,
          clientType
        })
      : this.onboardingEngine.createClientFromOnboarding({
          name,
          market,
          saleType,
          ecosystemId: ecosystemId || undefined
        });

    target$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: client => {
          this.lastCreatedClient.set(client);
          this.creationState.set('success');
          this.updateRequirementsPreview(client.documents as Document[], client.flow);
        },
        error: () => {
          this.creationState.set('error');
          this.errorMessage.set('Ocurrió un error al crear la oportunidad. Inténtalo de nuevo.');
        }
      });
  }

  resetForm(): void {
    this.form.reset({
      name: '',
      market: 'edomex',
      saleType: 'financiero',
      clientType: 'individual',
      ecosystemId: ''
    });
    this.creationState.set('idle');
    this.errorMessage.set(null);
    this.updateRequirementsPreview();
  }

  resetDemoScenario(): void {
    const scenario = this.activeDemoScenario();
    if (!scenario) {
      return;
    }
    this.demoSeeds.resetScenario(scenario);
    this.demoAnalytics.track('scenario_reset', { scenario });
  }

  toggleDemoDocument(documentId: string): void {
    const scenario = this.activeDemoScenario();
    if (!scenario) {
      return;
    }
    this.demoWorkflow.toggleDocumentCompletion(scenario, documentId);
  }

  simulateAviDecision(decision: DemoAviDecision): void {
    if (!this.isDemo()) {
      return;
    }
    const scenario = this.activeDemoScenario();
    if (!scenario || this.isSimulatingAviDecision()) {
      return;
    }
    this.isSimulatingAviDecision.set(true);
    try {
      this.demoAnalytics.track('avi_decision_triggered', {
        scenario,
        decision,
        feature: 'onboarding'
      });
      this.demoWorkflow.simulateAviDecision(scenario, decision);
    } finally {
      this.isSimulatingAviDecision.set(false);
    }
  }

  selectDemoDocumentMatch(optionId: string): void {
    if (!this.isDemo()) {
      return;
    }
    const scenario = this.activeDemoScenario();
    if (!scenario || optionId === this.activeDemoDocumentMatchOption()) {
      return;
    }
    this.demoWorkflow.setDocumentMatchOption(scenario, optionId);
  }

  getDemoDocumentMatchSummary(optionId: string | null): string {
    const options = this.demoScenarioSnapshot()?.documentMatchOptions ?? [];
    if (!options.length) {
      return 'Selecciona un estado demo para la coincidencia de datos.';
    }
    const match = options.find(option => option.id === optionId);
    return (match ?? options[0]).summary;
  }

  handleAviOverride(event: { decision: 'accepted' | 'forced'; comment: string }): void {
    const comment = event.comment.trim();
    if (!comment) {
      return;
    }

    const override: AviDocumentMatchOverride = {
      decision: event.decision,
      comment,
      forcedAt: Date.now(),
      forcedBy: null
    };

    this.onboardingRequirements.setAviManualOverride(override);

    const snapshot = this.onboardingRequirements.snapshot();
    if (snapshot?.aviDocumentMatch) {
      this.trackDocumentMatchTelemetry(snapshot.aviDocumentMatch, snapshot.context, snapshot.aviDocumentMatchOverride ?? null);
    }

    const telemetryPayload = {
      origin: 'onboarding',
      decision: event.decision,
      commentLength: override.comment.length
    };

    if (this.isDemo()) {
      this.demoAnalytics.track('avi_document_override', telemetryPayload);
    } else {
      this.analytics.track('avi_document_override', telemetryPayload);
    }
  }

  handleAviOverrideClear(): void {
    this.onboardingRequirements.setAviManualOverride(null);

    const snapshot = this.onboardingRequirements.snapshot();
    if (snapshot?.aviDocumentMatch) {
      this.trackDocumentMatchTelemetry(snapshot.aviDocumentMatch, snapshot.context, snapshot.aviDocumentMatchOverride ?? null);
    }

    const payload = { origin: 'onboarding' };
    if (this.isDemo()) {
      this.demoAnalytics.track('avi_document_override_cleared', payload);
    } else {
      this.analytics.track('avi_document_override_cleared', payload);
    }
  }

  private trackDocumentMatchTelemetry(
    match: AviDocumentMatchSnapshot,
    context: RequirementContext,
    override: AviDocumentMatchOverride | null
  ): void {
    const mismatches = match.fields
      .filter(field => field.status === 'mismatch')
      .map(field => field.id)
      .sort();

    const key = [
      'onboarding',
      context.market,
      match.status,
      Math.round(match.score * 100),
      mismatches.join(','),
      override?.decision ?? 'none'
    ].join('|');

    if (this.lastDocumentMatchTelemetryKey === key) {
      return;
    }

    this.lastDocumentMatchTelemetryKey = key;

    const payload = {
      origin: 'onboarding',
      status: match.status,
      score: Math.round(match.score * 100) / 100,
      mismatches,
      hasOverride: !!override,
      overrideDecision: override?.decision ?? null,
      market: context.market,
      saleType: context.saleType,
      clientType: context.clientType
    };

    if (this.isDemo()) {
      this.demoAnalytics.track('avi_document_match', payload);
    } else {
      this.analytics.track('avi_document_match', payload);
    }
  }

  formatAviDecision(decision: DemoAviDecision | null): string {
    switch (decision) {
      case 'GO':
        return 'GO';
      case 'REVIEW':
        return 'Review';
      case 'NO_GO':
        return 'No go';
      default:
        return 'Pendiente';
    }
  }

  getAviDecisionClass(decision: DemoAviDecision | null): string {
    switch (decision) {
      case 'GO':
        return 'onboarding__demo-avi-pill--go';
      case 'REVIEW':
        return 'onboarding__demo-avi-pill--review';
      case 'NO_GO':
        return 'onboarding__demo-avi-pill--no-go';
      default:
        return 'onboarding__demo-avi-pill--pending';
    }
  }

  private updateRequirementsPreview(documents: Document[] = [], businessFlow?: BusinessFlow): void {
    const { market, saleType, clientType } = this.form.value;

    if (!market || !saleType || !clientType) {
      return;
    }

    const resolvedFlow = businessFlow ?? this.resolveBusinessFlow(saleType, clientType);

    const activeScenario = this.activeDemoScenario();
    if (activeScenario) {
      const demoSnapshot = this.demoScenarioSnapshot();
      if (demoSnapshot?.onboardingUpdate) {
        this.onboardingRequirements.update(demoSnapshot.onboardingUpdate);
        return;
      }
    }

    this.onboardingRequirements.update({
      context: {
        market,
        saleType,
        clientType,
        businessFlow: resolvedFlow,
        requiresIncomeProof: saleType === 'financiero',
        collectiveSize: clientType === 'colectivo' ? (documents.length || null) : null
      },
      documents,
      flowContext: {
        market,
        saleType,
        clientType,
        businessFlow: resolvedFlow
      }
    });

    this.recordRequirementsTelemetry(this.onboardingRequirements.snapshot(), 'onboarding');
  }

  private resolveBusinessFlow(
    saleType: 'contado' | 'financiero',
    clientType: 'individual' | 'colectivo'
  ): BusinessFlow {
    if (clientType === 'colectivo') {
      return BusinessFlow.CreditoColectivo;
    }

    return saleType === 'contado' ? BusinessFlow.VentaDirecta : BusinessFlow.VentaPlazo;
  }

  private recordRequirementsTelemetry(
    snapshot: OnboardingRequirementsSnapshot | null,
    origin: 'documents' | 'onboarding' | 'cotizador'
  ): void {
    if (!snapshot) {
      return;
    }

    const key = `${origin}|${snapshot.context.market}|${snapshot.context.saleType}|${snapshot.context.clientType}|${snapshot.pendingCount}`;
    if (this.lastRequirementsTelemetryKey === key) {
      return;
    }

    this.lastRequirementsTelemetryKey = key;

    const analytics = this.isDemo() ? this.demoAnalytics : this.analytics;

    if (snapshot.pendingCount > 0) {
      analytics.track('onboarding_requirements_pending', {
        origin,
        pending: snapshot.pendingCount,
        market: snapshot.context.market,
        saleType: snapshot.context.saleType,
        clientType: snapshot.context.clientType,
        items: snapshot.pendingRequirements.slice(0, 5).map(item => ({
          id: item.id,
          title: item.title,
          status: item.status
        }))
      });
    } else {
      analytics.track('onboarding_requirements_clear', {
        origin,
        market: snapshot.context.market,
        saleType: snapshot.context.saleType,
        clientType: snapshot.context.clientType
      });
    }
  }
}
