import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FlowContextService } from '@core-services/flow-context.service';
import { ProtectionLabScenario, ProtectionWorkflowService } from '@feature-services/risk/protection-workflow.service';

@Component({
  selector: 'app-protection-demo-simulator',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './protection-demo-simulator.component.html',
  styleUrls: ['./protection-demo-simulator.component.scss']
})
export class ProtectionDemoSimulatorComponent {
  private readonly flowContext = inject(FlowContextService);
  private readonly protectionWorkflow = inject(ProtectionWorkflowService);

  readonly scenario = signal<ProtectionLabScenario>(this.protectionWorkflow.generateLabScenario());

  constructor() {
    this.flowContext.setBreadcrumbs(['Dashboard', 'Labs', 'Protection Simulator']);
  }

  reset(): void {
    this.scenario.set(this.protectionWorkflow.generateLabScenario());
  }
}
