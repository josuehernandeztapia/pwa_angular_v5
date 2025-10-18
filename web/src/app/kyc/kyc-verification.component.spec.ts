import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { KycVerificationComponent } from './kyc-verification.component';
import { FlowContextService } from '@core-services/flow-context.service';
import { ToastService } from '@core-services/toast.service';
import { AnalyticsService } from '@core-services/analytics.service';
import { ClientsApiService } from '@data-access/clients/clients-api.service';
import { MetaMapService } from '@feature-services/integrations/metamap.service';
import { Client, DocumentStatus } from '@interfaces/types';

const mockClient: Client = {
  id: 'cli-1',
  name: 'Cliente Demo',
  flow: 'VentaPlazo' as any,
  status: 'Activo',
  documents: [
    { id: 'doc-ine', name: 'Identificación oficial (INE)', status: DocumentStatus.Aprobado },
    { id: 'doc-comp', name: 'Comprobante de domicilio', status: DocumentStatus.Aprobado },
    { id: 'doc-kyc', name: 'Verificación Biométrica MetaMap', status: DocumentStatus.Pendiente }
  ],
  events: []
};

class FlowContextServiceStub {
  setBreadcrumbs = jasmine.createSpy('setBreadcrumbs');
}

class ToastServiceStub {
  success = jasmine.createSpy('success');
  warning = jasmine.createSpy('warning');
  info = jasmine.createSpy('info');
  error = jasmine.createSpy('error');
}

class AnalyticsServiceStub {
  track = jasmine.createSpy('track');
}

class ClientsApiServiceStub {
  getClients = jasmine.createSpy('getClients').and.returnValue(of([mockClient]));
}

class MetaMapServiceStub {
  validateKycPrerequisites(client: Client) {
    const kycDoc = client.documents.find(doc => doc.id === 'doc-kyc');
    const isComplete = kycDoc?.status === DocumentStatus.Aprobado;
    return {
      canStartKyc: !isComplete,
      isKycComplete: isComplete,
      missingDocs: [],
      tooltipMessage: ''
    };
  }

  completeKyc = jasmine.createSpy('completeKyc').and.returnValue(
    of({
      ...mockClient,
      documents: mockClient.documents.map(doc =>
        doc.id === 'doc-kyc' ? { ...doc, status: DocumentStatus.Aprobado } : doc
      )
    })
  );
}

describe('KycVerificationComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KycVerificationComponent],
      providers: [
        { provide: FlowContextService, useClass: FlowContextServiceStub },
        { provide: ToastService, useClass: ToastServiceStub },
        { provide: AnalyticsService, useClass: AnalyticsServiceStub },
        { provide: ClientsApiService, useClass: ClientsApiServiceStub },
        { provide: MetaMapService, useClass: MetaMapServiceStub }
      ]
    }).compileComponents();
  });

  it('should load clients and allow KYC simulation', () => {
    const fixture = TestBed.createComponent(KycVerificationComponent);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    expect(component.clients().length).toBe(1);
    component.startKyc();

    const updatedDoc = component.selectedClient()?.documents.find(doc => doc.id === 'doc-kyc');
    expect(updatedDoc?.status).toBe(DocumentStatus.Aprobado);
  });
});
