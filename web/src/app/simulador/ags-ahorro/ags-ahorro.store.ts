import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ChartConfiguration } from 'chart.js';
import { ToastService } from '@core-services/toast.service';
import { PdfExportService } from '@feature-services/documents/pdf-export.service';
import { SavingsScenario, SimuladorEngineService } from '@feature-services/simulador/simulador-engine.service';
import { DesignTokensService } from '@core-services/design-tokens.service';
import { SpeechService } from '@feature-services/avi/speech.service';
import { SimuladorStore } from '../simulador.store';

export interface AgsAhorroConfig {
  unitValue: number;
  initialDownPayment: number;
  deliveryMonths: number;
  overpricePerLiter: number;
}

export interface AgsAmortizationRow {
  paymentNumber: number;
  monthlyPayment: number;
  principal: number;
  interest: number;
  balance: number;
}

@Injectable({ providedIn: 'root' })
export class AgsAhorroStore {
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly pdfExport = inject(PdfExportService);
  private readonly simuladorEngine = inject(SimuladorEngineService);
  private readonly tokensService = inject(DesignTokensService);
  private readonly speechService = inject(SpeechService);
  private readonly simuladorHubStore = inject(SimuladorStore);

  readonly plates = signal<string[]>([]);
  readonly consumptions = signal<number[]>([]);
  readonly scenario = signal<SavingsScenario | null>(null);
  readonly isSimulating = signal(false);
  readonly ahorroChartConfig = signal<ChartConfiguration<'line'> | undefined>(undefined);
  readonly pmtChartConfig = signal<ChartConfiguration<'doughnut'> | undefined>(undefined);
  readonly newPlate = signal('');
  readonly viewMode = signal<'simple' | 'advanced'>('simple');
  readonly showAmortizationTable = signal(false);
  readonly amortizationTable = signal<AgsAmortizationRow[]>([]);
  readonly lastConfig = signal<AgsAhorroConfig | null>(null);

  readonly canSimulate = computed(() => {
    return this.plates().length > 0 &&
      this.consumptions().every(value => Number(value) > 0) &&
      !this.isSimulating();
  });

  readonly remainderAmount = computed(() => {
    const scenario = this.scenario();
    const config = this.lastConfig();
    if (!scenario || !config) {
      return 0;
    }
    const totalProjected = config.initialDownPayment + (scenario.monthlyContribution * scenario.monthsToTarget);
    return Math.max(0, scenario.targetAmount - totalProjected);
  });

  readonly displayTimeline = computed(() => this.scenario()?.timeline.slice(0, 8) ?? []);

  initializeDefaults(): void {
    if (this.plates().length === 0) {
      this.plates.set(['ABC-1234']);
      this.consumptions.set([2500]);
    }
  }

  setNewPlate(value: string): void {
    this.newPlate.set(value.toUpperCase());
  }

  addPlate(): void {
    const value = this.newPlate().trim();
    if (!value) {
      return;
    }
    this.plates.set([...this.plates(), value]);
    this.consumptions.set([...this.consumptions(), 2500]);
    this.newPlate.set('');
    this.clearScenario();
  }

  removePlate(index: number): void {
    const plates = [...this.plates()];
    const consumptions = [...this.consumptions()];
    if (index < 0 || index >= plates.length) {
      return;
    }
    plates.splice(index, 1);
    consumptions.splice(index, 1);
    this.plates.set(plates);
    this.consumptions.set(consumptions);
    this.clearScenario();
  }

  updateConsumption(index: number, value: number): void {
    const consumptions = [...this.consumptions()];
    if (index < 0 || index >= consumptions.length) {
      return;
    }
    consumptions[index] = Number(value) || 0;
    this.consumptions.set(consumptions);
    this.clearScenario();
  }

  markConfigDirty(): void {
    this.clearScenario();
  }

  simulate(config: AgsAhorroConfig): void {
    if (!this.canSimulate()) {
      return;
    }

    try {
      this.isSimulating.set(true);
      const scenario = this.simuladorEngine.generateAGSLiquidationScenario(
        config.initialDownPayment,
        config.deliveryMonths,
        this.plates(),
        this.consumptions(),
        config.overpricePerLiter,
        config.unitValue
      );

      this.lastConfig.set(config);
      this.scenario.set(scenario);
      this.toast.success('Escenario AGS simulado exitosamente');
      this.hydrateCharts(scenario);
    } catch (error) {
      this.toast.error('Error al simular escenario AGS');
    } finally {
      this.isSimulating.set(false);
    }
  }

  resetScenario(): void {
    this.scenario.set(null);
    this.ahorroChartConfig.set(undefined);
    this.pmtChartConfig.set(undefined);
    this.amortizationTable.set([]);
    this.showAmortizationTable.set(false);
  }

  proceedWithScenario(): void {
    const scenario = this.scenario();
    if (!scenario) {
      return;
    }
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('agsScenario', JSON.stringify(scenario));
    }
    this.toast.success('Escenario guardado, creando cliente...');
    this.router.navigate(['/clientes/nuevo'], {
      queryParams: {
        fromSimulator: 'ags-ahorro',
        market: 'aguascalientes',
        flow: 'AhorroProgramado'
      }
    });
  }

  generatePdf(): void {
    const scenario = this.scenario();
    const config = this.lastConfig();
    if (!scenario || !config) {
      this.toast.error('Primero ejecuta la simulación');
      return;
    }

    const scenarioData = {
      targetAmount: scenario.targetAmount,
      monthsToTarget: scenario.monthsToTarget,
      monthlyContribution: scenario.monthlyContribution,
      projectedBalance: scenario.projectedBalance,
      timeline: scenario.timeline,
      plates: this.plates(),
      consumptions: this.consumptions(),
      overpricePerLiter: config.overpricePerLiter,
      remainderAmount: this.remainderAmount()
    };

    this.pdfExport.generateAGSSavingsPDF(scenarioData)
      .then(blob => {
        const filename = `simulacion-ags-ahorro-${new Date().getTime()}.pdf`;
        this.pdfExport.downloadPDF(blob, filename);
        this.toast.success('PDF de simulación descargado');
      })
      .catch(() => this.toast.error('Error al generar PDF'));
  }

  saveDraft(): void {
    const scenario = this.scenario();
    const config = this.lastConfig();
    if (!scenario || !config) {
      this.toast.error('Primero ejecuta la simulación');
      return;
    }

    const draftKey = `agsScenario-${Date.now()}-draft`;
    const draft = {
      clientName: '',
      market: 'aguascalientes',
      clientType: 'Individual',
      timestamp: Date.now(),
      scenario: {
        targetAmount: scenario.targetAmount,
        monthsToTarget: scenario.monthsToTarget,
        monthlyContribution: scenario.monthlyContribution
      },
      configParams: {
        unitValue: config.unitValue,
        initialDownPayment: config.initialDownPayment,
        deliveryMonths: config.deliveryMonths,
        plates: this.plates(),
        consumptions: this.consumptions(),
        overpricePerLiter: config.overpricePerLiter
      }
    };

    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(draftKey, JSON.stringify(draft));
      }
      this.toast.success('Simulación guardada');
      this.simuladorHubStore.refreshSavedSimulations();
    } catch {
      this.toast.error('No se pudo guardar la simulación');
    }
  }

  calculateAmortization(): void {
    const scenario = this.scenario();
    const remainder = this.remainderAmount();
    if (!scenario || remainder <= 0) {
      this.toast.info('No hay monto a financiar para calcular amortización');
      return;
    }

    const annualRate = 0.255;
    const term = 24;
    const monthlyRate = annualRate / 12;
    const monthlyPayment = (remainder * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -term));

    const rows: AgsAmortizationRow[] = [];
    let balance = remainder;

    for (let i = 1; i <= term; i++) {
      const interest = balance * monthlyRate;
      const principal = monthlyPayment - interest;
      balance = Math.max(0, balance - principal);
      rows.push({
        paymentNumber: i,
        monthlyPayment,
        principal,
        interest,
        balance
      });
    }

    this.amortizationTable.set(rows);
    this.showAmortizationTable.set(true);
    this.toast.success('Tabla de amortización calculada');
  }

  toggleViewMode(): void {
    this.viewMode.set(this.viewMode() === 'simple' ? 'advanced' : 'simple');
  }

  shareWhatsApp(): void {
    const scenario = this.scenario();
    const config = this.lastConfig();
    if (!scenario || !config || typeof window === 'undefined') {
      return;
    }

    const message = this.buildWhatsAppMessage(scenario, config);
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
  }

  speakSummary(): void {
    const scenario = this.scenario();
    const config = this.lastConfig();
    if (!scenario || !config) {
      return;
    }

    const text = `Simulación de ahorro AGS completada. ` +
      `Tu meta es ${this.formatCurrency(scenario.targetAmount)}. ` +
      `Con tu enganche inicial de ${this.formatCurrency(config.initialDownPayment)} ` +
      `y ahorrando ${this.formatCurrency(scenario.monthlyContribution)} pesos mensuales, ` +
      `lograrás tu objetivo en ${scenario.monthsToTarget} meses. ` +
      `Quedaría un remanente de ${this.formatCurrency(this.remainderAmount())} pesos para liquidar.`;

    this.speechService.speak(text);
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value || 0);
  }

  private hydrateCharts(scenario: SavingsScenario): void {
    if (!scenario) {
      this.ahorroChartConfig.set(undefined);
      this.pmtChartConfig.set(undefined);
      return;
    }

    const months = Array.from({ length: scenario.monthsToTarget }, (_, i) => i + 1);
    const projectedData = scenario.projectedBalance || [];
    const tokens = this.tokensService.tokens;
    const primary = this.tokensService.dataColor('primary');

    const ahorroConfig: ChartConfiguration<'line'> = {
      type: 'line',
      data: {
        labels: months,
        datasets: [{
          label: 'Ahorro Acumulado',
          data: projectedData,
          borderColor: primary,
          backgroundColor: this.withAlpha(primary, 0.1),
          borderWidth: 2,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: 'Proyección de Ahorro Mensual',
            font: { size: 14, weight: 600 },
            color: tokens.color.text.primary
          }
        },
        scales: {
          x: {
            title: { display: true, text: 'Mes', color: tokens.color.text.secondary },
            grid: { color: tokens.color.border }
          },
          y: {
            title: { display: true, text: 'Monto ($)', color: tokens.color.text.secondary },
            grid: { color: tokens.color.border },
            ticks: {
              callback: (value: number | string) => this.formatCurrency(Number(value))
            }
          }
        }
      }
    };

    const remainder = this.remainderAmount();
    const totalSaved = scenario.monthlyContribution * scenario.monthsToTarget;

    const pmtConfig: ChartConfiguration<'doughnut'> = {
      type: 'doughnut',
      data: {
        labels: ['Ahorro Programado', 'Remanente a Financiar'],
        datasets: [{
          data: [totalSaved, remainder],
          backgroundColor: [
            tokens.color.text.primary,
            tokens.color.text.secondary
          ],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              usePointStyle: true,
              color: tokens.color.text.secondary
            }
          }
        }
      }
    };

    this.ahorroChartConfig.set(ahorroConfig);
    this.pmtChartConfig.set(pmtConfig);
  }

  private clearScenario(): void {
    if (this.scenario()) {
      this.resetScenario();
    }
  }

  private withAlpha(color: string, alpha: number): string {
    const hex = color.replace('#', '');
    const bigint = parseInt(hex, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  private buildWhatsAppMessage(scenario: SavingsScenario, config: AgsAhorroConfig): string {
    return `*Simulación AGS Ahorro Programado*\n\n` +
      `*Resumen del Plan:*\n` +
      `• Meta: ${this.formatCurrency(scenario.targetAmount)}\n` +
      `• Enganche inicial: ${this.formatCurrency(config.initialDownPayment)}\n` +
      `• Ahorro mensual: ${this.formatCurrency(scenario.monthlyContribution)}\n` +
      `• Tiempo estimado: ${scenario.monthsToTarget} meses\n` +
      `• Remanente a liquidar: ${this.formatCurrency(this.remainderAmount())}\n\n` +
      `*Placas incluidas:* ${this.plates().join(', ')}\n` +
      `*Sobreprecio por litro:* ${this.formatCurrency(config.overpricePerLiter)}\n\n` +
      `¿Te interesa formalizar este plan? ¡Contáctanos!`;
  }
}
