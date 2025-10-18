import { Injectable, computed, signal } from '@angular/core';
import { VoiceValidationService } from '@feature-services/avi/voice-validation.service';
import { BusinessFlow } from '@interfaces/types';
import { FlowContext, VoiceState } from '../types/document-upload.models';

interface VoiceInitOptions {
  flowContext: FlowContext;
  voiceValidation: VoiceValidationService;
}

@Injectable({ providedIn: 'root' })
export class DocumentVoiceService {
  private readonly voiceState = signal<VoiceState>({
    pattern: '',
    isRecording: false,
    showPattern: false,
    showAvi: false,
    verified: false,
    analysis: null
  });

  readonly state = this.voiceState.asReadonly();
  readonly isVoiceEnabled = computed(() => this.voiceState().showPattern);
  readonly isAviEnabled = computed(() => this.voiceState().showAvi);

  initialize(options: VoiceInitOptions): void {
    const shouldUseVoice = this.shouldUseVoicePattern(options.flowContext);
    const shouldUseAvi = this.shouldUseAvi(options.flowContext);

    this.voiceState.update(state => ({
      ...state,
      pattern: shouldUseVoice ? options.voiceValidation.generateVoicePattern() : '',
      showPattern: shouldUseVoice,
      showAvi: shouldUseAvi,
      analysis: shouldUseAvi ? { status: 'pending', confidence: 0, fraudRisk: 'UNKNOWN' } : null
    }));
  }

  setPattern(pattern: string): void {
    this.voiceState.update(state => ({ ...state, pattern }));
  }

  setShowPattern(show: boolean): void {
    this.voiceState.update(state => ({ ...state, showPattern: show }));
  }

  setShowAvi(show: boolean): void {
    this.voiceState.update(state => ({
      ...state,
      showAvi: show,
      analysis: show ? (state.analysis ?? { status: 'pending', confidence: 0, fraudRisk: 'UNKNOWN' }) : null
    }));
  }

  reset(): void {
    this.voiceState.set({
      pattern: '',
      isRecording: false,
      showPattern: false,
      showAvi: false,
      verified: false,
      analysis: null
    });
  }

  hydrate(state: Partial<VoiceState>): void {
    this.voiceState.update(current => ({
      ...current,
      ...state
    }));
  }

  markRecording(isRecording: boolean): void {
    this.voiceState.update(state => ({ ...state, isRecording }));
  }

  markVerified(analysis: any, decision: string | undefined): void {
    const verified = decision !== 'NO_GO';
    this.voiceState.update(state => ({
      ...state,
      verified,
      analysis
    }));
  }

  updateAnalysis(partial: Partial<VoiceState['analysis']>): void {
    if (partial == null) {
      this.voiceState.update(state => ({ ...state, analysis: null }));
      return;
    }

    this.voiceState.update(state => ({
      ...state,
      analysis: { ...(state.analysis ?? {}), ...partial }
    }));
  }

  private shouldUseVoicePattern(context: FlowContext): boolean {
    return context.businessFlow !== BusinessFlow.VentaDirecta &&
      (context.businessFlow === BusinessFlow.VentaPlazo ||
       context.businessFlow === BusinessFlow.CreditoColectivo ||
       context.market === 'edomex');
  }

  private shouldUseAvi(context: FlowContext): boolean {
    return context.businessFlow !== BusinessFlow.VentaDirecta &&
      (context.clientType === 'colectivo' ||
       context.businessFlow === BusinessFlow.CreditoColectivo ||
       context.businessFlow === BusinessFlow.VentaPlazo);
  }
}
