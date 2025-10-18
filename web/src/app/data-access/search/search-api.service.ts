import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { HttpClientService } from '@core-services/http-client.service';
import { SearchMockAdapter, MockSearchPayload } from '@internal-services/mock-adapters/search-mock.adapter';
import { environment } from '@environments/environment';

export type SearchResults = MockSearchPayload;

@Injectable({ providedIn: 'root' })
export class SearchApiService {
  constructor(
    private readonly httpClient: HttpClientService,
    private readonly mock: SearchMockAdapter
  ) {}

  search(query: string): Observable<SearchResults> {
    if (environment.features.enableMockData) {
      return this.mock.search(query);
    }

    return this.httpClient.get<SearchResults>('search', {
      params: { q: query, limit: '12' },
      showLoading: false,
      showError: false
    }).pipe(map(response => response.data ?? { clients: [], quotes: [], documents: [], contracts: [], total: 0 }));
  }
}
