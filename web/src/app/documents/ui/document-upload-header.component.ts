import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { DemoBadgeComponent } from '@shared/demo-badge.component';
import { DocumentCompletionStatus } from '../types/document-upload.models';

@Component({
  selector: 'app-document-upload-header',
  standalone: true,
  imports: [CommonModule, DemoBadgeComponent],
  templateUrl: './document-upload-header.component.html',
  styleUrls: ['./document-upload-header.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentUploadHeaderComponent {
  @Input({ required: true }) completionStatus!: DocumentCompletionStatus;
  @Input() pendingOfflineDocs = 0;
  @Input() title = 'Documentos requeridos';
  @Input() isDemo = false;
}
