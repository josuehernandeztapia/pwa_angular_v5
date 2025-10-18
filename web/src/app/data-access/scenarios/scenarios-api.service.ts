import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { HttpClientService } from '@core-services/http-client.service';
import { ScenariosMockAdapter } from '@internal-services/mock-adapters/scenarios-mock.adapter';
import { BusinessFlow, CompleteBusinessScenario, Market } from '@interfaces/types';
import { environment } from '@environments/environment';

@Injectable({ providedIn: 'root' })
export class ScenariosApiService {
  constructor(
    private readonly httpClient: HttpClientService,
    private readonly mock: ScenariosMockAdapter
  ) {}

  createCotizacionScenario(payload: {
    clientName: string;
    flow: BusinessFlow;
    market: Market;
  }): Observable<CompleteBusinessScenario> {
    if (environment.features.enableMockData) {
      return this.mock.createCotizacionScenario(payload);
    }

    return this.httpClient.post<CompleteBusinessScenario>('scenarios/cotizacion', payload, {
      successMessage: 'Escenario de cotización creado'
    }).pipe(map(response => response.data!));
  }

  createSimulacionScenario(payload: {
    clientName: string;
    flow: BusinessFlow;
    market: Market;
  }): Observable<CompleteBusinessScenario> {
    if (environment.features.enableMockData) {
      return this.mock.createSimulacionScenario(payload);
    }

    return this.httpClient.post<CompleteBusinessScenario>('scenarios/simulacion', payload, {
      successMessage: 'Escenario de simulación creado'
    }).pipe(map(response => response.data!));
  }
}
