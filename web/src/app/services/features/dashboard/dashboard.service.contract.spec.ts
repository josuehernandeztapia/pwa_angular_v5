import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';

import { DashboardService } from './dashboard.service';
import { DashboardStats } from '@interfaces/types';
import { environment } from '@environments/environment';

describe('DashboardService (BFF contract)', () => {
  let service: DashboardService;
  let httpMock: HttpTestingController;
  const originalMockFlag = environment.features.enableMockData;

  beforeEach(() => {
    environment.features.enableMockData = false;

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [DashboardService]
    });

    service = TestBed.inject(DashboardService);
    httpMock = TestBed.inject(HttpTestingController);
    service.invalidateStatsCache();
  });

  afterEach(() => {
    httpMock.verify();
    environment.features.enableMockData = originalMockFlag;
  });

  it('should request dashboard stats from the BFF for the default market', () => {
    const payload: DashboardStats = {
      opportunitiesInPipeline: { nuevas: 1, expediente: 2, aprobado: 3 },
      pendingActions: { clientsWithMissingDocs: 4, clientsWithGoalsReached: 5 },
      activeContracts: 6,
      monthlyRevenue: { collected: 100, projected: 150 }
    };

    let response: DashboardStats | null = null;

    service.getDashboardStats().subscribe(stats => (response = stats));

    const req = httpMock.expectOne(`${environment.apiUrl}/dashboard/stats`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys().length).toBe(0);
    req.flush(payload);

    expect(response).toEqual(payload as any);
  });

  it('should include the market parameter when requesting a specific market', () => {
    const payload: DashboardStats = {
      opportunitiesInPipeline: { nuevas: 2, expediente: 1, aprobado: 0 },
      pendingActions: { clientsWithMissingDocs: 1, clientsWithGoalsReached: 0 },
      activeContracts: 3,
      monthlyRevenue: { collected: 50, projected: 75 }
    };

    service.invalidateStatsCache('edomex');

    service.getDashboardStats('edomex').subscribe();

    const req = httpMock.expectOne(request => {
      return request.url === `${environment.apiUrl}/dashboard/stats` && request.params.get('market') === 'edomex';
    });

    expect(req.request.method).toBe('GET');
    req.flush(payload);
  });
});
