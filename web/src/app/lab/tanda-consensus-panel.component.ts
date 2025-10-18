import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { FlowContextService } from '@core-services/flow-context.service';
import { ToastService } from '@core-services/toast.service';
import { AnalyticsService } from '@core-services/analytics.service';
import { TandaInput, TandaLabService, TandaResult } from '@feature-services/tanda/tanda-lab.service';
import { IconComponent } from '@shared/icon/icon.component';

@Component({
  selector: 'app-tanda-consensus-panel',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IconComponent],
  templateUrl: './tanda-panel.component.html',
  styleUrls: ['./tanda-panel.component.scss']
})
export class TandaConsensusPanelComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly flowContext = inject(FlowContextService);
  private readonly toast = inject(ToastService);
  private readonly analytics = inject(AnalyticsService);
  private readonly tandaLab = inject(TandaLabService);
  private readonly destroyRef = inject(DestroyRef);

  readonly mode: 'consensus' | 'enhanced' = 'consensus';
  readonly modeLabel = 'Consensus';
  readonly title = 'Tanda Consensus – Motor colaborativo de asignación';
  readonly description = 'Simulación para validar el algoritmo consensus con métricas de cobertura y alertas de riesgo colectivo.';

  readonly form = this.fb.nonNullable.group({
    participants: [32, [Validators.required, Validators.min(12), Validators.max(120)]],
    monthly: [1800, [Validators.required, Validators.min(400)]],
    startMonth: [3, [Validators.required, Validators.min(1), Validators.max(60)]]
  });

  readonly result = signal<TandaResult | null>(null);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.flowContext.setBreadcrumbs(['LAB', 'Tanda Consensus']);
    this.analytics.track('tanda_lab_panel_opened', { mode: this.mode });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const input = this.form.getRawValue();
    const payload: TandaInput = {
      participants: input.participants,
      monthly: input.monthly,
      startMonth: input.startMonth
    };

    this.isLoading.set(true);
    this.error.set(null);

    this.tandaLab
      .simulateConsensus(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.isLoading.set(false);
          this.result.set(result);
          this.analytics.track('tanda_lab_simulation_completed', {
            mode: this.mode,
            assignedMonth: result.assignedMonth,
            coverage: result.coverage
          });
          if (result.warnings?.length) {
            this.toast.warning(result.warnings.join(' '));
          } else {
            this.toast.success('Simulación consensus ejecutada.');
          }
        },
        error: () => {
          this.isLoading.set(false);
          this.error.set('El servicio consensus no respondió. Revisa la configuración del BFF de Labs.');
          this.toast.error('Fallo al consultar el motor de Tanda Consensus.');
        }
      });
  }
}
