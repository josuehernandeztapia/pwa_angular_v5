import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { signal } from '@angular/core';

import { TandaEnhancedPanelComponent } from './tanda-enhanced-panel.component';
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
  simulateEnhanced = jasmine.createSpy('simulateEnhanced').and.returnValue(
    of({ assignedMonth: 5, coverage: 87.5, warnings: [] })
  );
}

describe('TandaEnhancedPanelComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TandaEnhancedPanelComponent],
      providers: [
        { provide: FlowContextService, useClass: FlowContextServiceStub },
        { provide: ToastService, useClass: ToastServiceStub },
        { provide: AnalyticsService, useClass: AnalyticsServiceStub },
        { provide: TandaLabService, useClass: TandaLabServiceStub }
      ]
    }).compileComponents();
  });

  it('should execute simulation on submit', () => {
    const fixture = TestBed.createComponent(TandaEnhancedPanelComponent);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.submit();

    expect(component.result()).toEqual(jasmine.objectContaining({ assignedMonth: 5 }));
  });
});
