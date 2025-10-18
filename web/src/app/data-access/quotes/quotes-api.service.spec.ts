import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { QuotesApiService } from './quotes-api.service';
import { HttpClientService } from '@core-services/http-client.service';
import { Quote } from '@interfaces/business';
import { BusinessFlow } from '@interfaces/types';
import { environment } from '@environments/environment';

describe('QuotesApiService', () => {
  let service: QuotesApiService;
  let mockHttp: jasmine.SpyObj<HttpClientService>;

  const originalMockFlag = environment.features.enableMockData;

  beforeEach(() => {
    environment.features.enableMockData = false;
    mockHttp = jasmine.createSpyObj<HttpClientService>('HttpClientService', ['post', 'get']);

    TestBed.configureTestingModule({
      providers: [
        QuotesApiService,
        { provide: HttpClientService, useValue: mockHttp }
      ]
    });

    service = TestBed.inject(QuotesApiService);
  });

  afterEach(() => {
    environment.features.enableMockData = originalMockFlag;
  });

  it('creates quote via HTTP when mock disabled', done => {
    const quote: Quote = {
      id: '1',
      clientId: 'c1',
      totalPrice: 100,
      downPayment: 10,
      amountToFinance: 90,
      term: 12,
      monthlyPayment: 8,
      market: 'edomex',
      clientType: 'individual',
      flow: BusinessFlow.VentaPlazo,
      product: {} as any,
      financialSummary: {} as any,
      timeline: [],
      createdAt: new Date(),
      expiresAt: new Date(),
      status: 'active'
    };

    mockHttp.post.and.returnValue(of({ success: true, data: quote }));

    service.createQuote({ clientId: 'c1', totalPrice: 100 }).subscribe(result => {
      expect(result).toEqual(quote);
      done();
    });
  });
});
