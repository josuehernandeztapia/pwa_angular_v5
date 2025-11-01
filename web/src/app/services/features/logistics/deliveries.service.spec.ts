import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { of, throwError } from 'rxjs';

import { DeliveriesService } from './deliveries.service';
import { DeliveryOrder } from '@interfaces/deliveries';

describe('DeliveriesService', () => {
  let httpSpy: jasmine.SpyObj<HttpClient>;
  let service: DeliveriesService;

  beforeEach(() => {
    httpSpy = jasmine.createSpyObj<HttpClient>('HttpClient', ['get', 'post', 'put', 'patch']);

    TestBed.configureTestingModule({
      providers: [
        DeliveriesService,
        { provide: HttpClient, useValue: httpSpy }
      ]
    });

    service = TestBed.inject(DeliveriesService);
    (service as any).baseUrl = 'https://mock-bff';
    (service as any).logger = {
      log: jasmine.createSpy('log'),
      warn: jasmine.createSpy('warn'),
      error: jasmine.createSpy('error')
    };
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
