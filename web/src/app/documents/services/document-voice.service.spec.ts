import { BusinessFlow } from '@interfaces/types';
import { DocumentVoiceService } from './document-voice.service';
import { FlowContext } from '../types/document-upload.models';

describe('DocumentVoiceService', () => {
  let service: DocumentVoiceService;
  const voiceValidation = {
    generateVoicePattern: jasmine.createSpy('generateVoicePattern').and.returnValue('ABC-123')
  } as any;

  const baseContext: FlowContext = {
    source: 'nueva-oportunidad',
    market: 'edomex',
    businessFlow: BusinessFlow.VentaPlazo,
    clientType: 'individual',
    contract: null,
    protection: null
  };

  beforeEach(() => {
    service = new DocumentVoiceService();
    voiceValidation.generateVoicePattern.calls.reset();
  });

  it('initializes pattern and AVI when flow requires verification', () => {
    service.initialize({ flowContext: baseContext, voiceValidation });

    const state = service.state();
    expect(voiceValidation.generateVoicePattern).toHaveBeenCalled();
    expect(state.pattern).toBe('ABC-123');
    expect(state.showPattern).toBeTrue();
    expect(state.showAvi).toBeTrue();
    expect(state.analysis).toEqual({ status: 'pending', confidence: 0, fraudRisk: 'UNKNOWN' });
  });

  it('skips pattern when flow is VentaDirecta', () => {
    service.initialize({
      flowContext: { ...baseContext, businessFlow: BusinessFlow.VentaDirecta },
      voiceValidation
    });

    const state = service.state();
    expect(state.pattern).toBe('');
    expect(state.showPattern).toBeFalse();
    expect(state.showAvi).toBeFalse();
  });

  it('updates recording and verification flags', () => {
    service.markRecording(true);
    expect(service.state().isRecording).toBeTrue();

    service.markVerified({ status: 'completed' }, 'GO');
    const state = service.state();
    expect(state.verified).toBeTrue();
    expect(state.analysis).toEqual({ status: 'completed' });
  });

  it('hydrates existing state', () => {
    service.hydrate({ pattern: 'XYZ', showPattern: true, verified: true });
    const state = service.state();
    expect(state.pattern).toBe('XYZ');
    expect(state.showPattern).toBeTrue();
    expect(state.verified).toBeTrue();
  });
});
