import { signal } from '@angular/core';

import { DemoAviTestComponent } from './demo-avi-test.component';
import { DemoScenarioId } from '@services/demo/demo-scenarios';

class DemoModeServiceStub {
  private readonly scenarioSignal = signal<DemoScenarioId | null>(null);
  readonly activeScenario = this.scenarioSignal.asReadonly();
  readonly activeScenarioState = signal(null as any);

  enableDemoMode = jasmine.createSpy('enableDemoMode');
  setScenario = jasmine.createSpy('setScenario').and.callFake((id: DemoScenarioId) => this.scenarioSignal.set(id));
  resetScenario = jasmine.createSpy('resetScenario');
}

class DemoAnalyticsStub {
  track = jasmine.createSpy('track');
}

class DemoWorkflowStub {
  simulateAviDecision = jasmine.createSpy('simulateAviDecision');
}

describe('DemoAviTestComponent', () => {
  let demoMode: DemoModeServiceStub;
  let analytics: DemoAnalyticsStub;
  let workflow: DemoWorkflowStub;
  let component: DemoAviTestComponent;

  beforeEach(() => {
    demoMode = new DemoModeServiceStub();
    analytics = new DemoAnalyticsStub();
    workflow = new DemoWorkflowStub();
    component = new DemoAviTestComponent(demoMode as any, analytics as any, workflow as any);
  });

  it('enables demo mode and sets scenario on init', () => {
    component.ngOnInit();

    expect(demoMode.enableDemoMode).toHaveBeenCalled();
    expect(demoMode.setScenario).toHaveBeenCalledWith('avi-perfecto');
    expect(analytics.track).toHaveBeenCalledWith('avi_test_viewed', jasmine.objectContaining({ scenario: 'avi-perfecto' }));
  });

  it('tracks interview lifecycle events', () => {
    component.ngOnInit();
    component.onInterviewStarted();

    expect(component.currentStepIndex()).toBe(1);
    expect(analytics.track).toHaveBeenCalledWith('avi_test_started', jasmine.objectContaining({ scenario: 'avi-perfecto' }));

    component.onInterviewCompleted({
      validationResult: {
        session_id: 'avi_demo',
        compliance_score: 82,
        session_duration: 5000,
        questions_missing: [],
        risk_flags: []
      }
    });

    expect(component.currentStepIndex()).toBe(2);
    expect(analytics.track).toHaveBeenCalledWith('avi_test_completed', jasmine.objectContaining({ compliance: 82 }));
  });

  it('resets the scenario and clears state', () => {
    component.ngOnInit();
    component.onInterviewStarted();
    component.resetTest();

    expect(demoMode.resetScenario).toHaveBeenCalledWith('avi-perfecto');
    expect(component.currentStepIndex()).toBe(0);
    expect(analytics.track).toHaveBeenCalledWith('avi_test_reset', jasmine.objectContaining({ scenario: 'avi-perfecto' }));
  });

  it('resolves issues by simulating GO decision', () => {
    component.ngOnInit();
    component.resolveIssues();

    expect(workflow.simulateAviDecision).toHaveBeenCalledWith('avi-perfecto', 'GO');
    expect(analytics.track).toHaveBeenCalledWith('avi_test_autofix', jasmine.objectContaining({ scenario: 'avi-perfecto' }));
  });
});
