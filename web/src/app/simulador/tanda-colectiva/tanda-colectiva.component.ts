import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { SummaryPanelComponent } from '@shared/summary-panel.component';
import { SkeletonCardComponent } from '@shared/skeleton-card.component';
import { IconComponent } from '@shared/icon/icon.component';
import { ChartDirective } from '@shared/chart.directive';
import { CollectiveScenarioConfig } from '@feature-services/simulador/simulador-engine.service';
import { TandaColectivaStore } from './tanda-colectiva.store';
import { DemoModeService } from '@core-services/demo-mode.service';
import { DemoSeedService } from '@services/demo/demo-seed.service';
import { DemoAnalyticsService } from '@services/demo/demo-analytics.service';
import { DemoTandaService } from '@services/demo/demo-tanda.service';

@Component({
  selector: 'app-tanda-colectiva',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, SummaryPanelComponent, SkeletonCardComponent, IconComponent, ChartDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tanda-colectiva.component.html',
  styleUrls: ['./tanda-colectiva.component.scss']
})
export class TandaColectivaComponent implements OnInit {
  readonly isSimulatingSignal = this.store.isSimulating;
  readonly simulationResultSignal = this.store.simulationResult;
  readonly groupSavingsChartConfig = this.store.groupSavingsChartConfig;
  readonly avgPmtChartConfig = this.store.avgPmtChartConfig;

  private readonly demoMode = inject(DemoModeService);
  private readonly demoSeeds = inject(DemoSeedService);
  private readonly demoAnalytics = inject(DemoAnalyticsService);
  private readonly demoTanda = inject(DemoTandaService);
  readonly isDemoMode = this.demoMode.isDemoMode;
  readonly activeDemoScenario = this.demoMode.activeScenario;
  readonly isTandaDemo = computed(() => this.isDemoMode() && this.activeDemoScenario() === 'tanda-colectiva');
  readonly demoScenarioSnapshot = computed(() => (this.isTandaDemo() ? this.demoSeeds.scenarioSnapshot('tanda-colectiva') : null));
  readonly demoGroup = computed(() => this.demoScenarioSnapshot()?.tandaGroup ?? null);
  readonly demoSchedule = computed(() => this.demoScenarioSnapshot()?.tandaSchedule ?? this.demoScenarioSnapshot()?.tandaGroup?.deliverySchedule ?? []);
  readonly demoMembers = computed(() => this.demoGroup()?.members ?? []);
  readonly demoMessage = signal<string | null>(null);
  private lastTrackedDemoScenario: string | null = null;
  private demoInitialized = false;

  configForm: FormGroup;

  constructor(
    private readonly fb: FormBuilder,
    private readonly store: TandaColectivaStore
  ) {
    this.configForm = this.fb.group({
      memberCount: [15, [Validators.required, Validators.min(5), Validators.max(50)]],
      unitPrice: [800000, [Validators.required, Validators.min(500000)]],
      avgConsumption: [500, [Validators.required, Validators.min(200)]],
      overpricePerLiter: [2.5, [Validators.required, Validators.min(0.5)]],
      voluntaryMonthly: [0, [Validators.min(0)]]
    });

    effect(() => {
      if (!this.isTandaDemo()) {
        this.lastTrackedDemoScenario = null;
        this.demoInitialized = false;
        this.demoMessage.set(null);
        return;
      }

      const scenarioId = this.activeDemoScenario();
      const group = this.demoGroup();
      if (!scenarioId || !group) {
        return;
      }

      if (this.lastTrackedDemoScenario !== scenarioId) {
        this.demoAnalytics.trackFlowStart({ scenario: scenarioId, feature: 'simulador', step: 'tanda-colectiva' });
        this.lastTrackedDemoScenario = scenarioId;
      }

      this.configForm.patchValue(
        {
          memberCount: group.totalMembers ?? 15,
          unitPrice: group.totalAmount ?? 800000,
          avgConsumption: group.monthlyAmount ?? 500,
          overpricePerLiter: 2.5,
          voluntaryMonthly: group.monthlyPaymentPerUnit ?? 0
        },
        { emitEvent: false }
      );

      if (!this.demoInitialized) {
        this.demoInitialized = true;
        void this.store.simulate(this.normalizeConfig());
      }

      this.demoMessage.set('Parámetros demo listos. Simula la tanda o lanza un sorteo para mostrar KPIs.');
    });
  }

  ngOnInit(): void {}

  get simulationResult() {
    return this.simulationResultSignal();
  }

  get isSimulating(): boolean {
    return this.isSimulatingSignal();
  }

  get groupSavingsChart() {
    return this.groupSavingsChartConfig() ?? undefined;
  }

  get avgPmtChart() {
    return this.avgPmtChartConfig() ?? undefined;
  }

  async simulateTanda(): Promise<void> {
    if (!this.configForm.valid || this.isSimulating) {
      return;
    }
    if (this.isTandaDemo()) {
      this.demoMessage.set('Simulando tanda demo...');
      this.demoAnalytics.track('tanda_simulation_requested', {
        scenario: this.activeDemoScenario(),
        members: this.configForm.get('memberCount')?.value || null
      });
    }
    await this.store.simulate(this.normalizeConfig());
    if (this.isTandaDemo()) {
      this.demoMessage.set('Simulación demo completada. Revisa los gráficos para explicar los resultados.');
    }
  }

  resetForm(): void {
    this.configForm.reset({
      memberCount: 15,
      unitPrice: 800000,
      avgConsumption: 500,
      overpricePerLiter: 2.5,
      voluntaryMonthly: 0
    });
    this.store.reset();
    this.demoInitialized = false;
    if (this.isTandaDemo()) {
      this.demoMessage.set('Formulario reiniciado. Usa "Cargar demo" para restaurar parámetros de capacitación.');
    }
  }

  goBack(): void {
    this.store.goBack();
  }

  generatePDF(): void {
    this.store.generatePdf(this.normalizeConfig());
  }

  loadDemoConfig(): void {
    if (!this.isTandaDemo()) {
      return;
    }
    const group = this.demoGroup();
    if (!group) {
      this.demoMessage.set('No hay configuración demo disponible.');
      return;
    }
    this.demoInitialized = false;
    this.configForm.patchValue(
      {
        memberCount: group.totalMembers ?? 15,
        unitPrice: group.totalAmount ?? 800000,
        avgConsumption: group.monthlyAmount ?? 500,
        overpricePerLiter: 2.5,
        voluntaryMonthly: group.monthlyPaymentPerUnit ?? 0
      },
      { emitEvent: false }
    );
    this.demoAnalytics.track('tanda_config_loaded', {
      scenario: this.activeDemoScenario(),
      members: group.totalMembers ?? null
    });
    this.demoMessage.set('Parámetros demo aplicados. Ejecuta simulación o sorteo para continuar.');
  }

  async simulateDemoSorteo(): Promise<void> {
    if (!this.isTandaDemo()) {
      return;
    }
    const result = await this.demoTanda.simulateSorteo();
    if (result) {
      const member = this.demoMembers().find(item => item.id === result.winnerId);
      this.demoMessage.set(`Sorteo demo ejecutado. Ganador: ${member?.name ?? result.winnerId}.`);
    }
    void this.store.simulate(this.normalizeConfig());
  }

  async markDemoPaymentMissed(memberId: string): Promise<void> {
    if (!this.isTandaDemo()) {
      return;
    }
    await this.demoTanda.markPaymentMissed(memberId);
    const member = this.demoMembers().find(item => item.id === memberId);
    this.demoMessage.set(`Pago faltante registrado para ${member?.name ?? memberId}.`);
    void this.store.simulate(this.normalizeConfig());
  }

  formatCurrency(value: number): string {
    return this.store.formatCurrency(value);
  }

  private normalizeConfig(): CollectiveScenarioConfig {
    const formValue = this.configForm.value;
    return {
      memberCount: Number(formValue.memberCount) || 0,
      unitPrice: Number(formValue.unitPrice) || 0,
      avgConsumption: Number(formValue.avgConsumption) || 0,
      overpricePerLiter: Number(formValue.overpricePerLiter) || 0,
      voluntaryMonthly: Number(formValue.voluntaryMonthly) || 0
    };
  }
}
