import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, distinctUntilChanged, finalize, map, of, switchMap } from 'rxjs';

import { FlowContextService } from '@core-services/flow-context.service';
import { QuotesApiService } from '@data-access/quotes/quotes-api.service';
import { Quote } from '@interfaces/types';

@Component({
  selector: 'app-quotation-flow',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './quotation-flow.component.html',
  styleUrls: ['./quotation-flow.component.scss']
})
export class QuotationFlowComponent {
  private readonly flowContext = inject(FlowContextService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly quotesApi = inject(QuotesApiService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly quotation = signal<NullableQuote>(
    this.flowContext.getContextData<{ quotationData?: NullableQuote }>('cotizador')?.quotationData ?? null
  );
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly summary = computed(() => this.buildSummary(this.quotation()));

  constructor() {
    this.observeRouteParams();
    this.setInitialBreadcrumbs(this.quotation());
  }

  goToCotizador(): void {
    this.router.navigate(['/cotizador']);
  }

  private observeRouteParams(): void {
    this.route.paramMap
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        map(params => params.get('quoteId')),
        distinctUntilChanged(),
        switchMap(quoteId => {
          if (!quoteId) {
            this.errorMessage.set(null);
            this.isLoading.set(false);
            return of({ quote: this.quotation(), quoteId: null });
          }

          this.isLoading.set(true);
          this.errorMessage.set(null);

          return this.quotesApi.getQuoteById(quoteId).pipe(
            map(quote => ({ quote, quoteId })),
            catchError(() => {
              this.errorMessage.set('No se pudo cargar la cotización solicitada.');
              return of({ quote: null, quoteId });
            }),
            finalize(() => this.isLoading.set(false))
          );
        })
      )
      .subscribe(({ quote, quoteId }) => {
        if (quote) {
          const merged = this.mergeWithExistingQuote(quote);
          this.quotation.set(merged);
          this.persistContext(merged);
          this.setBreadcrumbsFromQuote(merged);
        } else if (quoteId) {
          this.quotation.set(null);
          this.setBreadcrumbsFallback(quoteId);
        }
      });
  }

  private mergeWithExistingQuote(remoteQuote: Quote): NullableQuote {
    const existing = this.quotation();
    if (!existing) {
      return remoteQuote as NullableQuote;
    }
    return {
      ...existing,
      ...remoteQuote
    } as NullableQuote;
  }

  private persistContext(quote: NullableQuote): void {
    const existing = this.flowContext.getContextData<any>('cotizador') ?? {};
    const payload = {
      ...existing,
      quotationData: {
        ...(existing.quotationData ?? {}),
        ...quote
      }
    };

    this.flowContext.saveContext('cotizador', payload, {
      breadcrumbs: this.buildBreadcrumbsFromQuote(quote)
    });
  }

  private setInitialBreadcrumbs(quote: NullableQuote): void {
    if (!quote) {
      this.flowContext.setBreadcrumbs(['Dashboard', 'Cotizador', 'Resumen de cotización']);
      return;
    }
    this.setBreadcrumbsFromQuote(quote);
  }

  private setBreadcrumbsFromQuote(quote: NullableQuote): void {
    this.flowContext.setBreadcrumbs(this.buildBreadcrumbsFromQuote(quote));
  }

  private setBreadcrumbsFallback(quoteId: string): void {
    this.flowContext.setBreadcrumbs([
      'Dashboard',
      'Cotizador',
      `Cotización ${quoteId}`
    ]);
  }

  private buildBreadcrumbsFromQuote(quote: NullableQuote): string[] {
    const label = this.buildQuoteLabel(quote);
    return ['Dashboard', 'Cotizador', label];
  }

  private buildQuoteLabel(quote: NullableQuote): string {
    if (!quote) {
      return 'Resumen de cotización';
    }

    if (quote.product?.name) {
      return quote.product.name;
    }

    if (typeof (quote as any).title === 'string') {
      return (quote as any).title as string;
    }

    if (quote.id) {
      return `Cotización ${quote.id}`;
    }

    return 'Resumen de cotización';
  }

  private buildSummary(quote: NullableQuote): QuotationSummary | null {
    if (!quote) {
      return null;
    }

    const monetary = (value: unknown): number | null => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string' && value.trim().length) {
        const parsed = Number(value.replace(/[^0-9.-]+/g, ''));
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    };

    const termValue = (() => {
      if (typeof quote.term === 'number') {
        return quote.term;
      }
      const parsed = monetary(quote.term);
      return parsed ? Math.round(parsed) : null;
    })();

    return {
      title: this.buildQuoteLabel(quote),
      monthlyPayment: monetary((quote as any).monthlyPayment ?? quote.monthlyPayment),
      downPayment: monetary((quote as any).downPayment ?? quote.downPayment),
      term: termValue,
      generatedAt: quote.createdAt ? new Date(quote.createdAt) : null
    };
  }
}

type NullableQuote = (Quote & Record<string, any>) | null;

interface QuotationSummary {
  title: string;
  monthlyPayment: number | null;
  downPayment: number | null;
  term: number | null;
  generatedAt: Date | null;
}
