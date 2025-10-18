/**
 * Lightweight lexical processing helpers for AVI services.
 * These utilities provide deterministic heuristics so that
 * higher level services can run without the original React helpers.
 */

const EVASIVE_PATTERNS = [
  'no se',
  'no sé',
  'no recuerdo',
  'tal vez',
  'quizá',
  'quiza',
  'depende',
  'supongo'
];

const ADMISSION_PATTERNS = [
  'si',
  'sí',
  'claro',
  'por supuesto',
  'correcto',
  'así es',
  'efectivamente'
];

const STRESS_PATTERNS = [
  'nervioso',
  'nerviosa',
  'preocupado',
  'preocupada',
  'ansioso',
  'ansiosa',
  'estresado',
  'estresada'
];

export interface LexicalTokenDetails {
  evasiveTokens: string[];
  admissionTokens: string[];
  stressTokens: string[];
}

export interface AdvancedLexicalScore {
  baselineScore: number;
  adjustedLexicalScore: number;
  logLikelihoodRatio: number;
  tokenDetails: LexicalTokenDetails;
}

export interface NervousAdmissionPattern {
  patternDetected: boolean;
  nervousnessScore: number;
  admissionScore: number;
  responseDelayScore: number;
  confidence: number;
}

/**
 * Clamp helper used by multiple utilities.
 */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function countMatches(text: string, patterns: string[]): string[] {
  const hits: string[] = [];
  patterns.forEach(pattern => {
    if (text.includes(pattern)) {
      hits.push(pattern);
    }
  });
  return hits;
}

export function adjustLogLRForAdmission(
  logLikelihoodRatio: number,
  transcription: string,
  questionContext: string = 'normal_question'
): number {
  const text = transcription.toLowerCase();
  const admissions = countMatches(text, ADMISSION_PATTERNS);
  let adjusted = logLikelihoodRatio;

  if (admissions.length > 0) {
    adjusted += 0.35 + admissions.length * 0.05;
    if (questionContext === 'high_evasion_question') {
      adjusted += 0.15;
    }
  }

  if (countMatches(text, EVASIVE_PATTERNS).length > 0) {
    adjusted -= 0.25;
  }

  return adjusted;
}

export function computeAdvancedLexicalScore(
  transcription: string,
  evasiveBoost: number = 1,
  questionContext: string = 'normal_question'
): AdvancedLexicalScore {
  const text = transcription.toLowerCase();

  const evasiveTokens = countMatches(text, EVASIVE_PATTERNS);
  const admissionTokens = countMatches(text, ADMISSION_PATTERNS);
  const stressTokens = countMatches(text, STRESS_PATTERNS);

  let baseline = 0.75;
  baseline -= evasiveTokens.length * 0.08 * evasiveBoost;
  baseline += admissionTokens.length * 0.05;
  baseline -= stressTokens.length * 0.04;

  if (questionContext === 'high_evasion_question' && evasiveTokens.length > 0) {
    baseline -= 0.05;
  }

  baseline = clamp01(baseline);

  // Treat baseline as log-likelihood proxy to preserve legacy behaviour
  const baseLogLR = Math.log1p(baseline) - Math.log1p(1 - baseline);
  const adjustedLogLR = adjustLogLRForAdmission(baseLogLR, transcription, questionContext);
  const adjustedScore = clamp01(1 / (1 + Math.exp(-adjustedLogLR)));

  return {
    baselineScore: baseline,
    adjustedLexicalScore: adjustedScore,
    logLikelihoodRatio: adjustedLogLR,
    tokenDetails: {
      evasiveTokens,
      admissionTokens,
      stressTokens
    }
  };
}

export function detectNervousWithAdmissionPattern(
  transcription: string,
  voiceAnalysis?: {
    stress_level?: number;
    pause_frequency?: number;
    confidence_level?: number;
  },
  responseTimeMs?: number,
  expectedTimeMs?: number
): NervousAdmissionPattern {
  const text = transcription.toLowerCase();
  const admissionHits = countMatches(text, ADMISSION_PATTERNS).length;
  const nervousHits = countMatches(text, STRESS_PATTERNS).length;

  const voiceStress = clamp01(voiceAnalysis?.stress_level ?? 0.5);
  const pauseScore = clamp01((voiceAnalysis?.pause_frequency ?? 0.5));
  const admissionScore = clamp01(0.3 + admissionHits * 0.2);
  const nervousnessScore = clamp01((voiceStress * 0.6) + (pauseScore * 0.4) + nervousHits * 0.15);

  let responseDelayScore = 0;
  if (responseTimeMs != null && expectedTimeMs != null && expectedTimeMs > 0) {
    const ratio = responseTimeMs / expectedTimeMs;
    responseDelayScore = clamp01(ratio - 1);
  }

  const patternStrength = (nervousnessScore * 0.6) + (admissionScore * 0.3) + (responseDelayScore * 0.1);
  const patternDetected = patternStrength >= 0.55;

  return {
    patternDetected,
    nervousnessScore,
    admissionScore,
    responseDelayScore,
    confidence: patternDetected ? clamp01(0.5 + patternStrength / 2) : patternStrength
  };
}

export function applyNervousAdmissionCap(
  baseScore: number,
  pattern: NervousAdmissionPattern
): number {
  if (!pattern?.patternDetected) {
    return baseScore;
  }

  // Apply a conservative cap when the pattern is present.
  const cap = clamp01(0.65 + (1 - pattern.nervousnessScore) * 0.2);
  return Math.min(baseScore, cap);
}
