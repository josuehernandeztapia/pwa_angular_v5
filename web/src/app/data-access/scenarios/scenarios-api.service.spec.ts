import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { ScenariosApiService } from './scenarios-api.service';
import { HttpClientService } from '@core-services/http-client.service';
import { ScenariosMockAdapter } from '@internal-services/mock-adapters/scenarios-mock.adapter';
import { BusinessFlow, CompleteBusinessScenario, Market } from '@interfaces/types';
import { environment } from '@environments/environment';

describe('ScenariosApiService', () => {
  let service: ScenariosApiService;
  let httpClient: jasmine.SpyObj<HttpClientService>;
  let mockAdapter: jasmine.SpyObj<ScenariosMockAdapter>;
  const originalMockFlag = environment.features.enableMockData;

  const payload = { clientName: 'Cliente Demo', flow: BusinessFlow.VentaPlazo, market: 'aguascalientes' as Market };
  const scenario: CompleteBusinessScenario = {
    id: 'scenario-1',
    clientName: 'Cliente Demo',
    flow: BusinessFlow.VentaPlazo,
    market: payload.market,
    stage: 'COTIZACION',
    seniorSummary: {
      title: 'Cotización',
      description: [],
      keyMetrics: [],
      timeline: [],
      whatsAppMessage: ''
    }
  };

  beforeEach(() => {
    httpClient = jasmine.createSpyObj<HttpClientService>('HttpClientService', ['post']);
    mockAdapter = jasmine.createSpyObj<ScenariosMockAdapter>('ScenariosMockAdapter', [
      'createCotizacionScenario',
      'createSimulacionScenario'
    ]);

    TestBed.configureTestingModule({
      providers: [
        ScenariosApiService,
        { provide: HttpClientService, useValue: httpClient },
        { provide: ScenariosMockAdapter, useValue: mockAdapter }
      ]
    });

    service = TestBed.inject(ScenariosApiService);
  });

  afterEach(() => {
    environment.features.enableMockData = originalMockFlag;
  });

  it('uses mock adapter when mock data enabled', done => {
    environment.features.enableMockData = true;
    mockAdapter.createCotizacionScenario.and.returnValue(of(scenario));

    service.createCotizacionScenario(payload).subscribe(result => {
      expect(result).toEqual(scenario);
      expect(mockAdapter.createCotizacionScenario).toHaveBeenCalledWith(payload);
      done();
    });
  });

  it('performs HTTP call when mock disabled', done => {
    environment.features.enableMockData = false;
    httpClient.post.and.returnValue(of({ success: true, data: scenario } as any));

    service.createSimulacionScenario(payload).subscribe(result => {
      expect(result).toEqual(scenario);
      expect(httpClient.post).toHaveBeenCalled();
      done();
    });
  });
});
