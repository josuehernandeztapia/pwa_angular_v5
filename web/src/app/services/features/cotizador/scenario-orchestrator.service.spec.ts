import { ScenarioOrchestratorService } from './scenario-orchestrator.service';
import { FinancialCalculatorService } from '@feature-services/cotizador/financial-calculator.service';
import { CotizadorEngineService } from '@feature-services/cotizador/cotizador-engine.service';

describe('ScenarioOrchestratorService', () => {
  let service: ScenarioOrchestratorService;

  beforeEach(() => {
    const financialCalc = new FinancialCalculatorService();
    const cotizador = new CotizadorEngineService(financialCalc);
    const tandaEngineStub = {} as any;
    const protectionEngineStub = {} as any;
    const simuladorStub = {} as any;

    service = new ScenarioOrchestratorService(
      financialCalc,
      cotizador,
      tandaEngineStub,
      protectionEngineStub,
      simuladorStub
    );
  });

  it('uses catalog packages for AGS individual quotes', async () => {
    const result = await service.createAGSIndividualCotizacion('Cliente Demo', 853000, 511800, 12);

    expect(result.quote).toBeDefined();
    expect(result.quote?.totalPrice).toBeCloseTo(853000, 0);
    expect(result.quote?.downPayment).toBeCloseTo(511800, 0);
    expect(result.quote?.amountToFinance).toBeCloseTo(341200, 0);
    expect(result.quote?.monthlyPayment).toBeCloseTo(32511.93, 2);
    expect(result.quote?.term).toBe(12);
  });

  it('aligns EdoMex collective scenario with package configuration', async () => {
    const result = await service.createEdoMexCollectiveCotizacion('Grupo Demo', 0, 153075, 60, 6);

    expect(result.quote).toBeDefined();
    expect(result.quote?.totalPrice).toBeGreaterThan(0);
    expect(result.quote?.downPayment).toBeCloseTo(153075, 0);
    expect(result.quote?.term).toBe(60);
    expect(result.quote?.monthlyPayment).toBeCloseTo(28010.89, 2);
  });
});
