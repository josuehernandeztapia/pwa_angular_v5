import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { SummaryPanelComponent } from '@shared/summary-panel.component';
import { SkeletonCardComponent } from '@shared/skeleton-card.component';
import { IconComponent } from '@shared/icon/icon.component';
import { ChartDirective } from '@shared/chart.directive';
import { CollectiveScenarioConfig } from '@feature-services/simulador/simulador-engine.service';
import { TandaColectivaStore } from './tanda-colectiva.store';

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
    await this.store.simulate(this.normalizeConfig());
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
  }

  goBack(): void {
    this.store.goBack();
  }

  generatePDF(): void {
    this.store.generatePdf(this.normalizeConfig());
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
