import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ProtectionWorkflowService } from '@feature-services/risk/protection-workflow.service';
import { ProtectionScenario, ProtectionType } from '@interfaces/protection';
import { FlowContextService } from '@core-services/flow-context.service';
import { IconComponent } from '@shared/icon/icon.component';
import { DemoModeService } from '@core-services/demo-mode.service';
import { DemoAnalyticsService } from '@services/demo/demo-analytics.service';
import { DemoReestructuraEngine } from '@services/demo/demo-reestructura.engine';

@Component({
  selector: 'app-proteccion',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IconComponent],
  templateUrl: './proteccion.component.html',
  styleUrls: ['./proteccion.component.scss']
})
export class ProteccionComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly protectionWorkflow = inject(ProtectionWorkflowService);
  private readonly flowContext = inject(FlowContextService);
  private readonly demoMode = inject(DemoModeService);
  private readonly demoAnalytics = inject(DemoAnalyticsService);
  private readonly demoReestructura = inject(DemoReestructuraEngine);

  readonly simulateForm = this.fb.nonNullable.group({
    contractId: this.fb.nonNullable.control('CT-1277', Validators.required),
    monthK: this.fb.nonNullable.control(12, [Validators.required, Validators.min(1)]),
    requestedType: this.fb.control<ProtectionType | ''>(''),
    notes: this.fb.control('')
  });

  readonly scenarios = this.protectionWorkflow.availableScenarios;
  readonly selectedScenario = this.protectionWorkflow.selectedScenario;
  readonly error = this.protectionWorkflow.error;
  readonly isLoading = computed(() => this.protectionWorkflow.loading() || this.protectionWorkflow.simulating());
  readonly feedback = computed(() => {
    const simulation = this.protectionWorkflow.lastSimulation();
    if (!simulation) {
      return null;
    }
    return simulation.eligibilityCheck.isEligible
      ? simulation.eligibilityCheck.reason
      : 'Cliente no elegible actualmente.';
  });
  readonly isDemoMode = this.demoMode.isDemoMode;
  readonly activeDemoScenario = this.demoMode.activeScenario;
  readonly isProteccionDemo = computed(() => this.isDemoMode() && this.activeDemoScenario() === 'proteccion-reestructura');
  readonly demoScenarioNotes = computed(() => this.demoMode.activeScenarioState()?.protectionNotes ?? []);
  readonly demoProtectionScenarios = computed(() => this.demoReestructura.protectionScenarios());
  readonly selectedDemoScenarioId = computed(() => this.demoReestructura.getActiveOptionId() ?? this.demoProtectionScenarios()[0]?.id ?? null);
  readonly uiScenarios = computed(() => (this.isProteccionDemo() ? this.demoProtectionScenarios() : this.scenarios()));
  readonly uiSelectedScenario = computed(() => {
    if (!this.isProteccionDemo()) {
      return this.selectedScenario();
    }
    const activeId = this.selectedDemoScenarioId();
    return this.demoProtectionScenarios().find(item => item.id === activeId) ?? null;
  });
  readonly demoMessage = signal<string | null>(null);
  readonly demoPaymentPlan = computed(() => this.demoMode.activeScenarioState()?.client?.paymentPlan ?? null);
  readonly demoActiveFinanceScenario = computed(() => {
    if (!this.isProteccionDemo()) {
      return null;
    }
    const activeId = this.selectedDemoScenarioId();
    return this.demoProtectionScenarios().find(item => item.id === activeId) ?? null;
  });
  readonly demoFinanceSummary = computed(() => {
    if (!this.isProteccionDemo()) {
      return null;
    }
    const paymentPlan = this.demoPaymentPlan();
    if (!paymentPlan) {
      return null;
    }
    const scenario = this.demoActiveFinanceScenario();
    return {
      scenarioTitle: scenario?.title ?? scenario?.type ?? 'Escenario demo',
      monthlyPayment: paymentPlan.monthlyPayment,
      monthlyGoal: paymentPlan.monthlyGoal ?? null,
      term: paymentPlan.term ?? null
    };
  });
  readonly financeEvents = computed(() => this.demoMode.activeScenarioState()?.financeEvents ?? []);
  readonly isFinanceEventProcessing = signal(false);

  private lastTrackedDemoScenario: string | null = null;

  constructor() {
    effect(() => {
      if (!this.isProteccionDemo()) {
        this.lastTrackedDemoScenario = null;
        this.demoMessage.set(null);
        return;
      }

      const scenarioId = this.activeDemoScenario();
      const snapshot = this.demoMode.activeScenarioState();
      if (!scenarioId || !snapshot) {
        return;
      }

      if (this.lastTrackedDemoScenario !== scenarioId) {
        this.demoAnalytics.trackFlowStart({ scenario: scenarioId, feature: 'proteccion', step: 'wizard-init' });
        this.lastTrackedDemoScenario = scenarioId;
        if (snapshot.client?.id) {
          this.simulateForm.patchValue({ contractId: snapshot.client.id }, { emitEvent: false });
        }
        this.demoMessage.set('Escenario demo listo. Usa los accesos rápidos o selecciona un card para explicar cada reestructura.');
      }
    });
  }

  ngOnInit(): void {
    this.flowContext.setBreadcrumbs(['Dashboard', 'Protección']);
    this.simulate();
  }

  simulate(): void {
    if (this.simulateForm.invalid) {
      this.simulateForm.markAllAsTouched();
      return;
    }

    if (this.isProteccionDemo()) {
      this.demoAnalytics.track('protection_simulate_triggered', {
        scenario: this.activeDemoScenario(),
        monthK: this.simulateForm.controls.monthK.value
      });
      this.demoMessage.set('Escenarios demo recargados. Selecciona Stepdown, diferimiento o recalendarización para mostrar el impacto.');
      return;
    }

    this.demoMessage.set(null);

    const { contractId, monthK, requestedType, notes } = this.simulateForm.getRawValue();
    this.protectionWorkflow.clearError();
    this.protectionWorkflow.loadPlan(contractId);
    this.protectionWorkflow.simulateScenarios(contractId, monthK, {
      triggerReason: notes || undefined,
      requestedType: requestedType || undefined
    });
  }

  selectScenario(scenario: ProtectionScenario): void {
    if (this.isProteccionDemo()) {
      const optionId = scenario.id ?? scenario.type ?? 'stepdown';
      void this.demoReestructura.applyScenario(optionId).then(() => {
        const paymentPlan = this.demoPaymentPlan();
        const paymentInfo = paymentPlan ? ` (PMT ${this.formatCurrencyAmount(paymentPlan.monthlyPayment)})` : '';
        this.demoMessage.set(`Escenario demo aplicado: ${scenario.title ?? optionId}.${paymentInfo}`);
        this.demoAnalytics.track('protection_option_applied', {
          scenario: this.activeDemoScenario(),
          option: optionId
        });
      });
      return;
    }

    this.demoMessage.set(null);
    const contractId = this.simulateForm.controls.contractId.getRawValue();
    this.protectionWorkflow.selectScenario(contractId, scenario);
  }

  applyDemoScenario(optionId: string): void {
    if (!this.isProteccionDemo()) {
      return;
    }
    const scenario = this.demoProtectionScenarios().find(item => item.id === optionId);
    void this.demoReestructura.applyScenario(optionId).then(() => {
      const paymentPlan = this.demoPaymentPlan();
      const paymentInfo = paymentPlan ? ` (PMT ${this.formatCurrencyAmount(paymentPlan.monthlyPayment)})` : '';
      this.demoMessage.set(`Escenario demo aplicado: ${scenario?.title ?? optionId}.${paymentInfo}`);
      this.demoAnalytics.track('protection_quick_apply', {
        scenario: this.activeDemoScenario(),
        option: optionId
      });
    });
  }

  simulateFinanceEvent(kind: 'late' | 'extra'): void {
    if (!this.isProteccionDemo() || this.isFinanceEventProcessing()) {
      return;
    }
    const scenario = this.activeDemoScenario();
    if (!scenario) {
      return;
    }

    this.isFinanceEventProcessing.set(true);
    const action = kind === 'late'
      ? this.demoReestructura.simulateLatePayment({ scenarioId: scenario })
      : this.demoReestructura.simulateExtraPayment({ scenarioId: scenario });

    void action
      .then(() => {
        this.demoAnalytics.track('finance_event', {
          scenario,
          event: kind,
          feature: 'proteccion'
        });
      })
      .finally(() => this.isFinanceEventProcessing.set(false));
  }

  resetDemoScenario(): void {
    if (!this.isProteccionDemo()) {
      return;
    }
    this.demoMode.resetScenario('proteccion-reestructura');
    this.demoAnalytics.trackScenarioReset('proteccion-reestructura');
    this.demoMessage.set('Escenario demo restaurado. Aplica Stepdown, Diferir o Recalendar para continuar la demo.');
  }

  scenarioScore(scenario: ProtectionScenario): number {
    return scenario.score ?? 0;
  }

  scenarioTitle(scenario: ProtectionScenario): string {
    return scenario.title ?? scenario.type ?? 'Escenario';
  }

  scenarioDescription(scenario: ProtectionScenario): string {
    return scenario.description ?? scenario.details?.join(' • ') ?? 'Ajuste sugerido por el motor de protección.';
  }

  scenarioHighlights(scenario: ProtectionScenario): string[] {
    const highlights: string[] = [];
    if (scenario.impact?.paymentChange) {
      const delta = scenario.impact.paymentChange;
      highlights.push(`Pago cambia ${delta > 0 ? '↑' : '↓'} ${Math.abs(delta).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}`);
    }
    if (scenario.impact?.termChange) {
      highlights.push(`Plazo ${scenario.impact.termChange > 0 ? '+' : ''}${scenario.impact.termChange} meses`);
    }
    if (scenario.tirOK === false) {
      highlights.push('⚠️ Requiere aprobación de riesgos');
    }
    return highlights;
  }

  private formatCurrencyAmount(value: number | null | undefined): string {
    if (value == null) {
      return '';
    }
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  }
}
