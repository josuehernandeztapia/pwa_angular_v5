import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { HttpClientService } from '@core-services/http-client.service';

@Injectable({ providedIn: 'root' })
export class SystemHealthService {
  constructor(private readonly httpClient: HttpClientService) {}

  checkHealth(): Observable<boolean> {
    return this.httpClient.checkApiHealth();
  }
}
