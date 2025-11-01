import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'app-demo-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span
      class="demo-badge"
      [class.demo-badge--demo]="isDemo"
      [class.demo-badge--real]="!isDemo"
      [class.demo-badge--md]="size === 'md'"
    >
      {{ isDemo ? 'DEMO' : 'REAL' }}
    </span>
  `,
  styleUrls: ['./demo-badge.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DemoBadgeComponent {
  @Input() isDemo = false;
  @Input() size: 'sm' | 'md' = 'sm';
}
