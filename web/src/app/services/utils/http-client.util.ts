import { HttpClient, HttpEvent, HttpHandler, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';

class NullHttpHandler implements HttpHandler {
  handle(_req: HttpRequest<unknown>): Observable<HttpEvent<unknown>> {
    return throwError(() => new Error('HttpClient is not available in the current test context.')); 
  }
}

export function resolveHttpClient(): HttpClient {
  return inject(HttpClient, { optional: true }) ?? new HttpClient(new NullHttpHandler());
}
