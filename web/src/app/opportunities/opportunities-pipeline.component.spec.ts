import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { OpportunitiesPipelineComponent } from './opportunities-pipeline.component';
import { DashboardService } from '@feature-services/dashboard/dashboard.service';
import { FlowContextService } from '@core-services/flow-context.service';
import { Market } from '@interfaces/types';

class DashboardServiceStub {
  private responseFactory: (market: Market) => any = () => of([
    { name: 'Nuevas Oportunidades', count: 3, clientIds: ['c1', 'c2', 'c3'] },
    { name: 'Aprobado', count: 2, clientIds: ['c4', 'c5'] }
  ]);

  getOpportunityStages = jasmine.createSpy('getOpportunityStages').and.callFake((market: Market) => this.responseFactory(market));

  setResponse(factory: (market: Market) => any): void {
    this.responseFactory = factory;
  }
}

class FlowContextServiceStub {
  setBreadcrumbs = jasmine.createSpy('setBreadcrumbs');
}

describe('OpportunitiesPipelineComponent', () => {
  let fixture: ComponentFixture<OpportunitiesPipelineComponent>;
  let component: OpportunitiesPipelineComponent;
  let dashboardStub: DashboardServiceStub;
  let flowContextStub: FlowContextServiceStub;

  beforeEach(async () => {
    dashboardStub = new DashboardServiceStub();
    flowContextStub = new FlowContextServiceStub();

    await TestBed.configureTestingModule({
      imports: [OpportunitiesPipelineComponent],
      providers: [
        { provide: DashboardService, useValue: dashboardStub },
        { provide: FlowContextService, useValue: flowContextStub }
      ]
    }).compileComponents();

    TestBed.runInInjectionContext(() => {
      fixture = TestBed.createComponent(OpportunitiesPipelineComponent);
      component = fixture.componentInstance;
    });
  });

  it('should load stages on init and compute totals', () => {
    fixture.detectChanges();

    expect(flowContextStub.setBreadcrumbs).toHaveBeenCalledWith(['Dashboard', 'Oportunidades']);
    expect(dashboardStub.getOpportunityStages).toHaveBeenCalledWith('all');
    expect(component.stages().length).toBe(2);
    expect(component.totalOpportunities()).toBe(5);
    expect(component.isLoading()).toBeFalse();
    expect(component.error()).toBeNull();
  });

  it('should reload data when market changes', () => {
    fixture.detectChanges();

    component.setMarket('edomex');

    expect(dashboardStub.getOpportunityStages).toHaveBeenCalledWith('edomex');
    expect(component.selectedMarket()).toBe('edomex');
  });

  it('should expose error state when service fails', () => {
    dashboardStub.setResponse(() => throwError(() => new Error('boom')));

    fixture.detectChanges();

    expect(component.stages()).toEqual([]);
    expect(component.error()).toContain('No fue posible sincronizar el pipeline');
    expect(component.isLoading()).toBeFalse();
  });
});
