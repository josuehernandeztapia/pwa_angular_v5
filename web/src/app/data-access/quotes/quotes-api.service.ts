import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';

import { HttpClientService } from '@core-services/http-client.service';
import { Quote } from '@interfaces/business';
import { BusinessFlow } from '@interfaces/types';
import { getDemoQuotes } from '@demo/demo-seed';
import { environment } from '@environments/environment';

@Injectable({ providedIn: 'root' })
export class QuotesApiService {
  constructor(private readonly httpClient: HttpClientService) {}

  createQuote(payload: Partial<Quote>): Observable<Quote> {
    if (environment.features.enableMockData) {
      const quote: Quote = {
        totalPrice: payload.totalPrice || 0,
        downPayment: payload.downPayment || 0,
        amountToFinance: payload.amountToFinance || 0,
        term: payload.term || 24,
        monthlyPayment: payload.monthlyPayment || 0,
        market: payload.market || 'aguascalientes',
        clientType: payload.clientType || 'individual',
        flow: payload.flow || BusinessFlow.VentaPlazo,
        id: Date.now().toString(),
        clientId: payload.clientId || '',
        product: payload.product!,
        financialSummary: payload.financialSummary!,
        timeline: payload.timeline || [],
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'active'
      };
      return of(quote);
    }

    return this.httpClient.post<Quote>('quotes', payload, {
      successMessage: 'Cotización creada exitosamente'
    }).pipe(map(response => response.data!));
  }

  getClientQuotes(clientId: string): Observable<Quote[]> {
    if (environment.features.enableMockData) {
      return of(getDemoQuotes().filter(quote => quote.clientId === clientId));
    }

    return this.httpClient.get<Quote[]>(`clients/${clientId}/quotes`).pipe(
      map(response => response.data || [])
    );
  }

  getQuoteById(id: string): Observable<Quote | null> {
    if (environment.features.enableMockData) {
      return of(getDemoQuotes().find(quote => quote.id === id) ?? null);
    }

    return this.httpClient.get<Quote>(`quotes/${id}`).pipe(
      map(response => response.data ?? null)
    );
  }
}
