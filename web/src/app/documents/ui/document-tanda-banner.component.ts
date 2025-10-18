import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TandaPolicyMetadata } from '@feature-services/configuration/market-policy.service';
import { TandaValidationStatus } from '@feature-services/tanda/tanda-validation.service';

@Component({
  selector: 'app-document-tanda-banner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './document-tanda-banner.component.html',
  styleUrls: ['./document-tanda-banner.component.scss']
})
export class DocumentTandaBannerComponent {
  @Input() visible = false;
  @Input() rules: TandaPolicyMetadata | undefined;
  @Input() status: TandaValidationStatus | null = null;
  @Output() dismiss = new EventEmitter<void>();

  get statusLabel(): string {
    if (!this.status) {
      return 'Pendiente';
    }
    switch (this.status) {
      case 'ok':
        return 'Validada';
      case 'review':
        return 'Revisión requerida';
      case 'error':
        return 'Error';
      case 'processing':
        return 'En proceso';
      default:
        return 'Pendiente';
    }
  }

  onDismiss(): void {
    this.dismiss.emit();
  }
}
