import { CUSTOM_ELEMENTS_SCHEMA, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { IntegrationDemoComponent } from './integration-demo.component';
import { FlowContextService } from '@core-services/flow-context.service';
import { IntegrationComponent } from '@app/integration/integration.component';

@Component({
  selector: 'app-integration-dashboard',
  standalone: true,
  template: '<p>integration stub</p>'
})
class IntegrationDashboardStubComponent {}

class FlowContextStub {
  setBreadcrumbs = jasmine.createSpy('setBreadcrumbs');
}

describe('IntegrationDemoComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [IntegrationDemoComponent],
      providers: [{ provide: FlowContextService, useClass: FlowContextStub }],
      schemas: [CUSTOM_ELEMENTS_SCHEMA]
    });

    TestBed.overrideComponent(IntegrationDemoComponent, {
      remove: { imports: [IntegrationComponent] },
      add: { imports: [IntegrationDashboardStubComponent] }
    });
  });

  it('creates component', () => {
    const fixture = TestBed.createComponent(IntegrationDemoComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });
});
