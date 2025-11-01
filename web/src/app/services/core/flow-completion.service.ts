import { Injectable, computed, signal } from '@angular/core';
import { FlowContextService } from './flow-context.service';
import { SummaryMetric } from '@shared/summary-panel.component';

export type FlowCompletionActionKind = 'primary' | 'secondary' | 'ghost';

export interface FlowCompletionAction {
  id: string;
  label: string;
  description?: string;
  kind?: FlowCompletionActionKind;
  autoClose?: boolean;
  execute: () => void | Promise<void> | Promise<boolean>;
}

export interface FlowCompletionState {
  title: string;
  description?: string;
  metrics?: SummaryMetric[];
  nextSteps?: string[];
  actions: FlowCompletionAction[];
  breadcrumbs?: string[];
  dismissible?: boolean;
  onComplete?: () => void | Promise<void>;
}

@Injectable({ providedIn: 'root' })
export class FlowCompletionService {
  private readonly stateSignal = signal<FlowCompletionState | null>(null);
  readonly state = this.stateSignal.asReadonly();
  readonly isOpen = computed(() => this.stateSignal() !== null);

  constructor(private readonly flowContext: FlowContextService) {}

  open(state: FlowCompletionState): void {
    if (state.breadcrumbs?.length) {
      this.flowContext.setBreadcrumbs(state.breadcrumbs);
    }
    this.stateSignal.set({ ...state, dismissible: state.dismissible ?? true });
  }

  close(): void {
    const currentState = this.stateSignal();
    this.stateSignal.set(null);

    if (currentState?.onComplete) {
      Promise.resolve(currentState.onComplete()).catch(error => {
        console.error('[FlowCompletionService] Error executing onComplete callback', error);
      });
    }
  }

  async execute(action: FlowCompletionAction): Promise<void> {
    try {
      await action.execute?.();
      if (action.autoClose !== false) {
        this.close();
      }
    } catch (error) {
      // Mantener el overlay abierto para permitir reintentos; loggear para debugging
      console.error('[FlowCompletionService] Error executing action', action.id, error);
    }
  }
}
