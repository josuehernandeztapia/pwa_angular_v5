import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { OfflineService, OfflineData } from './offline.service';
import { AnalyticsService } from '@core-services/analytics.service';
import { HttpClientService } from '@core-services/http-client.service';
import { DocumentUploadService } from '@feature-services/documents/document-upload.service';
import { MonitoringService } from '@core-services/monitoring.service';
import { FlowContextService } from '@core-services/flow-context.service';
import { environment } from '@environments/environment';

class AnalyticsStub {
  track = jasmine.createSpy('track');
}

class HttpClientStub {
  post = jasmine.createSpy('post').and.returnValue(of({ success: true }));
  put = jasmine.createSpy('put').and.returnValue(of({ success: true }));
  delete = jasmine.createSpy('delete').and.returnValue(of({ success: true }));
  get = jasmine.createSpy('get').and.returnValue(of({ success: true }));
}

class DocumentUploadStub {
  uploadQueuedDocument = jasmine.createSpy('uploadQueuedDocument').and.returnValue(Promise.resolve());
}

class MonitoringStub {
  auditEvent = jasmine.createSpy('auditEvent');
}

class FlowContextStub {
  saveContext = jasmine.createSpy('saveContext');
}

describe('OfflineService', () => {
  let service: OfflineService;
  let analytics: AnalyticsStub;
  let httpClient: HttpClientStub;
  let documentUpload: DocumentUploadStub;
  const originalOfflineFlag = environment.features.enableOfflineMode;

  beforeEach(() => {
    analytics = new AnalyticsStub();
    httpClient = new HttpClientStub();
    documentUpload = new DocumentUploadStub();
    environment.features.enableOfflineMode = true;

    TestBed.configureTestingModule({
      providers: [
        OfflineService,
        { provide: AnalyticsService, useValue: analytics },
        { provide: HttpClientService, useValue: httpClient },
        { provide: DocumentUploadService, useValue: documentUpload },
        { provide: MonitoringService, useClass: MonitoringStub },
        { provide: FlowContextService, useClass: FlowContextStub }
      ]
    });

    service = TestBed.inject(OfflineService);
  });

  afterEach(() => {
    environment.features.enableOfflineMode = originalOfflineFlag;
  });

  function createDocumentPayload(): any {
    return {
      clientId: 'client-1',
      documentId: 'doc-1',
      fileBase64: btoa('mock-data'),
      fileName: 'id.jpg',
      fileType: 'image/jpeg',
      fileSize: 1024,
      hash: 'hash123'
    };
  }

  it('stores offline request and emits telemetry', () => {
    analytics.track.calls.reset();

    service.storeOfflineRequest('/api/test', 'POST', { foo: 'bar' });

    const snapshot = service.getPendingRequestsSnapshot();
    expect(snapshot.length).toBe(1);
    expect(snapshot[0].endpoint).toBe('/api/test');
    expect(analytics.track).toHaveBeenCalledWith('offline_queue_enqueued', jasmine.objectContaining({ endpoint: '/api/test', queueLength: 1 }));
  });

  it('flushes queued document uploads through DocumentUploadService', async () => {
    analytics.track.calls.reset();
    service.storeOfflineRequest('/documents/upload', 'POST', createDocumentPayload());

    await service.flushQueueNow();

    expect(documentUpload.uploadQueuedDocument).toHaveBeenCalled();
    expect(analytics.track).toHaveBeenCalledWith('offline_queue_document_uploaded', jasmine.objectContaining({ documentId: 'doc-1' }));
    expect(service.getPendingRequestsSnapshot().length).toBe(0);
  });

  it('requeues request when HTTP processing fails', async () => {
    httpClient.post.and.returnValue(throwError(() => new Error('fail')));
    service.storeOfflineRequest('/api/retry', 'POST', { id: 1 });

    await service.flushQueueNow();

    const snapshot = service.getPendingRequestsSnapshot();
    expect(snapshot.length).toBe(1);
    expect(snapshot[0].attempts).toBe(1);
    expect(analytics.track).toHaveBeenCalledWith('offline_queue_request_failed', jasmine.objectContaining({ endpoint: '/api/retry' }));
  });
});
