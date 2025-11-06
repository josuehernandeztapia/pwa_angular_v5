import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of } from 'rxjs';

import { OnboardingRequirementsService } from './onboarding-requirements.service';
import { Document } from '@interfaces/types';
import { AviDocumentMatchSnapshot } from './onboarding-requirements.models';

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
      isAviRequired: true,
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

    expect(service.snapshot()).toBeTruthy();

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

  it('blocks AVI requirement when document comparison fails', fakeAsync(() => {
    const documents: Document[] = [
      { id: 'doc-ine', name: 'INE anverso/reverso', status: 'Aprobado' } as any,
      { id: 'doc-proof', name: 'Comprobante de domicilio', status: 'Aprobado' } as any,
      { id: 'doc-kyc', name: 'Verificación Biométrica', status: 'Pendiente' } as any
    ];

    const match: AviDocumentMatchSnapshot = {
      status: 'mismatch',
      score: 0.42,
      evaluatedAt: Date.now(),
      fields: [
        { id: 'fullName', documentValue: 'Cliente Demo', aviValue: 'Cliente Demo', similarity: 1, status: 'match', confidence: 0.9 },
        { id: 'curp', documentValue: 'DEMO010101HDFRRN00', aviValue: 'DEMO999999HDFRRN00', similarity: 0, status: 'mismatch', confidence: 0.8 },
        { id: 'address', documentValue: null, aviValue: null, similarity: 0, status: 'insufficient', confidence: 0 }
      ]
    };

    service.update({
      context: baseContext,
      documents,
      aviDocumentMatch: match
    });

    tick();

    const snapshot = service.snapshot();
    expect(snapshot?.aviRequirement?.status).toBe('blocked');
    expect(snapshot?.aviRequirement?.metadata?.['documentMatch']).toEqual(match);
  }));

  it('marks AVI requirement as completed when manual override is applied', fakeAsync(() => {
    const documents: Document[] = [
      { id: 'doc-ine', name: 'INE anverso/reverso', status: 'Aprobado' } as any,
      { id: 'doc-proof', name: 'Comprobante de domicilio', status: 'Aprobado' } as any,
      { id: 'doc-kyc', name: 'Verificación Biométrica', status: 'Pendiente' } as any
    ];

    const match: AviDocumentMatchSnapshot = {
      status: 'mismatch',
      score: 0.51,
      evaluatedAt: Date.now(),
      fields: [
        { id: 'fullName', documentValue: 'Cliente Demo', aviValue: 'Cliente Demo', similarity: 1, status: 'match', confidence: 0.9 },
        { id: 'curp', documentValue: 'DEMO010101HDFRRN00', aviValue: 'DEMO999999HDFRRN00', similarity: 0, status: 'mismatch', confidence: 0.8 }
      ]
    };

    service.update({
      context: baseContext,
      documents,
      aviDocumentMatch: match
    });

    tick();

    expect(service.snapshot()?.aviRequirement?.status).toBe('blocked');

    service.setAviManualOverride({
      decision: 'forced',
      comment: 'Validado directamente con cliente',
      forcedAt: Date.now(),
      forcedBy: 'asesor-test'
    });

    const overrideSnapshot = service.snapshot();
    expect(overrideSnapshot?.aviRequirement?.status).toBe('completed');
    expect(overrideSnapshot?.aviRequirement?.metadata?.['documentMatchOverride']).toEqual(jasmine.objectContaining({
      decision: 'forced',
      comment: 'Validado directamente con cliente'
    }));
  }));
});
