import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { DashboardApiService, DashboardStats } from './dashboard-api.service';
import { HttpClientService } from '@core-services/http-client.service';
import { DashboardMockAdapter } from '@internal-services/mock-adapters/dashboard-mock.adapter';
import { environment } from '@environments/environment';

describe('DashboardApiService', () => {
  let service: DashboardApiService;
  let httpClient: jasmine.SpyObj<HttpClientService>;
  let mockAdapter: jasmine.SpyObj<DashboardMockAdapter>;
  const originalMockFlag = environment.features.enableMockData;

  beforeEach(() => {
    httpClient = jasmine.createSpyObj<HttpClientService>('HttpClientService', ['get']);
    mockAdapter = jasmine.createSpyObj<DashboardMockAdapter>('DashboardMockAdapter', ['getDashboardStats']);

    TestBed.configureTestingModule({
      providers: [
        DashboardApiService,
        { provide: HttpClientService, useValue: httpClient },
        { provide: DashboardMockAdapter, useValue: mockAdapter }
      ]
    });

    service = TestBed.inject(DashboardApiService);
  });

  afterEach(() => {
    environment.features.enableMockData = originalMockFlag;
  });

  it('delegates to mock adapter when mock data enabled', done => {
    environment.features.enableMockData = true;
    const stats: DashboardStats = {
      clients: { total: 1, active: 1, new_this_month: 1 },
      ecosystems: { total: 0, active: 0, pending: 0 },
      groups: { total: 0, active: 0, units_delivered: 0 },
      recentActivity: []
    };
    mockAdapter.getDashboardStats.and.returnValue(of(stats));

    service.getStats().subscribe(result => {
      expect(result).toEqual(stats);
      expect(mockAdapter.getDashboardStats).toHaveBeenCalled();
      done();
    });
  });

  it('performs HTTP call when mock disabled', done => {
    environment.features.enableMockData = false;
    const response = { success: true, data: { clients: { total: 2, active: 1, new_this_month: 1 }, ecosystems: { total: 0, active: 0, pending: 0 }, groups: { total: 0, active: 0, units_delivered: 0 }, recentActivity: [] } };
    httpClient.get.and.returnValue(of(response as any));

    service.getStats().subscribe(result => {
      expect(result.clients.total).toBe(2);
      expect(httpClient.get).toHaveBeenCalledWith('dashboard/stats', jasmine.any(Object));
      done();
    });
  });
});
