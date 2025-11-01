import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { IconComponent } from '@shared/icon/icon.component';
import { FormFieldComponent } from '@shared/form-field.component';
import { SkeletonCardComponent } from '@shared/skeleton-card.component';
import { SummaryPanelComponent } from '@shared/summary-panel.component';
import { ChartDirective } from '@shared/chart.directive';
import { AgsAhorroStore, AgsAhorroConfig } from './ags-ahorro.store';
import { DemoModeService } from '@core-services/demo-mode.service';
import { DemoAnalyticsService } from '@services/demo/demo-analytics.service';
import { DemoReestructuraEngine } from '@services/demo/demo-reestructura.engine';

@Component({
  selector: 'app-ags-ahorro',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, SummaryPanelComponent, SkeletonCardComponent, FormFieldComponent, IconComponent, ChartDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ags-ahorro.component.html',
  styleUrl: './ags-ahorro.component.scss'
})
export class AgsAhorroComponent implements OnInit {
  simuladorForm!: FormGroup;

  readonly plates = this.store.plates;
  readonly consumptions = this.store.consumptions;
  readonly scenarioSignal = this.store.scenario;
  readonly ahorroChartConfig = this.store.ahorroChartConfig;
  readonly pmtChartConfig = this.store.pmtChartConfig;
  readonly isSimulatingSignal = this.store.isSimulating;
  readonly viewMode = this.store.viewMode;
  readonly showAmortizationTable = this.store.showAmortizationTable;
  readonly amortizationTable = this.store.amortizationTable;
  readonly remainderAmount = this.store.remainderAmount;
  readonly displayTimeline = this.store.displayTimeline;
  readonly newPlateValue = this.store.newPlate;

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
  private demoInitialized = false;

  showProtectionDemo = false;

  constructor(
    private readonly fb: FormBuilder,
    private readonly router: Router,
    private readonly store: AgsAhorroStore
  ) {
    this.createForm();

    effect(() => {
      if (!this.isFinanzasDemo()) {
        this.lastTrackedDemoScenario = null;
        this.lastSimulatedDemoScenario = null;
        this.demoInitialized = false;
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
        this.demoAnalytics.trackFlowStart({ scenario: scenarioId, feature: 'simulador', step: 'ags-ahorro' });
        this.lastTrackedDemoScenario = trackerKey;
      }

      if (selected.config) {
        this.simuladorForm.patchValue(
          {
            unitValue: selected.config['unitValue'] ?? this.simuladorForm.get('unitValue')?.value,
            initialDownPayment: selected.config['initialDownPayment'] ?? this.simuladorForm.get('initialDownPayment')?.value,
            deliveryMonths: selected.config['deliveryMonths'] ?? this.simuladorForm.get('deliveryMonths')?.value,
            overpricePerLiter: selected.config['overpricePerLiter'] ?? this.simuladorForm.get('overpricePerLiter')?.value
          },
          { emitEvent: false }
        );
      }

      const canAutoSimulate = this.simuladorForm.valid && this.store.canSimulate();

      if (canAutoSimulate && this.lastSimulatedDemoScenario !== trackerKey) {
        this.demoMessage.set('Simulando escenario demo de ahorro...');
        this.lastSimulatedDemoScenario = trackerKey;
        this.demoInitialized = true;
        this.store.simulate(this.normalizeConfig());
        this.demoAnalytics.track('finanzas_autosimulated', {
          scenario: scenarioId,
          option: selected.id ?? 'default',
          feature: 'simulador-ags'
        });
        this.demoMessage.set(`Escenario demo activo: ${selected.title}. Ajusta parámetros o comparte el resumen con tu cliente.`);
      } else if (!canAutoSimulate) {
        this.demoMessage.set('Completa los datos del simulador para ejecutar la demo.');
        this.demoInitialized = false;
        this.lastSimulatedDemoScenario = null;
      } else if (selected.title) {
        this.demoMessage.set(`Escenario demo activo: ${selected.title}. Ajusta parámetros o comparte el resumen con tu cliente.`);
      }
    });
  }

  ngOnInit(): void {
    this.store.initializeDefaults();
  }

  get scenario() {
    return this.scenarioSignal();
  }

  get isSimulating(): boolean {
    return this.isSimulatingSignal();
  }

  get plateList(): string[] {
    return this.plates();
  }

  get consumptionList(): number[] {
    return this.consumptions();
  }

  get newPlate(): string {
    return this.newPlateValue();
  }

  get currentViewMode(): 'simple' | 'advanced' {
    return this.viewMode();
  }

  get isAmortizationVisible(): boolean {
    return this.showAmortizationTable();
  }

  get amortizationRows() {
    return this.amortizationTable();
  }

  get timeline() {
    return this.displayTimeline();
  }

  get ahorroChartConfigValue() {
    return this.ahorroChartConfig() ?? undefined;
  }

  get pmtChartConfigValue() {
    return this.pmtChartConfig() ?? undefined;
  }

  addPlate(): void {
    this.store.addPlate();
  }

  removePlate(index: number): void {
    this.store.removePlate(index);
  }

  updateConsumption(index: number, value: number): void {
    this.store.updateConsumption(index, Number(value));
  }

  handleConfigChange(): void {
    this.store.markConfigDirty();
  }

  simulateScenario(): void {
    if (!this.simuladorForm.valid || !this.store.canSimulate()) {
      return;
    }
    if (this.isFinanzasDemo()) {
      const selected = this.demoSelectedScenario();
      this.demoAnalytics.track('finanzas_simulation_requested', {
        scenario: this.activeDemoScenario(),
        option: selected?.id ?? null
      });
      this.demoMessage.set('Simulando escenario demo de ahorro...');
      this.lastSimulatedDemoScenario = `${this.activeDemoScenario()}|${selected?.id ?? 'default'}`;
    }
    this.store.simulate(this.normalizeConfig());
    if (this.isFinanzasDemo()) {
      const selected = this.demoSelectedScenario();
      const title = selected?.title ?? 'Escenario demo activo';
      this.demoMessage.set(`${title} recalculado. Usa PDF o compartir por WhatsApp para continuar la capacitación.`);
    }
  }

  proceedWithScenario(): void {
    this.store.proceedWithScenario();
  }

  resetSimulation(): void {
    this.store.resetScenario();
    if (this.isFinanzasDemo()) {
      this.demoInitialized = false;
      this.lastSimulatedDemoScenario = null;
      this.demoMessage.set('Simulación demo reiniciada. Ajusta los valores o selecciona otro escenario What-If.');
    }
  }

  async selectDemoScenario(optionId: string): Promise<void> {
    if (!this.isFinanzasDemo()) {
      return;
    }
    const current = this.demoSelectedScenario();
    if (current?.id === optionId || this.isApplyingDemoScenario()) {
      return;
    }
    this.isApplyingDemoScenario.set(true);
    try {
      this.demoMessage.set('Aplicando escenario demo...');
      this.demoAnalytics.track('finance_scenario_selected', {
        scenario: 'finanzas-whatif',
        option: optionId,
        feature: 'simulador-ags'
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
      this.resetSimulation();
      this.lastSimulatedDemoScenario = null;
      this.demoAnalytics.track('scenario_reset', { scenario: scenarioId, feature: 'simulador-ags' });
      this.demoMessage.set('Escenario demo restablecido. Ejecuta o ajusta parámetros para continuar.');
    } finally {
      this.isApplyingDemoScenario.set(false);
    }
  }

  goBack(): void {
    this.router.navigate(['/']);
  }

  generatePDF(): void {
    this.store.generatePdf();
  }

  saveDraft(): void {
    this.store.saveDraft();
  }

  calculateAmortization(): void {
    this.store.calculateAmortization();
  }

  toggleViewMode(): void {
    this.store.toggleViewMode();
  }

  shareWhatsApp(): void {
    this.store.shareWhatsApp();
  }

  speakSummary(): void {
    this.store.speakSummary();
  }

  formatCurrency(value: number): string {
    return this.store.formatCurrency(value);
  }

  setNewPlate(value: string): void {
    this.store.setNewPlate(value);
  }

  closeAmortization(): void {
    this.store.showAmortizationTable.set(false);
  }

  canSimulate(): boolean {
    return this.simuladorForm.valid && this.store.canSimulate();
  }

  private createForm(): void {
    this.simuladorForm = this.fb.group({
      unitValue: [799000, [Validators.required, Validators.min(700000)]],
      initialDownPayment: [400000, [Validators.required, Validators.min(0)]],
      deliveryMonths: [6, Validators.required],
      overpricePerLiter: [5.0, [Validators.required, Validators.min(1)]]
    });
  }

  private normalizeConfig(): AgsAhorroConfig {
    const formValue = this.simuladorForm.value;
    return {
      unitValue: Number(formValue.unitValue) || 0,
      initialDownPayment: Number(formValue.initialDownPayment) || 0,
      deliveryMonths: Number(formValue.deliveryMonths) || 0,
      overpricePerLiter: Number(formValue.overpricePerLiter) || 0
    };
  }
}
