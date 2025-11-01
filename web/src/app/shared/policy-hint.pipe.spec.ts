import { PolicyHintPipe, PolicyHintOptions } from './policy-hint.pipe';
import { MarketPolicyContext, MarketPolicyMetadata, MarketPolicyService } from '@services/features/configuration/market-policy.service';
import { BusinessFlow } from '@interfaces/types';

describe('PolicyHintPipe', () => {
  let pipe: PolicyHintPipe;
  let marketPolicy: jasmine.SpyObj<MarketPolicyService>;
  const baseContext: MarketPolicyContext = {
    market: 'edomex',
    clientType: 'individual',
    saleType: 'financiero',
    businessFlow: BusinessFlow.VentaPlazo
  };

  const metadata: MarketPolicyMetadata = {
    ocrThreshold: 0.8,
    expiryRules: {
      ine: '12 meses',
      comprobante_ingresos: '6 meses'
    },
    income: { threshold: 0.35, documentId: 'comprobante_ingresos' },
    tanda: {
      minMembers: 4,
      maxMembers: 8,
      minContribution: 2500,
      maxContribution: 6000,
      minRounds: 6,
      maxRounds: 18
    }
  } as unknown as MarketPolicyMetadata;

  beforeEach(() => {
    marketPolicy = jasmine.createSpyObj<MarketPolicyService>('MarketPolicyService', [
      'getPolicyMetadata',
      'getDocumentById',
      'getExpiryRules'
    ]);

    marketPolicy.getPolicyMetadata.and.returnValue(metadata);
    marketPolicy.getDocumentById.and.returnValue(undefined);
    marketPolicy.getExpiryRules.and.returnValue(metadata.expiryRules);

    pipe = new PolicyHintPipe(marketPolicy);
  });

  it('returns income hint with formatted ratio', () => {
    const hint = pipe.transform('income', { context: baseContext });
    expect(hint).toContain('35%');
  });

  it('includes suggested income when monthly payment is provided', () => {
    const hint = pipe.transform('income', { context: baseContext, monthlyPayment: 7000 });
    expect(hint).toContain('$20,000');
  });

  it('formats down payment hint with amount and percentages', () => {
    const options: PolicyHintOptions = {
      context: baseContext,
      totalPrice: 500000,
      minDownPaymentPct: 0.2,
      maxDownPaymentPct: 0.35
    };

    const hint = pipe.transform('downPayment', options);
    expect(hint).toContain('20%');
    expect(hint).toContain('$100,000');
    expect(hint).toContain('35%');
  });

  it('falls back to expiry rules for document hints', () => {
    const hint = pipe.transform('documentExpiry', { context: baseContext, documentId: 'ine' });
    expect(hint).toBe('Vigencia: 12 meses.');
  });

  it('returns tanda contribution message with range', () => {
    const hint = pipe.transform('tandaContribution', { context: baseContext });
    expect(hint).toContain('2,500');
    expect(hint).toContain('6,000');
  });
});
