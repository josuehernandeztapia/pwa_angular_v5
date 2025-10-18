import { MarketPolicyService } from './market-policy.service';

describe('MarketPolicyService – otros market coverage', () => {
  let service: MarketPolicyService;

  beforeEach(() => {
    service = new MarketPolicyService();
  });

  it('exposes "otros" market in available policies', () => {
    const policies = service.getAvailablePolicies();
    expect(policies).toContain(jasmine.objectContaining({ market: 'otros', clientType: 'individual' }));
    expect(policies).toContain(jasmine.objectContaining({ market: 'otros', clientType: 'colectivo' }));
  });

  it('returns enriched documents for otros individual financiero context', () => {
    const result = service.getPolicyDocuments({
      market: 'otros',
      clientType: 'individual',
      saleType: 'financiero'
    });

    expect(result.documents.some(doc => doc.id === 'doc-licencia')).toBeTrue();
    const incomeDoc = result.documents.find(doc => doc.id === 'doc-income');
    expect(incomeDoc).toBeDefined();
    expect(incomeDoc?.optional).toBeFalse();
    expect(result.metadata.ocrThreshold).toBeCloseTo(0.82, 2);
    expect(result.metadata.protection?.required).toBeFalse();
  });

  it('builds collective roster requirements for otros colectivos', () => {
    const result = service.getPolicyDocuments({
      market: 'otros',
      clientType: 'colectivo',
      saleType: 'financiero',
      collectiveSize: 4
    });

    const memberIds = result.documents.filter(doc => doc.group === 'member').map(doc => doc.id);
    expect(memberIds).toContain('doc-ine-miembro-1');
    expect(memberIds).toContain('doc-proof-miembro-1');
    expect(result.metadata.tanda?.minMembers).toBe(3);
    expect(result.metadata.protection?.required).toBeTrue();
  });
});
