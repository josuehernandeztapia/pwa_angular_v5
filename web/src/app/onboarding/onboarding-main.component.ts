import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FlowContextService } from '@core-services/flow-context.service';
import { IconComponent } from '@shared/icon/icon.component';
import { OnboardingEngineService } from '@feature-services/simulador/onboarding-engine.service';
import { Client } from '@interfaces/types';

@Component({
  selector: 'app-onboarding-main',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IconComponent],
  templateUrl: './onboarding-main.component.html',
  styleUrls: ['./onboarding-main.component.scss']
})
export class OnboardingMainComponent {
  private readonly flowContext = inject(FlowContextService);
  private readonly onboardingEngine = inject(OnboardingEngineService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly markets = [
    { value: 'edomex', label: 'Edo. de México' },
    { value: 'aguascalientes', label: 'Aguascalientes' }
  ] as const;

  readonly saleTypes = [
    { value: 'financiero', label: 'Financiamiento' },
    { value: 'contado', label: 'Contado' }
  ] as const;

  readonly clientTypes = [
    { value: 'individual', label: 'Individual' },
    { value: 'colectivo', label: 'Colectivo' }
  ] as const;

  readonly onboardingSteps = [
    { icon: 'user-plus', title: 'Identifica al cliente', description: 'Define mercado, flujo y tipo de cliente.' },
    { icon: 'clipboard-list', title: 'Genera checklist inteligente', description: 'Calculamos documentos requeridos automáticamente.' },
    { icon: 'sparkles', title: 'Automatiza oportunidades', description: 'Creamos la oportunidad y registramos los eventos clave.' }
  ] as const;

  readonly form = this.fb.group({
    name: this.fb.control('', { validators: [Validators.required, Validators.minLength(3)] }),
    market: this.fb.control<'edomex' | 'aguascalientes'>('edomex'),
    saleType: this.fb.control<'contado' | 'financiero'>('financiero'),
    clientType: this.fb.control<'individual' | 'colectivo'>('individual'),
    ecosystemId: this.fb.control('')
  });

  readonly creationState = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  readonly errorMessage = signal<string | null>(null);
  readonly lastCreatedClient = signal<Client | null>(null);
  readonly isLoading = computed(() => this.creationState() === 'loading');

  constructor() {
    this.flowContext.setBreadcrumbs(['Dashboard', 'Onboarding']);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Completa los campos obligatorios para generar la oportunidad.');
      return;
    }

    const { name, market, saleType, clientType, ecosystemId } = this.form.value;
    if (!name || !market || !saleType || !clientType) {
      this.errorMessage.set('Los campos seleccionados no son válidos.');
      return;
    }

    this.creationState.set('loading');
    this.errorMessage.set(null);

    const target$ = clientType === 'colectivo'
      ? this.onboardingEngine.createSavingsOpportunity({
          name,
          market,
          ecosystemId: ecosystemId || undefined,
          clientType
        })
      : this.onboardingEngine.createClientFromOnboarding({
          name,
          market,
          saleType,
          ecosystemId: ecosystemId || undefined
        });

    target$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: client => {
          this.lastCreatedClient.set(client);
          this.creationState.set('success');
        },
        error: () => {
          this.creationState.set('error');
          this.errorMessage.set('Ocurrió un error al crear la oportunidad. Inténtalo de nuevo.');
        }
      });
  }

  resetForm(): void {
    this.form.reset({
      name: '',
      market: 'edomex',
      saleType: 'financiero',
      clientType: 'individual',
      ecosystemId: ''
    });
    this.creationState.set('idle');
    this.errorMessage.set(null);
  }
}
