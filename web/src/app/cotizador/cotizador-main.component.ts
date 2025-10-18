import { CommonModule } from '@angular/common';
import { Component, ChangeDetectionStrategy, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { BusinessFlow, Client } from '@interfaces/types';
import { ClientType, Quote, SimulatorMode } from '@interfaces/business';
import { PolicyClientType, PolicyMarket } from '@feature-services/configuration/market-policy.service';
import { SavingsProjectionChartComponent } from '@shared/savings-projection-chart.component';
import { TandaTimelineComponent } from '@shared/tanda-timeline.component';
import { TandaMilestone } from '@interfaces/tanda';
import { IconComponent } from '@shared/icon/icon.component';
import { OfflineQueueBannerComponent } from '@shared/offline-queue-banner.component';
import { ToastService } from '@core-services/toast.service';
import { CotizadorStore, CollectionUnit } from './cotizador.store';

@Component({
  selector: 'app-cotizador-main',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, SavingsProjectionChartComponent, TandaTimelineComponent, OfflineQueueBannerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cotizador-main.component.html',
  styleUrls: ['./cotizador-main.component.scss'],
})
export class CotizadorMainComponent implements OnInit, OnChanges {
  private readonly store = inject(CotizadorStore);
  private readonly toast = inject(ToastService);

  private readonly marketLabels: Record<PolicyMarket, string> = {
    aguascalientes: 'Aguascalientes',
    edomex: 'EdoMex',
    otros: 'Otros mercados'
  };

  private readonly clientTypeLabels: Record<PolicyClientType, string> = {
    individual: 'Individual',
    colectivo: 'Colectivo'
  };

  protected readonly Math = Math;

  @Input() client?: Client;
  @Input() initialMode: SimulatorMode = 'acquisition';
  @Output() onFormalize = new EventEmitter<Quote | Event>();

  isProtectionDemoOpen = false;

  ngOnInit(): void {
    this.store.initialize(this.client, this.initialMode);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['client'] || changes['initialMode']) {
      this.store.initialize(this.client, this.initialMode);
    }
  }

  // --- Stepper helpers ---
  get currentStep(): number {
    return this.store.currentStep();
  }

  get totalSteps(): number {
    return this.store.totalSteps;
  }

  get progressPercentage(): number {
    return (this.currentStep / this.totalSteps) * 100;
  }

  nextStep(): void {
    this.store.nextStep();
  }

  previousStep(): void {
    this.store.previousStep();
  }

  goToStep(step: number): void {
    this.store.goToStep(step);
  }

  // --- Store-backed properties (getters/setters to keep template bindings) ---
  get market(): PolicyMarket | '' {
    return this.store.market();
  }

  set market(value: PolicyMarket | '') {
    this.store.setMarket(value);
  }

  get clientType(): PolicyClientType | '' {
    return this.store.clientType();
  }

  set clientType(value: PolicyClientType | '') {
    this.store.setClientType(value);
  }

  get marketOptions(): PolicyMarket[] {
    return this.store.marketOptions();
  }

  get clientTypeOptions(): PolicyClientType[] {
    return this.store.clientTypeOptions();
  }

  get pkg() {
    return this.store.pkg();
  }

  get isLoading(): boolean {
    return this.store.isLoading();
  }

  get selectedOptions(): Record<string, boolean> {
    return this.store.selectedOptions();
  }

  get downPaymentPercentage(): number {
    return this.store.downPaymentPercentage();
  }

  set downPaymentPercentage(value: number) {
    this.store.setDownPaymentPercentage(value);
  }

  get term(): number {
    return this.store.term();
  }

  set term(value: number) {
    this.store.setTerm(value);
  }

  get amortizationTable() {
    return this.store.amortizationTable();
  }

  get isAmortizationVisible(): boolean {
    return this.store.isAmortizationVisible();
  }

  get downPaymentAmountDirect(): string {
    return this.store.downPaymentAmountDirect();
  }

  set downPaymentAmountDirect(value: string) {
    this.store.setDownPaymentAmountDirect(value);
  }

  get initialDownPayment(): string {
    return this.store.initialDownPayment();
  }

  set initialDownPayment(value: string) {
    this.store.setInitialDownPayment(value);
  }

  get deliveryTerm(): number {
    return this.store.deliveryTerm();
  }

  set deliveryTerm(value: number) {
    this.store.setDeliveryTerm(value);
  }

  get voluntaryContribution(): string {
    return this.store.voluntaryContribution();
  }

  set voluntaryContribution(value: string) {
    this.store.setVoluntaryContribution(value);
  }

  get collectionUnits(): CollectionUnit[] {
    return this.store.collectionUnits();
  }

  get tandaMembers(): number {
    return this.store.tandaMembers();
  }

  set tandaMembers(value: number) {
    this.store.setTandaMembers(value);
  }

  get includeInsurance(): boolean {
    return this.store.includeInsurance();
  }

  set includeInsurance(value: boolean) {
    this.store.setIncludeInsurance(value);
  }

  get insuranceAmount(): string {
    return this.store.insuranceAmount();
  }

  set insuranceAmount(value: string) {
    this.store.setInsuranceAmount(value);
  }

  get insuranceMode(): 'financiado' | 'contado' {
    return this.store.insuranceMode();
  }

  set insuranceMode(value: 'financiado' | 'contado') {
    this.store.setInsuranceMode(value);
  }

  // --- Derived financial values ---
  get totalPrice(): number {
    return this.store.totalPrice();
  }

  get downPayment(): number {
    return this.store.downPayment();
  }

  get amountToFinance(): number {
    return this.store.amountToFinance();
  }

  get monthlyPayment(): number {
    return this.store.monthlyPayment();
  }

  get firstInterest(): number {
    return this.store.firstInterest();
  }

  get firstPrincipal(): number {
    return this.store.firstPrincipal();
  }

  get firstBalance(): number {
    return this.store.firstBalance();
  }

  get monthlySavings(): number {
    return this.store.monthlySavings();
  }

  get projectedCollectionSavings(): number {
    return this.store.projectedCollectionSavings();
  }

  get timeToGoal(): number {
    return this.store.timeToGoal();
  }

  // --- Actions ---
  onMarketChange(): void {
    this.store.setMarket(this.market);
  }

  onClientTypeChange(): void {
    this.store.setClientType(this.clientType);
  }

  onSavingsConfigChange(): void {
    this.store.persistFlowContextSnapshot('savings-config');
  }

  toggleComponent(componentId: string): void {
    this.store.toggleComponent(componentId);
  }

  addCollectionUnit(): void {
    this.store.addCollectionUnit();
  }

  updateCollectionUnit(id: number, patch: Partial<CollectionUnit>): void {
    this.store.updateCollectionUnit(id, patch);
  }

  removeCollectionUnit(id: number): void {
    this.store.removeCollectionUnit(id);
  }

  calculateAmortization(): void {
    this.store.calculateAmortization();
  }

  closeAmortization(): void {
    this.store.closeAmortization();
  }

  generateQuotePDF(): void {
    this.store.generatePDF();
  }

  handleFormalizeClick(): void {
    const pkg = this.pkg;
    const market = this.market;
    const clientType = this.clientType;

    if (!pkg || !market || !clientType) {
      this.toast.error('Completa la configuración antes de formalizar.');
      return;
    }

    const baseFlow = this.initialMode === 'savings' ? BusinessFlow.AhorroProgramado : (this.client?.flow ?? BusinessFlow.VentaPlazo);
    const flow = this.client?.flow === BusinessFlow.CreditoColectivo ? BusinessFlow.CreditoColectivo : baseFlow;

    const quote: Quote = {
      totalPrice: this.totalPrice,
      downPayment: this.downPayment,
      amountToFinance: this.amountToFinance,
      term: this.term,
      monthlyPayment: this.monthlyPayment,
      market,
      clientType: clientType as ClientType,
      flow
    };

    this.store.persistFlowContextSnapshot('formalize');
    this.onFormalize.emit(quote);
  }

  goBack(): void {
    this.store.goToDashboard();
  }


  get isVentaDirecta(): boolean {
    return this.store.isVentaDirecta();
  }

  onDownPaymentDirectChange(): void {
    this.store.setDownPaymentAmountDirect(this.downPaymentAmountDirect);
  }

  onDownPaymentSliderChange(): void {
    this.store.setDownPaymentPercentage(this.downPaymentPercentage);
  }

  onTermChange(): void {
    this.store.setTerm(this.term);
  }

  onTandaMembersChange(): void {
    this.store.setTandaMembers(this.tandaMembers);
  }

  openProtectionDemo(): void {
    this.isProtectionDemoOpen = true;
  }

  get tandaTimeline(): TandaMilestone[] {
    const pkg = this.pkg;
    const clientType = this.clientType;
    const initialMode = this.initialMode;

    if (!pkg || clientType !== 'colectivo' || initialMode !== 'savings' || this.totalPrice <= 0 || this.tandaMembers <= 0) {
      return [];
    }

    const downPaymentGoal = (pkg.minDownPaymentPercentage ?? 0) * this.totalPrice;
    const singleMemberMonthlySaving = this.monthlySavings;
    const individualAmountToFinance = this.totalPrice - downPaymentGoal;

    let individualMonthlyPayment = 0;
    if (individualAmountToFinance > 0 && pkg.rate > 0 && pkg.terms.length > 0) {
      const individualTerm = pkg.terms[0];
      const monthlyRate = pkg.rate / 12;
      individualMonthlyPayment = (individualAmountToFinance * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -individualTerm));
    }

    const totalGroupMonthlyIncome = this.tandaMembers * singleMemberMonthlySaving;
    const timeline: TandaMilestone[] = [];
    let accumulatedSavingsSurplus = 0;
    let membersPaying = 0;

    for (let i = 1; i <= this.tandaMembers; i++) {
      const currentMonthlyDebtPayment = membersPaying * individualMonthlyPayment;
      const netSavingsPerMonth = totalGroupMonthlyIncome - currentMonthlyDebtPayment;

      if (netSavingsPerMonth <= 0) {
        break;
      }

      const savingsNeeded = downPaymentGoal - accumulatedSavingsSurplus;
      const monthsToSave = savingsNeeded > 0 ? savingsNeeded / netSavingsPerMonth : 0;

      timeline.push({
        type: 'ahorro',
        duration: monthsToSave,
        label: `Ahorro para Enganche ${i}`,
        month: i,
        completed: false,
        current: i === 1,
        icon: 'credit-card',
        title: `Enganche ${i}`,
        description: `Acumulando ${this.formatCurrency(downPaymentGoal)} para la entrega`,
        amount: downPaymentGoal
      });

      timeline.push({
        type: 'entrega',
        unitNumber: i,
        duration: 0.1,
        label: `Entrega Unidad ${i}`,
        month: i,
        completed: false,
        current: false,
        icon: 'truck',
        title: `Entrega ${i}`,
        description: `Unidad #${i} entregada al grupo`
      });

      const totalSavingsGenerated = accumulatedSavingsSurplus + (monthsToSave * netSavingsPerMonth);
      accumulatedSavingsSurplus = totalSavingsGenerated - downPaymentGoal;
      membersPaying++;
    }

    return timeline;
  }

  formatCurrency(value: number): string {
    return this.store.formatCurrency(value);
  }

  get tandaLimits(): { min: number; max: number } {
    return this.store.tandaLimits();
  }

  get minDownPaymentRequired(): number {
    return this.store.minDownPaymentRequired();
  }

  get canGoPrevious(): boolean {
    return this.store.canGoPrevious();
  }

  get canGoNext(): boolean {
    return this.store.canGoNext();
  }

  getMarketLabel(option: PolicyMarket): string {
    return this.marketLabels[option] ?? option;
  }

  getClientTypeLabel(option: PolicyClientType): string {
    return this.clientTypeLabels[option] ?? option;
  }

  getDownPaymentPercentage(): number {
    const total = Math.max(this.totalPrice, 0);
    if (!total) {
      return 0;
    }
    const initialDown = this.toNumber(this.initialDownPayment) || this.downPayment;
    return Math.max(0, Math.min(100, (initialDown / total) * 100));
  }

  getSavedPercentage(): number {
    const total = Math.max(this.totalPrice, 0);
    if (!total) {
      return 0;
    }
    return Math.max(0, Math.min(100, (this.projectedCollectionSavings / total) * 100));
  }

  toNumber(value: any): number {
    const parsed = typeof value === 'number' ? value : parseFloat(value ?? '0');
    return Number.isFinite(parsed) ? parsed : 0;
  }
}
