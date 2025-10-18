/**
 * QA helper for quick voice evaluation smoke tests.
 * Usage: import into Playwright/console, or run in browser devtools after
 * exposing `voiceValidationService` from the app container.
 */

function createMockAudioBlob(duration: number = 10): Blob {
  const sampleRate = 16000;
  const arrayBuffer = new ArrayBuffer(sampleRate * duration * 2); // 16-bit PCM
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

const SCENARIOS = {
  goodResponse: {
    audioBlob: createMockAudioBlob(8),
    questionId: 'unit_substitution',
    contextId: 'test_ctx_001',
    municipality: 'cuautitlan_izcalli'
  },
  shortResponse: {
    audioBlob: createMockAudioBlob(1),
    questionId: 'seasonal_vulnerability',
    contextId: 'test_ctx_002',
    municipality: 'ecatepec_morelos'
  },
  longResponse: {
    audioBlob: createMockAudioBlob(35),
    questionId: 'route_security_issues',
    contextId: 'test_ctx_003',
    municipality: 'nezahualcoyotl'
  }
} as const;

export async function runVoiceSmokeTest(voiceValidationService: any) {
  console.info('[VoiceTest] Starting voice evaluation smoke test');
  voiceValidationService.clearVoiceEvaluations();

  for (const [scenarioName, scenario] of Object.entries(SCENARIOS)) {
    try {
      console.groupCollapsed(`[VoiceTest] Scenario: ${scenarioName}`);
      const result = await voiceValidationService.evaluateAudio(
        scenario.audioBlob,
        scenario.questionId,
        scenario.contextId,
        scenario.municipality
      );
      console.log('[VoiceTest] Voice evaluation result', {
        decision: result.decision,
        score: result.voiceScore,
        flags: result.flags,
        fallback: result.fallback
      });
      console.groupEnd();
    } catch (error) {
      console.error(`[VoiceTest] Scenario ${scenarioName} failed`, error);
    }
  }

  const summary = voiceValidationService.aggregateResilience();
  console.info('[VoiceTest] Aggregated voice resilience summary', summary);
  if (summary?.categoryBreakdown) {
    console.table(summary.categoryBreakdown);
  }

  return {
    evaluations: voiceValidationService.getVoiceEvaluations(),
    summary
  };
}

if (typeof window !== 'undefined') {
  (window as any).runVoiceSmokeTest = runVoiceSmokeTest;
  (window as any).createMockAudioBlob = createMockAudioBlob;
  console.info('%c[VoiceTest] helpers attached to window', 'color:#0aa960');
}
