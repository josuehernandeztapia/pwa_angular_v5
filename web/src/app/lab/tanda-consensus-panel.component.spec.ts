import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { TandaConsensusPanelComponent } from './tanda-consensus-panel.component';
import { FlowContextService } from '@core-services/flow-context.service';
import { ToastService } from '@core-services/toast.service';
import { AnalyticsService } from '@core-services/analytics.service';
import { TandaLabService } from '@feature-services/tanda/tanda-lab.service';

class FlowContextServiceStub {
  setBreadcrumbs = jasmine.createSpy('setBreadcrumbs');
}

class ToastServiceStub {
  success = jasmine.createSpy('success');
  warning = jasmine.createSpy('warning');
  error = jasmine.createSpy('error');
}

class AnalyticsServiceStub {
  track = jasmine.createSpy('track');
}

class TandaLabServiceStub {
  simulateConsensus = jasmine.createSpy('simulateConsensus').and.returnValue(
    of({ assignedMonth: 8, coverage: 72, warnings: ['Mock warning'] })
  );
}

describe('TandaConsensusPanelComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TandaConsensusPanelComponent],
      providers: [
        { provide: FlowContextService, useClass: FlowContextServiceStub },
        { provide: ToastService, useClass: ToastServiceStub },
        { provide: AnalyticsService, useClass: AnalyticsServiceStub },
        { provide: TandaLabService, useClass: TandaLabServiceStub }
      ]
    }).compileComponents();
  });

  it('should simulate consensus scenario', () => {
    const fixture = TestBed.createComponent(TandaConsensusPanelComponent);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.submit();

    expect(component.result()).toEqual(jasmine.objectContaining({ assignedMonth: 8 }));
  });
});
