import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, filter } from 'rxjs';
import { FlowContextService } from '@core-services/flow-context.service';
import { IconComponent } from '@shared/icon/icon.component';
import { FormFieldComponent } from '@shared/form-field.component';
import { MarketPolicyService, PolicyClientType, PolicyMarket } from '@feature-services/configuration/market-policy.service';

interface OpportunityStep {
  id: number;
  label: string;
  description: string;
}

type ClientType = 'individual' | 'colectivo';
type FlowValue = 'venta_plazo' | 'venta_directa' | 'ahorro_programado' | 'credito_colectivo';

interface OpportunityDraft {
  market: string;
  flow: FlowValue;
  clientType: ClientType;
  clientName: string;
  monthlyIncome: number | null;
  voluntaryContribution: number | null;
  includeProtection: boolean;
  notes: string;
}

interface ClientTypeOption {
  value: ClientType;
  label: string;
}

interface FlowOption {
  value: FlowValue;
  label: string;
  requiresIncome: boolean;
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
  private readonly marketPolicy = inject(MarketPolicyService, { optional: true });

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
    flow: this.fb.nonNullable.control<FlowValue>('venta_plazo', Validators.required),
    clientType: this.fb.nonNullable.control<ClientType>('individual', Validators.required),
    clientName: this.fb.nonNullable.control('', [Validators.required, Validators.minLength(3)]),
    monthlyIncome: this.fb.control<number | null>(null, [Validators.min(0)]),
    voluntaryContribution: this.fb.control<number | null>(null, [Validators.min(0)]),
    includeProtection: this.fb.nonNullable.control(true),
    notes: this.fb.control('')
  });

  private readonly clientTypeOptionsSignal = signal<ClientTypeOption[]>([]);
  readonly clientTypeOptions = this.clientTypeOptionsSignal.asReadonly();

  private readonly flowOptionsSignal = signal<FlowOption[]>([]);
  readonly flowOptions = this.flowOptionsSignal.asReadonly();

  private readonly incomeRequiredSignal = signal(true);
  readonly isIncomeRequired = this.incomeRequiredSignal.asReadonly();

  private readonly FLOW_LABELS: Record<FlowValue, string> = {
    venta_plazo: 'Venta a plazo',
    venta_directa: 'Venta directa',
    ahorro_programado: 'Ahorro programado',
    credito_colectivo: 'Crédito colectivo'
  } as const;

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

    this.initializeContextSubscriptions();

    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const patch: Partial<OpportunityDraft> = {};

        const market = params.get('market');
        if (market) {
          patch.market = this.normalizeMarketParam(market);
        }

        const flow = params.get('suggestedFlow') ?? params.get('preselectedFlow');
        if (flow) {
          const normalizedFlow = this.normalizeFlowParam(flow);
          if (normalizedFlow) {
            patch.flow = normalizedFlow;
          }
        }

        const clientType = params.get('clientType');
        if (clientType) {
          const normalizedType = this.normalizeClientTypeParam(clientType);
          if (normalizedType) {
            patch.clientType = normalizedType;
          }
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

        if (Object.keys(patch).length > 0) {
          this.syncClientTypeOptions(this.opportunityForm.controls.market.value);
          this.syncFlowOptions();
        }
      });

    this.opportunityForm.valueChanges
      .pipe(
        debounceTime(200),
        takeUntilDestroyed(),
        filter(() => this.opportunityForm.valid)
      )
      .subscribe(() => this.persistDraft());

    // Seed initial UI state once controls are ready
    this.syncClientTypeOptions(this.opportunityForm.controls.market.value);
    this.syncFlowOptions();
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

  trackClientTypeOption(_: number, option: ClientTypeOption): ClientType {
    return option.value;
  }

  trackFlowOption(_: number, option: FlowOption): FlowValue {
    return option.value;
  }

  getFlowLabel(flow: FlowValue): string {
    return this.FLOW_LABELS[flow] ?? flow;
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

  private initializeContextSubscriptions(): void {
    const marketControl = this.opportunityForm.controls.market;
    const clientTypeControl = this.opportunityForm.controls.clientType;
    const flowControl = this.opportunityForm.controls.flow;

    marketControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(market => {
        this.syncClientTypeOptions(market);
        this.syncFlowOptions();
      });

    clientTypeControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.syncFlowOptions());

    flowControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(flow => {
        if (flow) {
          this.updateMonthlyIncomeRequirement(flow);
        }
      });
  }

  private syncClientTypeOptions(selectedMarket: string): void {
    const options = this.resolveClientTypeOptions(selectedMarket);
    this.clientTypeOptionsSignal.set(options);

    const clientTypeControl = this.opportunityForm.controls.clientType;
    const currentValue = clientTypeControl.value;
    if (!options.some(option => option.value === currentValue)) {
      const fallback = options[0]?.value ?? 'individual';
      clientTypeControl.setValue(fallback, { emitEvent: false });
    }
  }

  private syncFlowOptions(): void {
    const market = this.opportunityForm.controls.market.value;
    const clientType = this.opportunityForm.controls.clientType.value;
    const options = this.resolveFlowOptions(market, clientType);
    this.flowOptionsSignal.set(options);

    const flowControl = this.opportunityForm.controls.flow;
    const currentFlow = flowControl.value;

    if (!options.some(option => option.value === currentFlow)) {
      const fallback = options[0]?.value ?? 'venta_plazo';
      if (currentFlow !== fallback) {
        flowControl.setValue(fallback, { emitEvent: false });
        this.updateMonthlyIncomeRequirement(fallback);
      }
    } else if (currentFlow) {
      this.updateMonthlyIncomeRequirement(currentFlow);
    }
  }

  private resolveClientTypeOptions(market: string): ClientTypeOption[] {
    const normalized = this.normalizePolicyMarket(market);
    const options: ClientTypeOption[] = [];

    let allowed: PolicyClientType[] = [];
    try {
      allowed = this.marketPolicy?.getClientTypesForMarket(normalized) ?? [];
    } catch {
      allowed = [];
    }

    const ensured = new Set<ClientType>();
    allowed.forEach(type => ensured.add(type));

    if (ensured.size === 0) {
      ensured.add('individual');
    }

    if (ensured.has('individual')) {
      options.push({ value: 'individual', label: 'Individual' });
    }

    if (ensured.has('colectivo')) {
      options.push({ value: 'colectivo', label: 'Colectivo' });
    }

    return options;
  }

  private resolveFlowOptions(market: string, clientType: ClientType): FlowOption[] {
    const matrix = this.getFlowMatrix();
    const normalizedMarket = this.normalizeMarketKey(market);
    const marketOptions = matrix[normalizedMarket] ?? matrix.otros;
    const options = marketOptions[clientType] ?? [];
    return options.map(option => ({ ...option }));
  }

  private updateMonthlyIncomeRequirement(flow: FlowValue): void {
    const options = this.flowOptionsSignal();
    const matched = options.find(option => option.value === flow);
    const requiresIncome = matched?.requiresIncome ?? (flow === 'venta_plazo' || flow === 'credito_colectivo');
    this.incomeRequiredSignal.set(requiresIncome);

    const control = this.opportunityForm.controls.monthlyIncome;
    const validators = requiresIncome ? [Validators.required, Validators.min(0)] : [Validators.min(0)];
    control.setValidators(validators);
    control.updateValueAndValidity({ emitEvent: false });
  }

  private normalizeFlowParam(raw: string): FlowValue | null {
    const normalized = this.sanitize(raw);
    switch (normalized) {
      case 'venta_plazo':
      case 'venta a plazo':
      case 'cotizacion':
      case 'quotation':
        return 'venta_plazo';
      case 'venta_directa':
      case 'venta directa':
      case 'contado':
        return 'venta_directa';
      case 'ahorro_programado':
      case 'ahorro programado':
      case 'simulacion':
        return 'ahorro_programado';
      case 'credito_colectivo':
      case 'credito colectivo':
      case 'colectivo':
      case 'tanda':
        return 'credito_colectivo';
      default:
        return null;
    }
  }

  private normalizeClientTypeParam(raw: string): ClientType | null {
    const normalized = this.sanitize(raw);
    if (normalized === 'individual') {
      return 'individual';
    }
    if (normalized === 'colectivo' || normalized === 'collective') {
      return 'colectivo';
    }
    return null;
  }

  private normalizeMarketParam(raw: string): string {
    const normalized = this.sanitize(raw);
    switch (normalized) {
      case 'aguascalientes':
      case 'ags':
        return 'aguascalientes';
      case 'edomex':
      case 'estado de mexico':
        return 'edomex';
      case 'cdmx':
      case 'ciudad de mexico':
        return 'cdmx';
      case 'otros':
      case 'other':
      case 'otros mercados':
        return 'otros';
      default:
        return 'aguascalientes';
    }
  }

  private normalizePolicyMarket(market: string): PolicyMarket {
    const normalized = this.sanitize(market);
    if (normalized === 'edomex') {
      return 'edomex';
    }
    if (normalized === 'aguascalientes') {
      return 'aguascalientes';
    }
    return 'otros';
  }

  private normalizeMarketKey(market: string): 'aguascalientes' | 'edomex' | 'otros' {
    const normalized = this.sanitize(market);
    if (normalized === 'aguascalientes') {
      return 'aguascalientes';
    }
    if (normalized === 'edomex') {
      return 'edomex';
    }
    return 'otros';
  }

  private sanitize(input: string): string {
    return input
      .normalize('NFD')
      .replace(/[^\w\s-]/g, '')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  private getFlowMatrix(): Record<'aguascalientes' | 'edomex' | 'otros', Record<ClientType, FlowOption[]>> {
    const baseIndividual: FlowOption[] = [
      { value: 'venta_plazo', label: this.FLOW_LABELS.venta_plazo, requiresIncome: true },
      { value: 'venta_directa', label: this.FLOW_LABELS.venta_directa, requiresIncome: false },
      { value: 'ahorro_programado', label: this.FLOW_LABELS.ahorro_programado, requiresIncome: false }
    ];

    const edomexIndividual: FlowOption[] = [
      { value: 'venta_plazo', label: this.FLOW_LABELS.venta_plazo, requiresIncome: true },
      { value: 'venta_directa', label: this.FLOW_LABELS.venta_directa, requiresIncome: false },
      { value: 'ahorro_programado', label: this.FLOW_LABELS.ahorro_programado, requiresIncome: false }
    ];

    const edomexCollective: FlowOption[] = [
      { value: 'credito_colectivo', label: this.FLOW_LABELS.credito_colectivo, requiresIncome: true }
    ];

    return {
      aguascalientes: {
        individual: baseIndividual,
        colectivo: []
      },
      edomex: {
        individual: edomexIndividual,
        colectivo: edomexCollective
      },
      otros: {
        individual: baseIndividual,
        colectivo: []
      }
    };
  }
}
