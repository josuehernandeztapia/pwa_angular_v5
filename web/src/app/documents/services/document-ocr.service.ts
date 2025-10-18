import { Injectable, signal } from '@angular/core';
import { Document } from '@interfaces/types';
import { OCRProgress, OCRResult } from '@feature-services/documents/ocr.service';
import { OcrState } from '../types/document-upload.models';

@Injectable({ providedIn: 'root' })
export class DocumentOcrService {
  private readonly state = signal<OcrState>({
    status: null,
    showStatus: false,
    progress: { status: 'idle', progress: 0, message: '' },
    result: null,
    showPreview: false
  });

  readonly ocrState = this.state.asReadonly();

  reset(): void {
    this.state.set({
      status: null,
      showStatus: false,
      progress: { status: 'idle', progress: 0, message: '' },
      result: null,
      showPreview: false
    });
  }

  hydrate(snapshot: Partial<OcrState>): void {
    this.state.update(current => ({
      ...current,
      ...snapshot,
      progress: snapshot.progress ?? current.progress
    }));
  }

  setProcessing(progress: OCRProgress): void {
    const normalized = this.mapProgress(progress);
    this.state.update(state => ({
      ...state,
      status: normalized.status === 'error' ? 'error' : 'processing',
      showStatus: true,
      progress: normalized
    }));
  }

  setResult(result: OCRResult | null): void {
    this.state.update(state => ({
      ...state,
      status: result ? 'validated' : state.status,
      result,
      showPreview: !!result
    }));
  }

  setStatus(status: OcrState['status']): void {
    this.state.update(state => ({
      ...state,
      status,
      showStatus: status !== null
    }));
  }

  togglePreview(show: boolean): void {
    this.state.update(state => ({ ...state, showPreview: show }));
  }

  updateProgress(progress: OCRProgress): void {
    this.state.update(state => ({ ...state, progress: this.mapProgress(progress) }));
  }

  private mapProgress(progress: OCRProgress): OcrState['progress'] {
    const status = progress.status === 'error'
      ? 'error'
      : progress.status === 'idle' || progress.status === 'ready'
        ? 'idle'
        : 'processing';
    return {
      status,
      progress: typeof progress.progress === 'number' ? progress.progress : 0,
      message: progress.message ?? ''
    };
  }
}
