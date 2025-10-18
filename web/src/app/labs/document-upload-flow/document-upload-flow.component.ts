import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DocumentUploadShellComponent } from '@app/documents/ui/document-upload-shell.component';
import { FlowContextService } from '@core-services/flow-context.service';

@Component({
  selector: 'app-lab-document-upload-flow',
  standalone: true,
  imports: [CommonModule, DocumentUploadShellComponent],
  templateUrl: './document-upload-flow.component.html',
  styleUrls: ['./document-upload-flow.component.scss']
})
export class DocumentUploadFlowComponent {
  private readonly flowContext = inject(FlowContextService);
  private readonly router = inject(Router);

  readonly showShell = signal(true);

  constructor() {
    this.flowContext.setBreadcrumbs(['Dashboard', 'Labs', 'Document Upload']);
  }

  exit(): void {
    this.router.navigate(['/documentos']);
  }
}
