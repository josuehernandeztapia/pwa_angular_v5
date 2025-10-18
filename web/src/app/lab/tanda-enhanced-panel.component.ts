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
  selector: 'app-tanda-enhanced-panel',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IconComponent],
  templateUrl: './tanda-panel.component.html',
  styleUrls: ['./tanda-panel.component.scss']
})
export class TandaEnhancedPanelComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly flowContext = inject(FlowContextService);
  private readonly toast = inject(ToastService);
  private readonly analytics = inject(AnalyticsService);
  private readonly tandaLab = inject(TandaLabService);
  private readonly destroyRef = inject(DestroyRef);

  readonly mode: 'consensus' | 'enhanced' = 'enhanced';
  readonly modeLabel = 'Enhanced';
  readonly title = 'Tanda Enhanced – Motor de asignación dinámica';
  readonly description = 'Simulador de laboratorio para validar heurísticas de asignación mensual con coberturas extendidas.';

  readonly form = this.fb.nonNullable.group({
    participants: [24, [Validators.required, Validators.min(8), Validators.max(96)]],
    monthly: [2500, [Validators.required, Validators.min(500)]],
    startMonth: [1, [Validators.required, Validators.min(1), Validators.max(48)]]
  });

  readonly result = signal<TandaResult | null>(null);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.flowContext.setBreadcrumbs(['LAB', 'Tanda Enhanced']);
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
      .simulateEnhanced(payload)
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
            this.toast.success('Simulación completada exitosamente.');
          }
        },
        error: () => {
          this.isLoading.set(false);
          this.error.set('No fue posible obtener respuesta del laboratorio. Se recomienda validar el BFF de Labs.');
          this.toast.error('Fallo al consultar el motor de Tanda Enhanced.');
        }
      });
  }
}
