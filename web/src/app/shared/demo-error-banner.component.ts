import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

import { IconComponent } from '@shared/icon/icon.component';
import { IconName } from '@shared/icon/icon-definitions';

@Component({
  selector: 'app-demo-error-banner',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './demo-error-banner.component.html',
  styleUrls: ['./demo-error-banner.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DemoErrorBannerComponent {
  @Input() title = 'Escenario demo';
  @Input() description = '';
  @Input() actionLabel = 'Resolver';
  @Input() actionIcon: IconName | null = 'sparkles';
  @Input() busy = false;
  @Output() resolve = new EventEmitter<void>();

  onResolve(): void {
    if (this.busy) {
      return;
    }
    this.resolve.emit();
  }
}
