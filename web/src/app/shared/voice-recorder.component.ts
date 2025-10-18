import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, EventEmitter, Input, OnInit, Output, PLATFORM_ID, ReadonlySignal, Renderer2, RendererFactory2, inject, signal } from '@angular/core';
import { interval, Subscription } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { VoiceValidationService } from '@feature-services/avi/voice-validation.service';
import { IconComponent } from '@shared/icon/icon.component';

interface VoiceRecorderState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  hasRecording: boolean;
  isProcessing: boolean;
  error: string | null;
}

@Component({
  selector: 'app-voice-recorder',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './voice-recorder.component.html',
  styleUrls: ['./voice-recorder.component.scss']
})
export class VoiceRecorderComponent implements OnInit {
  @Input() advisorId: string = '';
  @Input() clientId: string = '';
  @Input() sessionType: 'prospection' | 'documentation' | 'legal_questionnaire' = 'prospection';
  @Input() municipality: string = '';
  @Input() productType: string = '';
  @Input() showGuide: boolean = true;
  @Input() showLiveFeedback: boolean = true;
  @Input() formData: any = null; // For cross-validation

  @Output() validationComplete = new EventEmitter<any>();
  @Output() interviewApproved = new EventEmitter<any>();
  @Output() errorOccurred = new EventEmitter<string>();

  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly documentRef = inject(DOCUMENT);
  private readonly renderer: Renderer2 = inject(RendererFactory2).createRenderer(null, null);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly windowRef: (Window & typeof globalThis) | null = this.isBrowser
    ? (this.documentRef.defaultView as any)
    : null;

  private readonly recorderState = signal<VoiceRecorderState>({
    isRecording: false,
    isPaused: false,
    duration: 0,
    hasRecording: false,
    isProcessing: false,
    error: null
  });

  readonly state: ReadonlySignal<VoiceRecorderState> = this.recorderState.asReadonly();

  interviewGuide: any = null;
  guideExpanded = true;
  askedQuestions: string[] = [];
  validationResult: any = null;

  private durationSub?: Subscription;
  private removeValidationListener?: () => void;

  constructor(private readonly voiceService: VoiceValidationService) {
    this.destroyRef.onDestroy(() => {
      this.stopDurationTimer();
      this.removeValidationListener?.();
      this.removeValidationListener = undefined;
    });
  }

  ngOnInit(): void {
    this.loadInterviewGuide();
    this.setupEventListeners();
    this.subscribeToVoiceService();
  }

  private loadInterviewGuide(): void {
    if (!this.showGuide || !this.municipality || !this.productType) {
      return;
    }

    this.interviewGuide = this.voiceService.generateInterviewGuide(
      this.municipality,
      this.productType
    );
  }

  private setupEventListeners(): void {
    if (!this.windowRef) {
      return;
    }

    this.removeValidationListener = this.renderer.listen(
      this.windowRef,
      'voiceValidationComplete',
      (event: Event) => {
        const detail = (event as CustomEvent).detail;
        this.handleValidationComplete(detail);
      }
    );
  }

  private subscribeToVoiceService(): void {
    this.voiceService.isRecording
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(isRecording => {
        this.updateState({ isRecording });

        if (isRecording) {
          this.startDurationTimer();
        } else {
          this.stopDurationTimer();
          this.updateState({ hasRecording: true });
        }
      });

    this.voiceService.recordingErrors
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(error => {
        this.updateState({
          error,
          isRecording: false,
          isProcessing: false
        });
        this.stopDurationTimer();
        this.errorOccurred.emit(error);
      });

    this.voiceService.currentSession
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(session => {
        this.updateState({ isProcessing: session ? session.status === 'processing' : false });
      });
  }

  async toggleRecording(): Promise<void> {
    if (this.state().isRecording) {
      this.stopRecording();
    } else {
      await this.startRecording();
    }
  }

  private async startRecording(): Promise<void> {
    try {
      this.updateState({
        error: null,
        hasRecording: false
      });

      await this.voiceService.startVoiceSession(
        this.advisorId,
        this.clientId,
        this.sessionType,
        this.municipality,
        this.productType
      );

      this.voiceService.startRecording();
      this.askedQuestions = [];
      this.validationResult = null;
    } catch (error) {
      const message = 'No se pudo iniciar la grabación. Verifique permisos del micrófono.';
      this.updateState({ error: message });
      this.errorOccurred.emit(message);
    }
  }

  private stopRecording(): void {
    this.voiceService.stopRecording();
    this.updateState({ isProcessing: true });
  }

  private startDurationTimer(): void {
    this.stopDurationTimer();
    this.updateState({ duration: 0 });

    this.durationSub = interval(1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.recorderState.update(state => ({
          ...state,
          duration: state.duration + 1000
        }));
      });
  }

  private stopDurationTimer(): void {
    this.durationSub?.unsubscribe();
    this.durationSub = undefined;
  }

  resetRecording(): void {
    this.updateState({
      isRecording: false,
      isPaused: false,
      duration: 0,
      hasRecording: false,
      isProcessing: false,
      error: null
    });
    this.askedQuestions = [];
    this.validationResult = null;
  }

  dismissError(): void {
    this.updateState({ error: null });
  }

  toggleGuide(): void {
    this.guideExpanded = !this.guideExpanded;
  }

  getCategoryLabel(category: string): string {
    const labels: Record<string, string> = {
      identity: 'ID',
      financial: 'FIN',
      operational: 'OPE',
      legal: 'LEG'
    };
    return labels[category] || category.toUpperCase();
  }

  getRecorderStateClasses(): Record<string, boolean> {
    const state = this.state();
    return {
      'voice-recorder--recording': state.isRecording,
      'voice-recorder--processing': state.isProcessing
    };
  }

  getStatusDotClasses(): Record<string, boolean> {
    return {
      'voice-recorder__status-dot--active': this.state().isRecording
    };
  }

  getRecordButtonClasses(): Record<string, boolean> {
    return {
      'voice-recorder__button--recording': this.state().isRecording
    };
  }

  getQuestionClasses(question: any): Record<string, boolean> {
    const asked = this.askedQuestions.includes(question.id);
    return {
      'voice-recorder__question--asked': asked,
      'voice-recorder__question--mandatory': question.mandatory && !asked
    };
  }

  getScoreClasses(score: number): Record<string, boolean> {
    return {
      'voice-recorder__score-circle--excellent': score >= 85,
      'voice-recorder__score-circle--warning': score < 85 && score >= 60,
      'voice-recorder__score-circle--critical': score < 60
    };
  }

  getQuestionsSummaryClasses(): Record<string, boolean> {
    const missing = this.validationResult?.questions_missing?.length ?? 0;
    return {
      'voice-recorder__summary-item--success': missing === 0,
      'voice-recorder__summary-item--alert': missing > 0
    };
  }

  getRiskSummaryClasses(): Record<string, boolean> {
    const hasRisk = (this.validationResult?.risk_flags?.length ?? 0) > 0;
    return {
      'voice-recorder__summary-item--alert': hasRisk,
      'voice-recorder__summary-item--success': !hasRisk
    };
  }

  getCompletedQuestionsCount(): number {
    return this.askedQuestions.length;
  }

  getTotalQuestionsCount(): number {
    return this.interviewGuide?.questions.length ?? 0;
  }

  getMandatoryCompletedCount(): number {
    if (!this.interviewGuide) {
      return 0;
    }

    return this.interviewGuide.questions
      .filter((q: any) => q.mandatory && this.askedQuestions.includes(q.id))
      .length;
  }

  getMandatoryQuestionsCount(): number {
    return this.interviewGuide?.questions.filter((q: any) => q.mandatory).length ?? 0;
  }

  getNextQuestion(): any {
    if (!this.interviewGuide) {
      return null;
    }

    return this.voiceService.getNextRequiredQuestion(
      this.sessionType,
      this.municipality,
      this.productType,
      this.askedQuestions
    );
  }

  getStatusText(): string {
    const state = this.state();
    if (state.isProcessing) return 'Procesando...';
    if (state.isRecording) return 'Grabando entrevista';
    if (state.hasRecording) return 'Grabación completada';
    return 'Listo para grabar';
  }

  formatDuration(ms: number): string {
    return this.voiceService.formatDuration(ms);
  }

  getComplianceColor(score: number): string {
    return this.voiceService.getComplianceColor(score);
  }

  private handleValidationComplete(result: any): void {
    this.validationResult = result;
    this.updateState({ isProcessing: false });
    this.validationComplete.emit(result);
  }

  viewDetailedResults(): void {
    // Placeholder for future navigation/event emission
  }

  approveInterview(): void {
    this.interviewApproved.emit({
      validationResult: this.validationResult,
      sessionType: this.sessionType,
      advisorId: this.advisorId,
      clientId: this.clientId
    });
  }

  retryInterview(): void {
    this.resetRecording();
  }

  private updateState(patch: Partial<VoiceRecorderState>): void {
    this.recorderState.update(state => ({ ...state, ...patch }));
  }
}
