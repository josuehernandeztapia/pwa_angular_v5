import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { SearchApiService, SearchResults } from './search-api.service';
import { HttpClientService } from '@core-services/http-client.service';
import { SearchMockAdapter } from '@internal-services/mock-adapters/search-mock.adapter';
import { environment } from '@environments/environment';

describe('SearchApiService', () => {
  let service: SearchApiService;
  let httpClient: jasmine.SpyObj<HttpClientService>;
  let mockAdapter: jasmine.SpyObj<SearchMockAdapter>;
  const originalMockFlag = environment.features.enableMockData;

  beforeEach(() => {
    httpClient = jasmine.createSpyObj<HttpClientService>('HttpClientService', ['get']);
    mockAdapter = jasmine.createSpyObj<SearchMockAdapter>('SearchMockAdapter', ['search']);

    TestBed.configureTestingModule({
      providers: [
        SearchApiService,
        { provide: HttpClientService, useValue: httpClient },
        { provide: SearchMockAdapter, useValue: mockAdapter }
      ]
    });

    service = TestBed.inject(SearchApiService);
  });

  afterEach(() => {
    environment.features.enableMockData = originalMockFlag;
  });

  it('uses mock adapter when mock data enabled', done => {
    environment.features.enableMockData = true;
    const payload: SearchResults = { clients: [], quotes: [], documents: [], contracts: [], total: 0 };
    mockAdapter.search.and.returnValue(of(payload));

    service.search('test').subscribe(result => {
      expect(result).toEqual(payload);
      expect(mockAdapter.search).toHaveBeenCalledWith('test');
      done();
    });
  });

  it('performs HTTP call when mock disabled', done => {
    environment.features.enableMockData = false;
    const payload: SearchResults = { clients: [], quotes: [], documents: [], contracts: [], total: 0 };
    httpClient.get.and.returnValue(of({ success: true, data: payload } as any));

    service.search('test').subscribe(result => {
      expect(result.total).toBe(0);
      expect(httpClient.get).toHaveBeenCalled();
      done();
    });
  });
});
