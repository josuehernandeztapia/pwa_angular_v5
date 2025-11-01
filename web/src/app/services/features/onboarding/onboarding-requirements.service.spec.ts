import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of } from 'rxjs';

import { OnboardingRequirementsService } from './onboarding-requirements.service';
import { Document } from '@interfaces/types';

class DocumentRequirementsServiceStub {
  getDocumentRequirements = jasmine.createSpy('getDocumentRequirements').and.callFake(() =>
    of([
      { id: 'doc-ine', name: 'INE anverso/reverso' } as Document,
      { id: 'doc-proof', name: 'Comprobante de domicilio' } as Document,
      { id: 'doc-kyc', name: 'Verificación Biométrica' } as Document
    ])
  );

  validateKycPrerequisites() {
    return {
      canStartKyc: false,
      missingDocs: ['INE anverso/reverso'],
      isKycComplete: false,
      tooltipMessage: 'Falta documento INE'
    };
  }
}

class AviEligibilityServiceStub {
  evaluate() {
    return {
      isAviRequired: false,
      isEligible: true,
      completionRatio: 1,
      completedCount: 0,
      totalCount: 0,
      pendingCount: 0,
      requirements: []
    };
  }
}

describe('OnboardingRequirementsService', () => {
  let service: OnboardingRequirementsService;
  let documentReqs: DocumentRequirementsServiceStub;

  beforeEach(() => {
    documentReqs = new DocumentRequirementsServiceStub();

    TestBed.configureTestingModule({});

    service = new OnboardingRequirementsService(
      documentReqs as unknown as any,
      new AviEligibilityServiceStub() as any
    );
  });

  const baseContext = {
    market: 'edomex',
    saleType: 'financiero' as const,
    clientType: 'individual' as const
  };

  it('builds pending requirements snapshot', fakeAsync(() => {
    service.update({
      context: baseContext,
      documents: []
    });

    expect(service.snapshot()).toBeNull();

    tick();

    const snapshot = service.snapshot();
    expect(snapshot).toBeTruthy();
    expect(snapshot!.documents.length).toBeGreaterThan(0);
    expect(snapshot!.pendingCount).toBeGreaterThan(0);
  }));

  it('marks approved documents as completed', fakeAsync(() => {
    const documents: Document[] = [
      { id: 'doc-ine', name: 'INE anverso/reverso', status: 'Aprobado' } as any,
      { id: 'doc-proof', name: 'Comprobante de domicilio', status: 'Aprobado' } as any
    ];

    service.update({
      context: baseContext,
      documents
    });

    tick();

    const snapshot = service.snapshot();
    expect(snapshot).toBeTruthy();
    const completed = snapshot!.documents.filter(doc => doc.status === 'completed');
    expect(completed.length).toBeGreaterThanOrEqual(2);
  }));
});
