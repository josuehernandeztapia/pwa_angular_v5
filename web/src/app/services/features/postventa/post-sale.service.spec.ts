import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { PostSaleService, PostSalePhotoUploadResult } from './post-sale.service';
import { OfflineService, OfflineProcessResult } from '@core-services/offline.service';
import { HttpClientService } from '@core-services/http-client.service';
import { VisionOCRRetryService } from '@feature-services/documents/vision-ocr-retry.service';
import { AnalyticsService } from '@core-services/analytics.service';
import { environment } from '@environments/environment';

class OfflineServiceStub {
  private online = true;
  private onlineSubject = new BehaviorSubject<boolean>(true);
  online$ = this.onlineSubject.asObservable();
  pendingRequests$ = of([]);
  processedRequests$ = of([]);
  storeOfflineRequest = jasmine.createSpy('storeOfflineRequest');

  isOnline(): boolean {
    return this.online;
  }

  setOnline(value: boolean): void {
    this.online = value;
    this.onlineSubject.next(value);
  }
}

class HttpClientServiceStub {
  post = jasmine.createSpy('post');
}

class VisionOCRRetryServiceStub {
  ocrWithRetry = jasmine.createSpy('ocrWithRetry').and.returnValue(of({
    confidence: 0.82,
    fields: { vin: 'ABC123' },
    retryCount: 1,
    fallbackUsed: false,
    processingTime: 1200
  }));
}

class AnalyticsServiceStub {
  track = jasmine.createSpy('track');
}

describe('PostSaleService', () => {
  let service: PostSaleService;
  let offline: OfflineServiceStub;
  let httpClient: HttpClientServiceStub;
  let analytics: AnalyticsServiceStub;
  const originalPostSaleFlag = environment.features.enablePostSaleBff;

  beforeEach(() => {
    offline = new OfflineServiceStub();
    httpClient = new HttpClientServiceStub();
    analytics = new AnalyticsServiceStub();
    environment.features.enablePostSaleBff = true;

    TestBed.configureTestingModule({
      providers: [
        PostSaleService,
        { provide: OfflineService, useValue: offline },
        { provide: VisionOCRRetryService, useClass: VisionOCRRetryServiceStub },
        { provide: AnalyticsService, useValue: analytics },
        { provide: HttpClientService, useValue: httpClient }
      ]
    });

    service = TestBed.inject(PostSaleService);
  });

  afterEach(() => {
    environment.features.enablePostSaleBff = originalPostSaleFlag;
  });

  function createMockFile(): File {
    return new File(['binary'], 'photo.jpg', { type: 'image/jpeg' });
  }

  it('queues photo upload when offline', (done) => {
    offline.setOnline(false);
    const file = createMockFile();

    service.processPhoto('CASE-1', 'vin', file, { threshold: 0.75 }).subscribe(result => {
      expect(result.status).toBe('queued');
      expect(result.offlineQueued).toBeTrue();
      expect(offline.storeOfflineRequest).toHaveBeenCalledWith('/postventa/cases/CASE-1/photos', 'POST', jasmine.any(Object));
      expect(analytics.track).toHaveBeenCalledWith('post_sale_photo_offline_enqueued', jasmine.objectContaining({ caseId: 'CASE-1', stepId: 'vin' }));
      done();
    });
  });

  it('maps successful offline result to processed payload', () => {
    const request = {
      id: 'offline-1',
      timestamp: Date.now(),
      endpoint: '/postventa/cases/CASE-2/photos',
      method: 'POST' as const,
      data: {
        feature: 'postventa-photo',
        caseId: 'CASE-2',
        stepId: 'vin',
        fileName: 'photo.jpg',
        fileSize: 1024,
        queuedAt: Date.now()
      }
    };

    const result: OfflineProcessResult = {
      request,
      success: true
    };

    const mapped = service.mapOfflineResult(result) as PostSalePhotoUploadResult;
    expect(mapped).not.toBeNull();
    expect(mapped?.status).toBe('processed');
    expect(mapped?.caseId).toBe('CASE-2');
    expect(mapped?.offlineSynced).toBeTrue();
  });

  it('returns queued payload when offline sync fails', () => {
    const request = {
      id: 'offline-2',
      timestamp: Date.now(),
      endpoint: '/postventa/cases/CASE-3/photos',
      method: 'POST' as const,
      data: {
        feature: 'postventa-photo',
        caseId: 'CASE-3',
        stepId: 'vin',
        fileName: 'photo.jpg',
        fileSize: 2048,
        queuedAt: Date.now()
      }
    };

    const result: OfflineProcessResult = {
      request,
      success: false
    };

    const mapped = service.mapOfflineResult(result);
    expect(mapped?.status).toBe('queued');
    expect(mapped?.offlineQueued).toBeTrue();
    expect(mapped?.payload?.caseId).toBe('CASE-3');
  });

  it('falls back to local case when BFF createCase request fails', (done) => {
    httpClient.post.and.returnValue(throwError(() => new Error('BFF down')));

    service.createCase().subscribe(result => {
      expect(result.id).toContain('CASE-');
      expect(httpClient.post).toHaveBeenCalledWith('postventa/cases', {}, jasmine.any(Object));
      expect(analytics.track).toHaveBeenCalledWith('post_sale_case_initialized', jasmine.objectContaining({ source: 'bff-fallback' }));
      done();
    });
  });
});
