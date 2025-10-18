import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { HttpClientService, ApiResponse } from '@core-services/http-client.service';
import { DashboardMockAdapter } from '@internal-services/mock-adapters/dashboard-mock.adapter';
import { environment } from '@environments/environment';

export interface DashboardStats {
  clients: {
    total: number;
    active: number;
    new_this_month: number;
  };
  ecosystems: {
    total: number;
    active: number;
    pending: number;
  };
  groups: {
    total: number;
    active: number;
    units_delivered: number;
  };
  recentActivity: Array<{
    type: string;
    message: string;
    timestamp: Date;
  }>;
}

@Injectable({ providedIn: 'root' })
export class DashboardApiService {
  constructor(
    private readonly httpClient: HttpClientService,
    private readonly mock: DashboardMockAdapter
  ) {}

  getStats(): Observable<DashboardStats> {
    if (environment.features.enableMockData) {
      return this.mock.getDashboardStats();
    }

    return this.httpClient.get<DashboardStats>('dashboard/stats', {
      showLoading: false,
      showError: false
    }).pipe(
      map((response: ApiResponse<DashboardStats>) => response.data ?? this.emptyStats())
    );
  }

  private emptyStats(): DashboardStats {
    return {
      clients: { total: 0, active: 0, new_this_month: 0 },
      ecosystems: { total: 0, active: 0, pending: 0 },
      groups: { total: 0, active: 0, units_delivered: 0 },
      recentActivity: []
    };
  }
}
