import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-document-income-banner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './document-income-banner.component.html',
  styleUrls: ['./document-income-banner.component.scss']
})
export class DocumentIncomeBannerComponent {
  @Input() visible = false;
  @Input() message = '';
  @Output() dismiss = new EventEmitter<void>();

  onDismiss(): void {
    this.dismiss.emit();
  }
}
