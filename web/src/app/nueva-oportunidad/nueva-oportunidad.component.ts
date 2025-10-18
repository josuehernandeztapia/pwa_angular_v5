import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, filter } from 'rxjs';
import { FlowContextService } from '@core-services/flow-context.service';
import { IconComponent } from '@shared/icon/icon.component';
import { FormFieldComponent } from '@shared/form-field.component';

interface OpportunityStep {
  id: number;
  label: string;
  description: string;
}

interface OpportunityDraft {
  market: string;
  flow: string;
  clientType: 'individual' | 'colectivo';
  clientName: string;
  monthlyIncome: number | null;
  voluntaryContribution: number | null;
  includeProtection: boolean;
  notes: string;
}

@Component({
  selector: 'app-nueva-oportunidad',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IconComponent, FormFieldComponent],
  templateUrl: './nueva-oportunidad.component.html',
  styleUrls: ['./nueva-oportunidad.component.scss']
})
export class NuevaOportunidadComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly flowContext = inject(FlowContextService);
  private readonly destroyRef = inject(DestroyRef);

  readonly steps: OpportunityStep[] = [
    {
      id: 0,
      label: 'Contexto',
      description: 'Define el mercado y tipo de cliente para recomendaciones inteligentes.'
    },
    {
      id: 1,
      label: 'Finanzas',
      description: 'Valida capacidad de pago y aportaciones voluntarias.'
    },
    {
      id: 2,
      label: 'Protección',
      description: 'Configura protección y observaciones antes de crear la oportunidad.'
    }
  ];

  readonly activeStep = signal(0);
  readonly isSubmitting = signal(false);
  readonly showValidationErrors = signal(false);

  readonly opportunityForm = this.fb.nonNullable.group({
    market: this.fb.nonNullable.control<string>('aguascalientes', Validators.required),
    flow: this.fb.nonNullable.control<string>('venta_plazo', Validators.required),
    clientType: this.fb.nonNullable.control<'individual' | 'colectivo'>('individual', Validators.required),
    clientName: this.fb.nonNullable.control('', [Validators.required, Validators.minLength(3)]),
    monthlyIncome: this.fb.control<number | null>(null, [Validators.required, Validators.min(0)]),
    voluntaryContribution: this.fb.control<number | null>(null, [Validators.min(0)]),
    includeProtection: this.fb.nonNullable.control(true),
    notes: this.fb.control('')
  });

  readonly summary = computed(() => {
    const value = this.opportunityForm.getRawValue();
    return {
      market: value.market,
      flow: value.flow,
      clientType: value.clientType,
      clientName: value.clientName,
      monthlyIncome: value.monthlyIncome,
      voluntaryContribution: value.voluntaryContribution,
      includeProtection: value.includeProtection,
      notes: value.notes?.trim() ?? ''
    } satisfies OpportunityDraft;
  });

  ngOnInit(): void {
    this.flowContext.setBreadcrumbs(['Dashboard', 'Nueva oportunidad']);

    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const patch: Partial<OpportunityDraft> = {};

        const market = params.get('market');
        if (market) {
          patch.market = market;
        }

        const flow = params.get('suggestedFlow') ?? params.get('preselectedFlow');
        if (flow) {
          patch.flow = flow;
        }

        const clientType = params.get('clientType');
        if (clientType === 'individual' || clientType === 'colectivo') {
          patch.clientType = clientType;
        }

        const clientName = params.get('clientName');
        if (clientName) {
          patch.clientName = clientName;
        }

        Object.entries(patch).forEach(([key, value]) => {
          const control = this.opportunityForm.get(key);
          if (control) {
            control.patchValue(value, { emitEvent: false });
          }
        });
      });

    this.opportunityForm.valueChanges
      .pipe(
        debounceTime(200),
        takeUntilDestroyed(),
        filter(() => this.opportunityForm.valid)
      )
      .subscribe(() => this.persistDraft());
  }

  goToStep(nextStep: number): void {
    if (nextStep < 0 || nextStep >= this.steps.length) {
      return;
    }

    if (nextStep > this.activeStep() && !this.isCurrentStepValid()) {
      this.showValidationErrors.set(true);
      this.opportunityForm.markAllAsTouched();
      return;
    }

    this.activeStep.set(nextStep);
  }

  next(): void {
    this.goToStep(this.activeStep() + 1);
  }

  previous(): void {
    this.goToStep(this.activeStep() - 1);
  }

  submit(): void {
    this.showValidationErrors.set(true);
    if (this.opportunityForm.invalid) {
      this.opportunityForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);

    const draft = this.summary();
    this.flowContext.saveContext('newOpportunityDraft', draft, {
      breadcrumbs: ['Dashboard', 'Nueva oportunidad'],
      persist: true
    });

    this.router.navigate(['/documentos'], {
      queryParams: {
        source: 'nueva-oportunidad',
        market: draft.market,
        clientType: draft.clientType,
        businessFlow: draft.flow,
        includeProtection: draft.includeProtection
      }
    });
  }

  trackStep(_: number, step: OpportunityStep): number {
    return step.id;
  }

  private isCurrentStepValid(): boolean {
    const controlsByStep = [
      ['market', 'flow', 'clientType', 'clientName'],
      ['monthlyIncome', 'voluntaryContribution'],
      ['includeProtection', 'notes']
    ];

    const stepControls = controlsByStep[this.activeStep()] ?? [];
    return stepControls.every(key => this.opportunityForm.get(key)?.valid ?? true);
  }

  private persistDraft(): void {
    this.flowContext.saveContext('newOpportunityDraft', this.summary(), {
      breadcrumbs: ['Dashboard', 'Nueva oportunidad'],
      ttlMs: 1000 * 60 * 30
    });
  }
}
