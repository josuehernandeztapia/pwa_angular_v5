import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { SystemHealthService } from './system-health.service';
import { HttpClientService } from '@core-services/http-client.service';

describe('SystemHealthService', () => {
  let service: SystemHealthService;
  let mockHttp: jasmine.SpyObj<HttpClientService>;

  beforeEach(() => {
    mockHttp = jasmine.createSpyObj<HttpClientService>('HttpClientService', ['checkApiHealth']);
    mockHttp.checkApiHealth.and.returnValue(of(true));

    TestBed.configureTestingModule({
      providers: [
        SystemHealthService,
        { provide: HttpClientService, useValue: mockHttp }
      ]
    });

    service = TestBed.inject(SystemHealthService);
  });

  it('delegates to HttpClientService', done => {
    service.checkHealth().subscribe(result => {
      expect(result).toBeTrue();
      expect(mockHttp.checkApiHealth).toHaveBeenCalled();
      done();
    });
  });
});
