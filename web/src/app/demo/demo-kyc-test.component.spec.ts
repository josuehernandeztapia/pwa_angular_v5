import { signal } from '@angular/core';

import { DemoKycTestComponent } from './demo-kyc-test.component';
import { DemoScenarioId } from '@services/demo/demo-scenarios';
import { DocumentStatus } from '@interfaces/types';

class DemoModeServiceStub {
  private readonly scenarioSignal = signal<DemoScenarioId | null>(null);
  readonly activeScenarioState = signal({
    id: 'kyc-demo',
    documents: [
      { id: 'doc-ine-kyc', name: 'INE', status: DocumentStatus.Pendiente },
      { id: 'doc-kyc', name: 'Biometría', status: DocumentStatus.Pendiente }
    ]
  } as any);

  enableDemoMode = jasmine.createSpy('enableDemoMode');
  setScenario = jasmine.createSpy('setScenario').and.callFake((id: DemoScenarioId) => this.scenarioSignal.set(id));
  resetScenario = jasmine.createSpy('resetScenario');

  getScenarioSnapshot(): any {
    return this.activeScenarioState();
  }
}

class DemoAnalyticsStub {
  track = jasmine.createSpy('track');
}

describe('DemoKycTestComponent', () => {
  let demoMode: DemoModeServiceStub;
  let analytics: DemoAnalyticsStub;
  let component: DemoKycTestComponent;

  beforeEach(() => {
    demoMode = new DemoModeServiceStub();
    analytics = new DemoAnalyticsStub();
    component = new DemoKycTestComponent(demoMode as any, analytics as any);
    component.ngOnInit();
  });

  it('initializes demo mode and loads documents', () => {
    expect(demoMode.enableDemoMode).toHaveBeenCalled();
    expect(demoMode.setScenario).toHaveBeenCalledWith('kyc-demo');
    expect(component.documents().length).toBe(2);
    expect(analytics.track).toHaveBeenCalledWith('kyc_test_viewed', jasmine.objectContaining({ scenario: 'kyc-demo' }));
  });

  it('prepares uploads and advances step', () => {
    component.prepareUploads();
    expect(component.currentStepIndex()).toBe(1);
    expect(component.documents().filter(doc => doc.status === DocumentStatus.Aprobado).length).toBe(1);
    expect(analytics.track).toHaveBeenCalledWith('kyc_test_stage_progressed', jasmine.objectContaining({ stage: 'uploads_prepared' }));
  });

  it('handles biometric alert and resolves it', () => {
    component.prepareUploads();
    component.simulateBiometricAlert();

    expect(component.hasFraudFlag()).toBeTrue();
    expect(component.documents().some(doc => doc.status === DocumentStatus.Rechazado)).toBeTrue();
    expect(analytics.track).toHaveBeenCalledWith('kyc_test_biometric_alert', jasmine.any(Object));

    component.resolveAlerts();

    expect(component.hasFraudFlag()).toBeFalse();
    expect(analytics.track).toHaveBeenCalledWith('kyc_test_autofix', jasmine.objectContaining({ scenario: 'kyc-demo' }));
    expect(analytics.track).toHaveBeenCalledWith('kyc_test_completed', jasmine.objectContaining({ fraudFlags: false }));
  });

  it('resets the test to initial state', () => {
    component.prepareUploads();
    component.resetTest();

    expect(demoMode.resetScenario).toHaveBeenCalledWith('kyc-demo');
    expect(component.currentStepIndex()).toBe(0);
    expect(component.documents().every(doc => doc.status === DocumentStatus.Pendiente)).toBeTrue();
  });
});
