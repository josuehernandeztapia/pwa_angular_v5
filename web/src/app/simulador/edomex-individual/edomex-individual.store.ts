import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ChartConfiguration } from 'chart.js';
import { timer } from 'rxjs';
import { finalize, tap } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LoadingService } from '@core-services/loading.service';
import { ToastService } from '@core-services/toast.service';
import { PdfExportService } from '@feature-services/documents/pdf-export.service';
import { FinancialCalculatorService } from '@feature-services/cotizador/financial-calculator.service';
import { DesignTokensService } from '@core-services/design-tokens.service';
import { SavingsScenario, SimuladorEngineService } from '@feature-services/simulador/simulador-engine.service';
import { SimuladorStore } from '../simulador.store';

export interface EdoMexIndividualConfig {
  targetDownPayment: number;
  currentPlateConsumption: number;
  overpricePerLiter: number;
  voluntaryMonthly: number;
}

interface ChartBundle {
  progress: ChartConfiguration<'line'>;
  distribution: ChartConfiguration<'doughnut'>;
}

@Injectable({ providedIn: 'root' })
export class EdomexIndividualStore {
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly loadingService = inject(LoadingService);
  private readonly toast = inject(ToastService);
  private readonly pdfExportService = inject(PdfExportService);
  private readonly financialCalc = inject(FinancialCalculatorService);
  private readonly tokensService = inject(DesignTokensService);
  private readonly simuladorEngine = inject(SimuladorEngineService);
  private readonly simuladorHubStore = inject(SimuladorStore);

  readonly scenario = signal<SavingsScenario | null>(null);
  readonly isCalculating = signal(false);
  readonly progressChartConfig = signal<ChartConfiguration<'line'> | undefined>(undefined);
  readonly distributionChartConfig = signal<ChartConfiguration<'doughnut'> | undefined>(undefined);

  readonly hasScenario = computed(() => this.scenario() !== null);

  private readonly scenarioCache = new Map<string, SavingsScenario>();
  private readonly chartCache = new Map<string, ChartBundle>();

  calculateScenario(config: EdoMexIndividualConfig): void {
    const cacheKey = this.buildCacheKey(config);
    const cachedScenario = this.scenarioCache.get(cacheKey);
    if (cachedScenario) {
      this.applyScenario(cachedScenario, cacheKey, false);
      return;
    }

    this.isCalculating.set(true);
    this.loadingService.show('Calculando tu plan de ahorro personalizado...');

    timer(1200)
      .pipe(
        tap(() => {
          const scenario = this.simuladorEngine.generateEdoMexIndividualScenario(
            config.targetDownPayment,
            config.currentPlateConsumption,
            config.overpricePerLiter,
            config.voluntaryMonthly
          );
          this.scenarioCache.set(cacheKey, scenario);
          this.applyScenario(scenario, cacheKey, true);
        }),
        finalize(() => {
          this.isCalculating.set(false);
          this.loadingService.hide();
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        error: () => {
          this.resetScenario();
          this.toast.error('No se pudo calcular el escenario EdoMex.');
        }
      });
  }

  resetScenario(): void {
    this.scenario.set(null);
    this.progressChartConfig.set(undefined);
    this.distributionChartConfig.set(undefined);
  }

  proceedToClientCreation(config: EdoMexIndividualConfig): void {
    const scenario = this.scenario();
    if (!scenario) {
      return;
    }

    const payload = {
      simulatorData: {
        type: 'EDOMEX_INDIVIDUAL',
        scenario,
        configParams: config
      }
    };

    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('pendingClientData', JSON.stringify(payload));
    }

    this.router.navigate(['/clientes/nuevo'], {
      queryParams: {
        fromSimulator: 'edomex-individual',
        hasScenario: 'true'
      }
    });
  }

  generatePDF(config: EdoMexIndividualConfig): void {
    const scenario = this.scenario();
    if (!scenario) {
      this.toast.error('No hay simulación disponible para generar PDF');
      return;
    }

    const planningData = {
      targetDownPayment: scenario.targetAmount,
      monthsToTarget: scenario.monthsToTarget,
      monthlyCollection: scenario.collectionContribution,
      voluntaryMonthly: scenario.voluntaryContribution,
      plateConsumption: config.currentPlateConsumption,
      overpricePerLiter: config.overpricePerLiter,
      projectedBalance: scenario.projectedBalance
    };

    this.pdfExportService.generateIndividualPlanningPDF(planningData as any)
      .then(() => this.toast.success('PDF generado exitosamente'))
      .catch(() => this.toast.error('Error al generar PDF'));
  }

  saveDraft(config: EdoMexIndividualConfig): void {
    const scenario = this.scenario();
    if (!scenario) {
      this.toast.error('No hay simulación para guardar');
      return;
    }

    const draftKey = `edomex-individual-${Date.now()}-draft`;
    const draft = {
      clientName: '',
      market: 'edomex',
      clientType: 'Individual',
      timestamp: Date.now(),
      type: 'EDOMEX_INDIVIDUAL',
      targetDownPayment: scenario.targetAmount,
      scenario,
      configParams: config
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

  formatCurrency(value: number): string {
    return this.financialCalc.formatCurrency(value);
  }

  private applyScenario(scenario: SavingsScenario, cacheKey: string, notify: boolean): void {
    this.scenario.set(scenario);
    this.hydrateChartConfigs(scenario, cacheKey);
    if (notify) {
      this.toast.success('Escenario EdoMex calculado');
    }
  }

  private hydrateChartConfigs(scenario: SavingsScenario, cacheKey: string): void {
    const cached = this.chartCache.get(cacheKey);
    if (cached) {
      this.progressChartConfig.set(cached.progress);
      this.distributionChartConfig.set(cached.distribution);
      return;
    }

    const months = Array.from({ length: scenario.monthsToTarget }, (_, i) => i + 1);
    const projectedData = scenario.projectedBalance || [];

    const tokens = this.tokensService.tokens;
    const primary = this.tokensService.dataColor('primary');

    const progress: ChartConfiguration<'line'> = {
      type: 'line',
      data: {
        labels: months,
        datasets: [
          {
            label: 'Progreso de Ahorro',
            data: projectedData,
            borderColor: primary,
            backgroundColor: this.withAlpha(primary, 0.1),
            borderWidth: 2,
            fill: true,
            tension: 0.4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: 'Progreso Mensual hacia el Enganche',
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
              callback: (value: number | string) => this.financialCalc.formatCurrency(Number(value))
            }
          }
        }
      }
    };

    const collectionAmount = scenario.collectionContribution * scenario.monthsToTarget;
    const voluntaryAmount = scenario.voluntaryContribution * scenario.monthsToTarget;

    const distribution: ChartConfiguration<'doughnut'> = {
      type: 'doughnut',
      data: {
        labels: ['Recaudación Combustible', 'Aportación Voluntaria'],
        datasets: [{
          data: [collectionAmount, voluntaryAmount],
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
          },
          title: {
            display: true,
            text: 'Distribución de Aportaciones',
            font: { size: 14, weight: 600 },
            color: tokens.color.text.primary
          }
        }
      }
    };

    this.chartCache.set(cacheKey, { progress, distribution });
    this.progressChartConfig.set(progress);
    this.distributionChartConfig.set(distribution);
  }

  private buildCacheKey(config: EdoMexIndividualConfig): string {
    return JSON.stringify([
      config.targetDownPayment,
      config.currentPlateConsumption,
      config.overpricePerLiter,
      config.voluntaryMonthly
    ]);
  }

  private withAlpha(color: string, alpha: number): string {
    const hex = color.replace('#', '');
    const bigint = parseInt(hex, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
}
