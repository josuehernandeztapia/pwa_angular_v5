import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { DocumentCompletionStatus } from '../types/document-upload.models';

@Component({
  selector: 'app-document-upload-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './document-upload-header.component.html',
  styleUrls: ['./document-upload-header.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentUploadHeaderComponent {
  @Input({ required: true }) completionStatus!: DocumentCompletionStatus;
  @Input() pendingOfflineDocs = 0;
  @Input() title = 'Documentos requeridos';
}
