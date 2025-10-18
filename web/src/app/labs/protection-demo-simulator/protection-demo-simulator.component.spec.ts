import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ProtectionDemoSimulatorComponent } from './protection-demo-simulator.component';
import { FlowContextService } from '@core-services/flow-context.service';
import { ProtectionLabScenario, ProtectionWorkflowService } from '@feature-services/risk/protection-workflow.service';

class FlowContextStub {
  setBreadcrumbs = jasmine.createSpy('setBreadcrumbs');
}

class ProtectionWorkflowStub {
  generateLabScenario(): ProtectionLabScenario {
    return {
      title: 'Demo estrategia premium',
      metrics: [
        { label: 'Cobertura', value: '$750,000' },
        { label: 'Prima mensual', value: '$2,950' }
      ]
    };
  }
}

describe('ProtectionDemoSimulatorComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ProtectionDemoSimulatorComponent],
      providers: [
        { provide: FlowContextService, useClass: FlowContextStub },
        { provide: ProtectionWorkflowService, useClass: ProtectionWorkflowStub }
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA]
    });
  });

  it('renders generated scenario', () => {
    const fixture = TestBed.createComponent(ProtectionDemoSimulatorComponent);
    fixture.detectChanges();
    const title = fixture.nativeElement.querySelector('.lab-protection__card h2');
    expect(title.textContent).toContain('Demo estrategia premium');
  });
});
