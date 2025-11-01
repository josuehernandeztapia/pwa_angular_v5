import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { DemoAnalyticsService } from '@services/demo/demo-analytics.service';
import { DemoModeService } from '@core-services/demo-mode.service';
import { IconComponent } from '@shared/icon/icon.component';

@Component({
  selector: 'app-demo-analytics',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './demo-analytics.component.html',
  styleUrls: ['./demo-analytics.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DemoAnalyticsComponent {
  private readonly analytics = inject(DemoAnalyticsService);
  private readonly demoMode = inject(DemoModeService);

  readonly events = this.analytics.events;
  readonly isDemoMode = this.demoMode.isDemoMode;
  readonly activeScenario = this.demoMode.activeScenario;
  readonly totalEvents = computed(() => this.events().length);

  clearLog(): void {
    this.analytics.clearHistory();
  }
}
