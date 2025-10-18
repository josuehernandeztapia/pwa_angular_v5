import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-document-protection-banner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './document-protection-banner.component.html',
  styleUrls: ['./document-protection-banner.component.scss']
})
export class DocumentProtectionBannerComponent {
  @Input() visible = false;
  @Input() coverageOptions = '';
  @Output() dismiss = new EventEmitter<void>();

  onDismiss(): void {
    this.dismiss.emit();
  }
}
