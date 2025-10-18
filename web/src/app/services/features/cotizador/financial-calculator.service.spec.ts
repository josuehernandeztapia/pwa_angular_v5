import { TestBed } from '@angular/core/testing';

import { FinancialCalculatorService } from './financial-calculator.service';

describe('FinancialCalculatorService', () => {
  let service: FinancialCalculatorService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [FinancialCalculatorService]
    });
    service = TestBed.inject(FinancialCalculatorService);
  });

  it('calculates IRR using Newton-Raphson for simple cash flow', () => {
    const cashFlows = [-1000, 1100];
    const irr = service.calculateTIR(cashFlows);
    expect(irr).toBeCloseTo(0.1, 5);
  });

  it('derives monthly rate via binary search to match payment schedule', () => {
    const principal = 100000;
    const term = 12;
    const expectedMonthlyRate = 0.01; // 12% anual
    const monthlyPayment = service.annuity(principal, expectedMonthlyRate, term);

    const computedRate = service.computeImpliedMonthlyRateFromAnnuity(principal, monthlyPayment, term, {
      tolerance: 1e-6
    });

    expect(computedRate).toBeCloseTo(expectedMonthlyRate, 6);
  });

  it('returns annual target IRR from inferred monthly rate', () => {
    const principal = 250000;
    const term = 24;
    const monthlyRate = 0.0125; // 1.25% mensual ~ 15% anual
    const monthlyPayment = service.annuity(principal, monthlyRate, term);

    const annual = service.getTargetContractIRRAnnual(principal, monthlyPayment, term);
    expect(annual).toBeCloseTo(monthlyRate * 12, 6);
  });
});
