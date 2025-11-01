import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FlowCompletionService, FlowCompletionAction } from '@core-services/flow-completion.service';
import { IconComponent } from './icon/icon.component';

@Component({
  selector: 'app-flow-completion-overlay',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './flow-completion-overlay.component.html',
  styleUrls: ['./flow-completion-overlay.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FlowCompletionOverlayComponent {
  private readonly completion = inject(FlowCompletionService);
  readonly state = this.completion.state;
  readonly hasState = computed(() => this.state() !== null);
  isExecuting = false;

  onBackdropClick(): void {
    this.dismiss();
  }

  close(): void {
    this.completion.close();
  }

  dismiss(): void {
    const current = this.state();
    if (!current?.dismissible) {
      return;
    }
    this.completion.close();
  }

  async executeAction(action: FlowCompletionAction): Promise<void> {
    this.isExecuting = true;
    try {
      await this.completion.execute(action);
    } finally {
      this.isExecuting = false;
    }
  }

  async onAction(action: FlowCompletionAction): Promise<void> {
    await this.completion.execute(action);
  }

  trackAction(_: number, action: FlowCompletionAction): string {
    return action.id;
  }

  trackMetric(index: number, metric: any): string {
    return metric.label || index.toString();
  }

  trackStep(index: number, step: string): string {
    return step;
  }
}
