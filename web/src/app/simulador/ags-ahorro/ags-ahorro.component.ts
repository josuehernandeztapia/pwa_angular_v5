import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { IconComponent } from '@shared/icon/icon.component';
import { FormFieldComponent } from '@shared/form-field.component';
import { SkeletonCardComponent } from '@shared/skeleton-card.component';
import { SummaryPanelComponent } from '@shared/summary-panel.component';
import { ChartDirective } from '@shared/chart.directive';
import { AgsAhorroStore, AgsAhorroConfig } from './ags-ahorro.store';

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

  showProtectionDemo = false;

  constructor(
    private readonly fb: FormBuilder,
    private readonly router: Router,
    private readonly store: AgsAhorroStore
  ) {
    this.createForm();
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
    this.store.simulate(this.normalizeConfig());
  }

  proceedWithScenario(): void {
    this.store.proceedWithScenario();
  }

  resetSimulation(): void {
    this.store.resetScenario();
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
