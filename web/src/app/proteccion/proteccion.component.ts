import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ProtectionWorkflowService } from '@feature-services/risk/protection-workflow.service';
import { ProtectionScenario, ProtectionType } from '@interfaces/protection';
import { FlowContextService } from '@core-services/flow-context.service';
import { IconComponent } from '@shared/icon/icon.component';

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

  ngOnInit(): void {
    this.flowContext.setBreadcrumbs(['Dashboard', 'Protección']);
    this.simulate();
  }

  simulate(): void {
    if (this.simulateForm.invalid) {
      this.simulateForm.markAllAsTouched();
      return;
    }

    const { contractId, monthK, requestedType, notes } = this.simulateForm.getRawValue();
    this.protectionWorkflow.clearError();
    this.protectionWorkflow.loadPlan(contractId);
    this.protectionWorkflow.simulateScenarios(contractId, monthK, {
      triggerReason: notes || undefined,
      requestedType: requestedType || undefined
    });
  }

  selectScenario(scenario: ProtectionScenario): void {
    const contractId = this.simulateForm.controls.contractId.getRawValue();
    this.protectionWorkflow.selectScenario(contractId, scenario);
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
}
