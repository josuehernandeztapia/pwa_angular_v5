import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

type BannerType = 'offline' | 'queued' | 'error' | null;

@Component({
  selector: 'app-document-status-banner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './document-status-banner.component.html',
  styleUrls: ['./document-status-banner.component.scss']
})
export class DocumentStatusBannerComponent {
  @Input() type: BannerType = null;
  @Input() pendingOfflineDocs = 0;
}
