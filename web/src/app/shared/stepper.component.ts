import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { IconComponent } from '@shared/icon/icon.component';
import { IconName } from '@shared/icon/icon-definitions';

export interface StepperStep {
  id: string;
  label: string;
  valid?: boolean;
  completed?: boolean;
  icon?: IconName;
}

@Component({
  selector: 'app-stepper',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './stepper.component.html',
  styleUrls: ['./stepper.component.scss']
})
export class StepperComponent implements OnChanges {
  @Input() steps: StepperStep[] = [];
  @Input() currentStepIndex: number = 0;
  @Input() canProceed: boolean = true;
  @Input() allowNavigation: boolean = true;
  @Input() isMobile: boolean = false;

  @Output() stepChange = new EventEmitter<number>();
  @Output() nextStep = new EventEmitter<void>();
  @Output() previousStep = new EventEmitter<void>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['currentStepIndex'] && changes['currentStepIndex'].currentValue >= 0) {
      // Ensure step index is within bounds
      if (this.currentStepIndex >= this.steps.length) {
        this.currentStepIndex = this.steps.length - 1;
      }
    }
  }

  get progressPercentage(): number {
    if (this.steps.length === 0) return 0;
    return (this.currentStepIndex / (this.steps.length - 1)) * 100;
  }

  onStepClick(index: number): void {
    if (!this.allowNavigation || index === this.currentStepIndex) return;

    // Only allow navigation to previous steps or next step if current is valid
    const canNavigate = index < this.currentStepIndex ||
      (index === this.currentStepIndex + 1 && this.canProceed);

    if (canNavigate) {
      this.stepChange.emit(index);
    }
  }

  onNextStep(): void {
    if (this.currentStepIndex < this.steps.length - 1 && this.canProceed && this.allowNavigation) {
      this.nextStep.emit();
    }
  }

  onPreviousStep(): void {
    if (this.currentStepIndex > 0 && this.allowNavigation) {
      this.previousStep.emit();
    }
  }
}
