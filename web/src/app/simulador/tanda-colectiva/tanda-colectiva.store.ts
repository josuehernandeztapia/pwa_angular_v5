import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ChartConfiguration } from 'chart.js';
import { LoadingService } from '@core-services/loading.service';
import { ToastService } from '@core-services/toast.service';
import { PdfExportService } from '@feature-services/documents/pdf-export.service';
import { CollectiveScenarioConfig, SavingsScenario, SimuladorEngineService } from '@feature-services/simulador/simulador-engine.service';
import { FinancialCalculatorService } from '@feature-services/cotizador/financial-calculator.service';
import { DesignTokensService } from '@core-services/design-tokens.service';
import { FlowContextService } from '@core-services/flow-context.service';
import { MarketPolicyContext, MarketPolicyService, PolicyClientType, PolicyMarket } from '@feature-services/configuration/market-policy.service';
import { BusinessFlow } from '@interfaces/types';

interface TandaSimulationResult {
  scenario: SavingsScenario & { monthsToFirstAward?: number; monthsToFullDelivery?: number };
  tandaResult: any;
  snowballEffect: any;
}

@Injectable({ providedIn: 'root' })
export class TandaColectivaStore {
  private readonly router = inject(Router);
  private readonly loadingService = inject(LoadingService);
  private readonly toast = inject(ToastService);
  private readonly pdfExport = inject(PdfExportService);
  private readonly simuladorEngine = inject(SimuladorEngineService);
  private readonly financialCalc = inject(FinancialCalculatorService);
  private readonly tokensService = inject(DesignTokensService);
  private readonly marketPolicy = inject(MarketPolicyService);
  private readonly flowContext = inject(FlowContextService, { optional: true });

  readonly isSimulating = signal(false);
  readonly simulationResult = signal<TandaSimulationResult | null>(null);
  readonly groupSavingsChartConfig = signal<ChartConfiguration<'line'> | undefined>(undefined);
  readonly avgPmtChartConfig = signal<ChartConfiguration<'doughnut'> | undefined>(undefined);

  readonly groupContribution = computed(() => this.simulationResult()?.scenario?.monthlyContribution ?? 0);
  readonly firstAwardMonths = computed(() => this.simulationResult()?.scenario?.monthsToFirstAward ?? 0);
  readonly fullDeliveryMonths = computed(() => this.simulationResult()?.scenario?.monthsToFullDelivery ?? 0);

  async simulate(config: CollectiveScenarioConfig): Promise<void> {
    if (this.isSimulating()) {
      return;
    }

    this.isSimulating.set(true);
    this.loadingService.show('Simulando estrategia de tanda colectiva...');

    try {
      const result = await this.simuladorEngine.generateEdoMexCollectiveScenario(config);
      if (!result?.scenario) {
        throw new Error('Escenario colectivo no disponible');
      }

      const scenario = result.scenario;
      scenario.monthsToFirstAward = Math.ceil(config.unitPrice / scenario.monthlyContribution);
      scenario.monthsToFullDelivery = scenario.monthsToFirstAward * config.memberCount;

      this.simulationResult.set({
        scenario,
        tandaResult: result.tandaResult,
        snowballEffect: result.snowballEffect
      });

      this.updateCharts(config.memberCount);
      this.persistFlowContextSnapshot(config, 'tanda-simulation');
    } catch (error) {
      console.error('[TandaColectivaStore] Error al simular tanda colectiva', error);
      this.toast.error('No se pudo ejecutar la simulación colectiva');
      this.simulationResult.set(null);
      this.groupSavingsChartConfig.set(undefined);
      this.avgPmtChartConfig.set(undefined);
    } finally {
      this.isSimulating.set(false);
      this.loadingService.hide();
    }
  }

  reset(): void {
    this.simulationResult.set(null);
    this.groupSavingsChartConfig.set(undefined);
    this.avgPmtChartConfig.set(undefined);
  }

  generatePdf(config: CollectiveScenarioConfig): void {
    const result = this.simulationResult();
    if (!result?.scenario) {
      this.toast.error('No hay simulación disponible para generar PDF');
      return;
    }

    const tandaData = {
      memberCount: config.memberCount,
      unitPrice: config.unitPrice,
      monthlyContribution: result.scenario.monthlyContribution,
      firstDeliveryMonth: result.scenario.monthsToFirstAward ?? 0
    };

    this.pdfExport.generateTandaPDF(tandaData as any)
      .then(() => this.toast.success('PDF generado exitosamente'))
      .catch(() => this.toast.error('Error al generar PDF'));
  }

  goBack(): void {
    this.router.navigate(['/simuladores']);
  }

  formatCurrency(value: number): string {
    return this.financialCalc.formatCurrency(value);
  }

  private updateCharts(memberCount: number): void {
    const result = this.simulationResult();
    const scenario = result?.scenario;
    if (!scenario) {
      this.groupSavingsChartConfig.set(undefined);
      this.avgPmtChartConfig.set(undefined);
      return;
    }

    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    const groupSavings = months.map(month => month * scenario.monthlyContribution);

    const tokens = this.tokensService.tokens;
    const accent = this.tokensService.dataColor('accent');

    const savingsConfig: ChartConfiguration<'line'> = {
      type: 'line',
      data: {
        labels: months,
        datasets: [{
          label: 'Ahorro Grupal Acumulado',
          data: groupSavings,
          borderColor: accent,
          backgroundColor: 'transparent',
          tension: 0.3,
          pointRadius: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: tokens.color.text.secondary } },
          y: {
            ticks: {
              color: tokens.color.text.secondary,
              callback: (value: number | string) => this.formatCurrency(Number(value))
            }
          }
        }
      }
    };

    const avgContribution = scenario.monthlyContribution / Math.max(1, memberCount);

    const distributionConfig: ChartConfiguration<'doughnut'> = {
      type: 'doughnut',
      data: {
        labels: ['PMT Individual', 'Resto del Grupo'],
        datasets: [{
          data: [avgContribution, Math.max(0, scenario.monthlyContribution - avgContribution)],
          backgroundColor: [accent, tokens.color.border],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
      }
    };

    this.groupSavingsChartConfig.set(savingsConfig);
    this.avgPmtChartConfig.set(distributionConfig);
  }

  private persistFlowContextSnapshot(config: CollectiveScenarioConfig, origin: string): void {
    if (!this.flowContext) {
      return;
    }

    const result = this.simulationResult();
    const scenario = result?.scenario;
    if (!scenario) {
      return;
    }

    const market: PolicyMarket = 'edomex';
    const clientType: PolicyClientType = 'colectivo';
    const saleType: 'contado' | 'financiero' = 'financiero';
    const businessFlow = BusinessFlow.CreditoColectivo;
    const collectiveMembers = Number.isFinite(config.memberCount) && config.memberCount > 0
      ? Math.floor(config.memberCount)
      : undefined;

    const groupContribution = scenario.monthlyContribution;
    const monthlyPayment = collectiveMembers ? groupContribution / collectiveMembers : undefined;

    const policyContext: MarketPolicyContext = {
      market,
      clientType,
      saleType,
      businessFlow,
      collectiveSize: collectiveMembers,
    };

    let incomeThreshold: number | undefined;
    let incomeThresholdRatio: number | undefined;

    if (monthlyPayment && monthlyPayment > 0) {
      const ratio = this.marketPolicy.getIncomeThreshold(policyContext);
      if (typeof ratio === 'number' && Number.isFinite(ratio) && ratio > 0) {
        incomeThresholdRatio = ratio;
        incomeThreshold = monthlyPayment * ratio;
      }
    }

    const requiresIncomeProof = incomeThreshold !== undefined && monthlyPayment !== undefined
      ? monthlyPayment > incomeThreshold
      : undefined;

    if (typeof requiresIncomeProof === 'boolean') {
      policyContext.requiresIncomeProof = requiresIncomeProof;
    }

    const simulatorData = {
      market,
      clientType,
      saleType,
      collectiveMembers,
      monthlyContribution: groupContribution,
      monthlyPayment,
      incomeThreshold,
      incomeThresholdRatio,
      requiresIncomeProof,
      config,
      scenario,
      origin,
      updatedAt: Date.now(),
    };

    const existing = this.flowContext.getContextData<any>('simulador') ?? {};

    this.flowContext.saveContext('simulador', {
      ...existing,
      market,
      clientType,
      saleType,
      businessFlow,
      collectiveMembers,
      monthlyPayment,
      incomeThreshold,
      incomeThresholdRatio,
      requiresIncomeProof,
      simulatorData,
      quotationData: {
        ...(existing.quotationData ?? {}),
        monthlyPayment,
        incomeThreshold,
        incomeThresholdRatio,
        collectiveMembers,
      },
      policyContext,
      clientId: existing.clientId,
      clientName: existing.clientName,
    }, {
      breadcrumbs: ['Dashboard', 'Simulador', 'Tanda Colectiva'],
    });
  }
}
