import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { IconComponent } from '@shared/icon/icon.component';
import { IconName } from '@shared/icon/icon-definitions';
import { OnboardingRequirement, OnboardingRequirementsSnapshot, AviDocumentMatchSnapshot, AviDocumentMatchOverride } from '@feature-services/onboarding/onboarding-requirements.models';

@Component({
  selector: 'app-onboarding-checklist',
  standalone: true,
  imports: [CommonModule, IconComponent, FormsModule],
  templateUrl: './onboarding-checklist.component.html',
  styleUrls: ['./onboarding-checklist.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OnboardingChecklistComponent {
  @Input() snapshot: OnboardingRequirementsSnapshot | null = null;
  @Input() showExtras = true;
  @Output() aviOverrideSubmitted = new EventEmitter<{ decision: 'accepted' | 'forced'; comment: string }>();
  @Output() aviOverrideCleared = new EventEmitter<void>();

  aviOverrideComment = '';
  readonly aviOverrideCommentMaxLength = 280;
  readonly aviOverrideMinLength = 10;

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

  canSubmitAviOverride(): boolean {
    return this.aviOverrideComment.trim().length >= this.aviOverrideMinLength;
  }

  onAviOverrideSubmit(decision: 'accepted' | 'forced'): void {
    if (!this.canSubmitAviOverride()) {
      return;
    }
    const comment = this.aviOverrideComment.trim();
    this.aviOverrideSubmitted.emit({ decision, comment });
    this.aviOverrideComment = '';
  }

  onAviOverrideClear(): void {
    this.aviOverrideCleared.emit();
    this.aviOverrideComment = '';
  }

  isAviRequirement(requirement: OnboardingRequirement): boolean {
    return requirement.id === 'avi-interview';
  }

  aviMatch(requirement: OnboardingRequirement): AviDocumentMatchSnapshot | null {
    const match = requirement.metadata?.['documentMatch'] as AviDocumentMatchSnapshot | undefined;
    return match ?? null;
  }

  aviOverride(requirement: OnboardingRequirement): AviDocumentMatchOverride | null {
    const override = requirement.metadata?.['documentMatchOverride'] as AviDocumentMatchOverride | undefined;
    return override ?? null;
  }

  shouldShowAviOverrideForm(requirement: OnboardingRequirement): boolean {
    const match = this.aviMatch(requirement);
    return this.isAviRequirement(requirement) && !!match && match.status === 'mismatch' && !this.aviOverride(requirement);
  }
}
