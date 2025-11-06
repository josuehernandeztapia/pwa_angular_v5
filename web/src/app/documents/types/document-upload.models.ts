import { MarketPolicyContext, MarketPolicyMetadata, TandaPolicyMetadata } from '@feature-services/configuration/market-policy.service';
import { TandaFlowContextState } from '@feature-services/tanda/tanda-validation.service';
import { ContractContextSnapshot } from '@interfaces/contract-context';
import { BusinessFlow, Document, DocumentStatus } from '@interfaces/types';
import { AviDocumentMatchSnapshot, AviDocumentMatchOverride } from '@feature-services/onboarding/onboarding-requirements.models';

export interface FlowContext {
  clientId?: string;
  clientName?: string;
  source: 'nueva-oportunidad' | 'simulador' | 'cotizador';
  market: 'aguascalientes' | 'edomex';
  businessFlow: BusinessFlow;
  clientType: 'individual' | 'colectivo';
  saleType?: 'contado' | 'financiero';
  quotationData?: any;
  simulatorData?: any;
  collectiveMembers?: number;
  requiresIncomeProof?: boolean;
  monthlyPayment?: number;
  incomeThreshold?: number;
  incomeThresholdRatio?: number;
  tandaRules?: TandaPolicyMetadata;
  policyContext?: MarketPolicyContext | null;
  protection?: {
    required: boolean;
    coverageOptions: string[];
    defaultCoverage: string | null;
  } | null;
  contract?: {
    id?: string | null;
    status?: 'pending' | 'ready' | 'blocked';
    lastUpdated?: number;
  } | null;
}

export interface DocumentCompletionStatus {
  totalDocs: number;
  completedDocs: number;
  pendingDocs: number;
  completionPercentage: number;
  allComplete: boolean;
}

export interface MemberDocumentSection {
  index: number;
  label: string;
  documents: Document[];
}

export interface VoiceState {
  pattern: string;
  isRecording: boolean;
  showPattern: boolean;
  showAvi: boolean;
  verified: boolean;
  analysis: any | null;
}

export interface OcrState {
  status: 'processing' | 'validated' | 'error' | null;
  showStatus: boolean;
  progress: { status: 'idle' | 'processing' | 'error'; progress: number; message: string };
  result: any;
  showPreview: boolean;
}

export interface TandaState {
  validation: TandaFlowContextState | null;
  bannerDismissed: boolean;
  contribution?: number;
  rules?: TandaPolicyMetadata;
}

export interface DocumentFlowContextState {
  flowContext: FlowContext;
  completionStatus: DocumentCompletionStatus;
  documents?: Document[];
  primaryDocuments?: Document[];
  memberDocumentSections?: MemberDocumentSection[];
  policyContext?: MarketPolicyContext;
  policyMetadata?: MarketPolicyMetadata;
  voiceVerified?: boolean; // legacy persistence
  showAVI?: boolean;        // legacy persistence
  aviAnalysis?: any;        // legacy persistence
  voiceState?: VoiceState;
  ocrState?: OcrState;
  tandaState?: TandaState;
  tandaValidation?: TandaFlowContextState | null;
  contractContext?: ContractContextSnapshot;
  aviDocumentMatch?: AviDocumentMatchSnapshot | null;
  aviDocumentMatchOverride?: AviDocumentMatchOverride | null;
}

export interface DocumentPersistedDoc extends Document {
  status: DocumentStatus;
}
