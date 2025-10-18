import { DOCUMENT } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';

import { BackendApiService } from './backend-api.service';
import { StorageService } from '@core-services/storage.service';
import { AuthService } from '@core-services/auth.service';

class StorageServiceMock {
  saveClient = jasmine.createSpy('saveClient').and.returnValue(Promise.resolve());
  queueOfflineAction = jasmine.createSpy('queueOfflineAction').and.returnValue(Promise.resolve());
  getPendingActions = jasmine.createSpy('getPendingActions').and.returnValue(Promise.resolve([]));
  removeCompletedAction = jasmine.createSpy('removeCompletedAction').and.returnValue(Promise.resolve());
}

class AuthServiceMock {
  getToken = jasmine.createSpy('getToken').and.returnValue('token-123');
}

describe('BackendApiService', () => {
  let service: BackendApiService;
  let httpMock: HttpTestingController;
  let storage: StorageServiceMock;

  beforeEach(() => {
    BackendApiService['activeInstanceId'] = 0;
    storage = new StorageServiceMock();

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        BackendApiService,
        { provide: StorageService, useValue: storage },
        { provide: AuthService, useClass: AuthServiceMock },
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: DOCUMENT, useValue: document }
      ]
    });

    service = TestBed.inject(BackendApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should emit changes in online status responding to browser events', fakeAsync(() => {
    const emissions: boolean[] = [];
    const subscription = service.isOnline.subscribe(value => emissions.push(value));

    window.dispatchEvent(new Event('offline'));
    tick();
    window.dispatchEvent(new Event('online'));
    tick();

    expect(emissions[0]).toBeTrue();
    expect(emissions).toContain(false);
    expect(emissions[emissions.length - 1]).toBeTrue();

    subscription.unsubscribe();
  }));

  it('should POST client data and cache the response locally', fakeAsync(() => {
    const payload = {
      name: 'Jane Doe',
      curp: 'DOEJ900101HDFRRN01',
      ecosystem_id: 'eco-1',
      advisor_id: 'adv-9',
      stage: 'prospecto' as const
    };

    let responseId: string | undefined;

    service.createClient(payload).subscribe(resp => {
      responseId = resp.id;
    });

    const request = httpMock.expectOne('http://localhost:3000/api/clients');
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Authorization')).toBe('Bearer token-123');

    request.flush({ ...payload, id: 'client-1' });
    tick();

    expect(storage.saveClient).toHaveBeenCalledWith(jasmine.objectContaining({ id: 'client-1' }));
    expect(responseId).toBe('client-1');
  }));

  it('queues offline action when creating a client fails', fakeAsync(() => {
    const payload = {
      name: 'Offline Client',
      curp: 'OFFL890101HDFRZN02',
      ecosystem_id: 'eco-2',
      stage: 'prospecto' as const
    };

    let errorEmitted = false;

    service.createClient(payload).subscribe({
      next: fail,
      error: () => {
        errorEmitted = true;
      }
    });

    httpMock.expectOne('http://localhost:3000/api/clients').flush(null, { status: 0, statusText: 'Offline' });
    tick();

    expect(errorEmitted).toBeTrue();
    expect(storage.queueOfflineAction).toHaveBeenCalledWith(jasmine.objectContaining({ type: 'CREATE_CLIENT' }));
    expect(storage.saveClient).toHaveBeenCalled();
  }));

  it('replays queued actions when coming back online', fakeAsync(() => {
    const queuedClient = {
      id: 'temp-1',
      name: 'Queued Client',
      curp: 'QUEU900101HDFRRR08',
      stage: 'prospecto' as const
    };

    storage.getPendingActions.and.returnValue(Promise.resolve([
      { id: 'offline-1', type: 'CREATE_CLIENT', data: queuedClient }
    ]));

    window.dispatchEvent(new Event('offline'));
    tick();

    window.dispatchEvent(new Event('online'));

    const req = httpMock.expectOne('http://localhost:3000/api/clients');
    expect(req.request.method).toBe('POST');
    req.flush({ ...queuedClient, id: 'client-from-sync' });
    tick();

    expect(storage.removeCompletedAction).toHaveBeenCalledWith('offline-1');
  }));
  it('resolves conflict by refetching remote client and retrying update', fakeAsync(() => {
    const queuedUpdate = {
      clientId: 'client-42',
      clientData: { name: 'Conflicted', phone: '12345' }
    };

    storage.getPendingActions.and.returnValue(Promise.resolve([
      { id: 'offline-2', type: 'UPDATE_CLIENT', data: queuedUpdate }
    ]));

    window.dispatchEvent(new Event('online'));

    const firstPut = httpMock.expectOne('http://localhost:3000/api/clients/client-42');
    expect(firstPut.request.method).toBe('PUT');
    firstPut.flush({ message: 'Conflict' }, { status: 409, statusText: 'Conflict' });
    tick();

    const fetchRemote = httpMock.expectOne('http://localhost:3000/api/clients/client-42');
    expect(fetchRemote.request.method).toBe('GET');
    fetchRemote.flush({ id: 'client-42', name: 'Server Name', phone: '00000' });
    tick();

    const retryPut = httpMock.expectOne('http://localhost:3000/api/clients/client-42');
    expect(retryPut.request.method).toBe('PUT');
    expect(retryPut.request.body).toEqual(jasmine.objectContaining({ name: 'Conflicted', phone: '12345' }));
    retryPut.flush({ id: 'client-42', name: 'Conflicted', phone: '12345' });
    tick();

    expect(storage.removeCompletedAction).toHaveBeenCalledWith('offline-2');
    expect(storage.queueOfflineAction).not.toHaveBeenCalledWith(jasmine.objectContaining({ type: 'UPDATE_CLIENT', data: queuedUpdate }));
  }));

});
