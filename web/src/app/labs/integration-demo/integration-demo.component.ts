import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { IntegrationComponent } from '@app/integration/integration.component';
import { FlowContextService } from '@core-services/flow-context.service';

@Component({
  selector: 'app-integration-demo',
  standalone: true,
  imports: [CommonModule, IntegrationComponent],
  templateUrl: './integration-demo.component.html',
  styleUrls: ['./integration-demo.component.scss']
})
export class IntegrationDemoComponent {
  private readonly flowContext = inject(FlowContextService);

  constructor() {
    this.flowContext.setBreadcrumbs(['Dashboard', 'Labs', 'Integration Demo']);
  }
}
