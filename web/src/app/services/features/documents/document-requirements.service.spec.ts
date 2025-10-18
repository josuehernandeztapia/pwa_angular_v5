import { TestBed } from '@angular/core/testing';
import { DocumentRequirementsService } from './document-requirements.service';
import { MarketPolicyService } from '@feature-services/configuration/market-policy.service';
import { BusinessFlow, DocumentStatus } from '@interfaces/types';

describe('DocumentRequirementsService', () => {
  let service: DocumentRequirementsService;
  let marketPolicy: jasmine.SpyObj<MarketPolicyService>;

  beforeEach(() => {
    marketPolicy = jasmine.createSpyObj('MarketPolicyService', ['getPolicyDocuments', 'toDocuments']);

    TestBed.configureTestingModule({
      providers: [
        DocumentRequirementsService,
        { provide: MarketPolicyService, useValue: marketPolicy }
      ]
    });

    service = TestBed.inject(DocumentRequirementsService);
  });

  it('should map requirements through MarketPolicyService', (done) => {
    const docs = [{ id: 'doc-1', name: 'INE', status: DocumentStatus.Pendiente }];
    marketPolicy.getPolicyDocuments.and.returnValue({} as any);
    marketPolicy.toDocuments.and.returnValue(docs as any);

    service.getDocumentRequirements({
      market: 'edomex',
      saleType: 'financiero',
      businessFlow: BusinessFlow.Individual,
      clientType: 'individual'
    }).subscribe(result => {
      expect(result).toEqual(docs as any);
      expect(marketPolicy.getPolicyDocuments).toHaveBeenCalled();
      expect(marketPolicy.toDocuments).toHaveBeenCalled();
      done();
    });
  });

  it('should compute completion status for required and optional documents', () => {
    const status = service.getDocumentCompletionStatus([
      { id: 'req-1', status: DocumentStatus.Aprobado },
      { id: 'req-2', status: DocumentStatus.Pendiente },
      { id: 'opt-1', status: DocumentStatus.Aprobado, isOptional: true }
    ] as any);

    expect(status.totalDocs).toBe(3);
    expect(status.completedDocs).toBe(2);
    expect(status.pendingDocs).toBe(1);
    expect(status.completionPercentage).toBe(50);
    expect(status.allComplete).toBeFalse();
  });

  it('should validate KYC prerequisites', () => {
    const result = service.validateKycPrerequisites([
      { name: 'INE', status: DocumentStatus.Aprobado },
      { name: 'Comprobante de domicilio', status: DocumentStatus.Aprobado },
      { name: 'KYC Biométrico', status: DocumentStatus.Pendiente }
    ] as any);

    expect(result.canStartKyc).toBeTrue();
    expect(result.missingDocs.length).toBe(0);
    expect(result.isKycComplete).toBeFalse();
  });

  it('should update document status asynchronously', (done) => {
    service.updateDocumentStatus([
      { id: 'doc-1', status: DocumentStatus.Pendiente },
      { id: 'doc-2', status: DocumentStatus.Pendiente }
    ] as any, 'doc-2', DocumentStatus.Aprobado).subscribe(updated => {
      expect(updated.find(d => d.id === 'doc-2')?.status).toBe(DocumentStatus.Aprobado);
      done();
    });
  });

  it('should build requirements message per flow', () => {
    const message = service.getRequirementsMessage({
      market: 'edomex',
      saleType: 'financiero',
      businessFlow: BusinessFlow.CreditoColectivo
    });

    expect(message.toLowerCase()).toContain('crédito colectivo');
  });
});
