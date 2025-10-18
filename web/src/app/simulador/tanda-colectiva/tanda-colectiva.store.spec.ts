import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { Router } from '@angular/router';
import { TandaColectivaStore } from './tanda-colectiva.store';
import { LoadingService } from '@core-services/loading.service';
import { ToastService } from '@core-services/toast.service';
import { PdfExportService } from '@feature-services/documents/pdf-export.service';
import { CollectiveScenarioConfig, SavingsScenario, SimuladorEngineService } from '@feature-services/simulador/simulador-engine.service';
import { FinancialCalculatorService } from '@feature-services/cotizador/financial-calculator.service';
import { DesignTokensService } from '@core-services/design-tokens.service';
import { FlowContextService } from '@core-services/flow-context.service';
import { MarketPolicyService } from '@feature-services/configuration/market-policy.service';

describe('TandaColectivaStore', () => {
  let store: TandaColectivaStore;
  let engine: jasmine.SpyObj<SimuladorEngineService>;
  let loading: jasmine.SpyObj<LoadingService>;
  let toast: jasmine.SpyObj<ToastService>;
  let pdf: jasmine.SpyObj<PdfExportService>;
  let financial: jasmine.SpyObj<FinancialCalculatorService>;
  let tokens: jasmine.SpyObj<DesignTokensService> & { tokens: any };
  let flowContext: jasmine.SpyObj<FlowContextService>;
  let marketPolicy: jasmine.SpyObj<MarketPolicyService>;
  let router: jasmine.SpyObj<Router>;

  const config: CollectiveScenarioConfig = {
    memberCount: 5,
    unitPrice: 250000,
    avgConsumption: 900,
    overpricePerLiter: 4,
    voluntaryMonthly: 1500
  };

  const scenarioFixture: SavingsScenario = {
    type: 'EDOMEX_COLLECTIVE',
    targetAmount: 500000,
    monthsToTarget: 12,
    monthlyContribution: 60000,
    collectionContribution: 36000,
    voluntaryContribution: 24000,
    projectedBalance: [60000, 120000, 180000, 240000, 300000],
    timeline: [
      { month: 1, event: 'Aportación Grupal', amount: 60000 },
      { month: 12, event: 'Meta grupal alcanzada', amount: 500000 }
    ]
  };

  beforeEach(() => {
    engine = jasmine.createSpyObj('SimuladorEngineService', ['generateEdoMexCollectiveScenario']);
    engine.generateEdoMexCollectiveScenario.and.returnValue(Promise.resolve({
      scenario: { ...scenarioFixture },
      tandaResult: { schedule: [] },
      snowballEffect: { totalSavings: [10000] }
    }));

    loading = jasmine.createSpyObj('LoadingService', ['show', 'hide']);
    toast = jasmine.createSpyObj('ToastService', ['success', 'error']);
    pdf = jasmine.createSpyObj('PdfExportService', ['generateTandaPDF']);
    pdf.generateTandaPDF.and.returnValue(Promise.resolve(new Blob()));

    financial = jasmine.createSpyObj('FinancialCalculatorService', ['formatCurrency']);
    financial.formatCurrency.and.callFake(value => `MXN ${value}`);

    tokens = jasmine.createSpyObj('DesignTokensService', ['dataColor'], {
      tokens: {
        color: {
          text: {
            secondary: '#555555'
          }
        },
        border: '#999999'
      }
    });
    tokens.dataColor.and.returnValue('#FF6600');

    flowContext = jasmine.createSpyObj('FlowContextService', ['getContextData', 'saveContext']);
    flowContext.getContextData.and.returnValue({ clientId: 'abc-123', clientName: 'Colectivo Demo' });

    marketPolicy = jasmine.createSpyObj('MarketPolicyService', ['getIncomeThreshold']);
    marketPolicy.getIncomeThreshold.and.returnValue(3);

    router = jasmine.createSpyObj('Router', ['navigate']);
    router.navigate.and.returnValue(Promise.resolve(true));

    TestBed.configureTestingModule({
      providers: [
        TandaColectivaStore,
        { provide: SimuladorEngineService, useValue: engine },
        { provide: LoadingService, useValue: loading },
        { provide: ToastService, useValue: toast },
        { provide: PdfExportService, useValue: pdf },
        { provide: FinancialCalculatorService, useValue: financial },
        { provide: DesignTokensService, useValue: tokens },
        { provide: FlowContextService, useValue: flowContext },
        { provide: MarketPolicyService, useValue: marketPolicy },
        { provide: Router, useValue: router }
      ]
    });

    store = TestBed.inject(TandaColectivaStore);
  });

  it('should simulate collective scenario, hydrate charts and persist context', fakeAsync(() => {
    const dateSpy = spyOn(Date, 'now').and.returnValue(1700000000000);

    store.simulate(config);
    flushMicrotasks();

    expect(loading.show).toHaveBeenCalledWith('Simulando estrategia de tanda colectiva...');
    expect(engine.generateEdoMexCollectiveScenario).toHaveBeenCalledWith(config);
    expect(store.simulationResult()).toEqual(jasmine.objectContaining({
      scenario: jasmine.objectContaining({
        monthlyContribution: 60000,
        monthsToFirstAward: Math.ceil(config.unitPrice / 60000)
      })
    }));
    expect(store.groupSavingsChartConfig()).toBeDefined();
    expect(store.avgPmtChartConfig()).toBeDefined();
    expect(flowContext.saveContext).toHaveBeenCalled();

    const [, payload] = flowContext.saveContext.calls.mostRecent().args;
    expect((payload as any).simulatorData.monthlyPayment).toBeCloseTo(12000);
    expect((payload as any).policyContext.requiresIncomeProof).toBeFalse();
    expect((payload as any).simulatorData.updatedAt).toBe(1700000000000);

    expect(loading.hide).toHaveBeenCalled();
    dateSpy.and.callThrough();
  }));

  it('should reset state when reset is invoked', fakeAsync(() => {
    store.simulate(config);
    flushMicrotasks();

    store.reset();

    expect(store.simulationResult()).toBeNull();
    expect(store.groupSavingsChartConfig()).toBeUndefined();
    expect(store.avgPmtChartConfig()).toBeUndefined();
  }));

  it('should generate PDF when a scenario exists', fakeAsync(() => {
    store.simulate(config);
    flushMicrotasks();

    store.generatePdf(config);
    flushMicrotasks();

    expect(pdf.generateTandaPDF).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('PDF generado exitosamente');
  }));

  it('should navigate back to simulators hub', () => {
    store.goBack();
    expect(router.navigate).toHaveBeenCalledWith(['/simuladores']);
  });

  it('should surface engine errors and clear state', fakeAsync(() => {
    const consoleSpy = spyOn(console, 'error');
    engine.generateEdoMexCollectiveScenario.and.returnValue(Promise.reject(new Error('engine failure')));

    store.simulate(config);
    flushMicrotasks();

    expect(store.simulationResult()).toBeNull();
    expect(store.groupSavingsChartConfig()).toBeUndefined();
    expect(store.avgPmtChartConfig()).toBeUndefined();
    expect(toast.error).toHaveBeenCalledWith('No se pudo ejecutar la simulación colectiva');
    expect(loading.hide).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
  }));
});
