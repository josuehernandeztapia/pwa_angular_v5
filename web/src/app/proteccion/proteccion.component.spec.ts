import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { computed, signal } from '@angular/core';

import { ProteccionComponent } from './proteccion.component';
import { ProtectionWorkflowService } from '@services/features/risk/protection-workflow.service';
import { ProtectionScenario } from '@interfaces/protection';
import { FlowContextService } from '@core-services/flow-context.service';
import { DemoModeService } from '@core-services/demo-mode.service';
import { AnalyticsService } from '@core-services/analytics.service';
import { environment } from '@environments/environment';

class ProtectionWorkflowStub {
  private readonly scenariosSignal = signal<ProtectionScenario[]>([]);
  readonly availableScenarios = computed(() => this.scenariosSignal());
  readonly selectedScenario = signal<ProtectionScenario | null>(null);
  readonly error = signal<string | null>(null);
  readonly loading = signal(false);
  readonly simulating = signal(false);
  readonly lastSimulation = signal(null);

  clearError = jasmine.createSpy('clearError');
  loadPlan = jasmine.createSpy('loadPlan');
  simulateScenarios = jasmine.createSpy('simulateScenarios');
  selectScenario = jasmine.createSpy('selectScenario');
}

class FlowContextStub {
  setBreadcrumbs = jasmine.createSpy('setBreadcrumbs');
}

describe('ProteccionComponent (demo mode)', () => {
  let fixture: ComponentFixture<ProteccionComponent>;
  let component: ProteccionComponent;
  let demoMode: DemoModeService;

  beforeEach(async () => {
    environment.features.enableMockData = true;

    await TestBed.configureTestingModule({
      imports: [ProteccionComponent],
      providers: [
        { provide: ProtectionWorkflowService, useClass: ProtectionWorkflowStub },
        { provide: FlowContextService, useClass: FlowContextStub },
        { provide: AnalyticsService, useValue: { track: jasmine.createSpy('track') } }
      ]
    }).compileComponents();

    demoMode = TestBed.inject(DemoModeService);
    demoMode.setScenario('proteccion-reestructura');

    fixture = TestBed.createComponent(ProteccionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('reflects PMT changes after applying demo reestructura', fakeAsync(() => {
    expect(component.isProteccionDemo()).toBeTrue();

    const initialPlan = component.demoPaymentPlan();
    expect(initialPlan?.monthlyPayment).toBe(6800);

    component.applyDemoScenario('stepdown');
    tick(350);
    fixture.detectChanges();

    const updatedPlan = component.demoPaymentPlan();
    expect(updatedPlan?.monthlyPayment).toBe(5600);

    const summary = component.demoFinanceSummary();
    expect(summary?.scenarioTitle).toContain('Stepdown');
    expect(summary?.monthlyPayment).toBe(5600);

    const summaryElement: HTMLElement | null = fixture.nativeElement.querySelector('.protection__demo-summary');
    expect(summaryElement?.textContent ?? '').toContain('5,600');
  }));
});
