import { TestBed, fakeAsync, tick } from '@angular/core/testing';

import { CotizadorEngineService } from './cotizador-engine.service';
import { FinancialCalculatorService } from './financial-calculator.service';
import { BusinessFlow } from '@interfaces/types';
import { Quote } from '@interfaces/business';

describe('CotizadorEngineService financial accuracy', () => {
  let service: CotizadorEngineService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CotizadorEngineService, FinancialCalculatorService]
    });

    service = TestBed.inject(CotizadorEngineService);
  });

  it('matches legacy annuity values for Aguascalientes plazo (12 meses)', fakeAsync(() => {
    let result: Quote & { packageData: unknown } | undefined;

    service
      .generateQuoteWithPackage('aguascalientes-plazo', [], 0, 12)
      .subscribe(value => (result = value));

    tick(700); // getProductPackage delay (600ms) + mapping delay (100ms)

    expect(result).toBeDefined();
    expect(result!.downPayment).toBeCloseTo(511800, 0);
    expect(result!.amountToFinance).toBeCloseTo(341200, 0);
    expect(result!.monthlyPayment).toBeCloseTo(32511.93, 2);
  }));


it('normalizes EdoMex market keys and preserves CAT calculations', fakeAsync(() => {
  let result: Quote & { packageData: unknown } | undefined;

  service
    .generateQuoteWithPackage('edomex-colectivo', [], 0, 60)
    .subscribe(value => (result = value));

  tick(700);

  expect(result).toBeDefined();
  expect(result!.market).toBe('edomex');
  expect(result!.downPayment).toBeCloseTo(153075, 0);
  expect(result!.amountToFinance).toBeCloseTo(867425, 0);
  expect(result!.monthlyPayment).toBeCloseTo(28010.89, 2);

  const cat = service.getCAT(result!);
  expect(cat).toBeCloseTo(34.36, 2);
}));

  it('computes CAT within expected tolerance for Aguascalientes cuota anual', () => {
    const referenceQuote: Quote = {
      totalPrice: 853000,
      downPayment: 511800,
      amountToFinance: 341200,
      term: 12,
      monthlyPayment: 32511.93,
      market: 'aguascalientes',
      clientType: 'Individual',
      flow: BusinessFlow.VentaPlazo
    };

    const cat = service.getCAT(referenceQuote);
    expect(cat).toBeCloseTo(28.7, 1);
  });

  it('enforces minimum down payment rule for Aguascalientes', () => {
    const packageStub = {
      name: 'Paquete Venta a Plazo - Aguascalientes',
      rate: 0.255,
      terms: [12, 24],
      minDownPaymentPercentage: 0.6,
      components: []
    };

    const validation = service.validateDownPaymentRange(packageStub, 100000, 50000);

    expect(validation.valid).toBeFalse();
    expect(validation.errors.join(' ')).toContain('60%');
  });
});
