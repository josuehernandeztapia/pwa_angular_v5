/**
 * Manual Entry Component
 * P0.2 Surgical Fix - Manual fallback for OCR failures
 * Allows manual data entry when OCR confidence < 0.7
 */

import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Renderer2,
  RendererFactory2,
  ViewChild,
  effect,
  inject,
  input,
  output
} from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { IconComponent } from '@shared/icon/icon.component';
import { FocusTrapService } from '@core-services/focus-trap.service';
import { PLATFORM_ID } from '@angular/core';

export interface ManualEntryData {
  vin?: string;
  odometer?: string;
  documentType: 'vin' | 'odometer' | 'other';
  userEnteredValue: string;
  confidence: number; // Always 1.0 for manual entry
}

@Component({
  selector: 'app-manual-entry',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IconComponent],
  templateUrl: './manual-entry.component.html',
  styleUrls: ['./manual-entry.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ManualEntryComponent implements AfterViewInit {
  private readonly fb = inject(FormBuilder);
  private readonly focusTrap = inject(FocusTrapService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly documentRef = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly renderer: Renderer2 = inject(RendererFactory2).createRenderer(null, null);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  readonly documentType = input<ManualEntryData['documentType']>('other');
  readonly fieldName = input('');

  readonly save = output<ManualEntryData>();
  readonly cancel = output<void>();
  readonly retry = output<void>();

  readonly fieldId = `manual-${Math.random().toString(36).slice(2)}`;
  readonly manualForm: FormGroup = this.fb.group({
    value: ['', Validators.required]
  });

  @ViewChild('dialog', { static: true }) private dialogRef?: ElementRef<HTMLDivElement>;
  @ViewChild('closeButton', { static: true }) private closeButtonRef?: ElementRef<HTMLButtonElement>;

  private releaseFocus?: () => void;
  private removeEscapeListener?: () => void;

  constructor() {
    effect(() => {
      const control = this.manualForm.get('value');
      if (!control) {
        return;
      }

      const validators: ValidatorFn[] = [Validators.required, this.getValidatorForType(this.documentType())];
      control.setValidators(validators);
      control.updateValueAndValidity({ emitEvent: false });
    }, { allowSignalWrites: true });

    this.destroyRef.onDestroy(() => this.teardownFocusManagement());
  }

  ngAfterViewInit(): void {
    if (!this.isBrowser) {
      return;
    }

    queueMicrotask(() => this.setupFocusManagement());
  }

  getFieldLabel(): string {
    switch (this.documentType()) {
      case 'vin':
        return 'VIN (Número de Serie)';
      case 'odometer':
        return 'Kilometraje';
      default:
        return this.fieldName() || 'Valor';
    }
  }

  getPlaceholder(): string {
    switch (this.documentType()) {
      case 'vin':
        return 'Ej: 3VW2K7AJ9EM388202';
      case 'odometer':
        return 'Ej: 45000';
      default:
        return 'Ingresa el valor manualmente';
    }
  }

  getHint(): string {
    switch (this.documentType()) {
      case 'vin':
        return '17 caracteres alfanuméricos sin espacios';
      case 'odometer':
        return 'Solo números, sin comas ni puntos';
      default:
        return 'Verifica que el valor sea correcto';
    }
  }

  getMaxLength(): number {
    switch (this.documentType()) {
      case 'vin':
        return 17;
      case 'odometer':
        return 10;
      default:
        return 50;
    }
  }

  getPattern(): string {
    switch (this.documentType()) {
      case 'vin':
        return '[A-HJ-NPR-Z0-9]{17}';
      case 'odometer':
        return '[0-9]+';
      default:
        return '.*';
    }
  }

  getValidationError(): string {
    const errors = this.manualForm.get('value')?.errors;
    if (!errors) return '';

    if (errors['required']) return 'Este campo es requerido';

    if (this.documentType() === 'vin') {
      if (errors['vinLength']) return 'El VIN debe tener exactamente 17 caracteres';
      if (errors['vinFormat']) return 'VIN inválido. Usa solo letras A-H, J-N, P-R, T-Z y números 0-9';
    }

    if (this.documentType() === 'odometer') {
      if (errors['notNumber']) return 'Solo se permiten números';
      if (errors['negative']) return 'El kilometraje no puede ser negativo';
      if (errors['tooHigh']) return 'Kilometraje muy alto (máximo 999,999)';
    }

    return 'Valor inválido';
  }

  onSave(): void {
    if (this.manualForm.valid) {
      const value = this.manualForm.value.value;
      const type = this.documentType();
      const normalizedValue = type === 'vin' ? value.toUpperCase() : value;
      const data: ManualEntryData = {
        documentType: type,
        userEnteredValue: normalizedValue,
        confidence: 1.0,
        [type]: normalizedValue
      };
      this.teardownFocusManagement();
      this.save.emit(data);
    }
  }

  onCancel(): void {
    this.teardownFocusManagement();
    this.cancel.emit();
  }

  onRetry(): void {
    this.retry.emit();
  }

  private getValidatorForType(type: ManualEntryData['documentType']): ValidatorFn {
    switch (type) {
      case 'vin':
        return control => {
          const value = control.value?.toUpperCase();
          if (!value) {
            return null;
          }
          if (value.length !== 17) {
            return { vinLength: true };
          }
          if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(value)) {
            return { vinFormat: true };
          }
          return null;
        };
      case 'odometer':
        return control => {
          const value = control.value;
          if (!value) {
            return null;
          }
          const num = parseInt(value, 10);
          if (Number.isNaN(num)) {
            return { notNumber: true };
          }
          if (num < 0) {
            return { negative: true };
          }
          if (num > 999999) {
            return { tooHigh: true };
          }
          return null;
        };
      default:
        return Validators.minLength(1);
    }
  }

  private setupFocusManagement(): void {
    if (!this.isBrowser || this.releaseFocus) {
      return;
    }

    const dialogEl = this.dialogRef?.nativeElement;
    if (!dialogEl) {
      queueMicrotask(() => this.setupFocusManagement());
      return;
    }

    this.focusTrap.remember();
    this.releaseFocus = this.focusTrap.trap(dialogEl);

    const focusTarget = this.closeButtonRef?.nativeElement ?? dialogEl;
    queueMicrotask(() => {
      try {
        focusTarget.focus();
      } catch {
        /* ignore focus errors */
      }
    });

    this.removeEscapeListener = this.renderer.listen(this.documentRef, 'keydown', (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.onCancel();
      }
    });
  }

  private teardownFocusManagement(): void {
    this.removeEscapeListener?.();
    this.removeEscapeListener = undefined;

    try {
      this.releaseFocus?.();
    } catch {
      /* ignore focus trap cleanup */
    }
    this.releaseFocus = undefined;

    this.focusTrap.restore();
  }
}
