import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { ClientsApiService } from './clients-api.service';
import { HttpClientService, ApiResponse } from '@core-services/http-client.service';
import { ClientsMockAdapter } from '@internal-services/mock-adapters/clients-mock.adapter';
import { Client, BusinessFlow, DocumentStatus, Document } from '@interfaces/types';
import { environment } from '@environments/environment';

describe('ClientsApiService', () => {
  let service: ClientsApiService;
  let mockHttp: jasmine.SpyObj<HttpClientService>;
  let mockClients: jasmine.SpyObj<ClientsMockAdapter>;

  const demoDocument: Document = {
    id: 'doc-1',
    name: 'INE',
    status: DocumentStatus.Pendiente
  } as Document;

  const demoClients: Client[] = [
    {
      id: '1',
      name: 'Cliente Demo',
      flow: BusinessFlow.VentaPlazo,
      status: 'Activo',
      documents: [demoDocument],
      events: [],
      createdAt: new Date(),
      lastModified: new Date(),
      market: 'edomex'
    } as Client
  ];

  const originalMockFlag = environment.features.enableMockData;

  beforeEach(() => {
    mockHttp = jasmine.createSpyObj<HttpClientService>('HttpClientService', [
      'get',
      'post',
      'put',
      'patch',
      'delete',
      'uploadFile'
    ]);

    mockClients = jasmine.createSpyObj<ClientsMockAdapter>('ClientsMockAdapter', [
      'getClients',
      'getClientById',
      'createClient',
      'updateClient',
      'deleteClient',
      'updateDocumentStatus',
      'addClientEvent',
      'getEcosystems',
      'getCollectiveGroups',
      'getCollectiveMembers',
      'getEcosystemHierarchy'
    ]);

    TestBed.configureTestingModule({
      providers: [
        ClientsApiService,
        { provide: HttpClientService, useValue: mockHttp },
        { provide: ClientsMockAdapter, useValue: mockClients }
      ]
    });

    service = TestBed.inject(ClientsApiService);
  });

  afterEach(() => {
    environment.features.enableMockData = originalMockFlag;
  });

  it('loads clients from mock API and updates signal', done => {
    mockClients.getClients.and.returnValue(of(demoClients));

    service.getClients().subscribe(result => {
      expect(result).toEqual(demoClients);
      expect(service.clients().length).toBe(1);
      done();
    });
  });

  it('creates client using mock API and appends to cache', done => {
    const newClient = { ...demoClients[0], id: '2', name: 'Nuevo' };
    mockClients.createClient.and.returnValue(of(newClient));
    service.createClient(newClient).subscribe(result => {
      expect(result).toEqual(newClient);
      expect(service.clients()).toContain(newClient);
      done();
    });
  });

  it('uploads document in mock mode using document status update', done => {
    const clientWithDoc = {
      ...demoClients[0],
      documents: [{ id: 'doc-1', name: 'INE', status: DocumentStatus.Pendiente }]
    } as Client;

    mockClients.updateDocumentStatus.and.returnValue(of({
      ...clientWithDoc,
      documents: [{ id: 'doc-1', name: 'INE', status: DocumentStatus.EnRevision }]
    } as Client));

    service.uploadDocument(clientWithDoc.id, 'doc-1', new File([], 'test.pdf')).subscribe(doc => {
      expect(doc.status).toBe(DocumentStatus.EnRevision);
      done();
    });
  });

  it('updates document status through mock adapter', done => {
    environment.features.enableMockData = true;
    const updatedClient = {
      ...demoClients[0],
      documents: [{ ...demoDocument, status: DocumentStatus.Aprobado }]
    } as Client;
    mockClients.updateDocumentStatus.and.returnValue(of(updatedClient));

    service.updateDocumentStatus('1', 'doc-1', DocumentStatus.Aprobado).subscribe(result => {
      expect(mockClients.updateDocumentStatus).toHaveBeenCalledWith('1', 'doc-1', DocumentStatus.Aprobado, jasmine.any(Object));
      expect(result?.status).toBe(DocumentStatus.Aprobado);
      done();
    });
  });

  it('updates document status via HTTP when mock disabled', done => {
    environment.features.enableMockData = false;
    const response = { success: true, data: { ...demoDocument, status: DocumentStatus.Rechazado } } as ApiResponse<Document>;
    mockHttp.patch.and.returnValue(of(response));

    service.updateDocumentStatus('1', 'doc-1', DocumentStatus.Rechazado).subscribe(result => {
      expect(mockHttp.patch).toHaveBeenCalledWith('clients/1/documents/doc-1', { status: DocumentStatus.Rechazado }, jasmine.any(Object));
      expect(result?.status).toBe(DocumentStatus.Rechazado);
      done();
    });
  });

  it('merges additional document metadata when provided', done => {
    const docWithMeta = { ...demoDocument, status: DocumentStatus.Aprobado, verificationId: 'ver-1' } as Document;
    environment.features.enableMockData = true;
    mockClients.updateDocumentStatus.and.returnValue(of({
      ...demoClients[0],
      documents: [docWithMeta]
    } as Client));

    service.updateDocumentStatus('1', 'doc-1', DocumentStatus.Aprobado, { verificationId: 'ver-1' }).subscribe(result => {
      expect(result?.verificationId).toBe('ver-1');
      done();
    });
  });

  describe('ecosystem and collective endpoints', () => {
    it('returns ecosystems from mock adapter when mock data enabled', done => {
      environment.features.enableMockData = true;
      const ecosystems = [{ id: 'eco-1', name: 'Ruta Centro' } as any];
      mockClients.getEcosystems.and.returnValue(of(ecosystems));

      service.getEcosystems().subscribe(result => {
        expect(mockClients.getEcosystems).toHaveBeenCalled();
        expect(result).toEqual(ecosystems);
        done();
      });
    });

    it('fetches ecosystems via HTTP when mock disabled', done => {
      environment.features.enableMockData = false;
      const response = { success: true, data: [{ id: 'eco-2', name: 'Ruta Norte' }] } as ApiResponse<any[]>;
      mockHttp.get.and.returnValue(of(response));

      service.getEcosystems().subscribe(result => {
        expect(mockHttp.get).toHaveBeenCalledWith('clients/ecosystems');
        expect(result).toEqual(response.data || []);
        done();
      });
    });

    it('returns collective groups filtered by ecosystem when mock enabled', done => {
      environment.features.enableMockData = true;
      const groups = [{ id: 'g1', ecosystemId: 'eco-1' }, { id: 'g2', ecosystemId: 'eco-2' }] as any[];
      mockClients.getCollectiveGroups.and.returnValue(of(groups.filter(g => g.ecosystemId === 'eco-1')));

      service.getCollectiveGroups('eco-1').subscribe(result => {
        expect(mockClients.getCollectiveGroups).toHaveBeenCalledWith('eco-1');
        expect(result.length).toBeGreaterThan(0);
        done();
      });
    });

    it('returns collective members when mock enabled', done => {
      environment.features.enableMockData = true;
      mockClients.getCollectiveMembers.and.returnValue(of(demoClients));

      service.getCollectiveMembers('group-1').subscribe(result => {
        expect(mockClients.getCollectiveMembers).toHaveBeenCalledWith('group-1');
        expect(result).toEqual(demoClients);
        done();
      });
    });

    it('returns ecosystem hierarchy in mock mode', done => {
      environment.features.enableMockData = true;
      const hierarchy = [{ ecosystem: { id: 'eco-1' }, groups: [] }] as any;
      mockClients.getEcosystemHierarchy.and.returnValue(of(hierarchy));

      service.getEcosystemHierarchy().subscribe(result => {
        expect(mockClients.getEcosystemHierarchy).toHaveBeenCalled();
        expect(result).toEqual(hierarchy);
        done();
      });
    });
  });
});
