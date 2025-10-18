import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { of } from 'rxjs';

import { ClaimsService, ClaimRecord } from './claims.service';
import { OfflineService } from '@core-services/offline.service';
import { environment } from '@environments/environment';

class OfflineServiceStub {
  processedRequests$ = of();
  isOnline = () => true;
  storeOfflineRequest(): void {}
}

describe('ClaimsService (BFF integration)', () => {
  let service: ClaimsService;
  let httpMock: HttpTestingController;
  const originalFlags = {
    enableClaimsBff: environment.features.enableClaimsBff,
    enableMockData: environment.features.enableMockData
  };

  beforeEach(() => {
    environment.features.enableClaimsBff = true;
    environment.features.enableMockData = false;

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        ClaimsService,
        { provide: OfflineService, useClass: OfflineServiceStub }
      ]
    });

    service = TestBed.inject(ClaimsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    environment.features.enableClaimsBff = originalFlags.enableClaimsBff;
    environment.features.enableMockData = originalFlags.enableMockData;
  });

  it('invokes the claims BFF endpoint when fetching records', () => {
    let response: ClaimRecord[] | undefined;

    service.getClaims().subscribe(result => (response = result));

    const req = httpMock.expectOne('http://localhost:3000/api/claims');
    expect(req.request.method).toBe('GET');

    req.flush([
      {
        id: 'CLM-001',
        folio: 'F-001',
        clientName: 'Cliente Demo',
        vehicleVin: 'VIN123456',
        market: 'aguascalientes',
        type: 'service',
        status: 'open',
        amount: 12500,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        assignedTo: 'QA Agent'
      }
    ] satisfies ClaimRecord[]);

    expect(response?.length).toBe(1);
    expect(response?.[0].status).toBe('open');
  });
});
