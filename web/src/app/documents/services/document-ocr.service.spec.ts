import { DocumentOcrService } from './document-ocr.service';
import { OCRProgress, OCRResult } from '@feature-services/documents/ocr.service';

describe('DocumentOcrService', () => {
  let service: DocumentOcrService;

  beforeEach(() => {
    service = new DocumentOcrService();
  });

  it('sets processing state', () => {
    const progress: OCRProgress = { status: 'processing', progress: 42, message: 'Scanning' } as any;
    service.setProcessing(progress);

    const state = service.ocrState();
    expect(state.status).toBe('processing');
    expect(state.showStatus).toBeTrue();
    expect(state.progress.status).toBe('processing');
    expect(state.progress.progress).toBe(42);
  });

  it('sets result and marks preview visible', () => {
    const result: OCRResult = { text: 'hola', confidence: 0.9, extractedData: { folio: '123' } } as any;
    service.setResult(result);

    const state = service.ocrState();
    expect(state.status).toBe('validated');
    expect(state.result).toEqual(result);
    expect(state.showPreview).toBeTrue();
  });

  it('hydrates partial snapshot', () => {
    service.hydrate({ status: 'error', showStatus: true });
    expect(service.ocrState().status).toBe('error');
    expect(service.ocrState().showStatus).toBeTrue();
  });

  it('updates generic status and toggles visibility', () => {
    service.setStatus('error');
    expect(service.ocrState().status).toBe('error');
    expect(service.ocrState().showStatus).toBeTrue();

    service.setStatus(null);
    expect(service.ocrState().status).toBeNull();
    expect(service.ocrState().showStatus).toBeFalse();
  });

  it('resets to initial state', () => {
    service.setResult({} as OCRResult);
    service.reset();

    const state = service.ocrState();
    expect(state.status).toBeNull();
    expect(state.showStatus).toBeFalse();
    expect(state.showPreview).toBeFalse();
    expect(state.result).toBeNull();
  });
});
