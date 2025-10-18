/**
 * Icono informativo mostrado con `<app-icon name="document-text">` para Manual OCR Entry Component
 * Fallback manual entry when OCR confidence is low
 */

import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  ViewChild,
  Renderer2,
  RendererFactory2,
  inject,
  input,
  output,
  signal,
  effect
} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { IconComponent } from '@shared/icon/icon.component';
import { timer } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FocusTrapService } from '@core-services/focus-trap.service';
import { PLATFORM_ID } from '@angular/core';

export interface ManualOCRData {
  documentType: string;
  fields: Record<string, any>;
  confidence: number;
  isManual: boolean;
}

@Component({
  selector: 'app-manual-ocr-entry',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IconComponent],
  templateUrl: './manual-ocr-entry.component.html',
  styleUrls: ['./manual-ocr-entry.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ManualOCREntryComponent {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly focusTrap = inject(FocusTrapService);
  private readonly documentRef = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly renderer: Renderer2 = inject(RendererFactory2).createRenderer(null, null);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  readonly documentType = input('');
  readonly isOpen = input(false);

  readonly save = output<ManualOCRData>();
  readonly cancel = output<void>();

  manualForm: FormGroup = this.fb.group({});
  readonly isSaving = signal(false);
  readonly titleId = `manual-entry-title-${Math.random().toString(36).slice(2)}`;
  readonly descriptionId = `manual-entry-description-${Math.random().toString(36).slice(2)}`;

  @ViewChild('dialog') private dialogRef?: ElementRef<HTMLDivElement>;
  @ViewChild('closeButton') private closeButtonRef?: ElementRef<HTMLButtonElement>;

  private releaseFocus?: () => void;
  private removeEscapeListener?: () => void;

  constructor() {
    effect(() => {
      this.setupForm(this.documentType());
    }, { allowSignalWrites: true });

    effect(() => {
      if (!this.isBrowser) {
        return;
      }

      if (this.isOpen()) {
        queueMicrotask(() => this.setupFocusManagement());
      } else {
        this.teardownFocusManagement();
      }
    });

    this.destroyRef.onDestroy(() => this.teardownFocusManagement());
  }

  private setupForm(documentType: string): void {
    switch (documentType) {
      case 'vin':
        this.manualForm = this.fb.group({
          vin: ['', [Validators.required, Validators.minLength(17), Validators.maxLength(17)]],
          year: ['', [Validators.min(1980), Validators.max(2025)]],
          make: ['']
        });
        break;

      case 'odometer':
        this.manualForm = this.fb.group({
          kilometers: ['', [Validators.required, Validators.min(0)]],
          unit: ['km']
        });
        break;

      case 'plate':
        this.manualForm = this.fb.group({
          plate: ['', Validators.required],
          state: ['EDOMEX']
        });
        break;

      default:
        this.manualForm = this.fb.group({
          value: ['', Validators.required]
        });
    }
  }

  getDocumentLabel(type: string): string {
    const labels: Record<string, string> = {
      'vin': 'el VIN del vehículo',
      'odometer': 'el odómetro',
      'plate': 'la placa del vehículo'
    };
    return labels[type] || type;
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.manualForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  formatPlate(event: any): void {
    let value = event.target.value.toUpperCase();
    // Basic formatting for Mexican plates
    value = value.replace(/[^A-Z0-9]/g, '');
    event.target.value = value;
    this.manualForm.patchValue({ plate: value });
  }

  close(): void {
    this.teardownFocusManagement();
    this.cancel.emit();
  }

  saveManualData(): void {
    if (!this.manualForm.valid) return;

    this.isSaving.set(true);

    timer(500)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const manualData: ManualOCRData = {
          documentType: this.documentType(),
          fields: this.manualForm.value,
          confidence: 1.0,
          isManual: true
        };

        this.teardownFocusManagement();
        this.save.emit(manualData);
        this.isSaving.set(false);
      });
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
        this.close();
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
    this.isSaving.set(false);
  }
}
