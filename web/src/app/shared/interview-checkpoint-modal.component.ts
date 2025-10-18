import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  Inject,
  Input,
  OnChanges,
  OnInit,
  Output,
  PLATFORM_ID,
  SimpleChanges,
  ViewChild,
  Renderer2,
  RendererFactory2
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { InterviewCheckpointService } from '@feature-services/avi/interview-checkpoint.service';
import { VoiceRecorderComponent } from '../voice-recorder/voice-recorder.component';
import { IconComponent } from '@shared/icon/icon.component';
import { IconName } from '@shared/icon/icon-definitions';
import { AVIInterviewComponent } from '@app/avi-interview/avi-interview.component';
import { environment } from '@environments/environment';
import { FocusTrapService } from '@core-services/focus-trap.service';

interface CheckpointModalData {
  clientId: string;
  clientName: string;
  documentType: string;
  checkpoint: any;
  clientData: any;
}

@Component({
  selector: 'app-interview-checkpoint-modal',
  standalone: true,
  imports: [CommonModule, VoiceRecorderComponent, IconComponent, AVIInterviewComponent],
  templateUrl: './interview-checkpoint-modal.component.html',
  styleUrls: ['./interview-checkpoint-modal.component.scss']
})
export class InterviewCheckpointModalComponent implements OnInit, OnChanges {
  @Input() isVisible = false;
  @Input() modalData!: CheckpointModalData;
  @Input() advisorId: string = '';

  @Output() interviewCompleted = new EventEmitter<any>();
  @Output() modalClosed = new EventEmitter<void>();
  @Output() continueUpload = new EventEmitter<void>();

  @ViewChild('voiceRecorder') voiceRecorder!: VoiceRecorderComponent;
  @ViewChild('modalPanel') modalPanel?: ElementRef<HTMLDivElement>;
  @ViewChild('closeButton') closeButton?: ElementRef<HTMLButtonElement>;

  isInterviewInProgress = false;
  errorMessage = '';
  showHelp = true;
  helpExpanded = false;
  modalTitleId: string = `modal_title_${Math.random().toString(36).slice(2)}`;
  modalDescId: string = `modal_desc_${Math.random().toString(36).slice(2)}`;
  private previouslyFocusedElement: HTMLElement | null = null;
  private releaseFocusTrap?: () => void;
  private removeEscapeListener?: () => void;
  private readonly renderer: Renderer2;
  private readonly isBrowser: boolean;
  private readonly windowRef: (Window & typeof globalThis) | null;

  readonly aviEnabled = environment.features.enableAVISystem ?? false;

  constructor(
    private readonly checkpointService: InterviewCheckpointService,
    private readonly destroyRef: DestroyRef,
    @Inject(DOCUMENT) private readonly documentRef: Document,
    @Inject(PLATFORM_ID) platformId: Object,
    rendererFactory: RendererFactory2,
    private readonly focusTrap: FocusTrapService
  ) {
    this.renderer = rendererFactory.createRenderer(null, null);
    this.isBrowser = isPlatformBrowser(platformId);
    this.windowRef = this.isBrowser ? (this.documentRef.defaultView as Window | null) : null;
    this.destroyRef.onDestroy(() => this.teardownFocusTrap());
  }

  ngOnInit(): void {
    this.subscribeToCheckpointUpdates();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible']) {
      if (this.isVisible) {
        this.previouslyFocusedElement = this.documentRef.activeElement as HTMLElement;
        this.setupFocusTrap();
      } else {
        this.restoreFocusAfterModal();
        this.teardownFocusTrap();
      }
    }
  }

  private subscribeToCheckpointUpdates(): void {
    this.checkpointService
      .getCheckpoints()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((checkpoints: Record<string, any>) => {
        const updated = checkpoints[this.modalData.clientId];
        if (updated) {
          this.modalData = {
            ...this.modalData,
            checkpoint: updated
          };
        }
      });
  }

  onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget && !this.isInterviewInProgress) {
      this.closeModal();
    }
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && !this.isInterviewInProgress) {
      event.preventDefault();
      this.closeModal();
    }

    if (event.key === 'Tab') {
      this.trapFocusInModal(event);
    }
  }

  closeModal(): void {
    this.modalClosed.emit();
    this.isInterviewInProgress = false;
    this.errorMessage = '';
    this.teardownFocusTrap();
  }

  onValidationComplete(result: any): void {
    if (result?.isValid) {
      this.errorMessage = '';
    } else {
      this.errorMessage = result?.message || 'La entrevista continúa en validación.';
    }
  }

  onInterviewApproved(result: any): void {
    this.isInterviewInProgress = false;
    this.errorMessage = '';
    if (this.modalData?.clientId) {
      this.checkpointService.completeInterview(this.modalData.clientId, result?.validationResult ?? {});
    }
    this.interviewCompleted.emit(result);
  }

  onAdvancedInterviewStarted(): void {
    if (this.modalData?.clientId) {
      this.checkpointService.startInterview(this.modalData.clientId);
    }
    this.isInterviewInProgress = true;
    this.errorMessage = '';
  }

  onAdvancedInterviewCompleted(payload: { validationResult: any }): void {
    this.isInterviewInProgress = false;
    this.errorMessage = '';
    if (this.modalData?.clientId) {
      const checkpoint = this.checkpointService.completeInterview(this.modalData.clientId, payload.validationResult);
      this.modalData = {
        ...this.modalData,
        checkpoint
      };
    }
    this.interviewCompleted.emit(payload);
    this.continueToUpload();
  }

  onAdvancedInterviewCancelled(): void {
    this.isInterviewInProgress = false;
    this.errorMessage = '';
  }

  onRecorderError(error: any): void {
    this.isInterviewInProgress = false;
    this.errorMessage = error?.message || 'Ocurrió un error durante la grabación.';
  }

  onRecordStart(): void {
    this.isInterviewInProgress = true;
    this.errorMessage = '';
    if (this.modalData?.clientId) {
      this.checkpointService.startInterview(this.modalData.clientId);
    }
  }

  retryInterview(): void {
    this.errorMessage = '';
    this.isInterviewInProgress = false;
    if (this.voiceRecorder) {
      this.voiceRecorder.resetRecording();
    }
  }

  continueToUpload(): void {
    this.continueUpload.emit();
    this.closeModal();
  }

  contactSupervisor(): void {
    const supervisorPhone = this.modalData.checkpoint?.requirement?.supervisor_phone;
    if (supervisorPhone) {
      this.windowRef?.open?.(`tel:${supervisorPhone}`);
    }
  }

  toggleHelp(): void {
    this.helpExpanded = !this.helpExpanded;
  }

  getStatusClass(): string {
    const status = this.modalData?.checkpoint?.status;
    if (!status) {
      return '';
    }

    const map: Record<string, string> = {
      required_pending: 'checkpoint-modal__status--pending',
      in_progress: 'checkpoint-modal__status--progress',
      completed_valid: 'checkpoint-modal__status--success',
      completed_invalid: 'checkpoint-modal__status--invalid',
      expired: 'checkpoint-modal__status--expired'
    };

    return map[status] || '';
  }

  getStatusIcon(): IconName {
    if (!this.modalData?.checkpoint) return 'information-circle';

    switch (this.modalData.checkpoint.status) {
      case 'required_pending':
        return 'clock';
      case 'in_progress':
        return 'microphone';
      case 'completed_valid':
        return 'check-circle';
      case 'completed_invalid':
        return 'alert-triangle';
      case 'expired':
        return 'stop';
      default:
        return 'information-circle';
    }
  }

  getStatusText(): string {
    if (!this.modalData?.checkpoint) return 'Estado desconocido';

    switch (this.modalData.checkpoint.status) {
      case 'required_pending':
        return 'Entrevista pendiente';
      case 'in_progress':
        return 'Entrevista en progreso';
      case 'completed_valid':
        return 'Entrevista completada exitosamente';
      case 'completed_invalid':
        return 'Entrevista no válida';
      case 'expired':
        return 'Entrevista expirada';
      default:
        return 'Estado desconocido';
    }
  }

  getStatusDetails(): string | null {
    if (!this.modalData?.checkpoint) return null;

    switch (this.modalData.checkpoint.status) {
      case 'required_pending':
        return 'Debe completar la entrevista antes de continuar con la documentación.';
      case 'in_progress':
        return 'La entrevista está siendo grabada. Complete todas las preguntas obligatorias.';
      case 'completed_valid':
        return this.modalData.checkpoint.expires_at
          ? `Válida hasta: ${new Date(this.modalData.checkpoint.expires_at).toLocaleString('es-MX')}`
          : 'Entrevista válida.';
      case 'completed_invalid':
        return `Intento ${this.modalData.checkpoint.attempts} de ${
          this.modalData.checkpoint.requirement?.max_attempts || 3
        }. La entrevista no cumplió con los requerimientos.`;
      case 'expired':
        return 'La entrevista anterior ha expirado. Debe realizar una nueva.';
      default:
        return null;
    }
  }

  canStartInterview(): boolean {
    if (!this.modalData?.checkpoint) return false;

    const status = this.modalData.checkpoint.status;
    return ['required_pending', 'completed_invalid', 'expired'].includes(status) && !this.isMaxAttemptsReached();
  }

  canRetryInterview(): boolean {
    if (!this.modalData?.checkpoint) return false;

    return this.modalData.checkpoint.status === 'completed_invalid' && !this.isMaxAttemptsReached();
  }

  canContinue(): boolean {
    return this.modalData?.checkpoint?.status === 'completed_valid' && this.isCheckpointValid();
  }

  isMaxAttemptsReached(): boolean {
    if (!this.modalData?.checkpoint) return false;

    const attempts = this.modalData.checkpoint.attempts;
    const maxAttempts = this.modalData.checkpoint.requirement?.max_attempts || 3;
    return attempts >= maxAttempts;
  }

  private isCheckpointValid(): boolean {
    const expiresAt = this.modalData?.checkpoint?.expires_at;
    if (!expiresAt) {
      return true;
    }

    return new Date() < new Date(expiresAt);
  }

  getProductTypeLabel(productType: string): string {
    const labels: Record<string, string> = {
      individual: 'Individual',
      colectivo: 'Colectivo',
      contado: 'Contado',
      credito_simple: 'Crédito Simple',
      high_risk: 'Alto Riesgo',
      standard: 'Estándar'
    };
    return labels[productType] || productType;
  }

  getMunicipalityLabel(municipality: string): string {
    const labels: Record<string, string> = {
      aguascalientes: 'Aguascalientes',
      estado_de_mexico: 'Estado de México',
      default: 'General'
    };
    return labels[municipality] || municipality;
  }

  formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes > 0) {
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')} min`;
    }
    return `${seconds} seg`;
  }

  formatCurrency(amount: number | undefined): string {
    if (!amount) {
      return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(0);
    }

    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  }

  getRemainingAttempts(): string {
    if (!this.modalData?.checkpoint) return '0';

    const attempts = this.modalData.checkpoint.attempts;
    const maxAttempts = this.modalData.checkpoint.requirement?.max_attempts || 3;
    const remaining = Math.max(0, maxAttempts - attempts);

    return `${remaining} de ${maxAttempts}`;
  }

  private focusFirstElementInModal(): void {
    const modal = this.modalPanel?.nativeElement;
    if (!modal) {
      return;
    }

    const focusable = modal.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = this.closeButton?.nativeElement ?? focusable[0] ?? modal;

    try {
      first.focus();
    } catch {
      /* ignore focus issues */
    }
  }

  private trapFocusInModal(event: KeyboardEvent): void {
    const modal = this.modalPanel?.nativeElement;
    if (!modal) {
      return;
    }

    const focusable = Array.from(
      modal.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter(el => !el.hasAttribute('disabled'));

    if (!focusable.length) {
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = this.documentRef.activeElement as HTMLElement;

    if (event.shiftKey) {
      if (active === first) {
        first.blur();
        last.focus();
        event.preventDefault();
      }
    } else {
      if (active === last) {
        last.blur();
        first.focus();
        event.preventDefault();
      }
    }
  }

  private restoreFocusAfterModal(): void {
    if (this.previouslyFocusedElement) {
      queueMicrotask(() => {
        try {
          this.previouslyFocusedElement?.focus();
        } catch {
          /* ignore focus restore issues */
        }
        this.previouslyFocusedElement = null;
      });
    }
  }

  private setupFocusTrap(): void {
    if (!this.isBrowser || this.releaseFocusTrap) {
      return;
    }

    const panel = this.modalPanel?.nativeElement;
    if (!panel) {
      queueMicrotask(() => this.setupFocusTrap());
      return;
    }

    this.focusTrap.remember();
    this.releaseFocusTrap = this.focusTrap.trap(panel);

    this.removeEscapeListener = this.renderer.listen(this.documentRef, 'keydown', (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !this.isInterviewInProgress) {
        event.preventDefault();
        this.closeModal();
      }
    });

    queueMicrotask(() => this.focusFirstElementInModal());
  }

  private teardownFocusTrap(): void {
    this.removeEscapeListener?.();
    this.removeEscapeListener = undefined;

    try {
      this.releaseFocusTrap?.();
    } catch {
      /* ignore focus trap cleanup issues */
    }
    this.releaseFocusTrap = undefined;
    this.focusTrap.restore();
  }
}
