import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { IntegrationComponent } from './integration.component';
import { IntegratedImportTrackerService } from '@feature-services/postventa/integrated-import-tracker.service';
import { FlowContextService } from '@core-services/flow-context.service';
import { IntegratedImportStatus } from '@feature-services/postventa/integrated-import-tracker.service';

class TrackerStub {
  getIntegratedImportStatus = jasmine.createSpy('getIntegratedImportStatus').and.returnValue(of(null));
}

class FlowContextStub {
  setBreadcrumbs = jasmine.createSpy('setBreadcrumbs');
  getContextData = jasmine.createSpy('getContextData').and.returnValue(null);
}

function buildStatus(): IntegratedImportStatus {
  return {
    clientId: 'CL-001',
    pedidoPlanta: { status: 'completed', completionDate: new Date() },
    unidadFabricada: { status: 'completed', completionDate: new Date() },
    transitoMaritimo: { status: 'in_progress', startDate: new Date() },
    enAduana: { status: 'pending' },
    liberada: { status: 'pending' },
    triggerHistory: [],
    syncStatus: 'synced'
  } as IntegratedImportStatus;
}

describe('IntegrationComponent', () => {
  let tracker: TrackerStub;

  beforeEach(() => {
    tracker = new TrackerStub();

    TestBed.configureTestingModule({
      imports: [IntegrationComponent],
      providers: [
        { provide: IntegratedImportTrackerService, useValue: tracker },
        { provide: FlowContextService, useClass: FlowContextStub },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({}),
              queryParamMap: convertToParamMap({})
            },
            paramMap: of(convertToParamMap({})),
            queryParamMap: of(convertToParamMap({}))
          }
        }
      ]
    }).compileComponents();
  });

  it('renders fallback data when BFF returns null', () => {
    tracker.getIntegratedImportStatus.and.returnValue(of(null));

    const fixture = TestBed.runInInjectionContext(() => TestBed.createComponent(IntegrationComponent));
    fixture.detectChanges();

    expect(tracker.getIntegratedImportStatus).toHaveBeenCalledWith('CL-001');
    const nextAction = fixture.nativeElement.querySelector('.integration__meta dd:last-child');
    expect(nextAction?.textContent?.trim()).toContain('Coordinación de entrega');
  });

  it('surfaces error banner when service fails', () => {
    tracker.getIntegratedImportStatus.and.returnValue(throwError(() => new Error('network')));

    const fixture = TestBed.runInInjectionContext(() => TestBed.createComponent(IntegrationComponent));
    fixture.detectChanges();

    const banner = fixture.nativeElement.querySelector('.integration__banner');
    expect(banner?.textContent).toContain('BFF de integraciones no disponible');
  });

  it('shows live data when service succeeds', () => {
    tracker.getIntegratedImportStatus.and.returnValue(of(buildStatus()));

    const fixture = TestBed.runInInjectionContext(() => TestBed.createComponent(IntegrationComponent));
    fixture.detectChanges();

    const chips = fixture.nativeElement.querySelectorAll('.integration__chip');
    expect(chips.length).toBeGreaterThan(0);
    expect(chips[0].textContent?.trim()).toBe('Completado');
  });
});
