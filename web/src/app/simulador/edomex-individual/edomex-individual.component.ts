import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectionStrategy, DestroyRef, inject, computed, effect, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { IconComponent } from '@shared/icon/icon.component';
import { ChartDirective } from '@shared/chart.directive';
import { SummaryPanelComponent } from '@shared/summary-panel.component';
import { SkeletonCardComponent } from '@shared/skeleton-card.component';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime } from 'rxjs/operators';
import { EdomexIndividualStore, EdoMexIndividualConfig } from './edomex-individual.store';
import { SavingsScenario } from '@feature-services/simulador/simulador-engine.service';
import { PolicyHintPipe } from '@shared/policy-hint.pipe';
import { BusinessFlow } from '@interfaces/types';
import { DemoModeService } from '@core-services/demo-mode.service';
import { DemoAnalyticsService } from '@services/demo/demo-analytics.service';
import { DemoReestructuraEngine } from '@services/demo/demo-reestructura.engine';

@Component({
  selector: 'app-edomex-individual',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SummaryPanelComponent, SkeletonCardComponent, IconComponent, ChartDirective, PolicyHintPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './edomex-individual.component.scss',
  templateUrl: './edomex-individual.component.html'
})
export class EdomexIndividualComponent implements OnInit {
  configForm: FormGroup;
  private readonly destroyRef = inject(DestroyRef);

  readonly policyContext = {
    market: 'edomex' as const,
    clientType: 'individual' as const,
    saleType: 'financiero' as const,
    businessFlow: BusinessFlow.AhorroProgramado
  };

  readonly progressChartConfig = this.store.progressChartConfig;
  readonly distributionChartConfig = this.store.distributionChartConfig;
  private readonly demoMode = inject(DemoModeService);
  private readonly demoAnalytics = inject(DemoAnalyticsService);
  private readonly demoReestructura = inject(DemoReestructuraEngine);
  readonly isDemoMode = this.demoMode.isDemoMode;
  readonly activeDemoScenario = this.demoMode.activeScenario;
  readonly isFinanzasDemo = computed(() => this.isDemoMode() && this.activeDemoScenario() === 'finanzas-whatif');
  readonly demoFinanceScenarioSet = computed(() => {
    if (!this.isFinanzasDemo()) {
      return null;
    }
    const snapshot = this.demoMode.activeScenarioState();
    return snapshot?.financeScenarios ?? null;
  });
  readonly demoSelectedScenario = computed(() => {
    const set = this.demoFinanceScenarioSet();
    if (!set) {
      return null;
    }
    const selectedId = set.baseScenarioId ?? set.scenarios[0]?.id ?? null;
    return set.scenarios.find(option => option.id === selectedId) ?? null;
  });

  readonly demoMessage = signal<string | null>(null);
  readonly isApplyingDemoScenario = signal(false);
  private lastTrackedDemoScenario: string | null = null;
  private lastSimulatedDemoScenario: string | null = null;

  get progressChart() {
    return this.progressChartConfig() ?? undefined;
  }

  get distributionChart() {
    return this.distributionChartConfig() ?? undefined;
  }

  readonly asideActions = [
    { label: 'PDF', click: () => this.generatePDF() },
    { label: 'Crear Cliente', click: () => this.proceedToClientCreation() }
  ];

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private store: EdomexIndividualStore
  ) {
    this.configForm = this.fb.group({
      targetDownPayment: [149800, [Validators.required, Validators.min(50000)]],
      currentPlateConsumption: [500, [Validators.required, Validators.min(100)]],
      overpricePerLiter: [2.5, [Validators.required, Validators.min(0.5)]],
      voluntaryMonthly: [0, [Validators.min(0)]]
    });

    effect(() => {
      if (!this.isFinanzasDemo()) {
        this.lastTrackedDemoScenario = null;
        this.lastSimulatedDemoScenario = null;
        this.demoMessage.set(null);
        return;
      }

      const scenarioId = this.activeDemoScenario();
      const selected = this.demoSelectedScenario();
      if (!scenarioId || !selected) {
        return;
      }

      const trackerKey = `${scenarioId}|${selected.id ?? 'default'}`;
      if (this.lastTrackedDemoScenario !== trackerKey) {
        this.demoAnalytics.trackFlowStart({ scenario: scenarioId, feature: 'simulador', step: 'edomex-individual' });
        this.lastTrackedDemoScenario = trackerKey;
      }

      if (selected.config) {
        this.configForm.patchValue(
          {
            targetDownPayment: selected.config['targetDownPayment'] ?? this.configForm.get('targetDownPayment')?.value,
            currentPlateConsumption: selected.config['currentPlateConsumption'] ?? this.configForm.get('currentPlateConsumption')?.value,
            overpricePerLiter: selected.config['overpricePerLiter'] ?? this.configForm.get('overpricePerLiter')?.value,
            voluntaryMonthly: selected.config['voluntaryMonthly'] ?? this.configForm.get('voluntaryMonthly')?.value
          },
          { emitEvent: false }
        );
      }

      if (this.configForm.valid && this.lastSimulatedDemoScenario !== trackerKey) {
        this.demoMessage.set('Simulando escenario demo EdoMex...');
        this.lastSimulatedDemoScenario = trackerKey;
        this.store.calculateScenario(this.normalizeConfig());
        this.demoAnalytics.track('finanzas_autosimulated', {
          scenario: scenarioId,
          option: selected.id ?? 'default',
          feature: 'simulador-edomex'
        });
        this.demoMessage.set(`Escenario demo activo: ${selected.title}. Ajusta parámetros o comparte el resumen con tu cliente.`);
      } else if (!this.configForm.valid) {
        this.demoMessage.set('Completa los campos obligatorios para ejecutar la demo.');
        this.lastSimulatedDemoScenario = null;
      } else if (selected.title) {
        this.demoMessage.set(`Escenario demo activo: ${selected.title}. Ajusta parámetros o comparte el resumen con tu cliente.`);
      }
    });
  }

  ngOnInit(): void {
    this.configForm.patchValue({
      targetDownPayment: 149800,
      currentPlateConsumption: 500,
      overpricePerLiter: 2.5,
      voluntaryMonthly: 0
    });

    this.configForm.valueChanges
      .pipe(
        debounceTime(300),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        if (this.configForm.valid) {
          if (this.isFinanzasDemo()) {
            const scenarioId = this.activeDemoScenario();
            const selected = this.demoSelectedScenario();
            this.demoAnalytics.track('finanzas_autoupdate', {
              scenario: scenarioId,
              option: selected?.id ?? null,
              feature: 'simulador-edomex'
            });
            if (scenarioId) {
              this.lastSimulatedDemoScenario = `${scenarioId}|${selected?.id ?? 'default'}`;
            }
            this.demoMessage.set('Actualizando escenario demo con los nuevos valores...');
          }
          this.store.calculateScenario(this.normalizeConfig());
          if (this.isFinanzasDemo()) {
            const title = this.demoSelectedScenario()?.title ?? 'Escenario demo activo';
            this.demoMessage.set(`${title} recalculado. Usa los KPIs para narrar el caso.`);
          }
        } else {
          this.store.resetScenario();
          if (this.isFinanzasDemo()) {
            this.demoMessage.set('Completa la información requerida para reactivar la demo.');
            this.lastSimulatedDemoScenario = null;
          }
        }
      });

    if (this.configForm.valid && !this.isFinanzasDemo()) {
      this.store.calculateScenario(this.normalizeConfig());
    }
  }

  get scenario(): SavingsScenario | null {
    return this.store.scenario();
  }

  get isCalculating(): boolean {
    return this.store.isCalculating();
  }

  calculateScenario(): void {
    if (!this.configForm.valid) {
      this.store.resetScenario();
      return;
    }
    if (this.isFinanzasDemo()) {
      const scenarioId = this.activeDemoScenario();
      const selected = this.demoSelectedScenario();
      this.demoAnalytics.track('finanzas_simulation_requested', {
        scenario: scenarioId,
        option: selected?.id ?? null,
        feature: 'simulador-edomex'
      });
      this.demoMessage.set('Simulando escenario demo EdoMex...');
      if (scenarioId) {
        this.lastSimulatedDemoScenario = `${scenarioId}|${selected?.id ?? 'default'}`;
      }
    }
    this.store.calculateScenario(this.normalizeConfig());
    if (this.isFinanzasDemo()) {
      const title = this.demoSelectedScenario()?.title ?? 'Escenario demo activo';
      this.demoMessage.set(`${title} recalculado. Usa el resultado para reforzar la conversación.`);
    }
  }

  resetForm(): void {
    this.configForm.reset({
      targetDownPayment: 149800,
      currentPlateConsumption: 500,
      overpricePerLiter: 2.5,
      voluntaryMonthly: 0
    });
    this.store.resetScenario();
    if (this.isFinanzasDemo()) {
      this.lastSimulatedDemoScenario = null;
      this.demoMessage.set('Formulario restablecido. Ajusta valores o aplica otro escenario demo.');
    }
  }

  recalculate(): void {
    this.store.resetScenario();
    if (this.isFinanzasDemo()) {
      this.lastSimulatedDemoScenario = null;
      this.demoMessage.set('Escenario demo reiniciado. Ejecuta nuevamente la simulación para continuar.');
    }
  }

  async selectDemoScenario(optionId: string): Promise<void> {
    if (!this.isFinanzasDemo() || this.isApplyingDemoScenario()) {
      return;
    }
    const current = this.demoSelectedScenario();
    if (current?.id === optionId) {
      return;
    }
    this.isApplyingDemoScenario.set(true);
    try {
      this.demoMessage.set('Aplicando escenario demo...');
      this.demoAnalytics.track('finance_scenario_selected', {
        scenario: 'finanzas-whatif',
        option: optionId,
        feature: 'simulador-edomex'
      });
      await this.demoReestructura.applyWhatIf(optionId);
    } finally {
      this.isApplyingDemoScenario.set(false);
    }
  }

  async resetDemoScenario(): Promise<void> {
    if (!this.isFinanzasDemo() || this.isApplyingDemoScenario()) {
      return;
    }
    this.isApplyingDemoScenario.set(true);
    try {
      const scenarioId = 'finanzas-whatif';
      this.demoMessage.set('Reiniciando escenario demo...');
      this.demoMode.resetScenario(scenarioId);
      await this.demoReestructura.resetFinanceScenario(scenarioId);
      this.store.resetScenario();
      this.lastSimulatedDemoScenario = null;
      this.demoAnalytics.track('scenario_reset', { scenario: scenarioId, feature: 'simulador-edomex' });
      this.demoMessage.set('Escenario demo restablecido. Ejecuta la simulación base para continuar.');
    } finally {
      this.isApplyingDemoScenario.set(false);
    }
  }

  proceedToClientCreation(): void {
    if (!this.scenario) {
      return;
    }
    this.store.proceedToClientCreation(this.normalizeConfig());
  }

  goBack(): void {
    this.router.navigate(['/simuladores']);
  }

  generatePDF(): void {
    this.store.generatePDF(this.normalizeConfig());
  }

  saveDraft(): void {
    this.store.saveDraft(this.normalizeConfig());
  }

  formatCurrency(value: number): string {
    return this.store.formatCurrency(value);
  }

  // Helper method to check if a form control has errors
  hasControlError(controlName: string): boolean {
    const control = this.configForm.get(controlName);
    return Boolean(control && control.invalid && (control.dirty || control.touched));
  }

  showControlError(controlName: string, errorKey: string): boolean {
    const control = this.configForm.get(controlName);
    return Boolean(
      control &&
      control.hasError(errorKey) &&
      (control.dirty || control.touched)
    );
  }

  private normalizeConfig(): EdoMexIndividualConfig {
    const formValue = this.configForm.value;
    return {
      targetDownPayment: Number(formValue.targetDownPayment) || 0,
      currentPlateConsumption: Number(formValue.currentPlateConsumption) || 0,
      overpricePerLiter: Number(formValue.overpricePerLiter) || 0,
      voluntaryMonthly: Number(formValue.voluntaryMonthly) || 0
    };
  }
}
