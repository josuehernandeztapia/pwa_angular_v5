import { BusinessFlow, Document } from '@interfaces/types';
import { AviReadinessSnapshot } from '@feature-services/avi/avi-eligibility.service';
import { MarketPolicyMetadata } from '@feature-services/configuration/market-policy.service';
import { DocumentCompletionStatus, FlowContext } from '@app/documents/types/document-upload.models';

export type RequirementStageId = 'registration' | 'documents' | 'kyc' | 'avi' | 'completion';

export type RequirementKind = 'document' | 'kyc' | 'avi' | 'income' | 'tanda' | 'protection' | 'summary';

export type OnboardingTelemetryOrigin = 'documents' | 'onboarding' | 'cotizador';

export type DocumentMatchStatus = 'match' | 'mismatch' | 'insufficient';

export interface AviDocumentMatchFieldSnapshot {
  id: 'fullName' | 'curp' | 'address';
  documentValue: string | null;
  aviValue: string | null;
  similarity: number;
  status: DocumentMatchStatus;
  confidence: number;
}

export interface AviDocumentMatchSnapshot {
  status: DocumentMatchStatus;
  score: number;
  evaluatedAt: number;
  fields: AviDocumentMatchFieldSnapshot[];
}

export interface AviDocumentMatchOverride {
  decision: 'accepted' | 'forced';
  comment: string;
  forcedBy?: string | null;
  forcedAt: number;
}

export interface RequirementHelpLink {
  label: string;
  url: string;
}

export interface OnboardingRequirement {
  id: string;
  title: string;
  status: 'completed' | 'pending' | 'blocked';
  required: boolean;
  kind: RequirementKind;
  description?: string;
  helpText?: string;
  helpLink?: RequirementHelpLink;
  relatedDocumentId?: string;
  metadata?: Record<string, unknown>;
}

export interface OnboardingStage {
  id: RequirementStageId;
  title: string;
  subtitle?: string;
  status: 'completed' | 'current' | 'pending' | 'blocked';
  requirements: OnboardingRequirement[];
}

export interface OnboardingRequirementsSnapshot {
  context: RequirementContext;
  documents: OnboardingRequirement[];
  kycRequirement: OnboardingRequirement | null;
  aviRequirement: OnboardingRequirement | null;
  incomeRequirement: OnboardingRequirement | null;
  protectionRequirement: OnboardingRequirement | null;
  tandaRequirement: OnboardingRequirement | null;
  stages: OnboardingStage[];
  pendingRequirements: OnboardingRequirement[];
  pendingCount: number;
  completedCount: number;
  aviDocumentMatch?: AviDocumentMatchSnapshot | null;
  aviDocumentMatchOverride?: AviDocumentMatchOverride | null;
}

export interface RequirementContext {
  market: string;
  saleType: 'contado' | 'financiero';
  clientType: 'individual' | 'colectivo';
  businessFlow?: BusinessFlow;
  clientStatus?: string | null;
  requiresIncomeProof?: boolean;
  collectiveSize?: number | null;
}

export interface OnboardingAviSessionState {
  status: 'not_started' | 'pending' | 'in_progress' | 'completed' | 'cancelled';
  decision?: 'GO' | 'REVIEW' | 'NO_GO' | null;
  updatedAt?: number;
}

export interface OnboardingRequirementsUpdate {
  context: RequirementContext;
  documents: Document[];
  clientStatus?: string | null;
  policyMetadata?: MarketPolicyMetadata | null;
  completion?: DocumentCompletionStatus | null;
  aviSession?: OnboardingAviSessionState | null;
  aviReadiness?: AviReadinessSnapshot | null;
  flowContext?: Partial<FlowContext> | null;
  protectionApplied?: boolean;
  incomeVerified?: boolean;
  tandaValidated?: boolean;
  documentTemplates?: Document[];
  aviDocumentMatch?: AviDocumentMatchSnapshot | null;
  aviManualOverride?: AviDocumentMatchOverride | null;
}
