import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { CotizadorStore, CollectionUnit } from './cotizador.store';
import { CotizadorEngineService, ProductPackage, ProductComponent } from '@feature-services/cotizador/cotizador-engine.service';
import { MarketPolicyService, MarketPolicyMetadata, PolicyClientType, PolicyMarket } from '@feature-services/configuration/market-policy.service';
import { ToastService } from '@core-services/toast.service';
import { FinancialCalculatorService } from '@feature-services/cotizador/financial-calculator.service';
import { PdfExportService } from '@feature-services/documents/pdf-export.service';
import { DocumentRequirementsService } from '@feature-services/documents/document-requirements.service';
import { Router } from '@angular/router';
import { FlowContextService } from '@core-services/flow-context.service';
import { BusinessFlow, Client } from '@interfaces/types';
import { Quote, SimulatorMode } from '@interfaces/business';
import { QuotesApiService } from '@data-access/quotes/quotes-api.service';
import { OnboardingRequirementsService } from '@feature-services/onboarding/onboarding-requirements.service';
import { AnalyticsService } from '@core-services/analytics.service';

const mockPackage: ProductPackage = {
  name: 'Test Package',
  rate: 0.12,
  terms: [12, 24, 36],
  minDownPaymentPercentage: 0.2,
  components: [
    {
      id: 'base',
      name: 'Base Unit',
      price: 100000,
      isOptional: false,
      isMultipliedByTerm: false
    },
    {
      id: 'optional',
      name: 'Optional Add-on',
      price: 10000,
      isOptional: true,
      isMultipliedByTerm: true
    }
  ]
};

const mockClient: Client = {
  id: 'test-client-123',
  name: 'Test Client',
  email: 'test@example.com',
  phone: '1234567890',
  flow: BusinessFlow.Individual,
  ecosystemId: 'test-ecosystem',
  status: 'active',
  documents: [],
  events: []
};

const mockCollectiveClient: Client = {
  id: 'collective-client-123',
  name: 'Collective Client',
  email: 'collective@example.com',
  phone: '0987654321',
  flow: BusinessFlow.CreditoColectivo,
  status: 'active',
  documents: [],
  events: [],
  ecosystemId: 'edomex-001'
};

const mockDirectClient: Client = {
  ...mockClient,
  id: 'direct-client-456',
  flow: BusinessFlow.VentaDirecta
};

const mockMarketPolicyMetadata: MarketPolicyMetadata = {
  income: {
    threshold: 5000
  },
  tanda: {
    minMembers: 3,
    maxMembers: 15,
    minContribution: 1000,
    maxContribution: 50000,
    minRounds: 6,
    maxRounds: 24
  },
  ocrThreshold: 0.8
};

const mockQuote: Quote & { packageData: ProductPackage } = {
  flow: BusinessFlow.Individual,
  totalPrice: 110000,
  downPayment: 22000,
  amountToFinance: 88000,
  term: 12,
  monthlyPayment: 8500,
  market: 'edomex',
  clientType: 'individual',
  packageData: mockPackage
};

describe('CotizadorStore', () => {
  let store: CotizadorStore;
  let engine: jasmine.SpyObj<CotizadorEngineService>;
  let marketPolicy: jasmine.SpyObj<MarketPolicyService>;
  let toast: jasmine.SpyObj<ToastService>;
  let pdf: jasmine.SpyObj<PdfExportService>;
  let router: jasmine.SpyObj<Router>;
  let flowContext: jasmine.SpyObj<FlowContextService>;
  let quotesApi: jasmine.SpyObj<QuotesApiService>;
  let documentRequirements: jasmine.SpyObj<DocumentRequirementsService>;
  let onboardingRequirements: jasmine.SpyObj<OnboardingRequirementsService>;
  let analytics: jasmine.SpyObj<AnalyticsService>;

  beforeEach(() => {
    engine = jasmine.createSpyObj('CotizadorEngineService', ['getProductPackageForContext', 'generateQuoteWithPackage', 'resolvePackageKey']);
    engine.getProductPackageForContext.and.returnValue(of(mockPackage));
    engine.resolvePackageKey.and.callFake((context: any) => {
      if (!context || !context.market) {
        throw new Error('invalid context');
      }
      if (context.saleType === 'contado') {
        return `${context.market}-directa`;
      }
      if (context.clientType === 'colectivo') {
        return `${context.market}-colectivo`;
      }
      return `${context.market}-plazo`;
    });
    engine.generateQuoteWithPackage.and.returnValue(of(mockQuote));

    marketPolicy = jasmine.createSpyObj('MarketPolicyService', ['getAvailablePolicies', 'getPolicyMetadata', 'getIncomeThreshold']);
    marketPolicy.getAvailablePolicies.and.returnValue([
      { market: 'edomex', clientType: 'individual' },
      { market: 'edomex', clientType: 'colectivo' }
    ]);
    marketPolicy.getPolicyMetadata.and.returnValue(mockMarketPolicyMetadata);
    marketPolicy.getIncomeThreshold.and.returnValue(5000);

    toast = jasmine.createSpyObj('ToastService', ['success', 'error']);

    documentRequirements = jasmine.createSpyObj('DocumentRequirementsService', ['getDocumentRequirements']);
    documentRequirements.getDocumentRequirements.and.returnValue(of([]));

    onboardingRequirements = jasmine.createSpyObj('OnboardingRequirementsService', ['update', 'snapshot']);
    onboardingRequirements.snapshot.and.returnValue(null);

    analytics = jasmine.createSpyObj('AnalyticsService', ['track']);

    const financialCalc = jasmine.createSpyObj('FinancialCalculatorService', ['formatCurrency']);
    financialCalc.formatCurrency.and.callFake((value: number) => `MXN ${value}`);

    pdf = jasmine.createSpyObj('PdfExportService', ['generateQuotePDF', 'downloadPDF']);
    pdf.generateQuotePDF.and.returnValue(Promise.resolve(new Blob()));

    quotesApi = jasmine.createSpyObj('QuotesApiService', ['createQuote']);
    quotesApi.createQuote.and.returnValue(of(mockQuote));

    router = jasmine.createSpyObj('Router', ['navigate']);

    flowContext = jasmine.createSpyObj('FlowContextService', ['getContextData', 'saveContext']);
    flowContext.getContextData.and.returnValue({});

    TestBed.configureTestingModule({
      providers: [
        CotizadorStore,
        { provide: CotizadorEngineService, useValue: engine },
        { provide: MarketPolicyService, useValue: marketPolicy },
        { provide: ToastService, useValue: toast },
        { provide: FinancialCalculatorService, useValue: financialCalc },
        { provide: PdfExportService, useValue: pdf },
        { provide: QuotesApiService, useValue: quotesApi },
        { provide: Router, useValue: router },
        { provide: FlowContextService, useValue: flowContext },
        { provide: DocumentRequirementsService, useValue: documentRequirements },
        { provide: OnboardingRequirementsService, useValue: onboardingRequirements },
        { provide: AnalyticsService, useValue: analytics },
      ]
    });

    store = TestBed.inject(CotizadorStore);
    quotesApi.createQuote.calls.reset();
  });

  it('should initialize defaults for a new session', () => {
    store.initialize(undefined, 'acquisition');

    expect(store.market()).toBe('');
    expect(store.clientType()).toBe('');
    expect(store.pkg()).toBeNull();
    expect(store.currentStep()).toBe(1);
    expect(store.collectionUnits().length).toBe(0);
  });

  it('should fetch package and set defaults', fakeAsync(() => {
    store.setMarket('edomex');
    flushMicrotasks();

    store.setClientType('individual');
    flushMicrotasks();

    expect(engine.getProductPackageForContext).toHaveBeenCalledTimes(1);
    expect(store.pkg()).toEqual(mockPackage);
    expect(store.term()).toBe(mockPackage.terms[0]);
    expect(store.selectedOptions()['base']).toBeTrue();
    expect(store.totalPrice()).toBe(mockPackage.components[0].price);
  }));

  it('should calculate amortization table when data is valid', fakeAsync(() => {
    store.setMarket('edomex');
    flushMicrotasks();
    store.setClientType('individual');
    flushMicrotasks();

    store.calculateAmortization();

    expect(store.amortizationTable().length).toBe(store.term());
    expect(toast.error).not.toHaveBeenCalled();
    expect(store.isAmortizationVisible()).toBeTrue();
  }));

  it('should notify when amortization cannot be calculated without a package', () => {
    store.calculateAmortization();

    expect(toast.error).toHaveBeenCalledWith('Selecciona un paquete antes de calcular amortización.');
    expect(store.amortizationTable().length).toBe(0);
  });

  it('should generate PDF when quote data is available', fakeAsync(() => {
    store.setMarket('edomex');
    flushMicrotasks();
    store.setClientType('individual');
    flushMicrotasks();

    store.generatePDF();
    flushMicrotasks();

    expect(quotesApi.createQuote).toHaveBeenCalled();
    expect(pdf.generateQuotePDF).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('PDF generado');
  }));

  it('should toggle component options', () => {
    store.initialize(undefined, 'acquisition');
    store.toggleComponent('optional');
    expect(store.selectedOptions()['optional']).toBeTrue();
  });

  // FlowContext snapshot tests
  describe('FlowContext Persistence', () => {
    it('should persist snapshot after market change', fakeAsync(() => {
      store.initialize(mockClient, 'acquisition');
      store.setMarket('edomex');
      flushMicrotasks();

      expect(flowContext.saveContext).toHaveBeenCalled();

      // Check that at least one call was made with the correct context type and market
      const calls = flowContext.saveContext.calls.all();
      const cotizadorCalls = calls.filter((call: any) => call.args[0] === 'cotizador');

      expect(cotizadorCalls.length).toBeGreaterThan(0);

      // Check the most recent call has the expected market
      const lastCall = cotizadorCalls[cotizadorCalls.length - 1];
      expect(lastCall.args[1]).toEqual(jasmine.objectContaining({
        market: 'edomex'
      }));
    }));

    it('should persist snapshot after client type change', fakeAsync(() => {
      store.initialize(mockClient, 'acquisition');
      store.setMarket('edomex');
      flushMicrotasks();
      store.setClientType('individual');
      flushMicrotasks();

      expect(flowContext.saveContext).toHaveBeenCalledWith(
        'cotizador',
        jasmine.objectContaining({
          clientType: 'individual',
          quotationData: jasmine.objectContaining({
            clientType: 'individual',
            origin: 'client-type-change'
          })
        }),
        { breadcrumbs: ['Dashboard', 'Cotizador'] }
      );
    }));

    it('should persist snapshot with income threshold data', fakeAsync(() => {
      store.initialize(mockClient, 'acquisition');
      store.setMarket('edomex');
      flushMicrotasks();
      store.setClientType('individual');
      flushMicrotasks();

    expect(flowContext.saveContext).toHaveBeenCalledWith(
      'cotizador',
      jasmine.objectContaining({
        incomeThreshold: 5000,
        requiresIncomeProof: jasmine.any(Boolean)
      }),
      jasmine.any(Object)
    );
  }));

  it('should hydrate documentos context with requirements', fakeAsync(() => {
    store.initialize(mockClient, 'acquisition');
    store.setMarket('edomex');
    flushMicrotasks();
    store.setClientType('individual');
    flushMicrotasks();

    expect(documentRequirements.getDocumentRequirements).toHaveBeenCalledWith({
      market: 'edomex',
      saleType: 'financiero',
      businessFlow: BusinessFlow.Individual,
      clientType: 'individual',
      requiresIncomeProof: jasmine.any(Boolean),
      collectiveSize: undefined
    });

    expect(flowContext.saveContext).toHaveBeenCalledWith(
      'documentos',
      jasmine.objectContaining({
        flowContext: jasmine.objectContaining({
          market: 'edomex',
          clientType: 'individual'
        }),
        mathValidation: jasmine.objectContaining({
          withinTolerance: true
        })
      }),
      { breadcrumbs: ['Dashboard', 'Documentos'] }
    );
  }));

    it('should not persist when FlowContext service is unavailable', () => {
      const originalFlowContext = (store as any).flowContext;
      (store as any).flowContext = null;

      store.persistFlowContextSnapshot('test');

      expect(flowContext.saveContext).not.toHaveBeenCalled();

      (store as any).flowContext = originalFlowContext;
    });
  });

  // Insurance toggle tests
  describe('Insurance Configuration', () => {
    beforeEach(fakeAsync(() => {
      store.initialize(mockClient, 'acquisition');
      store.setMarket('edomex');
      flushMicrotasks();
      store.setClientType('individual');
      flushMicrotasks();
    }));

    it('should toggle insurance inclusion', () => {
      expect(store.includeInsurance()).toBeFalse();
      store.setIncludeInsurance(true);
      expect(store.includeInsurance()).toBeTrue();

      expect(flowContext.saveContext).toHaveBeenCalledWith(
        'cotizador',
        jasmine.objectContaining({
          quotationData: jasmine.objectContaining({
            origin: 'insurance-toggle'
          })
        }),
        jasmine.any(Object)
      );
    });

    it('should set insurance amount', () => {
      store.setInsuranceAmount('15000');
      expect(store.insuranceAmount()).toBe('15000');
    });

    it('should toggle insurance mode', () => {
      expect(store.insuranceMode()).toBe('financiado');
      store.setInsuranceMode('contado');
      expect(store.insuranceMode()).toBe('contado');
    });

    it('should include insurance in amount to finance when financiado', () => {
      store.setIncludeInsurance(true);
      store.setInsuranceAmount('20000');
      store.setInsuranceMode('financiado');

      const baseAmount = store.totalPrice() - store.downPayment();
      expect(store.amountToFinance()).toBe(baseAmount + 20000);
    });

    it('should not include insurance in amount to finance when contado', () => {
      store.setIncludeInsurance(true);
      store.setInsuranceAmount('20000');
      store.setInsuranceMode('contado');

      const baseAmount = store.totalPrice() - store.downPayment();
      expect(store.amountToFinance()).toBe(baseAmount);
    });
  });

  // Error handling tests
  describe('Error Handling', () => {
    it('should handle package loading errors', fakeAsync(() => {
      engine.getProductPackageForContext.and.returnValue(throwError('Network error'));

      store.setMarket('edomex');
      flushMicrotasks();
      store.setClientType('individual');
      tick();

      expect(store.pkg()).toBeNull();
      expect(store.isLoading()).toBeFalse();
      expect(toast.error).toHaveBeenCalledWith('Error al cargar el paquete para edomex');
    }));

    it('should handle policy metadata errors gracefully', fakeAsync(() => {
      marketPolicy.getPolicyMetadata.and.throwError('Metadata not found');

      store.setMarket('aguascalientes');
      flushMicrotasks();
      store.setClientType('individual');
      flushMicrotasks();

      // Should still load package despite metadata error
      expect(store.pkg()).toEqual(mockPackage);
      expect(store.currentPolicyMetadata()).toBeUndefined();
    }));

    it('should handle PDF generation when package is not available', fakeAsync(() => {
      // Don't setup any package - test the early return when no package is available
      store.generatePDF();
      tick();
      flushMicrotasks();

      // Should show error about package selection, not PDF generation
      expect(toast.error).toHaveBeenCalledWith('Selecciona un paquete primero');
      expect(quotesApi.createQuote).not.toHaveBeenCalled();
      expect(pdf.generateQuotePDF).not.toHaveBeenCalled();
    }));

    it('should handle quote generation errors for PDF', fakeAsync(() => {
      engine.generateQuoteWithPackage.and.returnValue(throwError('Quote error'));

      store.setMarket('edomex');
      flushMicrotasks();
      store.setClientType('individual');
      flushMicrotasks();

    store.generatePDF();
    tick();

    expect(toast.error).toHaveBeenCalledWith('No se pudo construir la cotización para generar PDF');
    expect(quotesApi.createQuote).not.toHaveBeenCalled();
  }));

    it('should validate amortization with invalid rate', fakeAsync(() => {
      const packageWithZeroRate = { ...mockPackage, rate: 0 };
      engine.getProductPackageForContext.and.returnValue(of(packageWithZeroRate));

      store.setMarket('edomex');
      flushMicrotasks();
      store.setClientType('individual');
      flushMicrotasks();

      store.calculateAmortization();

      expect(toast.error).toHaveBeenCalledWith('Define el plazo y la tasa antes de calcular amortización.');
    }));

    it('should validate amortization with zero amount to finance', fakeAsync(() => {
      store.setMarket('edomex');
      flushMicrotasks();
      store.setClientType('individual');
      flushMicrotasks();

      // Set 100% down payment to make amount to finance = 0
      store.setDownPaymentPercentage(100);
      store.calculateAmortization();

      expect(toast.error).toHaveBeenCalledWith('El monto a financiar debe ser mayor a cero.');
    }));
  });

  // Collection units tests
  describe('Collection Units Management', () => {
    it('should add collection unit', () => {
      expect(store.collectionUnits().length).toBe(0);

      store.addCollectionUnit();

      expect(store.collectionUnits().length).toBe(1);
      expect(store.collectionUnits()[0]).toEqual(jasmine.objectContaining({
        id: jasmine.any(Number),
        consumption: '',
        overprice: ''
      }));
    });

    it('should update collection unit', () => {
      store.addCollectionUnit();
      const unit = store.collectionUnits()[0];

      store.updateCollectionUnit(unit.id, { consumption: '100', overprice: '2.5' });

      const updatedUnit = store.collectionUnits()[0];
      expect(updatedUnit.consumption).toBe('100');
      expect(updatedUnit.overprice).toBe('2.5');
    });

    it('should remove collection unit', () => {
      store.addCollectionUnit();
      const unitId = store.collectionUnits()[0].id;

      store.removeCollectionUnit(unitId);

      expect(store.collectionUnits().length).toBe(0);
    });

    it('should calculate monthly savings from collection units', () => {
      store.setVoluntaryContribution('1000');
      store.addCollectionUnit();
      store.updateCollectionUnit(store.collectionUnits()[0].id, { consumption: '50', overprice: '3.0' });

      expect(store.monthlySavings()).toBe(1150); // 1000 + (50 * 3.0)
    });
  });

  // Step navigation tests
  describe('Step Navigation', () => {
    beforeEach(() => {
      store.initialize(mockClient, 'acquisition');
    });

    it('should validate step 1 requirements', () => {
      expect(store.canGoNext()).toBeTrue(); // Already initialized with client

      store.setMarket('');
      expect(store.canGoNext()).toBeFalse(); // No market

      store.setMarket('edomex');
      expect(store.canGoNext()).toBeTrue(); // Market set, client type auto-set from initialization
    });

    it('should validate step 2 requirements', fakeAsync(() => {
      store.setMarket('edomex');
      flushMicrotasks();
      store.setClientType('individual');
      flushMicrotasks();

      store.nextStep();
      expect(store.currentStep()).toBe(2);
      expect(store.canGoNext()).toBeTrue(); // Has package
    }));

    it('should not advance past total steps', () => {
      store.goToStep(store.totalSteps);
      store.nextStep();
      expect(store.currentStep()).toBe(store.totalSteps);
    });

    it('should not go back before first step', () => {
      store.previousStep();
      expect(store.currentStep()).toBe(1);
    });
  });

  describe('Business validations', () => {
    beforeEach(fakeAsync(() => {
      store.initialize(mockClient, 'acquisition');
      store.setMarket('edomex');
      flushMicrotasks();
      store.setClientType('individual');
      flushMicrotasks();
      store.setTerm(12);
    }));

    it('should warn when enganche is at the mínimo permitido', () => {
      const messages = store.validationMessages();
      expect(messages.some(message => message.code === 'downPayment.at-minimum')).toBeTrue();
    });

    it('should report an error when term is outside of allowed options', () => {
      store.setTerm(99);
      const messages = store.validationMessages();
      expect(messages.some(message => message.code === 'term.invalid')).toBeTrue();
    });

    it('should expose policy hints for down payment, term and income', () => {
      expect(store.policyHint('downPayment')).toContain('Política');
      expect(store.policyHint('term')).toContain('Plazos autorizados');
      expect(store.policyHint('income')).toContain('ingreso comprobable');
    });
  });

  describe('Business validations for direct flows', () => {
    it('should block direct sales below minimum down payment', fakeAsync(() => {
      store.initialize(mockDirectClient, 'acquisition');
      store.setMarket('edomex');
      flushMicrotasks();
      store.setDownPaymentAmountDirect('1000');

      const messages = store.validationMessages();
      expect(messages.some(message => message.code === 'downPayment.min.direct')).toBeTrue();
    }));
  });

  // Client initialization tests
  describe('Client Initialization', () => {
    it('should initialize with individual client', () => {
      store.initialize(mockClient, 'acquisition');

      expect(store.client()).toEqual(mockClient);
      expect(store.market()).toBe('edomex'); // With ecosystemId, uses new market key logic
      expect(store.clientType()).toBe('individual');
      expect(store.initialMode()).toBe('acquisition');
    });

    it('should initialize with collective client', () => {
      store.initialize(mockCollectiveClient, 'acquisition');

      expect(store.client()).toEqual(mockCollectiveClient);
      expect(store.market()).toBe('edomex'); // Has ecosystemId
      expect(store.clientType()).toBe('colectivo');
    });

    it('should initialize with savings mode', () => {
      store.initialize(mockClient, 'savings');

      expect(store.initialMode()).toBe('savings');
    });
  });

  // Tanda member validation tests
  describe('Tanda Member Validation', () => {
    it('should apply tanda limits for collective clients', fakeAsync(() => {
      store.initialize(mockCollectiveClient, 'acquisition');
      store.setMarket('edomex');
      flushMicrotasks();
      store.setClientType('colectivo');
      flushMicrotasks();

      expect(store.tandaLimits()).toEqual({ min: 3, max: 15 });
      expect(store.tandaMembers()).toBe(5); // Default value, limits applied separately
    }));

    it('should constrain tanda members within limits', () => {
      store.initialize(mockCollectiveClient, 'acquisition');

      // Set high value before applying limits
      store.setTandaMembers(25);

      // Apply limits through policy metadata
      const applyLimits = store['applyPolicyMetadata'].bind(store);
      applyLimits(mockMarketPolicyMetadata, 'colectivo');

      expect(store.tandaMembers()).toBe(15); // Clamped to max
    });
  });

  // Financial calculation edge cases
  describe('Financial Calculations Edge Cases', () => {
    beforeEach(fakeAsync(() => {
      store.initialize(mockClient, 'acquisition');
      store.setMarket('edomex');
      flushMicrotasks();
      store.setClientType('individual');
      flushMicrotasks();
    }));

    it('should handle zero monthly payment calculations', () => {
      store.term.set(0); // Invalid term
      expect(store.monthlyPayment()).toBe(800); // Default calculation with loaded package
      expect(store.firstInterest()).toBe(0);
      expect(store.firstPrincipal()).toBe(0);
    });

    it('should calculate with term-multiplied components', () => {
      store.selectedOptions.set({ 'base': true, 'optional': true });
      store.term.set(24);

      // Base: 100000 (not multiplied) + Optional: 10000 * 2 years = 20000
      expect(store.totalPrice()).toBe(120000);
    });

    it('should calculate time to goal correctly', () => {
      store.setVoluntaryContribution('5000');
      store.selectedOptions.set({ 'base': true });

      const goal = store.downPayment();
      const savings = store.monthlySavings();
      expect(store.timeToGoal()).toBeCloseTo(goal / savings, 2);
    });
  });

  // Navigation and routing tests
  describe('Navigation', () => {
    it('should navigate to dashboard', () => {
      store.goToDashboard();
      expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
    });
  });

  // Utility function tests
  describe('Utility Functions', () => {
    it('should convert values to numbers safely', () => {
      const toNumber = store['toNumber'].bind(store);

      expect(toNumber('123.45')).toBe(123.45);
      expect(toNumber(678.90)).toBe(678.90);
      expect(toNumber('invalid')).toBe(0);
      expect(toNumber(null)).toBe(0);
      expect(toNumber(undefined)).toBe(0);
      expect(toNumber(Infinity)).toBe(0);
      expect(toNumber(NaN)).toBe(0);
    });

    it('should identify venta directa flow', () => {
      const ventaDirectaClient = { ...mockClient, flow: BusinessFlow.VentaDirecta };
      store.initialize(ventaDirectaClient, 'acquisition');

      expect(store.isVentaDirecta()).toBeTrue();
    });

    it('should handle direct down payment for venta directa', () => {
      const ventaDirectaClient = { ...mockClient, flow: BusinessFlow.VentaDirecta };
      store.initialize(ventaDirectaClient, 'acquisition');
      store.setDownPaymentAmountDirect('75000');

      expect(store.downPayment()).toBe(75000);
    });
  });
});
