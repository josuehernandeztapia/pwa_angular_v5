import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { PostventaWizardComponent } from './postventa-wizard.component';
import { PostventaService, DraftQuote, Suggestion } from '@feature-services/postventa/postventa.service';
import { FlowContextService } from '@core-services/flow-context.service';
import { FlowCompletionService, FlowCompletionState } from '@core-services/flow-completion.service';
import { NavigationService } from '@core-services/navigation.service';
import { SummaryMetric } from '@shared/summary-panel.component';

class PostventaServiceStub {
  shouldFail = false;
  suggestions: Suggestion[] = [{ id: 'sug-1', name: 'Pulido', qty: 1, selected: true }];

  getOrCreateDraftQuote() {
    const draft: DraftQuote = { id: 'draft-1', lines: [] };
    return of(draft);
  }

  analyzePhotos() {
    if (this.shouldFail) {
      return throwError(() => new Error('failure'));
    }
    return of(this.suggestions);
  }

  uploadPhoto() {
    return of({ url: 'mock-url' });
  }

  addLines() {
    return of({ id: 'draft-1', lines: [] });
  }
}

class FlowCompletionStub {
  openedState: FlowCompletionState | null = null;
  closed = false;

  open = jasmine.createSpy('open').and.callFake((state: FlowCompletionState) => {
    this.openedState = state;
  });

  close = jasmine.createSpy('close').and.callFake(() => {
    this.closed = true;
    if (this.openedState?.onComplete) {
      this.openedState.onComplete();
    }
    this.openedState = null;
  });

  isOpen = () => this.openedState !== null && !this.closed;
}

class NavigationStub {
  navigateTo = jasmine.createSpy('navigateTo').and.returnValue(Promise.resolve(true));
  refreshQuickActions = jasmine.createSpy('refreshQuickActions');
}

class FlowContextStub {
  setBreadcrumbs = jasmine.createSpy('setBreadcrumbs');
}

function createMockFileList(files: File[]): FileList {
  const items = files.slice();
  return {
    length: items.length,
    item: (index: number) => items[index] ?? null,
    [Symbol.iterator]: function* () {
      for (const file of items) {
        yield file;
      }
    }
  } as unknown as FileList;
}

describe('PostventaWizardComponent', () => {
  let fixture: ComponentFixture<PostventaWizardComponent>;
  let component: PostventaWizardComponent;
  let service: PostventaServiceStub;
  let completion: FlowCompletionStub;
  let navigation: NavigationStub;

  beforeEach(async () => {
    service = new PostventaServiceStub();
    completion = new FlowCompletionStub();
    navigation = new NavigationStub();

    await TestBed.configureTestingModule({
      imports: [PostventaWizardComponent],
      providers: [
        { provide: PostventaService, useValue: service },
        { provide: FlowContextService, useClass: FlowContextStub },
        { provide: FlowCompletionService, useValue: completion },
        { provide: NavigationService, useValue: navigation }
      ]
    }).compileComponents();

    spyOn(URL, 'createObjectURL').and.returnValue('preview://mock');

    fixture = TestBed.createComponent(PostventaWizardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should open flow completion overlay on successful analysis', () => {
    component.photos.set([
      { kind: 'front', url: 'url', previewUrl: 'prev' }
    ]);

    component.analyze();

    expect(completion.open).toHaveBeenCalled();
    const state = completion.open.calls.mostRecent().args[0];
    expect(state.title).toBe('Sugerencias listas');
    expect(state.metrics?.[0].value).toContain('1 /');

    state.onComplete?.();
    expect(navigation.refreshQuickActions).toHaveBeenCalled();
  });

  it('should open overlay with fallback messaging when analyzer fails', () => {
    service.shouldFail = true;
    component.photos.set([
      { kind: 'front', url: 'url', previewUrl: 'prev' },
      { kind: 'side', url: 'url', previewUrl: 'prev' }
    ]);

    component.analyze();

    expect(completion.open).toHaveBeenCalled();
    const state = completion.open.calls.mostRecent().args[0];
    expect(state.title).toBe('Sugerencias heurísticas generadas');
    const analyzerMetric = state.metrics?.find((metric: SummaryMetric) => metric.label === 'Analizador');
    expect(analyzerMetric?.badge).toBe('warning');
  });

  it('should close overlay when new photos are added', () => {
    completion.open({
      title: 'dummy',
      actions: [],
      onComplete: () => navigation.refreshQuickActions(),
      metrics: []
    } as FlowCompletionState);

    const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
    const files = createMockFileList([file]);

    component.onAddPhotos('front', files);

    expect(completion.close).toHaveBeenCalled();
  });
});
