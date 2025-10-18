import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { IconComponent } from '@shared/icon/icon.component';
import { ChartDirective } from '@shared/chart.directive';
import { SummaryPanelComponent } from '@shared/summary-panel.component';
import { SkeletonCardComponent } from '@shared/skeleton-card.component';
import { EdomexIndividualStore, EdoMexIndividualConfig } from './edomex-individual.store';
import { SavingsScenario } from '@feature-services/simulador/simulador-engine.service';

@Component({
  selector: 'app-edomex-individual',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SummaryPanelComponent, SkeletonCardComponent, IconComponent, ChartDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './edomex-individual.component.scss',
  templateUrl: './edomex-individual.component.html'
})
export class EdomexIndividualComponent implements OnInit {
  configForm: FormGroup;

  readonly progressChartConfig = this.store.progressChartConfig;
  readonly distributionChartConfig = this.store.distributionChartConfig;

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
  }

  ngOnInit(): void {
    this.configForm.patchValue({
      targetDownPayment: 149800,
      currentPlateConsumption: 500,
      overpricePerLiter: 2.5,
      voluntaryMonthly: 0
    });
  }

  get scenario(): SavingsScenario | null {
    return this.store.scenario();
  }

  get isCalculating(): boolean {
    return this.store.isCalculating();
  }

  calculateScenario(): void {
    if (!this.configForm.valid) {
      return;
    }
    this.store.calculateScenario(this.normalizeConfig());
  }

  resetForm(): void {
    this.configForm.reset({
      targetDownPayment: 149800,
      currentPlateConsumption: 500,
      overpricePerLiter: 2.5,
      voluntaryMonthly: 0
    });
    this.store.resetScenario();
  }

  recalculate(): void {
    this.store.resetScenario();
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
