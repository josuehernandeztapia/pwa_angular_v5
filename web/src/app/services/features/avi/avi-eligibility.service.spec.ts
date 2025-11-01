import { Document, DocumentStatus } from '@interfaces/types';

import { AviEligibilityService } from './avi-eligibility.service';

class DocumentRequirementsStub {
  validateKycPrerequisites(documents: Document[]) {
    const ine = documents.find(doc => doc.name === 'INE Vigente');
    const comprobante = documents.find(doc => doc.name === 'Comprobante de domicilio');
    const kyc = documents.find(doc => doc.name.includes('Verificación Biométrica'));

    const missingDocs: string[] = [];
    if (ine?.status !== DocumentStatus.Aprobado) {
      missingDocs.push('INE Vigente');
    }
    if (comprobante?.status !== DocumentStatus.Aprobado) {
      missingDocs.push('Comprobante de domicilio');
    }

    const coreDocsApproved = missingDocs.length === 0;
    const isKycComplete = kyc?.status === DocumentStatus.Aprobado;

    return {
      canStartKyc: coreDocsApproved && !isKycComplete,
      missingDocs,
      isKycComplete,
      tooltipMessage: ''
    };
  }
}

describe('AviEligibilityService', () => {
  let service: AviEligibilityService;

  beforeEach(() => {
    service = new AviEligibilityService(new DocumentRequirementsStub() as any);
  });

  it('marks requirements as completed when status and documents are valid', () => {
    const documents: Document[] = [
      { id: 'ine', name: 'INE Vigente', status: DocumentStatus.Aprobado },
      { id: 'dom', name: 'Comprobante de domicilio', status: DocumentStatus.Aprobado }
    ];

    const snapshot = service.evaluate({
      clientStatus: 'Expediente en Proceso',
      documents,
      showAviOverride: true
    });

    expect(snapshot.isEligible).toBeTrue();
    expect(snapshot.pendingCount).toBe(0);
    expect(snapshot.requirements.every(req => req.completed)).toBeTrue();
  });

  it('flags status requirement when client is not in expediente', () => {
    const documents: Document[] = [
      { id: 'ine', name: 'INE Vigente', status: DocumentStatus.Aprobado },
      { id: 'dom', name: 'Comprobante de domicilio', status: DocumentStatus.Aprobado }
    ];

    const snapshot = service.evaluate({
      clientStatus: 'Pendiente',
      documents,
      showAviOverride: true
    });

    const statusRequirement = snapshot.requirements.find(req => req.id === 'client-status');
    expect(snapshot.isEligible).toBeFalse();
    expect(statusRequirement?.completed).toBeFalse();
  });

  it('omits status requirement when client status is unavailable', () => {
    const documents: Document[] = [
      { id: 'ine', name: 'INE Vigente', status: DocumentStatus.Aprobado },
      { id: 'dom', name: 'Comprobante de domicilio', status: DocumentStatus.Aprobado }
    ];

    const snapshot = service.evaluate({
      documents,
      showAviOverride: true
    });

    expect(snapshot.requirements.find(req => req.id === 'client-status')).toBeUndefined();
  });

  it('lists missing documents as pending requirements', () => {
    const documents: Document[] = [
      { id: 'ine', name: 'INE Vigente', status: DocumentStatus.Pendiente },
      { id: 'dom', name: 'Comprobante de domicilio', status: DocumentStatus.Pendiente }
    ];

    const snapshot = service.evaluate({
      clientStatus: 'Expediente en Proceso',
      documents,
      showAviOverride: true
    });

    expect(snapshot.isEligible).toBeFalse();
    expect(snapshot.pendingCount).toBe(2);
    expect(snapshot.requirements.filter(req => !req.completed).map(req => req.label)).toEqual([
      'INE Vigente validado',
      'Comprobante de domicilio validado'
    ]);
  });
});
