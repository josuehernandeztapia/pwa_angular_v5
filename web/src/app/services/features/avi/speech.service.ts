import { Injectable } from '@angular/core';
import { ToastService } from '@core-services/toast.service';
import { safeWindow } from '@services/utils/ssr/safe-window.util';

@Injectable({ providedIn: 'root' })
export class SpeechService {
  constructor(private toast: ToastService) {}

  speak(text: string, options?: { auto?: boolean; rate?: number; lang?: string }): void {
    const win = safeWindow();
    if (!win) {
      return;
    }

    // Respect user/system preferences for automatic speech (only when auto-initiated)
    if (options?.auto && typeof win.matchMedia === 'function') {
      const prefersReducedMotion = win.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReducedMotion) return;
    }

    const speechSynthesis = (win as unknown as { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
    const UtteranceCtor = (win as unknown as { SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance }).SpeechSynthesisUtterance
      ?? (typeof SpeechSynthesisUtterance !== 'undefined' ? SpeechSynthesisUtterance : undefined);

    if (!speechSynthesis || !UtteranceCtor) {
      this.toast.info('Tu navegador no soporta síntesis de voz');
      return;
    }

    this.cancel();

    const utterance = new UtteranceCtor(text);
    utterance.lang = options?.lang || 'es-MX';
    utterance.rate = options?.rate ?? 0.9;
    speechSynthesis.speak(utterance);
  }

  cancel(): void {
    const win = safeWindow();
    const speechSynthesis = win?.speechSynthesis;
    speechSynthesis?.cancel();
  }
}
