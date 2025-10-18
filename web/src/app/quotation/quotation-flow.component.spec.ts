import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject, of } from 'rxjs';

import { QuotationFlowComponent } from './quotation-flow.component';
import { FlowContextService } from '@core-services/flow-context.service';
import { QuotesApiService } from '@data-access/quotes/quotes-api.service';
import { BusinessFlow } from '@interfaces/types';

class FlowContextStub {
  private readonly store: Record<string, any> = {
    cotizador: {
      quotationData: {
        title: 'Cotización demo',
        monthlyPayment: 5500,
        downPayment: 80000,
        term: 36
      }
    }
  };

  getContextData<T>(key: string): T | null {
    return (this.store[key] ?? null) as T | null;
  }

  saveContext(): void {}

  setBreadcrumbs(): void {}
}

class ActivatedRouteStub {
  private readonly subject = new BehaviorSubject(convertToParamMap({}));
  readonly paramMap = this.subject.asObservable();

  setParams(params: Record<string, any>): void {
    this.subject.next(convertToParamMap(params));
  }
}

describe('QuotationFlowComponent', () => {
  let routeStub: ActivatedRouteStub;
  let quotesApi: jasmine.SpyObj<QuotesApiService>;

  beforeEach(() => {
    routeStub = new ActivatedRouteStub();
    quotesApi = jasmine.createSpyObj('QuotesApiService', ['getQuoteById']);
    quotesApi.getQuoteById.and.returnValue(of(null));

    TestBed.configureTestingModule({
      imports: [QuotationFlowComponent, RouterTestingModule],
      providers: [
        { provide: FlowContextService, useClass: FlowContextStub },
        { provide: QuotesApiService, useValue: quotesApi },
        { provide: ActivatedRoute, useValue: routeStub }
      ]
    });
  });

  it('renders quotation summary when context available', () => {
    const fixture = TestBed.runInInjectionContext(() => TestBed.createComponent(QuotationFlowComponent));
    fixture.detectChanges();

    const title = fixture.nativeElement.querySelector('.quotation__card h2');
    expect(title?.textContent).toContain('Cotización demo');
  });

  it('navigates back to cotizador on button click', () => {
    const fixture = TestBed.runInInjectionContext(() => TestBed.createComponent(QuotationFlowComponent));
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate');

    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('.btn.btn-secondary');
    button.click();

    expect(router.navigate).toHaveBeenCalledWith(['/cotizador']);
  });

  it('loads quotation from API when quoteId param provided', () => {
    const fixture = TestBed.runInInjectionContext(() => TestBed.createComponent(QuotationFlowComponent));
    quotesApi.getQuoteById.and.returnValue(of({
      id: 'Q-9',
      product: { name: 'Plan Premium' },
      monthlyPayment: 12345,
      downPayment: 75000,
      term: 48,
      totalPrice: 0,
      amountToFinance: 0,
      market: 'aguascalientes',
      clientType: 'individual',
      flow: BusinessFlow.VentaPlazo
    }));

    fixture.detectChanges();

    routeStub.setParams({ quoteId: 'Q-9' });
    fixture.detectChanges();

    expect(quotesApi.getQuoteById).toHaveBeenCalledWith('Q-9');
    const title = fixture.nativeElement.querySelector('.quotation__card h2');
    expect(title?.textContent).toContain('Plan Premium');
  });
});
