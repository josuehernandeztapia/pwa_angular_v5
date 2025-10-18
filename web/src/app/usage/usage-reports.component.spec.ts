import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { UsageReportsComponent } from './usage-reports.component';
import { DashboardService } from '@feature-services/dashboard/dashboard.service';
import { FlowContextService } from '@core-services/flow-context.service';
import { DashboardStats, Market } from '@interfaces/types';

class DashboardServiceStub {
  private statsFactory: (market: Market) => DashboardStats = () => ({
    opportunitiesInPipeline: {
      nuevas: 5,
      expediente: 3,
      aprobado: 2
    },
    pendingActions: {
      clientsWithMissingDocs: 4,
      clientsWithGoalsReached: 1
    },
    activeContracts: 12,
    monthlyRevenue: {
      collected: 100000,
      projected: 150000
    }
  });

  getDashboardStats = jasmine.createSpy('getDashboardStats').and.callFake((market: Market) => of(this.statsFactory(market)));

  setStatsFactory(factory: (market: Market) => DashboardStats): void {
    this.statsFactory = factory;
    this.getDashboardStats.and.callFake((market: Market) => of(this.statsFactory(market)));
  }

  setErrorResponse(): void {
    this.getDashboardStats.and.callFake(() => throwError(() => new Error('BFF offline')));
  }
}

class FlowContextServiceStub {
  setBreadcrumbs = jasmine.createSpy('setBreadcrumbs');
}

describe('UsageReportsComponent', () => {
  let fixture: ComponentFixture<UsageReportsComponent>;
  let component: UsageReportsComponent;
  let dashboardStub: DashboardServiceStub;
  let flowContextStub: FlowContextServiceStub;

  beforeEach(async () => {
    dashboardStub = new DashboardServiceStub();
    flowContextStub = new FlowContextServiceStub();

    await TestBed.configureTestingModule({
      imports: [UsageReportsComponent],
      providers: [
        { provide: DashboardService, useValue: dashboardStub },
        { provide: FlowContextService, useValue: flowContextStub }
      ]
    }).compileComponents();

    TestBed.runInInjectionContext(() => {
      fixture = TestBed.createComponent(UsageReportsComponent);
      component = fixture.componentInstance;
    });
  });

  it('should load metrics and revenue data on init', () => {
    fixture.detectChanges();

    expect(flowContextStub.setBreadcrumbs).toHaveBeenCalledWith(['Dashboard', 'Uso del Sistema']);
    expect(dashboardStub.getDashboardStats).toHaveBeenCalledWith('all');
    expect(component.metrics().length).toBe(4);
    expect(component.revenue()).toEqual({ collected: 100000, projected: 150000 });
    expect(component.projectedDelta()).toBe(50000);
  });

  it('should reload metrics when market changes', () => {
    fixture.detectChanges();

    component.setMarket('edomex');

    expect(dashboardStub.getDashboardStats).toHaveBeenCalledWith('edomex');
    expect(component.selectedMarket()).toBe('edomex');
  });

  it('should present an error state when the dashboard service fails', () => {
    dashboardStub.setErrorResponse();

    fixture.detectChanges();

    expect(component.metrics()).toEqual([]);
    expect(component.revenue()).toBeNull();
    expect(component.error()).toContain('No fue posible recuperar los datos de uso');
    expect(component.isLoading()).toBeFalse();
  });
});
