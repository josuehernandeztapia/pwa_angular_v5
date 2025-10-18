import { BusinessFlow } from './types';

export type RiskCategory = 'BAJO' | 'MEDIO' | 'ALTO' | 'CRITICO';
export type RiskFactorSeverity = 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';

export interface RiskScoreBreakdown {
  creditScore: number;
  financialStability: number;
  behaviorHistory: number;
  paymentCapacity: number;
  geographicRisk: number;
  vehicleProfile: number;
  finalScore: number;
}

export interface RiskFactor {
  factorId: string;
  factorName: string;
  description: string;
  severity: RiskFactorSeverity;
  scoreImpact: number;
  mitigationRecommendations: string[];
}

export interface RiskEvaluation {
  evaluationId: string;
  processedAt: Date;
  processingTimeMs: number;
  algorithmVersion: string;
  decision: 'APPROVED' | 'REVIEW' | 'REJECTED' | string;
  riskCategory: RiskCategory;
  confidenceLevel: number;
  scoreBreakdown: RiskScoreBreakdown;
  businessFlow?: BusinessFlow;
  kiban: any;
  hase: any;
  riskFactors: RiskFactor[];
  financialRecommendations: any;
  mitigationPlan: any;
  decisionReasons: string[];
  nextSteps: string[];
}
