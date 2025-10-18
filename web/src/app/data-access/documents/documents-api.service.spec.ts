import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { DocumentsApiService } from './documents-api.service';
import { ClientsApiService } from '@data-access/clients/clients-api.service';
import { OfflineService } from '@core-services/offline.service';
import { DocumentStatus } from '@interfaces/types';

describe('DocumentsApiService', () => {
  let service: DocumentsApiService;
  let clientsApi: jasmine.SpyObj<ClientsApiService>;
  let offline: jasmine.SpyObj<OfflineService>;

  beforeEach(() => {
    clientsApi = jasmine.createSpyObj<ClientsApiService>('ClientsApiService', [
      'getClientDocuments',
      'updateDocumentStatus',
      'applyLocalDocumentPatch'
    ]);

    offline = jasmine.createSpyObj<OfflineService>('OfflineService', [
      'isOffline',
      'storeOfflineRequest'
    ]);

    TestBed.configureTestingModule({
      providers: [
        DocumentsApiService,
        { provide: ClientsApiService, useValue: clientsApi },
        { provide: OfflineService, useValue: offline }
      ]
    });

    service = TestBed.inject(DocumentsApiService);
  });

  it('retrieves documents via clients API', () => {
    clientsApi.getClientDocuments.and.returnValue(of([]));

    service.getClientDocuments('123').subscribe();

    expect(clientsApi.getClientDocuments).toHaveBeenCalledWith('123');
  });

  it('updates document status online through clients API', done => {
    offline.isOffline.and.returnValue(false);
    clientsApi.updateDocumentStatus.and.returnValue(of(null));

    service.updateDocumentStatus('1', 'doc', DocumentStatus.Aprobado).subscribe(() => {
      expect(clientsApi.updateDocumentStatus).toHaveBeenCalledWith('1', 'doc', DocumentStatus.Aprobado, {});
      expect(offline.storeOfflineRequest).not.toHaveBeenCalled();
      done();
    });
  });

  it('queues document update when offline', done => {
    offline.isOffline.and.returnValue(true);

    service.updateDocumentStatus('1', 'doc', DocumentStatus.EnRevision, { reviewNotes: 'pending' }).subscribe(result => {
      expect(offline.storeOfflineRequest).toHaveBeenCalledWith('clients/1/documents/doc', 'PATCH', {
        status: DocumentStatus.EnRevision,
        reviewNotes: 'pending'
      });
      expect(clientsApi.applyLocalDocumentPatch).toHaveBeenCalledWith('1', {
        id: 'doc',
        status: DocumentStatus.EnRevision,
        reviewNotes: 'pending'
      });
      expect(result?.id).toBe('doc');
      done();
    });
  });
});
