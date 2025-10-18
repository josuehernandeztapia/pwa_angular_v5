import { of, throwError } from 'rxjs';
import { DeliveriesService } from './deliveries.service';
import { DeliveryOrder } from '@interfaces/deliveries';
import * as HttpClientUtil from '@services/utils/http-client.util';
import * as BaseUrlUtil from '@services/utils/resolve-bff-base-url.util';
import { HttpClient } from '@angular/common/http';

describe('DeliveriesService', () => {
  let httpSpy: jasmine.SpyObj<HttpClient>;
  let service: DeliveriesService;
  let originalResolveHttp: typeof HttpClientUtil.resolveHttpClient;
  let originalResolveBase: typeof BaseUrlUtil.resolveBffBaseUrl;
  let resolveHttpSpy: jasmine.Spy;
  let resolveBaseSpy: jasmine.Spy;

  beforeEach(() => {
    httpSpy = jasmine.createSpyObj<HttpClient>('HttpClient', ['get', 'post', 'put', 'patch']);

    originalResolveHttp = HttpClientUtil.resolveHttpClient;
    originalResolveBase = BaseUrlUtil.resolveBffBaseUrl;

    resolveHttpSpy = spyOn(HttpClientUtil, 'resolveHttpClient').and.returnValue(httpSpy as any);
    resolveBaseSpy = spyOn(BaseUrlUtil, 'resolveBffBaseUrl').and.returnValue('https://mock-bff');

    service = new DeliveriesService();
    (service as any).logger = {
      log: jasmine.createSpy('log'),
      warn: jasmine.createSpy('warn'),
      error: jasmine.createSpy('error')
    };
  });

  afterEach(() => {
    resolveHttpSpy.and.callFake(originalResolveHttp);
    resolveBaseSpy.and.callFake(originalResolveBase);
  });

  it('maps bulk sync response metadata and failures', done => {
    const deliveries = [
      { id: 'D-1' } as DeliveryOrder,
      { id: 'D-2' } as DeliveryOrder,
      { id: 'D-3' } as DeliveryOrder
    ];

    httpSpy.put.and.returnValue(of({
      synced: 2,
      failed: 1,
      skipped: 0,
      metadata: {
        processedAt: '2025-10-14T00:00:00Z',
        durationMs: 150
      },
      failures: [
        { id: 'D-3', reason: 'validation error', statusCode: 422 }
      ]
    }));

    service.syncDeliveriesToNeon(deliveries).subscribe(result => {
      expect(httpSpy.put).toHaveBeenCalledWith('https://mock-bff/v1/deliveries/sync', { deliveries });
      expect(result).toEqual({ synced: 2, errors: 1 });
      done();
    });
  });

  it('falls back to computed totals when response omits counts', done => {
    const deliveries = [
      { id: 'D-1' } as DeliveryOrder,
      { id: 'D-2' } as DeliveryOrder,
      { id: 'D-3' } as DeliveryOrder
    ];

    httpSpy.put.and.returnValue(of({
      failures: [{ id: 'D-3', reason: 'conflict' }]
    } as any));

    service.syncDeliveriesToNeon(deliveries).subscribe(result => {
      expect(result).toEqual({ synced: 2, errors: 1 });
      done();
    });
  });

  it('returns default error summary when request fails', done => {
    const deliveries = [{ id: 'D-1' } as DeliveryOrder];
    httpSpy.put.and.returnValue(throwError(() => new Error('network')));

    service.syncDeliveriesToNeon(deliveries).subscribe(result => {
      expect(result).toEqual({ synced: 0, errors: 1 });
      done();
    });
  });
});
