import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import { IconComponent } from '@shared/icon/icon.component';
import { IconName } from '@shared/icon/icon-definitions';
import { OnboardingRequirement, OnboardingRequirementsSnapshot } from '@feature-services/onboarding/onboarding-requirements.models';

@Component({
  selector: 'app-onboarding-checklist',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './onboarding-checklist.component.html',
  styleUrls: ['./onboarding-checklist.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OnboardingChecklistComponent {
  @Input() snapshot: OnboardingRequirementsSnapshot | null = null;
  @Input() showExtras = true;

  trackByRequirement(_: number, item: OnboardingRequirement): string {
    return item.id;
  }

  statusIcon(requirement: OnboardingRequirement): IconName {
    switch (requirement.status) {
      case 'completed':
        return 'check-circle';
      case 'blocked':
        return 'alert-triangle';
      default:
        return 'clock';
    }
  }

  statusLabel(requirement: OnboardingRequirement): string {
    switch (requirement.status) {
      case 'completed':
        return 'Completado';
      case 'blocked':
        return 'Bloqueado';
      default:
        return 'Pendiente';
    }
  }

  requirementStateClasses(requirement: OnboardingRequirement): Record<string, boolean> {
    return {
      'onboarding-checklist__item--completed': requirement.status === 'completed',
      'onboarding-checklist__item--blocked': requirement.status === 'blocked',
      'onboarding-checklist__item--pending': requirement.status === 'pending'
    };
  }

  get documentRequirements(): OnboardingRequirement[] {
    if (!this.snapshot) {
      return [];
    }
    return this.snapshot.documents;
  }

  get extraRequirements(): OnboardingRequirement[] {
    if (!this.snapshot || !this.showExtras) {
      return [];
    }

    const extras: Array<OnboardingRequirement | null> = [
      this.snapshot.kycRequirement,
      this.snapshot.aviRequirement,
      this.snapshot.incomeRequirement,
      this.snapshot.protectionRequirement,
      this.snapshot.tandaRequirement
    ];

    return extras.filter((req): req is OnboardingRequirement => !!req);
  }

  get totalRequirements(): number {
    return this.documentRequirements.length + this.extraRequirements.length;
  }
}
