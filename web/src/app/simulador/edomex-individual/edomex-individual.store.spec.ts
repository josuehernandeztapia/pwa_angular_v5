import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { EdomexIndividualStore, EdoMexIndividualConfig } from './edomex-individual.store';
import { LoadingService } from '@core-services/loading.service';
import { ToastService } from '@core-services/toast.service';
import { PdfExportService } from '@feature-services/documents/pdf-export.service';
import { FinancialCalculatorService } from '@feature-services/cotizador/financial-calculator.service';
import { DesignTokensService } from '@core-services/design-tokens.service';
import { SimuladorEngineService, SavingsScenario } from '@feature-services/simulador/simulador-engine.service';
import { SimuladorStore } from '../simulador.store';

describe('EdomexIndividualStore', () => {
  let store: EdomexIndividualStore;
  let engine: jasmine.SpyObj<SimuladorEngineService>;
  let loading: jasmine.SpyObj<LoadingService>;
  let toast: jasmine.SpyObj<ToastService>;
  let pdf: jasmine.SpyObj<PdfExportService>;
  let financialCalc: jasmine.SpyObj<FinancialCalculatorService>;
  let tokens: Partial<DesignTokensService> & jasmine.SpyObj<DesignTokensService>;
  let hubStore: jasmine.SpyObj<SimuladorStore>;

  const baseConfig: EdoMexIndividualConfig = {
    targetDownPayment: 180000,
    currentPlateConsumption: 1500,
    overpricePerLiter: 4,
    voluntaryMonthly: 2500
  };

  const scenarioFixture: SavingsScenario = {
    type: 'EDOMEX_INDIVIDUAL',
    targetAmount: 180000,
    monthsToTarget: 6,
    monthlyContribution: 25000,
    collectionContribution: 6000,
    voluntaryContribution: 19000,
    projectedBalance: [25000, 50000, 75000, 100000, 125000, 150000],
    timeline: [
      { month: 1, event: 'Aportación Mensual', amount: 25000 },
      { month: 6, event: 'Meta de Enganche Alcanzada', amount: 180000 }
    ]
  };

  const createStorageMock = () => {
    let storage: Record<string, string> = {};
    return {
      getItem: (key: string) => storage[key] ?? null,
      setItem: (key: string, value: string) => { storage[key] = value; },
      removeItem: (key: string) => { delete storage[key]; },
      clear: () => { storage = {}; },
      key: (index: number) => Object.keys(storage)[index] ?? null,
      get length() {
        return Object.keys(storage).length;
      }
    };
  };

  beforeEach(() => {
    engine = jasmine.createSpyObj('SimuladorEngineService', ['generateEdoMexIndividualScenario']);
    engine.generateEdoMexIndividualScenario.and.returnValue({ ...scenarioFixture });

    loading = jasmine.createSpyObj('LoadingService', ['show', 'hide']);
    toast = jasmine.createSpyObj('ToastService', ['success', 'error', 'info']);
    pdf = jasmine.createSpyObj('PdfExportService', ['generateIndividualPlanningPDF']);
    pdf.generateIndividualPlanningPDF.and.returnValue(Promise.resolve(new Blob()));
    financialCalc = jasmine.createSpyObj('FinancialCalculatorService', ['formatCurrency']);
    financialCalc.formatCurrency.and.callFake(value => `MXN ${value}`);

    tokens = jasmine.createSpyObj('DesignTokensService', ['dataColor'], {
      tokens: {
        color: {
          text: {
            primary: '#111111',
            secondary: '#222222'
          }
        },
        border: '#333333'
      }
    });
    tokens.dataColor.and.returnValue('#0055FF');

    hubStore = jasmine.createSpyObj('SimuladorStore', ['refreshSavedSimulations']);

    Object.defineProperty(window, 'localStorage', {
      value: createStorageMock(),
      configurable: true,
      writable: true
    });

    Object.defineProperty(window, 'sessionStorage', {
      value: createStorageMock(),
      configurable: true,
      writable: true
    });

    TestBed.configureTestingModule({
      providers: [
        EdomexIndividualStore,
        { provide: LoadingService, useValue: loading },
        { provide: ToastService, useValue: toast },
        { provide: PdfExportService, useValue: pdf },
        { provide: FinancialCalculatorService, useValue: financialCalc },
        { provide: DesignTokensService, useValue: tokens },
        { provide: SimuladorEngineService, useValue: engine },
        { provide: SimuladorStore, useValue: hubStore }
      ]
    });

    store = TestBed.inject(EdomexIndividualStore);
  });

  it('should calculate scenario and hydrate charts with loading feedback', fakeAsync(() => {
    store.calculateScenario(baseConfig);

    expect(loading.show).toHaveBeenCalledWith('Calculando tu plan de ahorro personalizado...');
    expect(store.isCalculating()).toBeTrue();

    tick(1200);

    expect(engine.generateEdoMexIndividualScenario).toHaveBeenCalledWith(
      baseConfig.targetDownPayment,
      baseConfig.currentPlateConsumption,
      baseConfig.overpricePerLiter,
      baseConfig.voluntaryMonthly
    );
    expect(store.scenario()).toEqual(jasmine.objectContaining({ targetAmount: 180000 }));
    expect(store.progressChartConfig()).toBeDefined();
    expect(store.distributionChartConfig()).toBeDefined();
    expect(loading.hide).toHaveBeenCalled();
    expect(store.isCalculating()).toBeFalse();
  }));

  it('should reuse cached scenario and chart bundles without recomputing', fakeAsync(() => {
    store.calculateScenario(baseConfig);
    tick(1200);
    const firstProgress = store.progressChartConfig();
    const firstDistribution = store.distributionChartConfig();

    engine.generateEdoMexIndividualScenario.calls.reset();
    loading.show.calls.reset();

    store.calculateScenario(baseConfig);

    expect(engine.generateEdoMexIndividualScenario).not.toHaveBeenCalled();
    expect(loading.show).not.toHaveBeenCalled();
    expect(store.progressChartConfig()).toBe(firstProgress);
    expect(store.distributionChartConfig()).toBe(firstDistribution);
  }));

  it('should persist drafts and notify simulator hub store', fakeAsync(() => {
    store.calculateScenario(baseConfig);
    tick(1200);

    const dateSpy = spyOn(Date, 'now').and.returnValue(1700000000000);

    store.saveDraft(baseConfig);

    const draftKey = 'edomex-individual-1700000000000-draft';
    const rawDraft = window.localStorage.getItem(draftKey);
    expect(rawDraft).not.toBeNull();

    const parsedDraft = JSON.parse(rawDraft!);
    expect(parsedDraft.market).toBe('edomex');
    expect(parsedDraft.clientType).toBe('Individual');
    expect(parsedDraft.scenario.targetAmount).toBe(180000);
    expect(parsedDraft.configParams.targetDownPayment).toBe(baseConfig.targetDownPayment);
    expect(toast.success).toHaveBeenCalledWith('Simulación guardada');
    expect(hubStore.refreshSavedSimulations).toHaveBeenCalled();

    dateSpy.and.callThrough();
  }));

  it('should generate PDF when scenario is available', fakeAsync(() => {
    store.calculateScenario(baseConfig);
    tick(1200);

    store.generatePDF(baseConfig);
    flushMicrotasks();

    expect(pdf.generateIndividualPlanningPDF).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('PDF generado exitosamente');
  }));

  it('should fail gracefully when engine throws during calculation', fakeAsync(() => {
    engine.generateEdoMexIndividualScenario.and.callFake(() => {
      throw new Error('engine failure');
    });

    store.calculateScenario(baseConfig);
    tick(1200);

    expect(store.scenario()).toBeNull();
    expect(store.progressChartConfig()).toBeUndefined();
    expect(toast.error).toHaveBeenCalledWith('No se pudo calcular el escenario EdoMex.');
    expect(store.isCalculating()).toBeFalse();
    expect(loading.hide).toHaveBeenCalled();
  }));
});
