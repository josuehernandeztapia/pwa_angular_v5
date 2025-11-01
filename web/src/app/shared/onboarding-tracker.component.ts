import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import { IconComponent } from '@shared/icon/icon.component';
import { IconName } from '@shared/icon/icon-definitions';
import { OnboardingStage, OnboardingRequirementsSnapshot } from '@feature-services/onboarding/onboarding-requirements.models';

@Component({
  selector: 'app-onboarding-tracker',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './onboarding-tracker.component.html',
  styleUrls: ['./onboarding-tracker.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OnboardingTrackerComponent {
  @Input() snapshot: OnboardingRequirementsSnapshot | null = null;

  trackByStage(_: number, stage: OnboardingStage): string {
    return stage.id;
  }

  getCompletedCount(stage: OnboardingStage): number {
    return stage.requirements.filter(r => r.status === 'completed').length;
  }

  statusIcon(stage: OnboardingStage): IconName {
    switch (stage.status) {
      case 'completed':
        return 'check-circle';
      case 'blocked':
        return 'alert-triangle';
      case 'current':
        return 'sparkles';
      default:
        return 'clock';
    }
  }
}
