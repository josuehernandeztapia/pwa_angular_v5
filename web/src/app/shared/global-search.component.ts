import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, ElementRef, ViewChild, PLATFORM_ID, Renderer2, RendererFactory2, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { FocusTrapService } from '@core-services/focus-trap.service';
import { GlobalSearchResult, GlobalSearchService, GlobalSearchType } from '@core-services/global-search.service';
import { SearchRouterService } from '@core-services/search-router.service';
import { environment } from '@environments/environment';
import { IconComponent } from '@shared/icon/icon.component';

@Component({
  selector: 'app-global-search',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  templateUrl: './global-search.component.html',
  styleUrls: ['./global-search.component.scss']
})
export class GlobalSearchComponent {
  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;
  @ViewChild('container', { static: true }) containerRef?: ElementRef<HTMLDivElement>;

  readonly filters: Array<{ label: string; value: GlobalSearchType | 'all'; dataCy: string }> = [
    { label: 'Todo', value: 'all', dataCy: 'global-search-filter-all' },
    { label: 'Clientes', value: 'client', dataCy: 'global-search-filter-cliente' },
    { label: 'Contratos', value: 'contract', dataCy: 'global-search-filter-contrato' },
    { label: 'Cotizaciones', value: 'quote', dataCy: 'global-search-filter-cotizacion' },
    { label: 'Documentos', value: 'document', dataCy: 'global-search-filter-documento' }
  ];

  readonly isEnabled = environment.features.enableGlobalSearch ?? true;

  readonly query = signal('');
  readonly results = signal<GlobalSearchResult[]>([]);
  readonly filteredResults = signal<GlobalSearchResult[]>([]);
  readonly recents = signal<GlobalSearchResult[]>([]);
  readonly suggestions = signal<GlobalSearchResult[]>([]);
  readonly isOpen = signal(false);
  readonly highlightedIndex = signal(-1);
  readonly activeFilter = signal<GlobalSearchType | 'all'>('all');

  private readonly destroyRef = inject(DestroyRef);
  private readonly documentRef = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly focusTrap = inject(FocusTrapService);
  private readonly renderer: Renderer2 = inject(RendererFactory2).createRenderer(null, null);

  private readonly searchTerm$ = new Subject<string>();
  private releaseFocusTrap?: () => void;
  private removeShortcutListener?: () => void;

  constructor(
    private readonly globalSearch: GlobalSearchService,
    private readonly searchRouter: SearchRouterService
  ) {
    if (!this.isEnabled) {
      return;
    }

    this.initializeSearchStreams();
    this.setupGlobalShortcuts();
    this.bindFocusTrapLifecycle();
    this.scheduleMobileAutofocus();
  }

  onFocus(): void {
    if (!this.isEnabled) {
      return;
    }

    if (!this.query()) {
      this.results.set(this.initialResults());
    }

    this.isOpen.set(true);
  }

  onBlur(): void {
    if (!this.isEnabled) {
      return;
    }
    this.closeOverlay();
  }

  onInput(value: string): void {
    if (!this.isEnabled) {
      return;
    }

    this.query.set(value);
    this.searchTerm$.next(value);

    if (!value) {
      this.results.set(this.initialResults());
    }
  }

  onKeyDown(event: KeyboardEvent): void {
    if (!this.isEnabled) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.moveHighlight(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.moveHighlight(-1);
        break;
      case 'Enter': {
        event.preventDefault();
        const openInNewTab = event.shiftKey || event.ctrlKey || event.metaKey;
        this.executeSelection(openInNewTab);
        break;
      }
      case 'Escape':
        this.closeOverlay();
        break;
    }
  }

  selectResult(result: GlobalSearchResult, openInNewTab = false, interaction: 'keyboard' | 'mouse' = 'mouse'): void {
    if (!this.isEnabled) {
      return;
    }

    const position = this.filteredResults().findIndex(item => item.id === result.id);
    this.searchRouter.open(result, {
      newTab: openInNewTab,
      query: this.query(),
      position,
      interaction
    });
    this.reset();
  }

  getTypeLabel(type: GlobalSearchResult['type']): string {
    switch (type) {
      case 'client':
        return 'Cliente';
      case 'quote':
        return 'Cotización';
      case 'document':
        return 'Documento';
      case 'contract':
        return 'Contrato';
      default:
        return 'Resultado';
    }
  }

  isHighlighted(index: number): boolean {
    return index === this.highlightedIndex();
  }

  setFilter(filter: GlobalSearchType | 'all'): void {
    if (!this.isEnabled || this.activeFilter() === filter) {
      return;
    }

    this.activeFilter.set(filter);
    this.searchRouter.trackFilterChange(filter);
  }

  focusInput(prefill: string = this.query(), selectAll = true): void {
    if (!this.isEnabled) {
      return;
    }

    const input = this.searchInput?.nativeElement;
    if (!input) {
      return;
    }

    input.value = prefill;
    input.focus();
    if (selectAll) {
      try {
        input.select();
      } catch {
        /* ignore selection errors */
      }
    }

    this.isOpen.set(true);
    if (prefill) {
      this.searchTerm$.next(prefill);
    }
  }

  private initializeSearchStreams(): void {
    this.searchTerm$
      .pipe(
        debounceTime(180),
        distinctUntilChanged(),
        switchMap(term => this.globalSearch.search(term)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(results => {
        this.results.set(results);
      });

    this.globalSearch.recent$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(recents => {
        this.recents.set(recents);
        if (!this.query()) {
          this.results.set(this.initialResults());
        }
      });

    this.globalSearch.suggestions$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(suggestions => {
        this.suggestions.set(suggestions);
        if (!this.query() && !this.recents().length) {
          this.results.set(this.initialResults());
        }
      });

    effect(() => {
      const filtered = this.applyFilter(this.results(), this.activeFilter());
      this.filteredResults.set(filtered);

      const previousIndex = this.highlightedIndex();
      const nextIndex = filtered.length
        ? Math.min(previousIndex >= 0 ? previousIndex : 0, filtered.length - 1)
        : -1;
      this.highlightedIndex.set(nextIndex);

      this.searchRouter.trackResultsView(filtered, {
        query: this.query(),
        filter: this.activeFilter()
      });
    }, { allowSignalWrites: true });
  }

  private setupGlobalShortcuts(): void {
    if (!this.isBrowser) {
      return;
    }

    this.removeShortcutListener = this.renderer.listen(this.documentRef, 'keydown', (event: KeyboardEvent) => {
      if (!this.isEnabled) {
        return;
      }

      if (event.ctrlKey || event.metaKey) {
        const key = event.key.toLowerCase();
        if (key === 'k') {
          event.preventDefault();
          this.focusInput();
          return;
        }
        if (key === '/') {
          event.preventDefault();
          this.focusInput('', true);
          return;
        }
      }

      if (event.key === 'Escape' && this.isOpen()) {
        event.preventDefault();
        this.closeOverlay();
      }
    });

    this.destroyRef.onDestroy(() => this.removeShortcutListener?.());
  }

  private bindFocusTrapLifecycle(): void {
    if (!this.isBrowser) {
      return;
    }

    effect(() => {
      if (!this.isOpen()) {
        this.releaseFocusTrap?.();
        this.releaseFocusTrap = undefined;
        this.focusTrap.restore();
        return;
      }

      const container = this.containerRef?.nativeElement;
      if (!container || this.releaseFocusTrap) {
        return;
      }

      this.focusTrap.remember();
      this.releaseFocusTrap = this.focusTrap.trap(container);
    });

    this.destroyRef.onDestroy(() => {
      this.releaseFocusTrap?.();
      this.releaseFocusTrap = undefined;
      this.focusTrap.restore();
    });
  }

  private scheduleMobileAutofocus(): void {
    if (!this.isBrowser) {
      return;
    }

    queueMicrotask(() => {
      const windowRef = this.documentRef.defaultView;
      if (!windowRef || windowRef.innerWidth > 768) {
        return;
      }

      const activeElement = this.documentRef.activeElement as HTMLElement | null;
      const isOtherInputFocused = !!activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.isContentEditable === true
      );

      if (!isOtherInputFocused) {
        this.focusInput('', false);
      }
    });
  }

  private moveHighlight(direction: 1 | -1): void {
    const list = this.filteredResults();
    if (!list.length) {
      return;
    }

    const next = this.highlightedIndex() + direction;
    if (next < 0) {
      this.highlightedIndex.set(list.length - 1);
    } else if (next >= list.length) {
      this.highlightedIndex.set(0);
    } else {
      this.highlightedIndex.set(next);
    }
  }

  private executeSelection(openInNewTab: boolean): void {
    const list = this.filteredResults();
    if (!list.length) {
      return;
    }

    const index = this.highlightedIndex();
    const target = index >= 0 ? list[index] : list[0];
    this.selectResult(target, openInNewTab, 'keyboard');
  }

  private closeOverlay(): void {
    this.isOpen.set(false);
    this.highlightedIndex.set(-1);
  }

  private reset(): void {
    this.query.set('');
    this.isOpen.set(false);
    this.highlightedIndex.set(-1);
    this.searchTerm$.next('');
    this.activeFilter.set('all');
    this.results.set(this.initialResults());
  }

  private applyFilter(results: GlobalSearchResult[], filter: GlobalSearchType | 'all'): GlobalSearchResult[] {
    if (filter === 'all') {
      return [...results];
    }
    return results.filter(result => result.type === filter);
  }

  private initialResults(): GlobalSearchResult[] {
    const recents = this.recents();
    if (recents.length) {
      return [...recents];
    }
    const suggestions = this.suggestions();
    return suggestions.length ? [...suggestions] : [];
  }
}
