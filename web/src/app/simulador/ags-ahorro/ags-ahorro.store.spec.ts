import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AgsAhorroStore, AgsAhorroConfig } from './ags-ahorro.store';
import { ToastService } from '@core-services/toast.service';
import { PdfExportService } from '@feature-services/documents/pdf-export.service';
import { SavingsScenario, SimuladorEngineService } from '@feature-services/simulador/simulador-engine.service';
import { DesignTokensService } from '@core-services/design-tokens.service';
import { SpeechService } from '@feature-services/avi/speech.service';
import { SimuladorStore } from '../simulador.store';

describe('AgsAhorroStore', () => {
  let store: AgsAhorroStore;
  let engine: jasmine.SpyObj<SimuladorEngineService>;
  let toast: jasmine.SpyObj<ToastService>;
  let pdf: jasmine.SpyObj<PdfExportService>;
  let tokens: jasmine.SpyObj<DesignTokensService> & { tokens: any };
  let speech: jasmine.SpyObj<SpeechService>;
  let hubStore: jasmine.SpyObj<SimuladorStore>;
  let router: jasmine.SpyObj<Router>;

  const config: AgsAhorroConfig = {
    unitValue: 450000,
    initialDownPayment: 120000,
    deliveryMonths: 6,
    overpricePerLiter: 4
  };

  const scenarioFixture: SavingsScenario = {
    type: 'AGS_LIQUIDATION',
    targetAmount: 450000,
    monthsToTarget: 6,
    monthlyContribution: 10000,
    collectionContribution: 10000,
    voluntaryContribution: 0,
    projectedBalance: [130000, 140000, 150000, 160000, 170000, 180000],
    timeline: [
      { month: 0, event: 'Enganche Inicial', amount: 120000 },
      { month: 1, event: 'Recaudación Mensual', amount: 10000 }
    ]
  };

  const createStorageMock = () => {
    let store: Record<string, string> = {};
    return {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { store = {}; },
      key: (index: number) => Object.keys(store)[index] ?? null,
      get length() {
        return Object.keys(store).length;
      }
    };
  };

  beforeEach(() => {
    engine = jasmine.createSpyObj('SimuladorEngineService', ['generateAGSLiquidationScenario']);
    engine.generateAGSLiquidationScenario.and.returnValue({ ...scenarioFixture });

    toast = jasmine.createSpyObj('ToastService', ['success', 'error', 'info']);
    pdf = jasmine.createSpyObj('PdfExportService', ['generateAGSSavingsPDF', 'downloadPDF']);
    pdf.generateAGSSavingsPDF.and.returnValue(Promise.resolve(new Blob()));

    tokens = jasmine.createSpyObj('DesignTokensService', ['dataColor'], {
      tokens: {
        color: {
          text: {
            primary: '#101010',
            secondary: '#303030'
          }
        },
        border: '#505050'
      }
    });
    tokens.dataColor.and.returnValue('#0055FF');

    speech = jasmine.createSpyObj('SpeechService', ['speak']);
    hubStore = jasmine.createSpyObj('SimuladorStore', ['refreshSavedSimulations']);
    router = jasmine.createSpyObj('Router', ['navigate']);
    router.navigate.and.returnValue(Promise.resolve(true));

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
        AgsAhorroStore,
        { provide: SimuladorEngineService, useValue: engine },
        { provide: ToastService, useValue: toast },
        { provide: PdfExportService, useValue: pdf },
        { provide: DesignTokensService, useValue: tokens },
        { provide: SpeechService, useValue: speech },
        { provide: SimuladorStore, useValue: hubStore },
        { provide: Router, useValue: router }
      ]
    });

    store = TestBed.inject(AgsAhorroStore);
  });

  it('should initialize defaults once with plate and consumption values', () => {
    expect(store.plates().length).toBe(0);

    store.initializeDefaults();

    expect(store.plates()).toEqual(['ABC-1234']);
    expect(store.consumptions()).toEqual([2500]);

    store.initializeDefaults();
    expect(store.plates().length).toBe(1);
  });

  it('should simulate scenario, hydrate charts and emit success toast', () => {
    store.initializeDefaults();

    store.simulate(config);

    expect(engine.generateAGSLiquidationScenario).toHaveBeenCalledWith(
      config.initialDownPayment,
      config.deliveryMonths,
      store.plates(),
      store.consumptions(),
      config.overpricePerLiter,
      config.unitValue
    );
    expect(store.scenario()).toEqual(jasmine.objectContaining({ targetAmount: 450000 }));
    expect(store.ahorroChartConfig()).toBeDefined();
    expect(store.pmtChartConfig()).toBeDefined();
    expect(toast.success).toHaveBeenCalledWith('Escenario AGS simulado exitosamente');
    expect(store.isSimulating()).toBeFalse();
  });

  it('should clear existing scenario when consumption changes', () => {
    store.initializeDefaults();
    store.simulate(config);
    expect(store.scenario()).not.toBeNull();

    store.updateConsumption(0, 2800);

    expect(store.scenario()).toBeNull();
    expect(store.ahorroChartConfig()).toBeUndefined();
    expect(store.pmtChartConfig()).toBeUndefined();
  });

  it('should persist draft and refresh hub simulations', () => {
    store.initializeDefaults();
    store.simulate(config);

    toast.success.calls.reset();
    const dateSpy = spyOn(Date, 'now').and.returnValue(1700000000000);

    store.saveDraft();

    const key = 'agsScenario-1700000000000-draft';
    const rawDraft = window.localStorage.getItem(key);
    expect(rawDraft).not.toBeNull();

    const draft = JSON.parse(rawDraft!);
    expect(draft.market).toBe('aguascalientes');
    expect(draft.clientType).toBe('Individual');
    expect(draft.configParams.unitValue).toBe(config.unitValue);
    expect(toast.success).toHaveBeenCalledWith('Simulación guardada');
    expect(hubStore.refreshSavedSimulations).toHaveBeenCalled();

    dateSpy.and.callThrough();
  });

  it('should calculate amortization table and expose rows', () => {
    store.initializeDefaults();
    store.simulate(config);

    toast.success.calls.reset();
    store.calculateAmortization();

    expect(store.showAmortizationTable()).toBeTrue();
    expect(store.amortizationTable().length).toBe(24);
    expect(toast.success).toHaveBeenCalledWith('Tabla de amortización calculada');
  });

  it('should navigate and persist scenario when proceeding with client creation', () => {
    store.initializeDefaults();
    store.simulate(config);

    toast.success.calls.reset();
    store.proceedWithScenario();

    expect(window.sessionStorage.getItem('agsScenario')).not.toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/clientes/nuevo'], {
      queryParams: {
        fromSimulator: 'ags-ahorro',
        market: 'aguascalientes',
        flow: 'AhorroProgramado'
      }
    });
    expect(toast.success).toHaveBeenCalledWith('Escenario guardado, creando cliente...');
  });

  it('should generate savings PDF when scenario available', fakeAsync(() => {
    store.initializeDefaults();
    store.simulate(config);

    toast.success.calls.reset();
    store.generatePdf();
    flushMicrotasks();

    expect(pdf.generateAGSSavingsPDF).toHaveBeenCalled();
    expect(pdf.downloadPDF).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('PDF de simulación descargado');
  }));

  it('should surface engine errors gracefully', () => {
    engine.generateAGSLiquidationScenario.and.throwError('engine failure');

    store.initializeDefaults();
    store.simulate(config);

    expect(store.scenario()).toBeNull();
    expect(toast.error).toHaveBeenCalledWith('Error al simular escenario AGS');
    expect(store.isSimulating()).toBeFalse();
  });
});
