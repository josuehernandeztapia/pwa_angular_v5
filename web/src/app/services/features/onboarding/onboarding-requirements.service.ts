import { Injectable, Optional, signal } from '@angular/core';
import { take } from 'rxjs/operators';

import { Document, DocumentStatus, BusinessFlow } from '@interfaces/types';
import { DocumentRequirementsService } from '@feature-services/documents/document-requirements.service';
import { AviEligibilityService, AviReadinessSnapshot } from '@feature-services/avi/avi-eligibility.service';
import { MarketPolicyMetadata } from '@feature-services/configuration/market-policy.service';
import { DocumentCompletionStatus, FlowContext } from '@app/documents/types/document-upload.models';
import { FlowContextService } from '@core-services/flow-context.service';
import { AnalyticsService } from '@core-services/analytics.service';

import {
  OnboardingRequirement,
  OnboardingRequirementsSnapshot,
  OnboardingRequirementsUpdate,
  RequirementContext,
  OnboardingStage,
  OnboardingAviSessionState,
  RequirementHelpLink,
  OnboardingTelemetryOrigin
} from './onboarding-requirements.models';

const DEFAULT_HELP_LINKS: Record<string, RequirementHelpLink> = {
  'kyc-validation': {
    label: 'Guía para completar KYC',
    url: 'https://help.creditas.mx/onboarding/kyc'
  },
  'avi-interview': {
    label: '¿Cómo realizar la entrevista AVI?',
    url: 'https://help.creditas.mx/onboarding/avi'
  },
  'income-validation': {
    label: 'Documentos válidos para comprobar ingresos',
    url: 'https://help.creditas.mx/onboarding/ingresos'
  },
  'protection-coverage': {
    label: 'Configurar protección del crédito',
    url: 'https://help.creditas.mx/onboarding/proteccion'
  },
  'tanda-validation': {
    label: 'Checklist de validación de tanda',
    url: 'https://help.creditas.mx/onboarding/tanda'
  }
};

@Injectable({ providedIn: 'root' })
export class OnboardingRequirementsService {
  private readonly contextSignal = signal<RequirementContext | null>(null);
  private readonly documentsSignal = signal<Document[]>([]);
  private readonly templatesSignal = signal<Document[]>([]);
  private readonly policyMetadataSignal = signal<MarketPolicyMetadata | null>(null);
  private readonly completionSignal = signal<DocumentCompletionStatus | null>(null);
  private readonly aviSessionSignal = signal<OnboardingAviSessionState | null>(null);
  private readonly aviReadinessSignal = signal<AviReadinessSnapshot | null>(null);
  private readonly snapshotSignal = signal<OnboardingRequirementsSnapshot | null>(null);
  private readonly telemetryKeys = new Map<OnboardingTelemetryOrigin, string>();
  private readonly flowContextKey = 'onboarding-requirements';

  private lastTemplateRequest = 0;
  private lastTemplatesContextKey: string | null = null;

  readonly snapshot = this.snapshotSignal.asReadonly();

  constructor(
    private readonly documentRequirements: DocumentRequirementsService,
    private readonly aviEligibility: AviEligibilityService,
    @Optional() private readonly flowContext?: FlowContextService,
    @Optional() private readonly analytics?: AnalyticsService
  ) {}

  update(update: OnboardingRequirementsUpdate): void {
    const nextContext: RequirementContext = {
      market: update.context.market,
      saleType: update.context.saleType,
      clientType: update.context.clientType,
      businessFlow: update.context.businessFlow,
      clientStatus: update.clientStatus ?? update.context.clientStatus ?? this.contextSignal()?.clientStatus ?? null,
      requiresIncomeProof: update.context.requiresIncomeProof,
      collectiveSize: update.context.collectiveSize ?? null
    };

    const previousKey = this.contextSignal() ? this.buildContextKey(this.contextSignal() as RequirementContext) : null;
    this.contextSignal.set(nextContext);

    this.documentsSignal.set(this.cloneDocuments(update.documents));

    if (update.policyMetadata !== undefined) {
      this.policyMetadataSignal.set(update.policyMetadata ?? null);
    }

    if (update.completion !== undefined) {
      this.completionSignal.set(update.completion ?? null);
    }

    if (update.aviSession !== undefined) {
      this.aviSessionSignal.set(update.aviSession);
    }

    if (update.aviReadiness !== undefined) {
      this.aviReadinessSignal.set(update.aviReadiness);
    } else {
      const context = this.contextSignal();
      if (context) {
        this.aviReadinessSignal.set(
          this.aviEligibility.evaluate({
            documents: this.documentsSignal(),
            clientStatus: context.clientStatus,
            flowContext: (update.flowContext ?? null) as Partial<FlowContext> | null,
            showAviOverride: true
          })
        );
      }
    }

    const contextKey = this.buildContextKey(nextContext);

    if (update.documentTemplates) {
      this.templatesSignal.set(this.cloneDocuments(update.documentTemplates));
      this.lastTemplatesContextKey = contextKey;
      this.recomputeSnapshot();
    } else {
      if (!previousKey || previousKey !== contextKey || this.templatesSignal().length === 0) {
        this.requestTemplates();
      } else {
        this.recomputeSnapshot();
      }
    }
  }

  private requestTemplates(): void {
    const context = this.contextSignal();
    if (!context) {
      this.templatesSignal.set([]);
      this.recomputeSnapshot();
      return;
    }

    const normalizedMarket = this.normalizeMarket(context.market);
    if (!normalizedMarket) {
      this.templatesSignal.set([]);
      this.recomputeSnapshot();
      return;
    }

    const contextKey = this.buildContextKey(context);
    if (this.lastTemplatesContextKey === contextKey && this.templatesSignal().length > 0) {
      this.recomputeSnapshot();
      return;
    }

    const requestToken = ++this.lastTemplateRequest;

    this.documentRequirements
      .getDocumentRequirements({
        market: normalizedMarket,
        saleType: context.saleType,
        businessFlow: context.businessFlow,
        clientType: context.clientType,
        requiresIncomeProof: context.requiresIncomeProof,
        collectiveSize: context.collectiveSize ?? undefined
      })
      .pipe(take(1))
      .subscribe({
        next: docs => {
          if (requestToken !== this.lastTemplateRequest) {
            return;
          }
          this.templatesSignal.set(this.cloneDocuments(docs));
          this.lastTemplatesContextKey = contextKey;
          this.recomputeSnapshot();
        },
        error: () => {
          if (requestToken !== this.lastTemplateRequest) {
            return;
          }
          this.templatesSignal.set([]);
          this.lastTemplatesContextKey = contextKey;
          this.recomputeSnapshot();
        }
      });
  }

  private recomputeSnapshot(): void {
    const context = this.contextSignal();
    if (!context) {
      this.snapshotSignal.set(null);
      this.persistSnapshot(null);
      return;
    }

    const templates = this.templatesSignal();
    const documents = this.documentsSignal();
    const policyMetadata = this.policyMetadataSignal();
    const completion = this.completionSignal();
    const aviReadiness = this.aviReadinessSignal();
    const aviSession = this.aviSessionSignal();

    const documentRequirements = templates.length
      ? templates.map(template => this.buildDocumentRequirement(template, documents, policyMetadata))
      : documents.map(doc => this.buildDocumentRequirement(doc, documents, policyMetadata));

    const kycRequirement = this.buildKycRequirement(documents, documentRequirements, policyMetadata);
    const aviRequirement = this.buildAviRequirement(aviReadiness, aviSession);
    const incomeRequirement = this.buildIncomeRequirement(policyMetadata, documentRequirements, documents, completion);
    const protectionRequirement = this.buildProtectionRequirement(policyMetadata, completion);
    const tandaRequirement = this.buildTandaRequirement(policyMetadata, completion);

    const stages = this.buildStages({
      documents: documentRequirements,
      kyc: kycRequirement,
      avi: aviRequirement,
      completion,
      protection: protectionRequirement,
      income: incomeRequirement,
      tanda: tandaRequirement
    });

    const pending = [
      ...documentRequirements,
      kycRequirement,
      aviRequirement,
      incomeRequirement,
      protectionRequirement,
      tandaRequirement
    ]
      .filter((item): item is OnboardingRequirement => !!item)
      .filter(item => item.required && item.status !== 'completed');

    const completedCount = [
      ...documentRequirements,
      kycRequirement,
      aviRequirement,
      incomeRequirement,
      protectionRequirement,
      tandaRequirement
    ]
      .filter((item): item is OnboardingRequirement => !!item)
      .filter(item => item.status === 'completed').length;

    const snapshot: OnboardingRequirementsSnapshot = {
      context,
      documents: documentRequirements,
      kycRequirement,
      aviRequirement,
      incomeRequirement,
      protectionRequirement,
      tandaRequirement,
      stages,
      pendingRequirements: pending,
      pendingCount: pending.length,
      completedCount
    };

    this.snapshotSignal.set(snapshot);
    this.persistSnapshot(snapshot);
  }

  private buildDocumentRequirement(
    template: Document,
    documents: Document[],
    metadata: MarketPolicyMetadata | null
  ): OnboardingRequirement {
    const matched = this.findDocumentMatch(template, documents);
    const status = matched?.status === DocumentStatus.Aprobado ? 'completed' : 'pending';
    const helpLink = this.resolveHelpLink(template.id ?? template.name ?? '');

    return {
      id: template.id,
      title: template.name ?? template.id,
      status,
      required: !template.isOptional,
      kind: 'document',
      description: template.tooltip,
      helpText: template.tooltip,
      helpLink,
      relatedDocumentId: matched?.id ?? template.id
    };
  }

  private buildKycRequirement(
    documents: Document[],
    requirements: OnboardingRequirement[],
    metadata: MarketPolicyMetadata | null
  ): OnboardingRequirement | null {
    const result = this.documentRequirements.validateKycPrerequisites(documents);
    const hasKycDocument = requirements.some(req => req.id.includes('kyc') || req.title.toLowerCase().includes('biométrica'));

    if (!hasKycDocument && !result.isKycComplete) {
      return null;
    }

    let status: 'completed' | 'pending' | 'blocked';
    if (result.isKycComplete) {
      status = 'completed';
    } else if (result.canStartKyc) {
      status = 'pending';
    } else {
      status = 'blocked';
    }

    const helpText = result.tooltipMessage || (result.missingDocs.length
      ? `Faltan documentos: ${result.missingDocs.join(', ')}.`
      : undefined);

    return {
      id: 'kyc-validation',
      title: 'Validación biométrica (KYC)',
      status,
      required: hasKycDocument,
      kind: 'kyc',
      helpText,
      helpLink: this.resolveHelpLink('kyc-validation'),
      metadata: {
        missingDocs: result.missingDocs
      }
    };
  }

  private buildAviRequirement(
    readiness: AviReadinessSnapshot | null,
    session: OnboardingAviSessionState | null
  ): OnboardingRequirement | null {
    if (!readiness || !readiness.isAviRequired) {
      return null;
    }

    const sessionStatus = session?.status ?? 'pending';

    let status: 'completed' | 'pending' | 'blocked';
    if (sessionStatus === 'completed') {
      status = 'completed';
    } else if (readiness.isEligible) {
      status = 'pending';
    } else {
      status = 'blocked';
    }

    const helpText = readiness.blockingReason || (sessionStatus === 'completed' && session?.decision
      ? `Decisión final: ${session.decision}`
      : undefined);

    return {
      id: 'avi-interview',
      title: 'Entrevista AVI',
      status,
      required: readiness.isAviRequired,
      kind: 'avi',
      helpText,
      helpLink: this.resolveHelpLink('avi-interview'),
      metadata: {
        completionRatio: readiness.completionRatio,
        pending: readiness.pendingCount
      }
    };
  }

  private buildIncomeRequirement(
    metadata: MarketPolicyMetadata | null,
    requirements: OnboardingRequirement[],
    documents: Document[],
    completion: DocumentCompletionStatus | null
  ): OnboardingRequirement | null {
    const incomeMeta = metadata?.income;
    if (!incomeMeta) {
      return null;
    }

    const targetId = incomeMeta.documentId ?? 'doc-income';
    const matchingRequirement = requirements.find(req => req.id === targetId || req.relatedDocumentId === targetId);
    const matchingDocument = documents.find(doc => doc.id === targetId || doc.name?.toLowerCase().includes('ingreso'));

    if (!matchingRequirement && !matchingDocument) {
      return null;
    }

    const isApproved = matchingDocument?.status === DocumentStatus.Aprobado;
    const status: 'completed' | 'pending' | 'blocked' = isApproved ? 'completed' : 'pending';

    return {
      id: 'income-validation',
      title: 'Comprobación de ingresos',
      status,
      required: true,
      kind: 'income',
      helpText: isApproved ? undefined : 'Adjunta comprobante de ingresos para continuar.',
      helpLink: this.resolveHelpLink('income-validation'),
      metadata: {
        threshold: incomeMeta.threshold,
        completionPercentage: completion?.completionPercentage ?? 0
      }
    };
  }

  private buildProtectionRequirement(
    metadata: MarketPolicyMetadata | null,
    completion: DocumentCompletionStatus | null
  ): OnboardingRequirement | null {
    const protection = metadata?.protection;
    if (!protection?.required) {
      return null;
    }

    return {
      id: 'protection-coverage',
      title: 'Configura protección del crédito',
      status: 'pending',
      required: true,
      kind: 'protection',
      helpText: 'Selecciona y aplica una cobertura de protección antes de proceder a contratos.',
      helpLink: this.resolveHelpLink('protection-coverage'),
      metadata: {
        coverageOptions: protection.coverageOptions,
        completion: completion?.allComplete ?? false
      }
    };
  }

  private buildTandaRequirement(
    metadata: MarketPolicyMetadata | null,
    completion: DocumentCompletionStatus | null
  ): OnboardingRequirement | null {
    const tanda = metadata?.tanda;
    if (!tanda) {
      return null;
    }

    return {
      id: 'tanda-validation',
      title: 'Validación colectiva (Tanda)',
      status: 'pending',
      required: true,
      kind: 'tanda',
      helpText: 'Completa la validación de integrantes y reglas de la tanda.',
      metadata: {
        minMembers: tanda.minMembers,
        maxMembers: tanda.maxMembers,
        completion: completion?.allComplete ?? false
      }
    };
  }

  private buildStages(config: {
    documents: OnboardingRequirement[];
    kyc: OnboardingRequirement | null;
    avi: OnboardingRequirement | null;
    completion: DocumentCompletionStatus | null;
    protection: OnboardingRequirement | null;
    income: OnboardingRequirement | null;
    tanda: OnboardingRequirement | null;
  }): OnboardingStage[] {
    const stages: OnboardingStage[] = [];

    stages.push({
      id: 'registration',
      title: 'Registro inicial',
      status: 'completed',
      requirements: []
    });

    const docPending = config.documents.filter(item => item.required && item.status !== 'completed');
    stages.push({
      id: 'documents',
      title: 'Documentos requeridos',
      status: docPending.length > 0 ? 'current' : 'completed',
      requirements: config.documents
    });

    const kycStatus = this.stageStatusFromRequirement(config.kyc, docPending.length === 0);
    stages.push({
      id: 'kyc',
      title: 'Validación KYC',
      status: kycStatus,
      requirements: config.kyc ? [config.kyc] : []
    });

    const aviStatus = this.stageStatusFromRequirement(config.avi, kycStatus === 'completed');
    stages.push({
      id: 'avi',
      title: 'Entrevista AVI',
      status: aviStatus,
      requirements: config.avi ? [config.avi] : []
    });

    const completionReady = docPending.length === 0 && (!config.kyc || config.kyc.status === 'completed') && (!config.avi || config.avi.status === 'completed');
    const completionStatus: 'completed' | 'current' | 'pending' = completionReady ? 'current' : 'pending';

    const completionRequirements = [config.protection, config.income, config.tanda]
      .filter((req): req is OnboardingRequirement => !!req);

    const completionResolved = completionRequirements.every(req => req.status === 'completed');

    stages.push({
      id: 'completion',
      title: 'Listo para contratos',
      status: completionResolved && completionReady ? 'completed' : completionStatus,
      requirements: completionRequirements
    });

    return stages;
  }

  private stageStatusFromRequirement(
    requirement: OnboardingRequirement | null,
    canStart: boolean
  ): 'completed' | 'current' | 'pending' | 'blocked' {
    if (!requirement) {
      return 'completed';
    }

    if (requirement.status === 'completed') {
      return 'completed';
    }

    if (!canStart || requirement.status === 'blocked') {
      return 'blocked';
    }

    return 'current';
  }

  private findDocumentMatch(template: Document, documents: Document[]): Document | undefined {
    const normalizedId = template.id?.toLowerCase();
    if (normalizedId) {
      const direct = documents.find(doc => doc.id?.toLowerCase() === normalizedId);
      if (direct) {
        return direct;
      }

      const suffix = documents.find(doc => doc.id?.toLowerCase().endsWith(`-${normalizedId}`));
      if (suffix) {
        return suffix;
      }
    }

    const normalizedName = (template.name || '').toLowerCase();
    if (!normalizedName) {
      return undefined;
    }

    return documents.find(doc => (doc.name || '').toLowerCase() === normalizedName);
  }

  private cloneDocuments(docs: Document[]): Document[] {
    return docs.map(doc => ({ ...doc }));
  }

  private buildContextKey(context: RequirementContext): string {
    return [
      context.market,
      context.saleType,
      context.clientType,
      context.businessFlow ?? 'none',
      context.collectiveSize ?? 'na'
    ].join('|');
  }

  private normalizeMarket(market: string): 'aguascalientes' | 'edomex' | 'otros' | null {
    const normalized = (market || '').toLowerCase();
    if (normalized.includes('aguascalientes') || normalized === 'ags') {
      return 'aguascalientes';
    }
    if (normalized.includes('edomex') || normalized.includes('estado')) {
      return 'edomex';
    }
    if (normalized.includes('otro')) {
      return 'otros';
    }
    return null;
  }

  private persistSnapshot(snapshot: OnboardingRequirementsSnapshot | null): void {
    if (!this.flowContext) {
      return;
    }

    try {
      if (snapshot) {
        this.flowContext.saveContext(this.flowContextKey, snapshot, { persist: false });
      } else {
        this.flowContext.clearContext(this.flowContextKey, false);
      }
    } catch (error) {
      console.warn('[OnboardingRequirements] Failed to persist snapshot', error);
    }
  }

  private resolveHelpLink(requirementId: string): RequirementHelpLink | undefined {
    return DEFAULT_HELP_LINKS[requirementId];
  }
}
