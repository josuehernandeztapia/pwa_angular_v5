import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { DestroyRef } from '@angular/core';
import { Router, Params } from '@angular/router';
import { SimuladorStore, SavedSimulation, SimulatorScenario, SmartContextState } from './simulador.store';
import { MarketPolicyService } from '@feature-services/configuration/market-policy.service';

interface Policy {
  market: string;
  clientType: string;
}
import { DownloadService } from '@core-services/download.service';
import { ChartConfiguration } from 'chart.js';

class RouterStub {
  navigate = jasmine.createSpy('navigate').and.returnValue(Promise.resolve(true));
}

class MarketPolicyServiceStub {
  private policies: Policy[] = [];
  getAvailablePolicies = jasmine.createSpy('getAvailablePolicies').and.callFake(() => this.policies);
  setPolicies(policies: Policy[]): void {
    this.policies = policies;
  }
}

class DownloadServiceStub {
  downloadText = jasmine.createSpy('downloadText');
}

const localStorageMock = (() => {
  let store: { [key: string]: string } = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value.toString(); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    key: (index: number) => Object.keys(store)[index] || null,
    get length() { return Object.keys(store).length; },
    get keys() { return Object.keys(store); }
  };
})();

// Mock localStorage globally for window object
let localStorageOverride: Storage | null = null;
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  get: () => (localStorageOverride ?? localStorageMock as unknown as Storage),
  set: (value: Storage) => { localStorageOverride = value; }
});

// Test data fixtures
const mockSavedSimulation: SavedSimulation = {
  id: 'test-sim-1',
  clientName: 'Juan Pérez',
  scenarioType: 'ags-ahorro',
  scenarioTitle: 'Proyector de Ahorro y Liquidación',
  market: 'aguascalientes',
  clientType: 'individual',
  lastModified: Date.now(),
  draftKey: 'ags-draft-123',
  summary: {
    targetAmount: 100000,
    monthlyContribution: 5000,
    timeToTarget: 20,
    status: 'draft'
  }
};

const mockSavedSimulation2: SavedSimulation = {
  id: 'test-sim-2',
  clientName: 'María González',
  scenarioType: 'edomex-individual',
  scenarioTitle: 'Planificador de Enganche',
  market: 'edomex',
  clientType: 'individual',
  lastModified: Date.now() - 1000,
  draftKey: 'edomex-draft-456',
  summary: {
    targetAmount: 150000,
    monthlyContribution: 3000,
    timeToTarget: 50,
    status: 'completed'
  }
};

const mockSavedSimulation3: SavedSimulation = {
  id: 'test-sim-3',
  clientName: 'Colectivo Los Pinos',
  scenarioType: 'tanda-colectiva',
  scenarioTitle: 'Simulador de Tanda Colectiva',
  market: 'edomex',
  clientType: 'colectivo',
  lastModified: Date.now() - 2000,
  draftKey: 'tanda-draft-789',
  summary: {
    targetAmount: 200000,
    monthlyContribution: 4000,
    timeToTarget: 30,
    status: 'draft'
  }
};

describe('SimuladorStore', () => {
  let store: SimuladorStore;
  let router: RouterStub;
  let marketPolicy: MarketPolicyServiceStub;
  let download: DownloadServiceStub;
  let destroyRefMock: { onDestroy: jasmine.Spy };
  let destroyCallback: (() => void) | null;

  afterEach(() => {
    localStorageOverride = null;
  });

  beforeEach(() => {
    localStorageOverride = null;
    destroyCallback = null;
    const onDestroySpy = jasmine.createSpy('onDestroy');
    onDestroySpy.and.callFake((cb: () => void) => {
      destroyCallback = cb;
    });
    destroyRefMock = { onDestroy: onDestroySpy } as unknown as { onDestroy: jasmine.Spy };

    TestBed.configureTestingModule({
      providers: [
        SimuladorStore,
        { provide: Router, useClass: RouterStub },
        { provide: MarketPolicyService, useClass: MarketPolicyServiceStub },
        { provide: DownloadService, useClass: DownloadServiceStub },
        { provide: DestroyRef, useValue: destroyRefMock as unknown as DestroyRef },
      ],
    });

    store = TestBed.inject(SimuladorStore);
    router = TestBed.inject(Router) as unknown as RouterStub;
    marketPolicy = TestBed.inject(MarketPolicyService) as unknown as MarketPolicyServiceStub;
    download = TestBed.inject(DownloadService) as unknown as DownloadServiceStub;

    // Clear localStorage before each test
    localStorageMock.clear();
  });

  describe('State Initialization and Signal Reactivity', () => {
    it('should initialize with default signal values', () => {
      expect(store.availableScenarios().length).toBe(3);
      expect(store.selectedScenarioId()).toBeNull();
      expect(store.isScenarioLoading()).toBeFalse();
      expect(store.smartContext().hasContext).toBeFalse();
      expect(store.isRedirecting()).toBeFalse();
      expect(store.redirectMessage()).toBe('');
      expect(store.comparisonMode()).toBeFalse();
      expect(store.isComparisonModalOpen()).toBeFalse();
      expect(store.selectedScenario()).toBeNull();
      expect(store.ahorroChartConfig()).toBeNull();
      expect(store.pmtChartConfig()).toBeNull();
      expect(store.canCompare()).toBeFalse();
    });

    it('should expose base scenarios correctly', () => {
      const scenarios = store.availableScenarios();
      expect(scenarios.length).toBe(3);
      expect(scenarios[0].id).toBe('ags-ahorro');
      expect(scenarios[1].id).toBe('edomex-individual');
      expect(scenarios[2].id).toBe('tanda-colectiva');
    });

    it('should compute selectedScenario from selectedScenarioId', () => {
      expect(store.selectedScenario()).toBeNull();

      (store as any).selectedScenarioId.set('ags-ahorro');

      const scenario = store.selectedScenario();
      expect(scenario).not.toBeNull();
      expect(scenario!.id).toBe('ags-ahorro');
      expect(scenario!.title).toBe('Proyector de Ahorro y Liquidación');
    });

    it('should return null for invalid scenario ID', () => {
      (store as any).selectedScenarioId.set('invalid-scenario');
      expect(store.selectedScenario()).toBeNull();
    });

    it('should update comparisonSelectionIds computed value', () => {
      expect(store.comparisonSelectionIds().length).toBe(0);

      (store as any).selectedComparisonIds.set(['sim-1', 'sim-2']);

      expect(store.comparisonSelectionIds().length).toBe(2);
      expect(store.canCompare()).toBeTrue();
    });
  });

  describe('Scenario Filtering and Hydration', () => {
    it('should filter scenarios based on available policies', () => {
      marketPolicy.setPolicies([{ market: 'edomex', clientType: 'colectivo' }]);

      store.hydrateScenarioAvailability();

      expect(store.availableScenarios().length).toBe(1);
      expect(store.availableScenarios()[0].id).toBe('tanda-colectiva');
    });

    it('should filter scenarios with multiple matching policies', () => {
      marketPolicy.setPolicies([
        { market: 'edomex', clientType: 'individual' },
        { market: 'edomex', clientType: 'colectivo' }
      ]);

      store.hydrateScenarioAvailability();

      expect(store.availableScenarios().length).toBe(2);
      expect(store.availableScenarios().map(s => s.id)).toContain('edomex-individual');
      expect(store.availableScenarios().map(s => s.id)).toContain('tanda-colectiva');
    });

    it('should fallback to all scenarios when no policies match', () => {
      marketPolicy.setPolicies([]);

      store.hydrateScenarioAvailability();

      expect(store.availableScenarios().length).toBe(3);
    });

    it('should fallback to all scenarios when no policies available', () => {
      marketPolicy.setPolicies([{ market: 'nonexistent' as any, clientType: 'invalid' as any }]);

      store.hydrateScenarioAvailability();

      expect(store.availableScenarios().length).toBe(3);
    });
  });

  describe('Scenario Selection and Navigation', () => {
    it('should ignore selection of non-existent scenario', () => {
      store.selectScenarioById('non-existent');

      expect(store.selectedScenarioId()).toBeNull();
      expect(store.isScenarioLoading()).toBeFalse();
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('should select scenario and set loading state', fakeAsync(() => {
      store.selectScenarioById('edomex-individual');

      expect(store.selectedScenarioId()).toBe('edomex-individual');
      expect(store.isScenarioLoading()).toBeTrue();
      expect(store.ahorroChartConfig()).toBeNull(); // Charts cleared
      expect(store.pmtChartConfig()).toBeNull();

      tick(1200);
      expect(store.isScenarioLoading()).toBeFalse();
    }));

    it('should navigate with correct parameters when selecting scenario', () => {
      store.selectScenarioById('ags-ahorro');

      expect(router.navigate).toHaveBeenCalledWith(['/nueva-oportunidad'], {
        queryParams: {
          market: 'aguascalientes',
          clientType: 'individual',
          preselectedFlow: 'SIMULACION',
          targetSimulator: 'ags-ahorro',
          fromHub: 'true'
        }
      });
    });

    it('should cancel previous scenario load when selecting new one', fakeAsync(() => {
      store.selectScenarioById('ags-ahorro');
      expect(store.isScenarioLoading()).toBeTrue();

      store.selectScenarioById('edomex-individual');
      expect(store.selectedScenarioId()).toBe('edomex-individual');

      tick(1200);
      expect(store.isScenarioLoading()).toBeFalse();
    }));

    it('should load charts after scenario loading completes', fakeAsync(() => {
      store.selectScenarioById('ags-ahorro');

      tick(1200);

      expect(store.ahorroChartConfig()).not.toBeNull();
      expect(store.pmtChartConfig()).not.toBeNull();
    }));
  });

  describe('Chart Caching Functionality', () => {
    it('should cache chart configurations per scenario', fakeAsync(() => {
      store.selectScenarioById('ags-ahorro');
      tick(1200);

      const firstAhorroConfig = store.ahorroChartConfig();
      const firstPmtConfig = store.pmtChartConfig();

      // Clear charts state
      (store as any).chartsState.set({});
      expect(store.ahorroChartConfig()).toBeNull();

      // Select same scenario again
      store.selectScenarioById('ags-ahorro');
      tick(1200);

      // Should get same cached instances
      expect(store.ahorroChartConfig()).toBe(firstAhorroConfig);
      expect(store.pmtChartConfig()).toBe(firstPmtConfig);
    }));

    it('should create separate cache entries for different scenarios', fakeAsync(() => {
      store.selectScenarioById('ags-ahorro');
      tick(1200);
      const agsConfig = store.ahorroChartConfig();

      store.selectScenarioById('edomex-individual');
      tick(1200);
      const edomexConfig = store.ahorroChartConfig();

      expect(agsConfig).not.toBe(edomexConfig);
    }));

    it('should generate chart configurations with correct structure', fakeAsync(() => {
      store.selectScenarioById('ags-ahorro');
      tick(1200);

      const ahorroConfig = store.ahorroChartConfig();
      const pmtConfig = store.pmtChartConfig();

      expect(ahorroConfig?.type).toBe('line');
      expect(ahorroConfig?.data.labels).toEqual(['Mes 1', 'Mes 6', 'Mes 12', 'Mes 18', 'Mes 24']);
      expect(ahorroConfig?.data.datasets[0].data).toEqual([3250, 19500, 39000, 58500, 78000]);

      expect(pmtConfig?.type).toBe('bar');
      expect(pmtConfig?.data.labels).toEqual(['Año 1', 'Año 2', 'Promedio']);
      expect(pmtConfig?.data.datasets[0].data).toEqual([3250, 3250, 3250]);
    }));
  });

  describe('Smart Context Detection and Redirections', () => {
    it('should set smart context from query params', () => {
      const params: Params = {
        market: 'edomex',
        clientType: 'individual',
        clientName: 'Juan Pérez',
        source: 'cotizador'
      };

      store.handleQueryParams(params);

      const context = store.smartContext();
      expect(context.hasContext).toBeTrue();
      expect(context.market).toBe('edomex');
      expect(context.clientType).toBe('individual');
      expect(context.clientName).toBe('Juan Pérez');
      expect(context.source).toBe('cotizador');
    });

    it('should handle missing optional parameters', () => {
      const params: Params = {
        market: 'aguascalientes',
        clientType: 'individual'
      };

      store.handleQueryParams(params);

      const context = store.smartContext();
      expect(context.hasContext).toBeTrue();
      expect(context.clientName).toBe('');
      expect(context.source).toBe('unknown');
    });

    it('should ignore invalid parameter types', () => {
      const params: Params = {
        market: ['invalid-array'],
        clientType: 123,
        clientName: { invalid: 'object' }
      };

      store.handleQueryParams(params);

      expect(store.smartContext().hasContext).toBeFalse();
    });

    it('should clear context when params are insufficient', () => {
      // First set context
      store.handleQueryParams({ market: 'edomex', clientType: 'individual' } as Params);
      expect(store.smartContext().hasContext).toBeTrue();

      // Then clear with insufficient params
      store.handleQueryParams({ market: 'edomex' } as Params);

      expect(store.smartContext().hasContext).toBeFalse();
      expect(store.isRedirecting()).toBeFalse();
      expect(store.redirectMessage()).toBe('');
    });

    it('should trigger smart redirection when context changes', fakeAsync(() => {
      store.handleQueryParams({
        market: 'edomex',
        clientType: 'individual',
        clientName: 'Test Client'
      } as Params);

      expect(store.isRedirecting()).toBeTrue();
      expect(store.redirectMessage()).toContain('Detecté contexto');

      tick(1200);
      expect(store.redirectMessage()).toContain('Lanzando Planificador de Enganche');

      tick(800);
      expect(router.navigate).toHaveBeenCalledWith(['/simulador/edomex-individual'], jasmine.any(Object));
      expect(store.isRedirecting()).toBeFalse();
      expect(store.redirectMessage()).toBe('');
    }));

    it('should not redirect when no matching scenario found', fakeAsync(() => {
      store.handleQueryParams({
        market: 'nonexistent' as any,
        clientType: 'invalid' as any
      } as Params);

      expect(store.isRedirecting()).toBeFalse();
      expect(store.redirectMessage()).toBe('');

      tick(2000);
      expect(router.navigate).not.toHaveBeenCalled();
    }));

    it('should cancel previous redirection when context changes', fakeAsync(() => {
      store.handleQueryParams({ market: 'edomex', clientType: 'individual' } as Params);
      expect(store.isRedirecting()).toBeTrue();

      store.handleQueryParams({ market: 'aguascalientes', clientType: 'individual' } as Params);
      expect(store.isRedirecting()).toBeTrue();

      tick(2000);
      expect(router.navigate).toHaveBeenCalledTimes(1);
      expect(router.navigate).toHaveBeenCalledWith(['/simulador/ags-ahorro'], jasmine.any(Object));
    }));

    it('should not trigger redirection when context unchanged', fakeAsync(() => {
      const params = { market: 'edomex', clientType: 'individual', clientName: 'Test' };

      store.handleQueryParams(params as Params);
      expect(store.isRedirecting()).toBeTrue();

      tick(2000); // Complete first redirection
      expect(store.isRedirecting()).toBeFalse();

      router.navigate.calls.reset();

      store.handleQueryParams(params as Params);
      expect(store.isRedirecting()).toBeFalse();

      tick(2000);
      expect(router.navigate).not.toHaveBeenCalled();
    }));
  });

  describe('Saved Simulations CRUD Operations', () => {
    beforeEach(() => {
      localStorageMock.clear();
    });

    it('should return empty array when no saved simulations exist', () => {
      store.refreshSavedSimulations();
      expect(store.savedSimulations().length).toBe(0);
    });

    it('should return empty array in server-side environment', () => {
      const originalHasWindow = (store as any).hasWindow.bind(store);
      const hasWindowSpy = spyOn<any>(store, 'hasWindow').and.returnValue(false);
      store.refreshSavedSimulations();
      expect(store.savedSimulations().length).toBe(0);
      hasWindowSpy.and.callFake(originalHasWindow);
    });

    it('should parse and sort saved simulations by lastModified timestamp', () => {
      const older = Date.now() - 2000;
      const newer = Date.now() - 1000;
      const newest = Date.now();

      localStorageMock.setItem('older-draft', JSON.stringify({
        clientName: 'Older Client',
        timestamp: older,
        market: 'edomex'
      }));

      localStorageMock.setItem('newer-draft', JSON.stringify({
        clientName: 'Newer Client',
        lastModified: newer,
        market: 'aguascalientes'
      }));

      localStorageMock.setItem('newest-Scenario', JSON.stringify({
        clientName: 'Newest Client',
        timestamp: newest,
        targetAmount: 100000
      }));

    store.refreshSavedSimulations();
    const simulations = store.savedSimulations();
    // eslint-disable-next-line no-console

      expect(simulations.length).toBe(3);
      expect(simulations[0].clientName).toBe('Newest Client');
      expect(simulations[1].clientName).toBe('Newer Client');
      expect(simulations[2].clientName).toBe('Older Client');
    });

    it('should extract data from various localStorage key patterns', () => {
      localStorageMock.setItem('test-draft', JSON.stringify({ clientName: 'Draft Key' }));
      localStorageMock.setItem('testScenario', JSON.stringify({ clientName: 'Scenario Key' }));
      localStorageMock.setItem('agsScenario123', JSON.stringify({ clientName: 'AGS Key' }));
      localStorageMock.setItem('edomexScenario456', JSON.stringify({ clientName: 'EdoMex Key' }));
      localStorageMock.setItem('unrelated-key', JSON.stringify({ clientName: 'Should Not Appear' }));

      store.refreshSavedSimulations();
      const simulations = store.savedSimulations();

      expect(simulations.length).toBe(4);
      expect(simulations.map(s => s.clientName)).toContain('Draft Key');
      expect(simulations.map(s => s.clientName)).toContain('Scenario Key');
      expect(simulations.map(s => s.clientName)).toContain('AGS Key');
      expect(simulations.map(s => s.clientName)).toContain('EdoMex Key');
      expect(simulations.map(s => s.clientName)).not.toContain('Should Not Appear');
    });

    it('should infer scenario types from localStorage keys and data', () => {
      localStorageMock.setItem('ags-test', JSON.stringify({ clientName: 'AGS Test' }));
      localStorageMock.setItem('edomex-individual-test', JSON.stringify({ clientName: 'EdoMex Individual' }));
      localStorageMock.setItem('tanda-test', JSON.stringify({ clientName: 'Tanda Test' }));
      localStorageMock.setItem('collective-test', JSON.stringify({ clientName: 'Collective Test' }));
      localStorageMock.setItem('generic-test', JSON.stringify({
        clientName: 'Generic',
        type: 'EDOMEX_COLLECTIVE'
      }));

      store.refreshSavedSimulations();
      const simulations = store.savedSimulations();

      const ags = simulations.find(s => s.clientName === 'AGS Test');
      expect(ags?.scenarioType).toBe('ags-ahorro');

      const edomexIndividual = simulations.find(s => s.clientName === 'EdoMex Individual');
      expect(edomexIndividual?.scenarioType).toBe('edomex-individual');

      const tanda = simulations.find(s => s.clientName === 'Tanda Test');
      expect(tanda?.scenarioType).toBe('tanda-colectiva');

      const collective = simulations.find(s => s.clientName === 'Collective Test');
      expect(collective?.scenarioType).toBe('tanda-colectiva');

      const generic = simulations.find(s => s.clientName === 'Generic');
      expect(generic?.scenarioType).toBe('tanda-colectiva');
    });

    it('should infer markets from keys and data', () => {
      localStorageMock.setItem('ags-test', JSON.stringify({ clientName: 'AGS' }));
      localStorageMock.setItem('edomex-test', JSON.stringify({ clientName: 'EdoMex' }));
      localStorageMock.setItem('market-data', JSON.stringify({
        clientName: 'Market Data',
        market: 'aguascalientes'
      }));

      store.refreshSavedSimulations();
      const simulations = store.savedSimulations();

      expect(simulations.find(s => s.clientName === 'AGS')?.market).toBe('aguascalientes');
      expect(simulations.find(s => s.clientName === 'EdoMex')?.market).toBe('edomex');
      expect(simulations.find(s => s.clientName === 'Market Data')?.market).toBe('aguascalientes');
    });

    it('should extract summary data from various draft formats', () => {
      localStorageMock.setItem('scenario-format', JSON.stringify({
        clientName: 'Scenario Format',
        scenario: {
          targetAmount: 100000,
          monthlyContribution: 5000,
          monthsToTarget: 20
        }
      }));

      localStorageMock.setItem('simulation-result-format', JSON.stringify({
        clientName: 'Simulation Result',
        simulationResult: {
          scenario: {
            targetAmount: 150000,
            monthlyContribution: 7500,
            monthsToTarget: 24
          }
        }
      }));

      localStorageMock.setItem('config-params-format', JSON.stringify({
        clientName: 'Config Params',
        configParams: {
          targetDownPayment: 200000
        },
        monthlyContribution: 8000
      }));

      store.refreshSavedSimulations();
      const simulations = store.savedSimulations();

      const scenarioFormat = simulations.find(s => s.clientName === 'Scenario Format');
      expect(scenarioFormat?.summary.targetAmount).toBe(100000);
      expect(scenarioFormat?.summary.monthlyContribution).toBe(5000);
      expect(scenarioFormat?.summary.timeToTarget).toBe(20);

      const simulationResult = simulations.find(s => s.clientName === 'Simulation Result');
      expect(simulationResult?.summary.targetAmount).toBe(150000);

      const configParams = simulations.find(s => s.clientName === 'Config Params');
      expect(configParams?.summary.targetAmount).toBe(200000);
      expect(configParams?.summary.monthlyContribution).toBe(8000);
    });

    it('should handle malformed JSON gracefully', () => {
      localStorageMock.setItem('valid-draft', JSON.stringify({ clientName: 'Valid' }));
      localStorageMock.setItem('invalid-draft', 'malformed json{');
      localStorageMock.setItem('empty-draft', '');

      store.refreshSavedSimulations();
      const simulations = store.savedSimulations();

      expect(simulations.length).toBe(1);
      expect(simulations[0].clientName).toBe('Valid');
    });

    it('should validate simulation drafts', () => {
      localStorageMock.setItem('valid-1', JSON.stringify({ clientName: 'Valid Name' }));
      localStorageMock.setItem('valid-2', JSON.stringify({ targetAmount: 100000 }));
      localStorageMock.setItem('valid-3', JSON.stringify({ monthlyContribution: 5000 }));
      localStorageMock.setItem('valid-4', JSON.stringify({ scenario: { targetAmount: 50000 } }));
      localStorageMock.setItem('valid-5', JSON.stringify({ configParams: { test: true } }));
      localStorageMock.setItem('invalid-draft', JSON.stringify({ irrelevantData: true }));

      store.refreshSavedSimulations();
      const simulations = store.savedSimulations();

      expect(simulations.length).toBe(5);
      expect(simulations.map(s => s.clientName)).not.toContain('Cliente sin nombre'); // Invalid was filtered out
    });

    it('should provide fallback values for missing data', () => {
      localStorageMock.setItem('minimal-draft', JSON.stringify({
        // Minimal valid data - just has clientName
        clientName: 'Minimal Client'
      }));

      store.refreshSavedSimulations();
      const simulations = store.savedSimulations();

      expect(simulations.length).toBe(1);
      const sim = simulations[0];
      expect(sim.clientName).toBe('Minimal Client');
      expect(sim.scenarioType).toBe('unknown');
      expect(sim.scenarioTitle).toBe('Simulación');
      expect(sim.market).toBe('unknown');
      expect(sim.clientType).toBe('Individual');
      expect(sim.lastModified).toBeGreaterThan(0);
    });

    it('should delete simulation from localStorage', () => {
      localStorageMock.setItem('to-delete', JSON.stringify({ clientName: 'Will be deleted' }));
      localStorageMock.setItem('to-keep', JSON.stringify({ clientName: 'Will be kept' }));

      store.refreshSavedSimulations();
      expect(store.savedSimulations().length).toBe(2);

      store.deleteSimulation('to-delete');

      expect(localStorageMock.getItem('to-delete')).toBeNull();
      expect(localStorageMock.getItem('to-keep')).not.toBeNull();
      expect(store.savedSimulations().length).toBe(1);
      expect(store.savedSimulations()[0].clientName).toBe('Will be kept');
    });

    it('should handle deletion in server-side environment', () => {
      const originalHasWindow = (store as any).hasWindow.bind(store);
      const hasWindowSpy = spyOn<any>(store, 'hasWindow').and.returnValue(false);
      expect(() => store.deleteSimulation('any-key')).not.toThrow();
      hasWindowSpy.and.callFake(originalHasWindow);
    });
  });

  describe('Comparison Mode Workflow and Selection', () => {
    beforeEach(() => {
      // Set up some mock simulations
      (store as any).savedSimulationsState.set([mockSavedSimulation, mockSavedSimulation2, mockSavedSimulation3]);
    });

    it('should toggle comparison mode on and off', () => {
      expect(store.comparisonMode()).toBeFalse();

      store.toggleComparisonMode();
      expect(store.comparisonMode()).toBeTrue();

      store.toggleComparisonMode();
      expect(store.comparisonMode()).toBeFalse();
    });

    it('should clear selection and close modal when turning off comparison mode', () => {
      store.toggleSimulationSelection('sim-1');
      store.toggleSimulationSelection('sim-2');
      store.openComparisonModal();

      expect(store.comparisonSelectionIds().length).toBe(2);
      expect(store.isComparisonModalOpen()).toBeTrue();

      store.toggleComparisonMode(); // Turn on
      store.toggleComparisonMode(); // Turn off

      expect(store.comparisonSelectionIds().length).toBe(0);
      expect(store.isComparisonModalOpen()).toBeFalse();
    });

    it('should toggle simulation selection', () => {
      expect(store.comparisonSelectionIds()).toEqual([]);

      store.toggleSimulationSelection('sim-1');
      expect(store.comparisonSelectionIds()).toEqual(['sim-1']);

      store.toggleSimulationSelection('sim-2');
      expect(store.comparisonSelectionIds()).toEqual(['sim-1', 'sim-2']);

      store.toggleSimulationSelection('sim-1');
      expect(store.comparisonSelectionIds()).toEqual(['sim-2']);
    });

    it('should limit selection to maximum of 3 simulations', () => {
      store.toggleSimulationSelection('sim-1');
      store.toggleSimulationSelection('sim-2');
      store.toggleSimulationSelection('sim-3');
      store.toggleSimulationSelection('sim-4'); // Should be ignored

      expect(store.comparisonSelectionIds().length).toBe(3);
      expect(store.comparisonSelectionIds()).toEqual(['sim-1', 'sim-2', 'sim-3']);
      expect(store.comparisonSelectionIds()).not.toContain('sim-4');
    });

    it('should clear all selections', () => {
      store.toggleSimulationSelection('sim-1');
      store.toggleSimulationSelection('sim-2');
      expect(store.comparisonSelectionIds().length).toBe(2);

      store.clearSelection();
      expect(store.comparisonSelectionIds().length).toBe(0);
    });

    it('should compute canCompare based on selection count', () => {
      expect(store.canCompare()).toBeFalse();

      store.toggleSimulationSelection('sim-1');
      expect(store.canCompare()).toBeFalse(); // Only 1 selected

      store.toggleSimulationSelection('sim-2');
      expect(store.canCompare()).toBeTrue(); // 2 selected

      store.toggleSimulationSelection('sim-3');
      expect(store.canCompare()).toBeTrue(); // 3 selected

      store.clearSelection();
      expect(store.canCompare()).toBeFalse();
    });

    it('should compute selectedSimulations from selection IDs', () => {
      expect(store.selectedSimulations().length).toBe(0);

      store.toggleSimulationSelection(mockSavedSimulation.id);
      store.toggleSimulationSelection(mockSavedSimulation2.id);

      const selected = store.selectedSimulations();
      expect(selected.length).toBe(2);
      expect(selected[0].id).toBe(mockSavedSimulation.id);
      expect(selected[1].id).toBe(mockSavedSimulation2.id);
    });

    it('should open comparison modal only when can compare', () => {
      expect(store.canCompare()).toBeFalse();
      store.openComparisonModal();
      expect(store.isComparisonModalOpen()).toBeFalse();

      store.toggleSimulationSelection('sim-1');
      store.toggleSimulationSelection('sim-2');
      expect(store.canCompare()).toBeTrue();

      store.openComparisonModal();
      expect(store.isComparisonModalOpen()).toBeTrue();
    });

    it('should close comparison modal', () => {
      store.toggleSimulationSelection('sim-1');
      store.toggleSimulationSelection('sim-2');
      store.openComparisonModal();
      expect(store.isComparisonModalOpen()).toBeTrue();

      store.closeComparisonModal();
      expect(store.isComparisonModalOpen()).toBeFalse();
    });
  });

  describe('Business Logic - Simulation Analysis and Ranking', () => {
    beforeEach(() => {
      (store as any).savedSimulationsState.set([mockSavedSimulation, mockSavedSimulation2, mockSavedSimulation3]);
    });

    it('should compute efficiency scores correctly', () => {
      // mockSavedSimulation: targetAmount: 100000, monthlyContribution: 5000, timeToTarget: 20
      const efficiency1 = store.getEfficiencyLabel(mockSavedSimulation);
      const class1 = store.getEfficiencyClass(mockSavedSimulation);

      // Score calculation: (5000/100000 * 60000) + (1/20 * 100 * 40) = 3000 + 200 = 3200 (way above excellent)
      expect(efficiency1).toBe('Excelente');
      expect(class1).toBe('excellent');

      // mockSavedSimulation2: targetAmount: 150000, monthlyContribution: 3000, timeToTarget: 50
      const efficiency2 = store.getEfficiencyLabel(mockSavedSimulation2);
      const class2 = store.getEfficiencyClass(mockSavedSimulation2);

      // Score: (3000/150000 * 60000) + (1/50 * 100 * 40) = 1200 + 80 = 1280 (excellent)
      expect(efficiency2).toBe('Excelente');
      expect(class2).toBe('excellent');
    });

    it('should handle simulations with missing financial data', () => {
      const incompleteSimulation: SavedSimulation = {
        ...mockSavedSimulation,
        summary: {
          status: 'draft'
          // Missing targetAmount and monthlyContribution
        }
      };

      const efficiency = store.getEfficiencyLabel(incompleteSimulation);
      const className = store.getEfficiencyClass(incompleteSimulation);

      expect(efficiency).toBe('N/D');
      expect(className).toBe('poor');
    });

    it('should return best option from selected simulations', () => {
      store.toggleSimulationSelection(mockSavedSimulation.id);
      store.toggleSimulationSelection(mockSavedSimulation2.id);

      const bestOption = store.getBestOption();

      expect(bestOption).toContain(mockSavedSimulation.clientName); // Higher efficiency score
    });

    it('should return fastest option with shortest time to target', () => {
      store.toggleSimulationSelection(mockSavedSimulation.id); // 20 months
      store.toggleSimulationSelection(mockSavedSimulation3.id); // 30 months

      const fastest = store.getFastestOption();

      expect(fastest).toContain('Juan Pérez'); // mockSavedSimulation has 20 months
      expect(fastest).toContain('20 meses');
    });

    it('should return lowest contribution option', () => {
      store.toggleSimulationSelection(mockSavedSimulation.id); // 5000 monthly
      store.toggleSimulationSelection(mockSavedSimulation2.id); // 3000 monthly

      const lowest = store.getLowestContributionOption();

      expect(lowest).toContain('María González'); // mockSavedSimulation2 has 3000
      expect(lowest).toContain('$3,000');
    });

    it('should handle empty selection for analysis methods', () => {
      expect(store.getBestOption()).toBe('Sin suficientes datos');
      expect(store.getFastestOption()).toBe('Sin datos');
      expect(store.getLowestContributionOption()).toBe('Sin datos');
    });

    it('should handle simulations with missing time data in fastest option', () => {
      const noTimeSimulation: SavedSimulation = {
        ...mockSavedSimulation,
        summary: { ...mockSavedSimulation.summary, timeToTarget: undefined }
      };

      (store as any).savedSimulationsState.set([noTimeSimulation]);
      store.toggleSimulationSelection(noTimeSimulation.id);

      const fastest = store.getFastestOption();
      expect(fastest).toContain('N/D');
    });

    it('should handle simulations with missing contribution data in lowest option', () => {
      const noContributionSimulation: SavedSimulation = {
        ...mockSavedSimulation,
        summary: { ...mockSavedSimulation.summary, monthlyContribution: undefined }
      };

      (store as any).savedSimulationsState.set([noContributionSimulation]);
      store.toggleSimulationSelection(noContributionSimulation.id);

      const lowest = store.getLowestContributionOption();
      expect(lowest).toContain('N/D');
    });
  });

  describe('Download and Sharing Functionality', () => {
    beforeEach(() => {
      (store as any).savedSimulationsState.set([mockSavedSimulation, mockSavedSimulation2]);
      store.toggleSimulationSelection(mockSavedSimulation.id);
      store.toggleSimulationSelection(mockSavedSimulation2.id);
    });

    it('should download comparison snapshot with correct structure', () => {
      store.downloadComparisonSnapshot();

      expect(download.downloadText).toHaveBeenCalledWith(
        jasmine.stringContaining('"generatedAt"'),
        'application/json',
        jasmine.objectContaining({
          filename: jasmine.stringMatching(/^comparacion-simulaciones-\d{4}-\d{2}-\d{2}\.json$/),
          revokeUrl: true
        })
      );
    });

    it('should create share message with simulation details', () => {
      const shareMessage = store.createShareMessage();

      expect(shareMessage).toContain('*Comparación de Simulaciones*');
      expect(shareMessage).toContain('Analizadas: 2 opciones');
      expect(shareMessage).toContain('Juan Pérez');
      expect(shareMessage).toContain('María González');
      expect(shareMessage).toContain('$100,000');
      expect(shareMessage).toContain('$150,000');
      expect(shareMessage).toContain('20 meses');
      expect(shareMessage).toContain('50 meses');
      expect(shareMessage).toContain('Conductores PWA');
    });

    it('should return empty share message when no simulations selected', () => {
      store.clearSelection();

      const shareMessage = store.createShareMessage();

      expect(shareMessage).toBe('');
    });

    it('should handle simulations with missing financial data in share message', () => {
      const incompleteSimulation: SavedSimulation = {
        ...mockSavedSimulation,
        id: 'incomplete',
        summary: { status: 'draft' }
      };

      (store as any).savedSimulationsState.set([incompleteSimulation]);
      store.clearSelection();
      store.toggleSimulationSelection('incomplete');

      const shareMessage = store.createShareMessage();

      expect(shareMessage).toContain('N/D');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle scenario selection with cleared available scenarios', () => {
      (store as any).availableScenarios.set([]);

      store.selectScenarioById('any-scenario');

      expect(store.selectedScenarioId()).toBeNull();
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('should handle localStorage errors during refresh', () => {
      const originalGetItem = localStorageMock.getItem;
      localStorageMock.getItem = jasmine.createSpy('getItem').and.throwError('Storage error');

      // Should not throw error
      expect(() => store.refreshSavedSimulations()).not.toThrow();
      expect(store.savedSimulations().length).toBe(0);

      // Restore original method
      localStorageMock.getItem = originalGetItem;
    });

    it('should handle null localStorage values', () => {
      localStorageOverride = {
        getItem: () => null,
        removeItem: () => {},
        setItem: () => {},
        clear: () => {},
        key: () => null,
        length: 1
      } as unknown as Storage;

      expect(() => store.refreshSavedSimulations()).not.toThrow();
      expect(store.savedSimulations().length).toBe(0);

      localStorageOverride = null;
    });

    it('should handle invalid JSON in localStorage', () => {
      localStorageMock.setItem('invalid-draft', 'not{valid}json');
      localStorageMock.setItem('valid-draft', JSON.stringify({ clientName: 'Valid' }));

      store.refreshSavedSimulations();

      expect(store.savedSimulations().length).toBe(1);
      expect(store.savedSimulations()[0].clientName).toBe('Valid');
    });

    it('should handle missing scenario titles gracefully', () => {
      const unknownScenario: SavedSimulation = {
        ...mockSavedSimulation,
        scenarioType: 'unknown-type'
      };

      (store as any).savedSimulationsState.set([unknownScenario]);
      store.toggleSimulationSelection(unknownScenario.id);

      expect(() => store.getBestOption()).not.toThrow();
      expect(() => store.createShareMessage()).not.toThrow();
    });

    it('should handle edge case efficiency calculations', () => {
      const edgeCaseSimulation: SavedSimulation = {
        ...mockSavedSimulation,
        summary: {
          targetAmount: 0,
          monthlyContribution: 1000,
          timeToTarget: 0,
          status: 'draft'
        }
      };

      const efficiency = store.getEfficiencyLabel(edgeCaseSimulation);
      expect(efficiency).toBe('N/D');
    });

    it('should handle infinite and NaN values in efficiency calculation', () => {
      const infiniteSimulation: SavedSimulation = {
        ...mockSavedSimulation,
        summary: {
          targetAmount: 100000,
          monthlyContribution: Infinity,
          timeToTarget: 0,
          status: 'draft'
        }
      };

      expect(() => store.getEfficiencyLabel(infiniteSimulation)).not.toThrow();
    });
  });

  describe('Subscription Cleanup and Memory Management', () => {
    it('should cancel scenario loading subscription on destroy', fakeAsync(() => {
      const registeredCallbacks = ((store as any).destroyCleanupHandlersForTesting ?? []) as Array<() => void>;

      if (destroyRefMock.onDestroy.calls.any()) {
        expect(destroyRefMock.onDestroy).toHaveBeenCalled();
      } else {
        expect(registeredCallbacks.length).toBeGreaterThan(0);
        destroyCallback = registeredCallbacks[0];
      }

      expect(typeof destroyCallback).toBe('function');

      store.selectScenarioById('ags-ahorro');
      expect((store as any).scenarioLoadSub).toBeTruthy();

      destroyCallback?.();

      expect((store as any).scenarioLoadSub).toBeUndefined();
    }));

    it('should cancel scenario loading when new scenario selected', fakeAsync(() => {
      store.selectScenarioById('ags-ahorro');
      expect(store.isScenarioLoading()).toBeTrue();

      // Select different scenario before first completes
      store.selectScenarioById('edomex-individual');

      tick(1200);

      // Should complete with second scenario only
      expect(store.selectedScenarioId()).toBe('edomex-individual');
      expect(store.isScenarioLoading()).toBeFalse();
    }));

    it('should cancel smart redirection subscription', fakeAsync(() => {
      store.handleQueryParams({ market: 'edomex', clientType: 'individual' } as Params);
      expect(store.isRedirecting()).toBeTrue();

      // Clear context to cancel redirection
      store.handleQueryParams({} as Params);
      expect(store.isRedirecting()).toBeFalse();

      tick(2000);
      expect(router.navigate).not.toHaveBeenCalled();
    }));

    it('should handle multiple subscription cancellations gracefully', fakeAsync(() => {
      store.selectScenarioById('ags-ahorro');
      store.selectScenarioById('edomex-individual');
      store.selectScenarioById('tanda-colectiva');

      // Should not throw error with multiple cancellations
      expect(() => tick(1200)).not.toThrow();
      expect(store.selectedScenarioId()).toBe('tanda-colectiva');
    }));

    it('should not attempt to cancel undefined subscriptions', () => {
      // Test private methods directly to ensure safety
      const cancelScenarioLoad = (store as any).cancelScenarioLoad.bind(store);
      const cancelSmartRedirect = (store as any).cancelSmartRedirect.bind(store);

      expect(() => cancelScenarioLoad()).not.toThrow();
      expect(() => cancelSmartRedirect()).not.toThrow();
    });
  });
});
