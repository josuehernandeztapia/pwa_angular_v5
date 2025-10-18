import { DOCUMENT } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';

import { FocusTrapService } from '@core-services/focus-trap.service';
import { GlobalSearchResult } from '@core-services/global-search.service';
import { GlobalSearchComponent } from './global-search.component';
import { GlobalSearchService } from '@core-services/global-search.service';
import { SearchRouterService } from '@core-services/search-router.service';

class FocusTrapServiceStub {
  remember = jasmine.createSpy('remember');
  restore = jasmine.createSpy('restore');
  releaseFocus = jasmine.createSpy('releaseFocus');
  trap = jasmine.createSpy('trap').and.callFake(() => () => this.releaseFocus());
}

class GlobalSearchServiceStub {
  readonly recent$ = new BehaviorSubject<GlobalSearchResult[]>([]);
  readonly suggestions$ = new BehaviorSubject<GlobalSearchResult[]>([]);
  search = jasmine.createSpy('search').and.callFake(() => of([]));
}

class SearchRouterServiceStub {
  open = jasmine.createSpy('open');
  trackFilterChange = jasmine.createSpy('trackFilterChange');
  trackResultsView = jasmine.createSpy('trackResultsView');
}

describe('GlobalSearchComponent', () => {
  let fixture: ComponentFixture<GlobalSearchComponent>;
  let component: GlobalSearchComponent;
  let focusTrap: FocusTrapServiceStub;
  let documentRef: Document;

  beforeEach(async () => {
    focusTrap = new FocusTrapServiceStub();

    await TestBed.configureTestingModule({
      imports: [GlobalSearchComponent],
      providers: [
        { provide: FocusTrapService, useValue: focusTrap },
        { provide: GlobalSearchService, useClass: GlobalSearchServiceStub },
        { provide: SearchRouterService, useClass: SearchRouterServiceStub }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(GlobalSearchComponent);
    component = fixture.componentInstance;
    documentRef = TestBed.inject(DOCUMENT);
    fixture.detectChanges();
  });

  it('opens overlay and traps focus with global shortcut', () => {
    documentRef.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    fixture.detectChanges();

    expect(component.isOpen()).toBeTrue();
    expect(focusTrap.remember).toHaveBeenCalled();
    expect(focusTrap.trap).toHaveBeenCalled();
  });

  it('closes overlay and restores focus on Escape', () => {
    documentRef.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    fixture.detectChanges();
    expect(component.isOpen()).toBeTrue();

    documentRef.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(component.isOpen()).toBeFalse();
    expect(focusTrap.restore).toHaveBeenCalled();
    expect(focusTrap.releaseFocus).toHaveBeenCalled();
  });
});
