import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { OnboardingMainComponent } from './onboarding-main.component';
import { FlowContextService } from '@core-services/flow-context.service';
import { OnboardingEngineService } from '@feature-services/simulador/onboarding-engine.service';
import { OnboardingRequirementsService } from '@feature-services/onboarding/onboarding-requirements.service';
import { AnalyticsService } from '@core-services/analytics.service';
import { Client, BusinessFlow } from '@interfaces/types';

class FlowContextStub {
  setBreadcrumbs = jasmine.createSpy('setBreadcrumbs');
}

class RequirementsServiceStub {
  update = jasmine.createSpy('update');
  snapshot = jasmine.createSpy('snapshot').and.returnValue(null);
}

class AnalyticsStub {
  track = jasmine.createSpy('track');
}

const buildClient = (override: Partial<Client> = {}): Client => ({
  id: 'onboard-1',
  name: 'Cliente Demo',
  flow: BusinessFlow.VentaDirecta,
  status: 'Nuevas Oportunidades',
  avatarUrl: '',
  healthScore: 70,
  documents: [{ id: 'doc-1', name: 'Identificación oficial', status: 'pending' } as any],
  events: [],
  ecosystemId: 'eco-01',
  ...override
});

describe('OnboardingMainComponent', () => {
  let engine: jasmine.SpyObj<OnboardingEngineService>;
  let requirements: RequirementsServiceStub;

  beforeEach(() => {
    engine = jasmine.createSpyObj('OnboardingEngineService', ['createClientFromOnboarding', 'createSavingsOpportunity']);
    engine.createClientFromOnboarding.and.returnValue(of(buildClient()));
    engine.createSavingsOpportunity.and.returnValue(of(buildClient({ id: 'saving-123', flow: BusinessFlow.CreditoColectivo })));

    requirements = new RequirementsServiceStub();

    TestBed.configureTestingModule({
      imports: [OnboardingMainComponent],
      providers: [
        { provide: FlowContextService, useClass: FlowContextStub },
        { provide: OnboardingEngineService, useValue: engine },
        { provide: OnboardingRequirementsService, useValue: requirements },
        { provide: AnalyticsService, useClass: AnalyticsStub }
      ]
    }).compileComponents();
  });

  it('creates opportunity via createClientFromOnboarding for individual flows', () => {
    const fixture = TestBed.runInInjectionContext(() => TestBed.createComponent(OnboardingMainComponent));
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.form.setValue({
      name: 'Juan Demo',
      market: 'edomex',
      saleType: 'contado',
      clientType: 'individual',
      ecosystemId: ''
    });

    component.submit();

    expect(engine.createClientFromOnboarding).toHaveBeenCalled();
    expect(component.lastCreatedClient()?.name).toBe('Cliente Demo');
    expect(requirements.update).toHaveBeenCalled();
  });

  it('delegates to createSavingsOpportunity for collective clients', () => {
    const fixture = TestBed.runInInjectionContext(() => TestBed.createComponent(OnboardingMainComponent));
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.form.setValue({
      name: 'Grupo Demo',
      market: 'aguascalientes',
      saleType: 'financiero',
      clientType: 'colectivo',
      ecosystemId: 'eco-02'
    });

    component.submit();

    expect(engine.createSavingsOpportunity).toHaveBeenCalledWith({
      name: 'Grupo Demo',
      market: 'aguascalientes',
      ecosystemId: 'eco-02',
      clientType: 'colectivo'
    });
    expect(component.creationState()).toBe('success');
    expect(requirements.update).toHaveBeenCalled();
  });

  it('marks form as touched when invalid', () => {
    const fixture = TestBed.runInInjectionContext(() => TestBed.createComponent(OnboardingMainComponent));
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.form.patchValue({ name: '' });

    component.submit();

    expect(component.form.touched).toBeTrue();
    expect(component.creationState()).toBe('idle');
  });
});
