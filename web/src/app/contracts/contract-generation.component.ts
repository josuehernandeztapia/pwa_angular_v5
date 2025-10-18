import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FlowContextService } from '@core-services/flow-context.service';
import { IconComponent } from '@shared/icon/icon.component';

@Component({
  selector: 'app-contract-generation',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './contract-generation.component.html',
  styleUrls: ['./contract-generation.component.scss']
})
export class ContractGenerationComponent {
  private readonly flowContext = inject(FlowContextService);

  constructor() {
    this.flowContext.setBreadcrumbs(['Dashboard', 'Contratos']);
  }
}
