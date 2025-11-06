import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, EventEmitter, Input, OnDestroy, OnInit, Optional, Output, PLATFORM_ID, Renderer2, RendererFactory2, inject, computed, effect, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { EMPTY, Subject, Subscription, takeUntil, timer } from 'rxjs';
import { BusinessFlow, Document, DocumentStatus } from '@interfaces/types';
import { DocumentFlowContextState, DocumentCompletionStatus, MemberDocumentSection, FlowContext, VoiceState, OcrState, TandaState } from '../types/document-upload.models';
import { DocumentRequirementsService } from '@feature-services/documents/document-requirements.service';
import { DocumentValidationService } from '@feature-services/documents/document-validation.service';
import { OCRProgress, OCRResult, OCRService } from '@feature-services/documents/ocr.service';
import { VoiceValidationService } from '@feature-services/avi/voice-validation.service';
import { AviEligibilityService, AviReadinessSnapshot } from '@feature-services/avi/avi-eligibility.service';
import { IconComponent } from '@shared/icon/icon.component';
import { IconName } from '@shared/icon/icon-definitions';
import { DocumentUploadHeaderComponent } from './document-upload-header.component';
import { DocumentStatusBannerComponent } from './document-status-banner.component';
import { DocumentProtectionBannerComponent } from './document-protection-banner.component';
import { DocumentTandaBannerComponent } from './document-tanda-banner.component';
import { DocumentIncomeBannerComponent } from './document-income-banner.component';
import { DocumentTelemetryPanelComponent } from './document-telemetry-panel.component';
import { ContextPanelComponent } from '@shared/context-panel.component';
import { ErrorBoundaryService, BoundaryIssue } from '@core-services/error-boundary.service';
import { FlowContextService } from '@core-services/flow-context.service';
import { OfflineData, OfflineProcessResult, OfflineService } from '@core-services/offline.service';
import { MarketPolicyContext, MarketPolicyMetadata, MarketPolicyService, PolicyMarket, TandaPolicyMetadata } from '@feature-services/configuration/market-policy.service';
import { AnalyticsService } from '@core-services/analytics.service';
import { AviBackendService } from '@feature-services/avi/avi-backend.service';
import { DocumentUploadService, DocumentUploadEvent } from '@feature-services/documents/document-upload.service';
import { DocumentsApiService } from '@data-access/documents/documents-api.service';
import { TandaValidationService, TandaFlowContextState, TandaValidationConfig, TandaValidationStatus } from '@feature-services/tanda/tanda-validation.service';
import { ToastService } from '@core-services/toast.service';
import { FlowCompletionService, FlowCompletionAction } from '@core-services/flow-completion.service';
import { SummaryMetric } from '@shared/summary-panel.component';
import { NavigationService } from '@core-services/navigation.service';
import { GlobalSearchService } from '@core-services/global-search.service';
import { DemoModeService } from '@core-services/demo-mode.service';
import { DemoSeedService } from '@services/demo/demo-seed.service';
import { DemoWorkflowService } from '@services/demo/demo-workflow.service';
import { DemoAnalyticsService } from '@services/demo/demo-analytics.service';
import { DemoAviDecision, DemoScenarioId } from '@services/demo/demo-scenarios';
import { EntitySyncService } from '@core-services/entity-sync.service';
import { ContractContextSnapshot } from '@interfaces/contract-context';
import { ProtectionFlowContextState } from '@feature-services/risk/protection-workflow.service';
import { OnboardingRequirementsService } from '@feature-services/onboarding/onboarding-requirements.service';
import { OnboardingAviSessionState, OnboardingRequirementsSnapshot, AviDocumentMatchSnapshot, AviDocumentMatchFieldSnapshot, DocumentMatchStatus, AviDocumentMatchOverride } from '@feature-services/onboarding/onboarding-requirements.models';
import { OnboardingStatusBannerComponent } from '@shared/onboarding-status-banner.component';
import { OnboardingTrackerComponent } from '@shared/onboarding-tracker.component';
import { OnboardingChecklistComponent } from '@shared/onboarding-checklist.component';
import { DocumentVoiceService } from '../services/document-voice.service';
import { DocumentOcrService } from '../services/document-ocr.service';
import { DocumentTandaService } from '../services/document-tanda.service';
import { catchError } from 'rxjs/operators';
import { DocumentUploadStore } from './document-upload.store';
import { PolicyHintPipe } from '@shared/policy-hint.pipe';
import { DemoErrorBannerComponent } from '@shared/demo-error-banner.component';

type AuditLogEntry = { timestamp: Date; docName: string; action: string; meta?: any };

interface OcrInsights {
  fullName: string | null;
  fullNameConfidence: number;
  curp: string | null;
  curpConfidence: number;
  address: string | null;
  addressConfidence: number;
}

interface AviInsights {
  fullName: string | null;
  curp: string | null;
  address: string | null;
  transcript: string | null;
  decision: string | null;
}

@Component({
  selector: 'app-document-upload-shell',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    IconComponent,
    ContextPanelComponent,
    DocumentUploadHeaderComponent,
    DocumentStatusBannerComponent,
    DocumentProtectionBannerComponent,
    DocumentTandaBannerComponent,
    DocumentIncomeBannerComponent,
    DocumentTelemetryPanelComponent,
    OnboardingStatusBannerComponent,
    OnboardingTrackerComponent,
    OnboardingChecklistComponent,
    PolicyHintPipe,
    DemoErrorBannerComponent
  ],
  templateUrl: './document-upload-shell.component.html',
  styleUrls: ['./document-upload-shell.component.scss'],
})
export class DocumentUploadShellComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private readonly destroyRef = inject(DestroyRef);
  private readonly documentRef = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly renderer: Renderer2 = inject(RendererFactory2).createRenderer(null, null);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly windowRef: (Window & typeof globalThis) | null = this.isBrowser
    ? (this.documentRef.defaultView as any)
    : null;
  private readonly store = inject(DocumentUploadStore);
  private readonly completion = inject(FlowCompletionService);
  private readonly navigation = inject(NavigationService);
  private readonly globalSearch = inject(GlobalSearchService);
  private readonly demoMode = inject(DemoModeService);
  private readonly demoSeeds = inject(DemoSeedService);
  private readonly demoWorkflow = inject(DemoWorkflowService);
  private readonly demoAnalytics = inject(DemoAnalyticsService);
  private readonly entitySync = inject(EntitySyncService);
  readonly isDemoMode = this.demoMode.isDemoMode;
  readonly activeDemoScenario = this.demoMode.activeScenario;
  readonly demoScenarioSnapshot = computed(() => {
    const scenario = this.activeDemoScenario();
    if (!scenario) {
      return null;
    }
    return this.demoSeeds.scenarioSnapshot(scenario);
  });
  readonly demoDocumentsWithIssues = computed(() => {
    if (!this.isDemoMode()) {
      return [] as Document[];
    }
    const snapshot = this.demoScenarioSnapshot();
    if (!snapshot?.documents?.length) {
      return [] as Document[];
    }
    return snapshot.documents.filter(doc => doc.status !== DocumentStatus.Aprobado);
  });
  readonly demoIssueDescription = computed(() => {
    const issues = this.demoDocumentsWithIssues();
    if (!issues.length) {
      return 'Todos los documentos demo están validados.';
    }
    const preview = issues.slice(0, 3).map(doc => doc.name).join(', ');
    const remaining = issues.length - 3;
    if (remaining > 0) {
      return `${preview} y ${remaining} más con incidencias demo.`;
    }
    return `${preview} con incidencias demo.`;
  });
  readonly dataConsistencyState = signal<AviDocumentMatchSnapshot | null>(null);
  private aviDocumentMatch: AviDocumentMatchSnapshot | null = null;
  readonly demoAviDecision = computed(() => this.demoScenarioSnapshot()?.aviDecision ?? null);
  readonly demoAviDecisionUpdatedAt = computed(() => this.demoScenarioSnapshot()?.aviDecisionUpdatedAt ?? null);
  readonly aviDecisionOptions: DemoAviDecision[] = ['GO', 'REVIEW', 'NO_GO'];
  readonly isResolvingDemoIssues = signal(false);
  readonly demoDocumentBusy = signal<string | null>(null);
  readonly isSimulatingAviDecision = signal(false);
  readonly activeDemoDocumentMatchOption = computed(() => this.demoScenarioSnapshot()?.activeDocumentMatchOption ?? null);
  private readonly demoWatcher = effect(() => {
    if (!this.isDemoMode()) {
      return;
    }
    const scenario = this.activeDemoScenario();
    const snapshot = this.demoScenarioSnapshot();
    if (!scenario || !snapshot?.documents) {
      return;
    }

    const docs = snapshot.documents.map(doc => ({ ...doc }));
    this.requiredDocuments = docs;
    this.completionStatus = this.documentRequirements.getDocumentCompletionStatus(docs) as DocumentCompletionStatus;

    if (!this.flowContext && snapshot.flowContext) {
      this.flowContext = {
        ...snapshot.flowContext,
        source: snapshot.flowContext.source ?? 'nueva-oportunidad'
      } as FlowContext;
    }

    if (Object.prototype.hasOwnProperty.call(snapshot, 'aviDocumentMatch')) {
      this.aviDocumentMatch = snapshot.aviDocumentMatch ? this.deepClone(snapshot.aviDocumentMatch) : null;
      this.dataConsistencyState.set(this.aviDocumentMatch);
    } else {
      this.evaluateDataConsistency();
    }

    this.syncOnboardingSnapshot();
    this.trackDocumentMatchTelemetry('documents');

    this.demoAnalytics.track('scenario_active', {
      scenario,
      feature: 'documents'
    });
  });
  private syncMessageTimer?: Subscription;
  private readonly contextKey = 'documentos';
  policyContext: MarketPolicyContext | null = null;
  private restoredDocuments: Document[] | null = null;
  private policyMetadata: MarketPolicyMetadata | null = null;
  private protectionBannerDismissed = false;
  private incomeBannerDismissed = false;
  private currentUploadingFile: File | null = null;
  private readonly documentStatusCache = new Map<string, DocumentStatus>();
  private hasLoadedServerDocuments = false;
  private hasShownCompletionOverlay = false;
  private lastDocumentProgressOverlayAt = 0;
  private lastDocumentMatchTelemetryKey: string | null = null;

  @Input() flowContext!: FlowContext;
  @Output() flowComplete = new EventEmitter<any>();
  @Output() goBackRequested = new EventEmitter<void>();

  get requiredDocuments(): Document[] {
    return this.store.requiredDocuments();
  }

  set requiredDocuments(value: Document[]) {
    this.store.setRequiredDocuments(value);
  }

  get completionStatus(): DocumentCompletionStatus {
    return this.store.completionStatus();
  }

  set completionStatus(value: DocumentCompletionStatus) {
    this.store.setCompletionStatus(value);
    this.syncDocumentProgress(value);
  }

  private syncDocumentProgress(status: DocumentCompletionStatus | null | undefined): void {
    if (!status || !this.flowContextService) {
      return;
    }

    this.flowContextService.saveContext('documents-progress', {
      pending: status.pendingDocs,
      completed: status.completedDocs,
      total: status.totalDocs,
      clientId: this.flowContext?.clientId ?? null,
      lastUpdated: Date.now()
    }, {
      persist: false
    });

    this.navigation.refreshQuickActions();
  }

  get primaryDocuments(): Document[] {
    return this.store.primaryDocuments();
  }

  set primaryDocuments(value: Document[]) {
    this.store.setPrimaryDocuments(value);
  }

  get memberDocumentSections(): MemberDocumentSection[] {
    return this.store.memberSections();
  }

  set memberDocumentSections(value: MemberDocumentSection[]) {
    this.store.setMemberSections(value);
  }

  get tandaValidationState(): TandaFlowContextState | null {
    return this.store.tandaState();
  }

  set tandaValidationState(value: TandaFlowContextState | null) {
    this.store.setTandaState(value);
  }

  get syncMessage(): string | null {
    return this.store.syncMessage();
  }

  set syncMessage(value: string | null) {
    this.store.setSyncMessage(value);
  }

  get queuedRequests(): OfflineData[] {
    return this.store.queuedRequests();
  }

  set queuedRequests(value: OfflineData[]) {
    this.store.setQueuedRequests(value);
  }

  get isOffline(): boolean {
    return this.store.offlineState().isOffline;
  }

  set isOffline(value: boolean) {
    const current = this.store.offlineState();
    this.store.setOfflineState(value, current.pendingDocs);
  }

  get pendingOfflineDocs(): number {
    return this.store.offlineState().pendingDocs;
  }

  set pendingOfflineDocs(value: number) {
    const current = this.store.offlineState();
    this.store.setOfflineState(current.isOffline, value);
  }

  toggleDemoDocument(doc: Document): void {
    const scenario = this.activeDemoScenario();
    if (!scenario) {
      return;
    }
    this.demoWorkflow.toggleDocumentCompletion(scenario, doc.id);
  }

  async autoFixDemoDocument(doc: Document): Promise<void> {
    await this.runDemoDocumentAction(doc.id, async scenario => {
      await this.demoWorkflow.fixDocument(scenario, doc.id);
      this.demoAnalytics.track('document_autofix_single', { scenario, documentId: doc.id });
    });
  }

  async simulateDemoDocumentIssue(doc: Document): Promise<void> {
    await this.runDemoDocumentAction(doc.id, async scenario => {
      await this.demoWorkflow.rejectDocument(scenario, doc.id, 'Incidencia demo generada manualmente');
      this.demoAnalytics.track('document_issue_simulated', { scenario, documentId: doc.id });
    });
  }

  async resolveDemoIssues(): Promise<void> {
    if (this.isResolvingDemoIssues()) {
      return;
    }
    const scenario = this.activeDemoScenario();
    if (!scenario) {
      return;
    }
    const documents = [...this.demoDocumentsWithIssues()];
    if (!documents.length) {
      return;
    }
    this.isResolvingDemoIssues.set(true);
    try {
      for (const doc of documents) {
        await this.demoWorkflow.fixDocument(scenario, doc.id);
      }
      this.demoAnalytics.track('documents_autofix', {
        scenario,
        total: documents.length
      });
    } finally {
      this.isResolvingDemoIssues.set(false);
    }
  }

  isDemoDocumentBusy(docId: string): boolean {
    return this.isResolvingDemoIssues() || this.demoDocumentBusy() === docId;
  }

  exitDemoMode(): void {
    this.demoMode.enableRealData();
    this.demoAnalytics.track('scenario_exit', { feature: 'documents' });
  }

  resetDemoScenario(): void {
    if (!this.isDemoMode()) {
      return;
    }
    const scenario = this.activeDemoScenario();
    if (!scenario) {
      return;
    }
    this.demoSeeds.resetScenario(scenario);
    this.demoAnalytics.track('scenario_reset', { scenario, feature: 'documents' });
  }

  simulateAviDecision(decision: DemoAviDecision): void {
    if (!this.isDemoMode()) {
      return;
    }
    const scenario = this.activeDemoScenario();
    if (!scenario || this.isSimulatingAviDecision()) {
      return;
    }
    this.isSimulatingAviDecision.set(true);
    try {
      this.demoAnalytics.track('avi_decision_triggered', {
        scenario,
        decision,
        feature: 'documents'
      });
      this.demoWorkflow.simulateAviDecision(scenario, decision);
    } finally {
      this.isSimulatingAviDecision.set(false);
    }
  }

  formatAviDecision(decision: DemoAviDecision | null): string {
    switch (decision) {
      case 'GO':
        return 'GO';
      case 'REVIEW':
        return 'Review';
      case 'NO_GO':
        return 'No go';
      default:
        return 'Pendiente';
    }
  }

  selectDemoDocumentMatch(optionId: string): void {
    if (!this.isDemoMode()) {
      return;
    }
    const scenario = this.activeDemoScenario();
    if (!scenario || optionId === this.activeDemoDocumentMatchOption()) {
      return;
    }
    this.demoWorkflow.setDocumentMatchOption(scenario, optionId);
  }

  getDemoDocumentMatchSummary(optionId: string | null): string {
    const options = this.demoScenarioSnapshot()?.documentMatchOptions ?? [];
    if (!options.length) {
      return 'Selecciona un estado demo para la coincidencia de datos.';
    }
    const match = options.find(option => option.id === optionId);
    return (match ?? options[0]).summary;
  }

  getAviDecisionClass(decision: DemoAviDecision | null): string {
    switch (decision) {
      case 'GO':
        return 'document-upload__demo-avi-pill--go';
      case 'REVIEW':
        return 'document-upload__demo-avi-pill--review';
      case 'NO_GO':
        return 'document-upload__demo-avi-pill--no-go';
      default:
        return 'document-upload__demo-avi-pill--pending';
    }
  }

  handleAviOverride(event: { decision: 'accepted' | 'forced'; comment: string }): void {
    const comment = event.comment.trim();
    if (!comment) {
      return;
    }

    const override: AviDocumentMatchOverride = {
      decision: event.decision,
      comment,
      forcedAt: Date.now(),
      forcedBy: null
    };

    this.onboardingRequirements.setAviManualOverride(override);
    this.trackDocumentMatchTelemetry('documents');
    this.persistFlowState();

    const telemetryPayload = {
      origin: 'documents',
      decision: event.decision,
      commentLength: override.comment.length
    };

    if (this.isDemoMode()) {
      this.demoAnalytics.track('avi_document_override', telemetryPayload);
    } else {
      this.analytics.track('avi_document_override', telemetryPayload);
    }
  }

  handleAviOverrideClear(): void {
    this.onboardingRequirements.setAviManualOverride(null);
    this.trackDocumentMatchTelemetry('documents');
    this.persistFlowState();

    if (this.isDemoMode()) {
      this.demoAnalytics.track('avi_document_override_cleared', { origin: 'documents' });
    } else {
      this.analytics.track('avi_document_override_cleared', { origin: 'documents' });
    }
  }

  queueHasAction(queueId: string): boolean {
    return this.store.queueInProgress().has(queueId);
  }

  private addQueueAction(queueId: string): void {
    this.store.addQueueAction(queueId);
  }

  private removeQueueAction(queueId: string): void {
    this.store.removeQueueAction(queueId);
  }

  get busyQueueIds(): Set<string> {
    return this.store.queueInProgress();
  }

  uploadProgressFor(docId: string): number {
    return this.store.uploadProgress()[docId] ?? 0;
  }

  private setUploadProgress(docId: string, progress: number): void {
    this.store.setUploadProgress(docId, progress);
  }

  private clearUploadProgress(docId: string): void {
    this.store.clearUploadProgress(docId);
  }

  retryCountFor(docId: string): number {
    return this.store.retryCounts()[docId] ?? 0;
  }

  private incrementRetry(docId: string): void {
    this.store.incrementRetryCount(docId);
  }

  private resetRetry(docId: string): void {
    this.store.resetRetryCount(docId);
  }

  private async runDemoDocumentAction(docId: string, action: (scenario: DemoScenarioId) => Promise<void>): Promise<void> {
    const scenario = this.activeDemoScenario();
    if (!scenario || this.demoDocumentBusy() === docId || this.isResolvingDemoIssues()) {
      return;
    }
    this.demoDocumentBusy.set(docId);
    try {
      await action(scenario);
    } finally {
      this.demoDocumentBusy.set(null);
    }
  }

  get auditLog(): AuditLogEntry[] {
    return this.store.auditLog();
  }

  private appendAudit(entry: AuditLogEntry): void {
    this.store.appendAuditEntry(entry);
  }
  // Voice Pattern & AVI

  // OCR State - Minimalista
  isProcessingDocument = false;

  // Original OCR properties (preserved for compatibility)
  currentUploadingDoc: Document | null = null;
  private uploadingDocId: string | null = null;
  hashIndex: Map<string, { name: string; size: number; timestamp: number }> = new Map();
  private pendingHashes = new Map<string, string>();
  private serializedFiles = new Map<string, { base64: string; name: string; type: string; size: number }>();

  private lastTandaConfigKey: string | null = null;
  private lastTandaRosterHash: string | null = null;
  boundaryIssues: BoundaryIssue[] = [];
  private lastTelemetryHash = '';
  private lastRequirementsTelemetryKey: string | null = null;

  get voicePattern(): string {
    return this.voiceService.state().pattern;
  }

  get showVoicePattern(): boolean {
    return this.voiceService.state().showPattern;
  }

  get isRecording(): boolean {
    return this.voiceService.state().isRecording;
  }

  get voiceVerified(): boolean {
    return this.voiceService.state().verified;
  }

  get showAVI(): boolean {
    return this.voiceService.state().showAvi;
  }

  get aviAnalysis(): any {
    return this.voiceService.state().analysis;
  }

  get aviReadiness(): AviReadinessSnapshot | null {
    if (!this.showAVI) {
      return null;
    }

    return this.aviEligibility.evaluate({
      documents: this.requiredDocuments ?? [],
      flowContext: this.flowContext ?? null,
      showAviOverride: true
    });
  }

  get onboardingSnapshot() {
    return this.onboardingRequirements.snapshot();
  }

  get ocrStatus(): 'processing' | 'validated' | 'error' | null {
    return this.ocrFacade.ocrState().status;
  }

  get showOCRStatus(): boolean {
    return this.ocrFacade.ocrState().showStatus;
  }

  get ocrProgress(): OCRProgress {
    return this.ocrFacade.ocrState().progress;
  }

  get ocrResult(): OCRResult | null {
    return this.ocrFacade.ocrState().result;
  }

  get showOCRPreview(): boolean {
    return this.ocrFacade.ocrState().showPreview;
  }

  getStatusLineClasses(status: 'processing' | 'validated' | 'error'): Record<string, boolean> {
    return {
      'document-upload__status-line--processing': status === 'processing',
      'document-upload__status-line--validated': status === 'validated',
      'document-upload__status-line--error': status === 'error'
    };
  }

  getStatusDotClasses(status: 'processing' | 'validated' | 'error'): Record<string, boolean> {
    return {
      'document-upload__status-dot--processing': status === 'processing',
      'document-upload__status-dot--validated': status === 'validated',
      'document-upload__status-dot--error': status === 'error'
    };
  }

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private documentRequirements: DocumentRequirementsService,
    private documentValidation: DocumentValidationService,
    private voiceValidation: VoiceValidationService,
    private voiceService: DocumentVoiceService,
    private ocrFacade: DocumentOcrService,
    private tandaService: DocumentTandaService,
    private ocrService: OCRService,
    private errorBoundary: ErrorBoundaryService,
    private marketPolicy: MarketPolicyService,
    private documentsApi: DocumentsApiService,
    private offline: OfflineService,
    private analytics: AnalyticsService,
    private aviBackend: AviBackendService,
    private documentUpload: DocumentUploadService,
    private tandaValidation: TandaValidationService,
    private toast: ToastService,
    private aviEligibility: AviEligibilityService,
    private onboardingRequirements: OnboardingRequirementsService,
    @Optional() private flowContextService?: FlowContextService
  ) {}

  // Expose enums to template
  protected readonly DocumentStatus = DocumentStatus;

  ngOnInit() {
    if (!this.flowContext && this.flowContextService) {
      this.flowContext = this.restoreFlowContextFromService() ?? this.flowContext;
    }

    // If no explicit input provided, attempt to derive from query params for deep-linking
    if (!this.flowContext && this.windowRef) {
      try {
        const search = this.windowRef.location?.search ?? '';
        const params = new URLSearchParams(search);
        const market = (params.get('market') as any) || 'aguascalientes';
        const clientTypeParam = (params.get('clientType') || '').toLowerCase();
        const clientType = (clientTypeParam === 'colectivo' ? 'colectivo' : 'individual') as any;
        const source = (params.get('source') as any) || 'nueva-oportunidad';
        const businessFlow = (params.get('businessFlow') as any) || BusinessFlow.VentaPlazo;
        const saleTypeParam = (params.get('saleType') || '').toLowerCase();
        const saleType = saleTypeParam === 'contado' ? 'contado' : 'financiero';
        const clientId = params.get('clientId') || undefined;
        const clientName = params.get('clientName') || undefined;
        this.flowContext = { market, clientType, source, businessFlow, saleType, clientId, clientName } as any;
      } catch {}
    }

    this.syncDocumentProgress(this.store.completionStatus());

    this.updateBreadcrumbs();
    this.persistFlowState();
    this.initializeFlow();

    this.errorBoundary.issues$
      .pipe(takeUntil(this.destroy$))
      .subscribe(issues => {
        this.boundaryIssues = issues;
        this.trackTelemetry(issues);
      });

    this.offline.online$
      .pipe(takeUntil(this.destroy$))
      .subscribe(isOnline => {
        this.isOffline = !isOnline;
        if (isOnline && this.pendingOfflineDocs > 0) {
          this.showSyncMessage('Conexión restablecida. Sincronizando documentos pendientes…');
        }
        this.trackTelemetry(this.boundaryIssues);
      });

    this.offline.pendingRequests$
      .pipe(takeUntil(this.destroy$))
      .subscribe(requests => {
        const relevant = requests.filter(request => this.isDocumentUploadRequest(request));
        this.pendingOfflineDocs = relevant.length;
        this.queuedRequests = relevant;
        this.syncQueuedDocumentStatuses();
        this.trackTelemetry(this.boundaryIssues);
        this.persistFlowState();
      });

    this.offline.processedRequests$
      .pipe(takeUntil(this.destroy$))
      .subscribe(result => {
        this.handleOfflineProcessResult(result);
        this.trackTelemetry(this.boundaryIssues);
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.syncMessageTimer?.unsubscribe();
    this.syncMessageTimer = undefined;

    // Cleanup OCR worker
    this.ocrService.terminateWorker();
    this.persistFlowState();
  }

  private async initializeFlow() {
    if (!this.flowContext) return;

    this.protectionBannerDismissed = false;
    this.incomeBannerDismissed = false;
    this.tandaService.reset();

    // Load required documents based on flow context
    const saleType = this.flowContext.saleType ?? 'financiero';
    this.flowContext.saleType = saleType;

    const policyContextFromFlow = this.clonePolicyContext(this.flowContext.policyContext);

    const requiresIncomeProof = this.determineIncomeProofRequirement(policyContextFromFlow ?? undefined);
    this.flowContext.requiresIncomeProof = requiresIncomeProof;

    const collectiveSize = this.determineCollectiveSize(policyContextFromFlow ?? undefined);
    if (typeof collectiveSize === 'number') {
      this.flowContext.collectiveMembers = collectiveSize;
    } else {
      this.flowContext.collectiveMembers = undefined;
    }

    if (policyContextFromFlow) {
      policyContextFromFlow.requiresIncomeProof = requiresIncomeProof;
      if (typeof collectiveSize === 'number') {
        policyContextFromFlow.collectiveSize = collectiveSize;
      } else {
        delete policyContextFromFlow.collectiveSize;
      }
      if (typeof this.flowContext.incomeThreshold === 'number') {
        policyContextFromFlow.incomeThreshold = this.flowContext.incomeThreshold;
      }
      if (typeof this.flowContext.incomeThresholdRatio === 'number') {
        policyContextFromFlow.incomeThresholdRatio = this.flowContext.incomeThresholdRatio;
      }
      this.policyContext = policyContextFromFlow;
    } else {
      this.policyContext = this.buildPolicyContext(saleType, requiresIncomeProof, collectiveSize);
    }

    if (this.policyContext) {
      this.flowContext.policyContext = this.clonePolicyContext(this.policyContext) ?? undefined;
      this.policyMetadata = this.marketPolicy.getPolicyMetadata(this.policyContext);
    } else {
      this.policyMetadata = null;
    }

    this.initializeTandaValidation();

    const demoSnapshot = this.demoScenarioSnapshot();
    if (this.isDemoMode() && demoSnapshot?.documents?.length) {
      const docs = demoSnapshot.documents.map(doc => ({ ...doc }));
      this.requiredDocuments = docs;
      this.initializeDocumentStatusCache(docs);
      this.syncQueuedDocumentStatuses();
      this.syncOnboardingSnapshot(docs);
      this.updateCompletionStatus(false);
      this.demoAnalytics.track('documents_seed_applied', {
        scenario: this.activeDemoScenario(),
        total: docs.length
      });
      return;
    }

    this.documentRequirements.getDocumentRequirements({
      market: this.flowContext.market,
      saleType,
      businessFlow: this.flowContext.businessFlow,
      clientType: this.flowContext.clientType,
      requiresIncomeProof,
      collectiveSize
    }).pipe(takeUntil(this.destroy$)).subscribe((docs: Document[]) => {
      let finalDocs = docs;
      if (this.restoredDocuments?.length) {
        const restoredMap = new Map(this.restoredDocuments.map(doc => [doc.id, doc]));
        finalDocs = docs.map(doc => {
          const restored = restoredMap.get(doc.id);
          return restored ? { ...doc, ...restored } : doc;
        });
        this.restoredDocuments = null;
      }
      finalDocs = this.applyMetadataEffects(finalDocs);
      this.requiredDocuments = finalDocs;
      this.initializeDocumentStatusCache(finalDocs);
      this.syncQueuedDocumentStatuses();
      this.syncOnboardingSnapshot(docs);
      this.updateCompletionStatus(false);
      this.loadDocumentsFromServer();
    });

    // Initialize Voice Pattern for complex flows (not VentaDirecta)
    if (this.shouldUseVoicePattern()) {
      this.initializeVoicePattern();
    }

    // Initialize AVI for high-risk flows
    if (this.shouldUseAVI()) {
      this.initializeAVI();
    }
  }

  private initializeTandaValidation(): void {
    if (!this.policyMetadata?.tanda) {
      return;
    }

    this.tandaValidation.state$
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => {
        this.tandaValidationState = state;
        this.tandaService.setValidation(state);
        if (state) {
          this.lastTandaConfigKey = this.configKeyForState(state);
        }
        this.persistFlowState();
        this.maybeOpenCompletionOverlay();
        this.syncOnboardingSnapshot();
      });

    const config = this.buildTandaValidationConfig();
    if (!config) {
      return;
    }

    const desiredKey = this.configKeyFor(config);
    if (this.lastTandaConfigKey === desiredKey) {
      return;
    }

    const current = this.tandaValidation.current;
    if (!current || this.hasDifferentTandaConfig(current, config)) {
      this.lastTandaConfigKey = desiredKey;
      this.analytics.track('tanda_validation_triggered', {
        members: config.members,
        rounds: config.rounds,
        contribution: config.contribution,
      });
      this.tandaValidation
        .validate(config)
        .catch(() => {
          this.lastTandaConfigKey = null;
        });
    }
  }

  private buildTandaValidationConfig(): TandaValidationConfig | null {
    if (!this.policyMetadata?.tanda || !this.flowContext) {
      return null;
    }

    const rules = this.policyMetadata.tanda;
    this.tandaService.updateRules(rules);
    const members = this.determineCollectiveSize() ?? rules.minMembers;
    if (!members || members <= 0) {
      return null;
    }

    const contributionCandidate = this.resolveTandaContribution();
    const roundsCandidate = this.resolveTandaRounds();

    const contribution = Math.min(
      rules.maxContribution,
      Math.max(rules.minContribution, contributionCandidate ?? rules.minContribution)
    );
    const rounds = Math.min(
      rules.maxRounds,
      Math.max(rules.minRounds, roundsCandidate ?? rules.minRounds)
    );

    this.tandaService.hydrate({ contribution, rules });

    return {
      market: this.flowContext.market,
      clientType: this.flowContext.clientType,
      members,
      contribution,
      rounds,
      rotationOrder: this.resolveTandaRotation(members),
      startDate: this.resolveTandaStartDate(),
      advisorId: this.resolveAdvisorId(),
      groupName: this.resolveGroupName(),
    };
  }

  private hasDifferentTandaConfig(state: TandaFlowContextState, config: TandaValidationConfig): boolean {
    return (
      state.config.members !== config.members ||
      Math.round(state.config.contribution) !== Math.round(config.contribution) ||
      state.config.rounds !== config.rounds
    );
  }

  private configKeyFor(config: TandaValidationConfig): string {
    return [config.members, Math.round(config.contribution), config.rounds].join('|');
  }

  private configKeyForState(state: TandaFlowContextState | null): string | null {
    if (!state) {
      return null;
    }
    return this.configKeyFor({
      market: state.config.market,
      clientType: state.config.clientType,
      members: state.config.members,
      contribution: state.config.contribution,
      rounds: state.config.rounds,
      rotationOrder: state.config.rotationOrder,
      startDate: state.config.startDate,
      advisorId: state.config.advisorId,
      groupName: state.config.groupName,
    });
  }

  get tandaValidationStatus(): TandaValidationStatus | null {
    return this.tandaService.tandaState().validation?.status ?? this.tandaValidationState?.status ?? null;
  }

  private resolveTandaContribution(): number | undefined {
    const quotation = (this.flowContext?.quotationData ?? {}) as any;
    const simulator = (this.flowContext?.simulatorData ?? {}) as any;

    const candidates = [
      quotation?.monthlyContribution,
      quotation?.monthlyPaymentPerMember,
      quotation?.contribution,
      quotation?.aporte,
      quotation?.scenario?.monthlyContribution,
      quotation?.scenario?.monthlyAmount,
      simulator?.monthlyContribution,
      simulator?.aporte,
    ];

    for (const value of candidates) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return value;
      }
    }

    return undefined;
  }

  private resolveTandaRounds(): number | undefined {
    const quotation = (this.flowContext?.quotationData ?? {}) as any;
    const simulator = (this.flowContext?.simulatorData ?? {}) as any;

    const candidates = [
      quotation?.rounds,
      quotation?.scenario?.rounds,
      quotation?.scenario?.horizonMonths,
      quotation?.timeline?.length,
      simulator?.rounds,
      simulator?.horizonMonths,
    ];

    for (const value of candidates) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return Math.round(value);
      }
    }

    return undefined;
  }

  private resolveTandaRotation(members: number): number[] {
    const quotation = (this.flowContext?.quotationData ?? {}) as any;
    const rotation = quotation?.rotationOrder;
    if (Array.isArray(rotation) && rotation.every(item => typeof item === 'number')) {
      return rotation.slice(0, members);
    }

    return Array.from({ length: members }, (_, index) => index + 1);
  }

  private resolveTandaStartDate(): string {
    const quotation = (this.flowContext?.quotationData ?? {}) as any;
    const start = quotation?.startDate ?? quotation?.scenario?.startDate;
    if (start) {
      const parsed = new Date(start);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }

    return new Date().toISOString();
  }

  private resolveAdvisorId(): string | null {
    const onboarding = this.flowContextService?.getContextData<any>('onboarding-wizard');
    if (onboarding?.advisorId) {
      return onboarding.advisorId;
    }
    const stored = sessionStorage.getItem('advisorId') ?? localStorage.getItem('advisorId');
    return stored ?? null;
  }

  private resolveGroupName(): string | null {
    const quotation = (this.flowContext?.quotationData ?? {}) as any;
    return quotation?.groupName ?? quotation?.scenario?.groupName ?? null;
  }

  private cloneTandaState(state: TandaFlowContextState | null): TandaFlowContextState | undefined {
    if (!state) {
      return undefined;
    }

    try {
      const cloner = (globalThis as any).structuredClone;
      if (typeof cloner === 'function') {
        return cloner(state);
      }
    } catch {
      // Ignore and fallback to JSON copy
    }

    try {
      return JSON.parse(JSON.stringify(state)) as TandaFlowContextState;
    } catch {
      return {
        ...state,
        config: { ...state.config },
        schedule: state.schedule ? state.schedule.map(entry => ({ ...entry })) : state.schedule,
        warnings: state.warnings ? [...state.warnings] : state.warnings,
        metadata: state.metadata ? { ...state.metadata } : state.metadata,
      };
    }
  }

  private buildAviTranscript(): string {
    const clientName = this.flowContext?.clientName ?? 'Cliente';
    const market = this.flowContext?.market ?? 'mercado';
    const completed = `${this.completionStatus.completedDocs}/${Math.max(1, this.completionStatus.totalDocs)}`;
    const timestamp = new Date().toISOString();
    return `Sesión de verificación con ${clientName} (${market}). Documentos validados ${completed}. Registro generado ${timestamp}.`;
  }

  private applyOcrExtraction(document: Document, result: OCRResult): void {
    if (!document) {
      return;
    }

    const extracted = result.extractedData as { documentType?: string; fields?: Record<string, string>; confidence?: number } | undefined;
    const documentType = extracted?.documentType ?? document.name;
    const fields = extracted?.fields ?? {};
    const confidence = extracted?.confidence ?? result.confidence ?? 0.5;

    document.ocrData = {
      documentType,
      fields,
      confidence,
      extractedAt: Date.now()
    };
  }

  private evaluateDataConsistency(): void {
    const ocrInsights = this.collectOcrInsights();
    const aviInsights = this.collectAviInsights();
    const snapshot = this.buildMatchSnapshot(ocrInsights, aviInsights);
    this.aviDocumentMatch = snapshot;
    this.dataConsistencyState.set(snapshot);
    this.trackDocumentMatchTelemetry('documents');
  }

  private collectOcrInsights(): OcrInsights {
    const insights: OcrInsights = {
      fullName: null,
      fullNameConfidence: 0,
      curp: null,
      curpConfidence: 0,
      address: null,
      addressConfidence: 0
    };

    const assign = (
      currentValue: string | null,
      currentConfidence: number,
      candidate: string | undefined,
      confidence: number
    ): { value: string | null; confidence: number } => {
      if (!candidate) {
        return { value: currentValue, confidence: currentConfidence };
      }
      if (!currentValue || confidence > currentConfidence) {
        return { value: candidate.trim(), confidence };
      }
      return { value: currentValue, confidence: currentConfidence };
    };

    for (const doc of this.requiredDocuments) {
      const data = doc.ocrData;
      if (!data) {
        continue;
      }

      const type = data.documentType?.toUpperCase() ?? doc.name.toUpperCase();
      const fields = data.fields ?? {};

      if (type.includes('INE')) {
        const combinedName = [fields['nombre'], fields['apellidos']].filter(Boolean).join(' ').trim();
        const nameAssignment = assign(insights.fullName, insights.fullNameConfidence, combinedName || fields['nombre'], data.confidence);
        insights.fullName = nameAssignment.value;
        insights.fullNameConfidence = nameAssignment.confidence;

        const curpAssignment = assign(insights.curp, insights.curpConfidence, fields['curp'], data.confidence);
        insights.curp = curpAssignment.value;
        insights.curpConfidence = curpAssignment.confidence;
      }

      if (type.includes('COMPROBANTE')) {
        const addressAssignment = assign(insights.address, insights.addressConfidence, fields['direccion'], data.confidence);
        insights.address = addressAssignment.value;
        insights.addressConfidence = addressAssignment.confidence;
      }
    }

    return insights;
  }

  private collectAviInsights(): AviInsights {
    const transcript = typeof this.aviAnalysis?.transcript === 'string' ? this.aviAnalysis?.transcript : null;
    const fallbackName = this.flowContext?.clientName
      ?? this.demoScenarioSnapshot()?.client?.name
      ?? null;

    const nameFromTranscript = transcript ? this.extractNameFromTranscript(transcript) : null;
    const curpMatch = transcript?.match(/[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]{2}/i);
    const addressMatch = transcript?.match(/(CALLE|DOMICILIO|DIRECCIÓN)[:\s]+([^\.]+)/i);

    return {
      fullName: nameFromTranscript ?? fallbackName,
      curp: curpMatch ? curpMatch[0].toUpperCase() : null,
      address: addressMatch ? addressMatch[2].trim() : null,
      transcript,
      decision: typeof this.aviAnalysis?.decision === 'string' ? this.aviAnalysis.decision : null
    };
  }

  private buildMatchSnapshot(ocr: OcrInsights, avi: AviInsights): AviDocumentMatchSnapshot | null {
    const fields: AviDocumentMatchFieldSnapshot[] = [];

    fields.push(this.evaluateMatchField('fullName', ocr.fullName, avi.fullName, ocr.fullNameConfidence, 0.82));
    fields.push(this.evaluateMatchField('curp', ocr.curp, avi.curp, ocr.curpConfidence, 1));
    fields.push(this.evaluateMatchField('address', ocr.address, avi.address, ocr.addressConfidence, 0.7));

    const informative = fields.filter(field => field.status !== 'insufficient');
    if (informative.length === 0) {
      return null;
    }

    const mismatches = informative.filter(field => field.status === 'mismatch');
    const matches = informative.filter(field => field.status === 'match');
    const score = informative.reduce((sum, field) => sum + field.similarity * (0.5 + field.confidence / 2), 0) / informative.length;

    let status: DocumentMatchStatus;
    if (mismatches.length > 0) {
      status = 'mismatch';
    } else if (matches.length > 0) {
      status = 'match';
    } else {
      status = 'insufficient';
    }

    return {
      status,
      score: Number.isFinite(score) ? score : 0,
      evaluatedAt: Date.now(),
      fields
    };
  }

  private evaluateMatchField(
    id: AviDocumentMatchFieldSnapshot['id'],
    documentValue: string | null,
    aviValue: string | null,
    documentConfidence: number,
    threshold: number
  ): AviDocumentMatchFieldSnapshot {
    if (!documentValue || !aviValue) {
      return {
        id,
        documentValue: documentValue ?? null,
        aviValue: aviValue ?? null,
        similarity: 0,
        status: 'insufficient',
        confidence: documentConfidence
      };
    }

    const normalizedDoc = this.normalizeComparable(documentValue);
    const normalizedAvi = this.normalizeComparable(aviValue);
    let similarity = 0;

    if (id === 'curp') {
      similarity = normalizedDoc === normalizedAvi ? 1 : 0;
    } else {
      similarity = this.calculateSimilarity(normalizedDoc, normalizedAvi);
    }

    const status: DocumentMatchStatus = similarity >= threshold ? 'match' : 'mismatch';

    return {
      id,
      documentValue,
      aviValue,
      similarity,
      status,
      confidence: documentConfidence
    };
  }

  private extractNameFromTranscript(transcript: string): string | null {
    const nameMatch = transcript.match(/con\s+([^()]+)\s*\(/i);
    if (nameMatch && nameMatch[1]) {
      return nameMatch[1].trim();
    }
    return null;
  }

  private normalizeComparable(value: string | null | undefined): string {
    if (!value) {
      return '';
    }
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private calculateSimilarity(a: string, b: string): number {
    if (!a || !b) {
      return 0;
    }
    if (a === b) {
      return 1;
    }

    const distance = this.levenshteinDistance(a, b);
    const maxLength = Math.max(a.length, b.length);
    if (maxLength === 0) {
      return 1;
    }
    return 1 - distance / maxLength;
  }

  private levenshteinDistance(a: string, b: string): number {
    const rows = a.length + 1;
    const cols = b.length + 1;
    const matrix: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));

    for (let i = 0; i < rows; i++) {
      matrix[i][0] = i;
    }
    for (let j = 0; j < cols; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i < rows; i++) {
      for (let j = 1; j < cols; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    return matrix[a.length][b.length];
  }

  getConsistencyIcon(snapshot: AviDocumentMatchSnapshot | null): IconName {
    if (!snapshot) {
      return 'information-circle';
    }
    switch (snapshot.status) {
      case 'match':
        return 'badge-check';
      case 'mismatch':
        return 'alert-triangle';
      default:
        return 'information-circle';
    }
  }

  getConsistencySummary(snapshot: AviDocumentMatchSnapshot | null): string {
    if (!snapshot) {
      return 'Aún no hay datos suficientes para validar coincidencias.';
    }

    const score = Math.round(snapshot.score * 100);
    switch (snapshot.status) {
      case 'match':
        return `Datos coinciden (${score}% de similitud).`;
      case 'mismatch':
        return `Revisa las discrepancias detectadas (${score}% de similitud).`;
      default:
        return 'Esperando resultados de OCR o entrevista AVI para comparar.';
    }
  }

  getConsistencyFieldLabel(fieldId: AviDocumentMatchFieldSnapshot['id']): string {
    switch (fieldId) {
      case 'fullName':
        return 'Nombre completo';
      case 'curp':
        return 'CURP';
      case 'address':
        return 'Domicilio';
      default:
        return fieldId;
    }
  }

  getConsistencyFieldStatus(field: AviDocumentMatchFieldSnapshot): string {
    switch (field.status) {
      case 'match':
        return 'Coincide';
      case 'mismatch':
        return 'No coincide';
      default:
        return 'Sin datos suficientes';
    }
  }

  private cloneVoiceState(state: VoiceState): VoiceState {
    return {
      ...state,
      analysis: state.analysis ? this.deepClone(state.analysis) : null
    };
  }

  private cloneOcrState(state: OcrState): OcrState {
    return {
      ...state,
      progress: this.deepClone(state.progress),
      result: state.result ? this.deepClone(state.result) : null
    };
  }

  private cloneTandaSnapshot(state: TandaState): TandaState {
    return {
      ...state,
      validation: state.validation ? this.cloneTandaState(state.validation) ?? null : null,
      rules: state.rules ? this.deepClone(state.rules) : undefined
    };
  }

  private deepClone<T>(value: T): T {
    if (value === null || typeof value !== 'object') {
      return value;
    }

    try {
      const cloner = (globalThis as any).structuredClone;
      if (typeof cloner === 'function') {
        return cloner(value);
      }
    } catch {
      // ignore structured clone failures
    }

    try {
      return JSON.parse(JSON.stringify(value)) as T;
    } catch {
      return value;
    }
  }

  private createMockAudioBlob(transcript: string): Blob {
    const header = 'MOCK_AUDIO_SIMULATION';
    return new Blob([`${header}\n${transcript}`], { type: 'audio/webm' });
  }

  private mapDecisionToRisk(decision: string | undefined): string {
    switch (decision) {
      case 'NO_GO':
        return 'HIGH';
      case 'REVIEW':
        return 'MEDIUM';
      default:
        return 'LOW';
    }
  }

  private buildUploadMetadata(document: Document, extra: Record<string, any> = {}): Record<string, any> {
    return {
      documentName: document.name,
      market: this.flowContext?.market,
      clientType: this.flowContext?.clientType,
      businessFlow: this.flowContext?.businessFlow,
      source: this.flowContext?.source,
      requiresIncomeProof: this.flowContext?.requiresIncomeProof ?? false,
      collectiveMembers: this.flowContext?.collectiveMembers,
      ...extra,
    };
  }

  private async uploadToBackend(
    file: File,
    document: Document,
    hash?: string,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    const clientId = this.flowContext?.clientId;
    if (!clientId) {
      this.analytics.track('documents_upload_skipped', {
        reason: 'missing_client_id',
        documentId: document.id,
      });
      throw new Error('No se puede subir el documento: falta clientId.');
    }

    const payloadMetadata = this.buildUploadMetadata(document, metadata);

    this.analytics.track('documents_upload_started', {
      documentId: document.id,
      clientId,
      fileSize: file.size,
    });

    await new Promise<void>((resolve, reject) => {
      const upload$ = this.documentUpload.uploadDocument({
        file,
        clientId,
        documentId: document.id,
        metadata: payloadMetadata,
        hash,
      });

      const subscription = upload$.subscribe({
        next: (event: DocumentUploadEvent) => {
          if (event.type === 'hash-computed') {
            if (event.hash && !this.pendingHashes.has(document.id)) {
              this.pendingHashes.set(document.id, event.hash);
            }
          }

          if (event.type === 'progress') {
            this.setUploadProgress(document.id, event.percentage);
          }

          if (event.type === 'completed') {
            this.setUploadProgress(document.id, 100);
            this.analytics.track('documents_upload_completed', {
              documentId: document.id,
              clientId,
              fileSize: file.size,
              mimeType: file.type,
            });
            this.addAudit('upload_backend_completed', document.name, {
              hash: event.hash,
              size: file.size,
            });
          }

          if (event.type === 'error') {
            this.addAudit('upload_backend_error', document.name, { message: event.message });
          }
        },
        error: error => {
          this.clearUploadProgress(document.id);
          this.analytics.track('documents_upload_failed', {
            documentId: document.id,
            clientId,
            message: (error as Error)?.message ?? 'unknown',
          });
          this.addAudit('upload_backend_failed', document.name, {
            message: (error as Error)?.message ?? 'unknown',
          });
          subscription.unsubscribe();
          reject(error);
        },
        complete: () => {
          this.clearUploadProgress(document.id);
          subscription.unsubscribe();
          resolve();
        }
      });
    });
  }

  get telemetryStats(): { total: number; queued: number; processing: number; ocrFailures: number; networkTimeouts: number; offlineQueued: number } {
    return this.telemetryStatsFromIssues(this.boundaryIssues);
  }

  get telemetryIssues(): BoundaryIssue[] {
    return this.boundaryIssues;
  }

  get showTelemetryPanel(): boolean {
    const stats = this.telemetryStats;
    return stats.total > 0 || stats.offlineQueued > 0;
  }

  async retryTelemetryIssue(issueId: string): Promise<void> {
    try {
      await this.errorBoundary.retryIssue(issueId);
    } catch (error) {
      this.toast.error('No se pudo reintentar la incidencia. Intenta más tarde.');
      throw error;
    }
  }

  dismissTelemetryIssue(issueId: string): void {
    this.errorBoundary.dismissIssue(issueId, 'Incidencia descartada.');
  }

  async retryQueuedRequest(queueId: string): Promise<void> {
    if (this.queueHasAction(queueId)) {
      return;
    }

    this.addQueueAction(queueId);
    try {
      const success = await this.offline.replayRequest(queueId);
      if (success) {
        this.toast.success('Documento enviado nuevamente.');
      }
    } catch (error) {
      this.toast.error('No se pudo sincronizar el documento. Reintenta más tarde.');
    } finally {
      this.removeQueueAction(queueId);
    }
  }

  discardQueuedRequest(queueId: string): void {
    if (this.queueHasAction(queueId)) {
      return;
    }

    const removed = this.offline.discardRequest(queueId);
    if (removed) {
      this.toast.info('Se descartó la acción en cola.');
    }
  }

  private trackTelemetry(issues: BoundaryIssue[]): void {
    const hash = this.computeTelemetryHash(issues);
    if (hash === this.lastTelemetryHash) {
      return;
    }
    this.lastTelemetryHash = hash;
    const stats = this.telemetryStatsFromIssues(issues);
    this.analytics.track('documents_telemetry_snapshot', {
      totalIssues: stats.total,
      queuedIssues: stats.queued,
      processingIssues: stats.processing,
      offlineQueued: stats.offlineQueued,
      ocrFailures: stats.ocrFailures,
      networkTimeouts: stats.networkTimeouts,
    });
  }

  private telemetryStatsFromIssues(issues: BoundaryIssue[]): { total: number; queued: number; processing: number; ocrFailures: number; networkTimeouts: number; offlineQueued: number } {
    const queued = issues.filter(issue => issue.status === 'queued').length;
    const processing = issues.filter(issue => issue.status === 'processing').length;
    const ocrFailures = issues.filter(issue => issue.type === 'ocr-failure').length;
    const networkTimeouts = issues.filter(issue => issue.type === 'network-timeout').length;
    return {
      total: issues.length,
      queued,
      processing,
      ocrFailures,
      networkTimeouts,
      offlineQueued: this.pendingOfflineDocs,
    };
  }

  private computeTelemetryHash(issues: BoundaryIssue[]): string {
    const issueSignature = issues
      .map(issue => `${issue.type}:${issue.status}`)
      .sort()
      .join('|');
    return `${issueSignature}|offline:${this.pendingOfflineDocs}`;
  }

  private restoreFlowContextFromService(): FlowContext | null {
    if (!this.flowContextService) {
      return null;
    }

    const stored = this.flowContextService.getContextData<DocumentFlowContextState>(this.contextKey);
    if (stored?.flowContext) {
      if (stored.completionStatus) {
        this.completionStatus = stored.completionStatus;
      }
      if (Array.isArray(stored.documents) && stored.documents.length) {
        this.restoredDocuments = stored.documents.map(doc => ({ ...doc }));
        this.requiredDocuments = this.restoredDocuments.map(doc => ({ ...doc }));
        this.syncQueuedDocumentStatuses();
        this.updateDocumentCollections();
      }
      if (stored.policyContext) {
        this.policyContext = { ...stored.policyContext };
      }
      if (stored.policyMetadata) {
        this.policyMetadata = {
          ocrThreshold: stored.policyMetadata.ocrThreshold,
          expiryRules: stored.policyMetadata.expiryRules
            ? { ...stored.policyMetadata.expiryRules }
            : undefined,
          protection: stored.policyMetadata.protection
            ? {
                ...stored.policyMetadata.protection,
                coverageOptions: [...stored.policyMetadata.protection.coverageOptions]
              }
            : undefined,
          tanda: stored.policyMetadata.tanda
            ? { ...stored.policyMetadata.tanda }
            : undefined,
          income: stored.policyMetadata.income
            ? { ...stored.policyMetadata.income }
            : undefined,
        };
      }
      if (!this.policyMetadata && this.policyContext) {
        this.policyMetadata = this.marketPolicy.getPolicyMetadata(this.policyContext);
      }
      if (stored.voiceState) {
        this.voiceService.reset();
        this.voiceService.hydrate(stored.voiceState);
        if (!this.voiceService.state().pattern) {
          this.voiceService.initialize({
            flowContext: this.flowContext,
            voiceValidation: this.voiceValidation
          });
        }
      } else {
        if (stored.voiceVerified !== undefined) {
          this.voiceService.markVerified(this.voiceService.state().analysis, stored.voiceVerified ? 'GO' : 'NO_GO');
          this.maybeOpenCompletionOverlay();
          this.syncOnboardingSnapshot();
        }
        if (stored.showAVI !== undefined) {
          this.voiceService.setShowAvi(stored.showAVI);
        }
        if (stored.aviAnalysis !== undefined) {
          this.voiceService.updateAnalysis(stored.aviAnalysis);
          this.maybeOpenCompletionOverlay();
          this.syncOnboardingSnapshot();
        }
      }
      if (stored.ocrState) {
        this.ocrFacade.reset();
        this.ocrFacade.hydrate(stored.ocrState);
      }
      if (stored.tandaState) {
        this.tandaService.reset();
        this.tandaService.hydrate(stored.tandaState);
      }
      if (stored.tandaValidation) {
        this.tandaValidationState = stored.tandaValidation;
        this.lastTandaConfigKey = this.configKeyForState(stored.tandaValidation);
        this.tandaService.setValidation(stored.tandaValidation);
      }
      if ('aviDocumentMatch' in stored) {
        this.aviDocumentMatch = stored.aviDocumentMatch ? this.deepClone(stored.aviDocumentMatch) : null;
        this.dataConsistencyState.set(this.aviDocumentMatch);
      }
      this.evaluateDataConsistency();
      return stored.flowContext;
    }

    const onboarding = this.flowContextService.getContextData<any>('onboarding-wizard');
    if (onboarding) {
      const mapped = this.mapOnboardingContext(onboarding);
      if (mapped) {
        return mapped;
      }
    }

    const cotizador = this.flowContextService.getContextData<any>('cotizador');
    if (cotizador) {
      const mapped = this.mapCotizadorContext(cotizador);
      if (mapped) {
        return mapped;
      }
    }

    const simulador = this.flowContextService.getContextData<any>('simulador');
    if (simulador) {
      const mapped = this.mapSimulatorContext(simulador);
      if (mapped) {
        return mapped;
      }
    }

    return null;
  }

  private mapOnboardingContext(snapshot: any): FlowContext | null {
    if (!snapshot) {
      return null;
    }

    const form = snapshot.form ?? {};
    const market = (form.market as FlowContext['market']) || 'aguascalientes';
    const clientType = (form.clientType as FlowContext['clientType']) || 'individual';
    const saleType = (form.saleType as 'contado' | 'financiero' | undefined) ?? 'financiero';

    const businessFlow = saleType === 'contado'
      ? BusinessFlow.VentaDirecta
      : clientType === 'colectivo'
        ? BusinessFlow.CreditoColectivo
        : BusinessFlow.VentaPlazo;

    const collectiveMembers = Array.isArray(form.memberNames) ? form.memberNames.filter(Boolean).length : undefined;

    return {
      market,
      clientType,
      businessFlow,
      saleType,
      source: 'nueva-oportunidad',
      clientId: snapshot.currentClient?.id,
      clientName: snapshot.currentClient?.name || undefined,
      collectiveMembers
    };
  }

  private mapCotizadorContext(context: any): FlowContext | null {
    if (!context) {
      return null;
    }

    const market = (context.market as FlowContext['market']) || 'aguascalientes';
    const clientType = (context.clientType as FlowContext['clientType']) || 'individual';
    const businessFlow = clientType === 'colectivo'
      ? BusinessFlow.CreditoColectivo
      : BusinessFlow.VentaPlazo;

    const collectiveMembers = typeof context.collectiveMembers === 'number'
      ? context.collectiveMembers
      : Array.isArray(context.members)
        ? context.members.length
        : undefined;

    return {
      market,
      clientType,
      businessFlow,
      saleType: (context.saleType as FlowContext['saleType']) ?? 'financiero',
      source: 'cotizador',
      clientId: context.clientId,
      clientName: context.clientName || undefined,
      quotationData: context,
      collectiveMembers
    };
  }

  private mapSimulatorContext(context: any): FlowContext | null {
    if (!context) {
      return null;
    }

    const market = (context.market as FlowContext['market']) || 'aguascalientes';
    const clientType = (context.clientType as FlowContext['clientType']) || 'individual';
    const saleType = (context.saleType as FlowContext['saleType']) ?? 'financiero';
    const businessFlow = context.businessFlow as BusinessFlow
      ?? (clientType === 'colectivo' ? BusinessFlow.CreditoColectivo : BusinessFlow.VentaPlazo);

    const collectiveMembers = typeof context.collectiveMembers === 'number'
      ? context.collectiveMembers
      : typeof context.memberCount === 'number'
        ? context.memberCount
        : Array.isArray(context.members)
          ? context.members.length
          : undefined;

    return {
      market,
      clientType,
      businessFlow,
      saleType,
      source: 'simulador',
      simulatorData: context.simulatorData ?? context,
      quotationData: context.quotationData ?? context,
      collectiveMembers,
      requiresIncomeProof: context.requiresIncomeProof,
      monthlyPayment: context.monthlyPayment,
      incomeThreshold: context.incomeThreshold,
      incomeThresholdRatio: context.incomeThresholdRatio,
      clientId: context.clientId,
      clientName: context.clientName,
    };
  }

  private persistFlowState(): void {
    if (!this.flowContextService || !this.flowContext) {
      return;
    }

    const contractContext = this.buildContractContext();
    const flowContractStatus = contractContext ? this.resolveContractStatus(contractContext) : this.flowContext.contract?.status;
    const flowContextSnapshot: FlowContext = {
      ...this.flowContext,
      contract: {
        id: contractContext?.contractId ?? this.flowContext.contract?.id ?? null,
        status: flowContractStatus ?? 'pending',
        lastUpdated: contractContext?.updatedAt ?? Date.now()
      }
    };

    this.flowContext = flowContextSnapshot;
    const voiceStateSnapshot = this.cloneVoiceState(this.voiceService.state());
    const ocrStateSnapshot = this.cloneOcrState(this.ocrFacade.ocrState());
    const tandaStateSnapshot = this.cloneTandaSnapshot(this.tandaService.tandaState());
    const aviDocumentMatchSnapshot = this.deepClone(this.aviDocumentMatch);
    const aviOverrideSnapshot = this.deepClone(this.onboardingRequirements.getAviManualOverride());

    const payload: DocumentFlowContextState = {
      flowContext: flowContextSnapshot,
      completionStatus: this.completionStatus,
      documents: this.requiredDocuments.map(doc => ({ ...doc })),
      policyContext: this.policyContext ? { ...this.policyContext } : undefined,
      policyMetadata: this.policyMetadata
        ? {
            ocrThreshold: this.policyMetadata.ocrThreshold,
            expiryRules: this.policyMetadata.expiryRules
              ? { ...this.policyMetadata.expiryRules }
              : undefined,
            protection: this.policyMetadata.protection
              ? {
                  ...this.policyMetadata.protection,
                  coverageOptions: [...this.policyMetadata.protection.coverageOptions]
                }
              : undefined,
            tanda: this.policyMetadata.tanda
              ? { ...this.policyMetadata.tanda }
              : undefined,
            income: this.policyMetadata.income
              ? { ...this.policyMetadata.income }
              : undefined,
          }
        : undefined,
      voiceVerified: voiceStateSnapshot.verified,
      showAVI: voiceStateSnapshot.showAvi,
      aviAnalysis: voiceStateSnapshot.analysis,
      voiceState: voiceStateSnapshot,
      ocrState: ocrStateSnapshot,
      tandaState: tandaStateSnapshot,
      tandaValidation: tandaStateSnapshot.validation ?? null,
      contractContext: contractContext ? { ...contractContext } : undefined,
      aviDocumentMatch: aviDocumentMatchSnapshot ?? null,
      aviDocumentMatchOverride: aviOverrideSnapshot ?? null
    };
    this.flowContextService.saveContext(this.contextKey, payload, {
      breadcrumbs: this.buildBreadcrumbs()
    });

    this.persistContractGuardContext(contractContext);
  }

  private buildContractContext(): ContractContextSnapshot | null {
    if (!this.flowContext) {
      return null;
    }

    const protectionState = this.flowContextService?.getContextData<ProtectionFlowContextState>('protection');
    const pendingUploads = this.offline
      ? this.offline
          .getPendingRequestsSnapshot()
          .filter(request => request.endpoint === '/documents/upload').length
      : 0;

    const aviStatus = typeof this.aviAnalysis?.status === 'string'
      ? this.aviAnalysis.status
      : this.showAVI
        ? 'pending'
        : 'skipped';

    const aviDecision = typeof this.aviAnalysis?.decision === 'string'
      ? this.aviAnalysis.decision
      : null;

    return {
      clientId: this.flowContext.clientId,
      contractId: this.flowContext.contract?.id ?? null,
      market: this.flowContext.market,
      businessFlow: this.flowContext.businessFlow,
      source: this.flowContext.source,
      documentsComplete: this.completionStatus.allComplete,
      aviStatus,
      aviDecision,
      voiceVerified: this.voiceVerified,
      requiresVoiceVerification: this.showVoicePattern,
      protectionRequired: this.policyMetadata?.protection?.required ?? false,
      protectionApplied: !!protectionState?.applied,
      pendingOfflineRequests: pendingUploads,
      updatedAt: Date.now()
    };
  }

  private resolveContractStatus(context: ContractContextSnapshot): 'pending' | 'ready' | 'blocked' {
    if (!context.documentsComplete || context.pendingOfflineRequests > 0) {
      return 'pending';
    }

    if (context.requiresVoiceVerification && !context.voiceVerified) {
      return 'pending';
    }

    const decision = context.aviDecision?.toLowerCase();
    if (decision === 'no_go') {
      return 'blocked';
    }

    if (context.protectionRequired && !context.protectionApplied) {
      return 'blocked';
    }

    return 'ready';
  }

  private persistContractGuardContext(context: ContractContextSnapshot | null): void {
    if (!context || !this.flowContextService) {
      return;
    }

    this.flowContextService.saveContext('contract', context, {
      breadcrumbs: ['Documentos', 'Contratos']
    });
  }

  private buildBreadcrumbs(): string[] {
    const crumbs = ['Dashboard', 'Documentos'];
    if (this.flowContext?.clientName) {
      crumbs.push(this.flowContext.clientName);
    } else if (this.flowContext?.clientId) {
      crumbs.push(`Cliente ${this.flowContext.clientId}`);
    }
    return crumbs;
  }

  private updateBreadcrumbs(): void {
    if (!this.flowContextService) {
      return;
    }
    this.flowContextService.setBreadcrumbs(this.buildBreadcrumbs());
  }

  private shouldUseVoicePattern(): boolean {
    // Voice Pattern for complex flows (exclude VentaDirecta)
    return this.flowContext.businessFlow !== BusinessFlow.VentaDirecta &&
           (this.flowContext.businessFlow === BusinessFlow.VentaPlazo ||
            this.flowContext.businessFlow === BusinessFlow.CreditoColectivo ||
            this.flowContext.market === 'edomex');
  }

  private initializeVoicePattern() {
    if (this.voiceService.state().pattern) {
      this.voiceService.setShowPattern(true);
      return;
    }

    this.voiceService.initialize({
      flowContext: this.flowContext,
      voiceValidation: this.voiceValidation
    });
  }

  private shouldUseAVI(): boolean {
    // Use AVI for complex flows (exclude VentaDirecta/Contado)
    return this.flowContext.businessFlow !== BusinessFlow.VentaDirecta &&
           (this.flowContext.clientType === 'colectivo' || 
            this.flowContext.businessFlow === BusinessFlow.CreditoColectivo ||
            this.flowContext.businessFlow === BusinessFlow.VentaPlazo);
  }

  private initializeAVI() {
    this.voiceService.setShowAvi(true);
    this.voiceService.updateAnalysis({ status: 'pending', confidence: 0, fraudRisk: 'UNKNOWN' });
    this.syncOnboardingSnapshot();
    this.persistFlowState();
  }

  private determineIncomeProofRequirement(policyContext: MarketPolicyContext | null = this.flowContext?.policyContext ?? null): boolean {
    if (!this.flowContext) {
      return false;
    }

    if (typeof policyContext?.requiresIncomeProof === 'boolean') {
      return policyContext.requiresIncomeProof;
    }

    if (typeof this.flowContext.requiresIncomeProof === 'boolean') {
      return this.flowContext.requiresIncomeProof;
    }

    const quotation = this.flowContext.quotationData ?? {};
    if (typeof quotation.requiresIncomeProof === 'boolean') {
      return quotation.requiresIncomeProof;
    }

    const monthlyPayment = quotation.monthlyPayment ?? quotation.pmt ?? quotation.monthlyQuota;
    const incomeThreshold = quotation.incomeThreshold ?? quotation.requiredIncomeThreshold;
    if (typeof monthlyPayment === 'number' && Number.isFinite(monthlyPayment)) {
      this.flowContext.monthlyPayment = monthlyPayment;

      if (typeof incomeThreshold === 'number' && Number.isFinite(incomeThreshold)) {
        this.flowContext.incomeThreshold = incomeThreshold;
        this.flowContext.incomeThresholdRatio = this.policyContext ? this.marketPolicy.getIncomeThreshold(this.policyContext) : undefined;
        this.analytics.track('documents_income_threshold_resolved', {
          source: 'quotation',
          monthlyPayment,
          threshold: incomeThreshold,
          ratio: this.flowContext.incomeThresholdRatio ?? null,
        });
        return monthlyPayment > incomeThreshold;
      }

      const contextForThreshold = policyContext ?? this.policyContext;
      if (contextForThreshold) {
        const ratio = this.marketPolicy.getIncomeThreshold(contextForThreshold);
        if (typeof ratio === 'number' && Number.isFinite(ratio) && ratio > 0) {
          const derivedThreshold = monthlyPayment * ratio;
          this.flowContext.incomeThreshold = derivedThreshold;
          this.flowContext.incomeThresholdRatio = ratio;
          this.analytics.track('documents_income_threshold_resolved', {
            source: 'policy',
            monthlyPayment,
            threshold: derivedThreshold,
            ratio,
          });
          return monthlyPayment > derivedThreshold;
        }
      }
    }

    return false;
  }

  private determineCollectiveSize(policyContext: MarketPolicyContext | null = this.flowContext?.policyContext ?? null): number | undefined {
    if (!this.flowContext) {
      return undefined;
    }

    if (typeof policyContext?.collectiveSize === 'number') {
      return this.normalizeCollectiveSize(policyContext.collectiveSize, policyContext.metadata?.tanda);
    }

    if (typeof this.flowContext.collectiveMembers === 'number') {
      return this.normalizeCollectiveSize(this.flowContext.collectiveMembers, policyContext?.metadata?.tanda);
    }

    const quotation = this.flowContext.quotationData ?? {};
    if (Array.isArray(quotation.members)) {
      return this.normalizeCollectiveSize(quotation.members.length, policyContext?.metadata?.tanda);
    }
    if (Array.isArray(quotation.groupMembers)) {
      return this.normalizeCollectiveSize(quotation.groupMembers.length, policyContext?.metadata?.tanda);
    }

    const simulator = this.flowContext.simulatorData ?? {};
    if (Array.isArray(simulator.members)) {
      return this.normalizeCollectiveSize(simulator.members.length, policyContext?.metadata?.tanda);
    }
    if (typeof simulator.memberCount === 'number') {
      return this.normalizeCollectiveSize(simulator.memberCount, policyContext?.metadata?.tanda);
    }

    return undefined;
  }

  get protectionRequired(): boolean {
    if (this.protectionBannerDismissed) {
      return false;
    }
    return this.policyMetadata?.protection?.required === true;
  }

  dismissProtectionBanner(): void {
    this.protectionBannerDismissed = true;
    this.persistFlowState();
  }

  get protectionCoverageOptions(): string {
    const options = this.policyMetadata?.protection?.coverageOptions ?? [];
    return options.length ? options.map(option => option.toUpperCase()).join(' / ') : 'Standard';
  }

  get tandaRules(): TandaPolicyMetadata | undefined {
    return this.policyMetadata?.tanda;
  }

  get showTandaBanner(): boolean {
    if (this.tandaService.tandaState().bannerDismissed) {
      return false;
    }

    return !!this.tandaRules;
  }

  dismissTandaBanner(): void {
    this.tandaService.dismissBanner();
    this.persistFlowState();
  }

  get showIncomeBanner(): boolean {
    if (this.incomeBannerDismissed) {
      return false;
    }

    const monthlyPayment = this.flowContext?.monthlyPayment;
    const threshold = this.flowContext?.incomeThreshold;

    if (typeof monthlyPayment !== 'number' || typeof threshold !== 'number') {
      return false;
    }

    return monthlyPayment > threshold;
  }

  dismissIncomeBanner(): void {
    this.incomeBannerDismissed = true;
  }

  get incomeBannerMessage(): string {
    const monthlyPayment = this.flowContext?.monthlyPayment;
    const threshold = this.flowContext?.incomeThreshold;

    if (typeof monthlyPayment !== 'number' || typeof threshold !== 'number' || threshold === 0) {
      return 'Revisa el comprobante de ingresos antes de continuar.';
    }

    const ratio = (monthlyPayment / threshold) * 100;
    return `Pago mensual estimado ${this.formatCurrency(monthlyPayment)} supera el umbral (${this.formatCurrency(threshold)} – ${ratio.toFixed(0)}%). Adjunta comprobante de ingresos o ajusta el plan.`;
  }

  getDocUploadDataCy(docId: string | null | undefined): string {
    if (!docId) {
      return 'doc-upload';
    }
    const normalized = docId
      .replace(/^doc[-_]?/i, '')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
    return `doc-upload-${normalized || 'generic'}`;
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(value);
  }

  get statusBannerType(): 'offline' | 'queued' | 'error' | null {
    if (this.isOffline) {
      return 'offline';
    }
    if (this.pendingOfflineDocs > 0) {
      return 'queued';
    }
    if (this.hasDocumentErrors) {
      return 'error';
    }
    return null;
  }

  getDocumentBadgeClasses(doc: Document): Record<string, boolean> {
    return {
      'document-card__status--approved': doc.status === DocumentStatus.Aprobado,
      'document-card__status--pending': doc.status === DocumentStatus.Pendiente || doc.status === DocumentStatus.EnRevision,
      'document-card__status--error': doc.status === DocumentStatus.Rechazado,
    };
  }

  getDocumentBadgeLabel(doc: Document): string {
    switch (doc.status) {
      case DocumentStatus.Aprobado:
        return 'Validado';
      case DocumentStatus.Rechazado:
        return 'Error';
      case DocumentStatus.EnRevision:
        return 'En revisión';
      default:
        return 'Pendiente';
    }
  }

  getDocumentQaHints(doc: Document): string[] {
    const hints: string[] = [];

    if (this.policyMetadata && this.shouldDisplayOcrHint(doc)) {
      const threshold = Math.round(this.policyMetadata.ocrThreshold * 100);
      hints.push(`OCR ≥ ${threshold}%`);
    }

    const expiry = this.resolveExpiryRule(doc.id);
    if (expiry) {
      hints.push(`Expiración: ${expiry}`);
    }

    return hints;
  }

  private resolveExpiryRule(docId: string): string | undefined {
    const rules = this.policyMetadata?.expiryRules;
    if (!rules) {
      return undefined;
    }

    if (rules[docId]) {
      return rules[docId];
    }

    for (const [key, value] of Object.entries(rules)) {
      if (key.includes('*') && this.matchesWildcard(docId, key)) {
        return value;
      }
    }

    return undefined;
  }

  private matchesWildcard(target: string, pattern: string): boolean {
    if (!pattern.includes('*')) {
      return target === pattern;
    }

    const [prefix] = pattern.split('*');
    return target.startsWith(prefix);
  }

  private shouldDisplayOcrHint(doc: Document): boolean {
    if (!this.policyMetadata) {
      return false;
    }

    return /doc-(ine|proof|rfc|income)/.test(doc.id);
  }

  private handleOfflineProcessResult(result: OfflineProcessResult): void {
    if (!this.isDocumentUploadRequest(result.request)) {
      return;
    }

    const documentId = result.request.data?.documentId as string | undefined;
    if (!documentId) {
      return;
    }

    const doc = this.requiredDocuments.find(item => item.id === documentId);
    if (!doc) {
      return;
    }

    if (result.success) {
      doc.status = DocumentStatus.Aprobado;
      this.addAudit('offline_synced', doc.name, { attempts: result.request.attempts ?? 0 });
      this.errorBoundary.resolveIssueByContext(issue => issue.context?.documentName === doc.name);
      this.updateCompletionStatus();
      this.persistFlowState();
      this.showSyncMessage(`Sincronizamos ${doc.name} al reconectar.`);
    } else {
      this.addAudit('offline_retry_failed', doc.name, { attempts: result.request.attempts ?? 0 });
    }
  }

  private isDocumentUploadRequest(request: OfflineData): boolean {
    if (!request) {
      return false;
    }

    if (typeof request.endpoint === 'string' && request.endpoint.includes('/documents')) {
      return true;
    }

    return Boolean(request.data && request.data.documentId);
  }

  private markDocumentQueued(doc: Document): void {
    doc.status = DocumentStatus.EnRevision;
    this.addAudit('queued_offline', doc.name);
    this.updateCompletionStatus();
    this.showSyncMessage(`${doc.name} se guardó para sincronización offline.`);
    this.persistFlowState();
  }

  private syncQueuedDocumentStatuses(): void {
    if (!this.requiredDocuments.length || !this.queuedRequests.length) {
      return;
    }

    let statusChanged = false;
    this.queuedRequests.forEach(request => {
      const docId = request.data?.documentId as string | undefined;
      if (!docId) {
        return;
      }
      const target = this.requiredDocuments.find(doc => doc.id === docId);
      if (target && target.status !== DocumentStatus.Aprobado && target.status !== DocumentStatus.EnRevision) {
        target.status = DocumentStatus.EnRevision;
        statusChanged = true;
      }
    });

    if (statusChanged) {
      this.updateCompletionStatus();
    }
  }

  private showSyncMessage(message: string): void {
    this.syncMessage = message;
    this.syncMessageTimer?.unsubscribe();
    this.syncMessageTimer = timer(5000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.syncMessage = null;
        this.syncMessageTimer = undefined;
      });
  }

  isUploading(doc: Document): boolean {
    const progress = this.uploadProgressFor(doc.id);
    return this.uploadingDocId === doc.id && progress < 100;
  }

  retryDocument(doc: Document): void {
    doc.status = DocumentStatus.Pendiente;
    this.setUploadProgress(doc.id, 0);
    this.addAudit('retry_request', doc.name);
    this.persistFlowState();
    this.updateCompletionStatus();
    queueMicrotask(() => this.uploadDocument(doc));
  }

  markManualReview(doc: Document): void {
    doc.status = DocumentStatus.EnRevision;
    this.addAudit('manual_review', doc.name);
    this.persistFlowState();
    this.updateCompletionStatus();
  }

  markManualComplete(doc: Document): void {
    doc.status = DocumentStatus.Aprobado;
    this.addAudit('manual_complete', doc.name);
    this.persistFlowState();
    this.updateCompletionStatus();
  }

  private pickNextDocumentForUpload(): Document | null {
    if (!this.requiredDocuments.length) {
      return null;
    }

    const priorityStatuses: DocumentStatus[] = [
      DocumentStatus.Pendiente,
      DocumentStatus.Rechazado,
      DocumentStatus.EnRevision
    ];

    for (const status of priorityStatuses) {
      const found = this.requiredDocuments.find(doc => doc.status === status);
      if (found) {
        return found;
      }
    }

    return this.requiredDocuments.find(doc => doc.status !== DocumentStatus.Aprobado) ?? null;
  }

  get hasDocumentErrors(): boolean {
    return this.requiredDocuments.some(doc => doc.status === DocumentStatus.Rechazado);
  }

  // New minimalista file upload handler
  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (input) {
      input.value = '';
    }
    if (!file) {
      return;
    }

    await this.handleDropUpload(file);
  }

  private async handleDropUpload(file: File): Promise<void> {
    const targetDocument = this.pickNextDocumentForUpload();
    if (!targetDocument) {
      this.showSyncMessage('Todos los documentos están validados.');
      return;
    }

    this.currentUploadingDoc = targetDocument;
    try {
      await this.processUploadedFile(file, targetDocument);
    } catch (error) {
    }
  }

  // Legacy upload method (preserved for compatibility)
  uploadDocument(document: Document) {
    this.currentUploadingDoc = document;
    this.showFileUploadDialog(document);
  }

  private showFileUploadDialog(document: Document) {
    if (!this.isBrowser) {
      return;
    }

    const input = this.documentRef.createElement('input') as HTMLInputElement;
    input.type = 'file';
    input.accept = 'image/*,application/pdf';
    input.multiple = false;

    const removeListener = this.renderer.listen(input, 'change', (event: Event) => {
      removeListener();
      const target = event.target as HTMLInputElement | null;
      const file = target?.files?.[0];
      if (file) {
        this.processUploadedFile(file, document);
      }
    });

    input.click();
  }

  private async processUploadedFile(file: File, document: Document) {
    this.isProcessingDocument = true;
    this.ocrFacade.setStatus('processing');
    this.ocrFacade.updateProgress({ status: 'processing', progress: 0, message: 'Analizando documento…' });
    this.ocrFacade.togglePreview(false);
    this.currentUploadingFile = file;
    this.currentUploadingDoc = document;

    let hash: string | undefined;
    let serialized: { base64: string; name: string; type: string; size: number } | undefined;

    try {
      hash = await this.documentUpload.computeFileHash(file);
      if (this.hashIndex.has(hash)) {
        this.addAudit('duplicate_detected', document.name, { hash, size: file.size });
        document.status = DocumentStatus.Aprobado;
        this.updateCompletionStatus();
        this.setUploadProgress(document.id, 100);
        this.ocrFacade.setStatus('validated');
        this.uploadingDocId = null;
        this.currentUploadingFile = null;
        this.currentUploadingDoc = null;
        this.isProcessingDocument = false;
        return;
      }

      this.hashIndex.set(hash, { name: file.name, size: file.size, timestamp: Date.now() });
      this.addAudit('hash_indexed', document.name, { hash, size: file.size });
      serialized = await this.documentUpload.serializeFile(file);
      this.serializedFiles.set(document.id, serialized);
      this.pendingHashes.set(document.id, hash);

      document.status = DocumentStatus.EnRevision;
      this.updateCompletionStatus();

      this.uploadingDocId = document.id;
      this.setUploadProgress(document.id, 0);

      if (file.type.startsWith('image/')) {
        await this.processImageWithOCR(file, document);
      } else if (file.type === 'application/pdf') {
        await this.processPDFUpload(file, document);
      } else {
        throw new Error('Tipo de archivo no soportado');
      }

      this.errorBoundary.resolveIssueByContext(issue => issue.context?.documentName === document.name);
    } catch (error) {
      document.status = DocumentStatus.Rechazado;
      this.updateCompletionStatus();
      this.addAudit('upload_error', document.name, { error: String(error) });
      this.ocrFacade.setStatus('error');
      this.setUploadProgress(document.id, 0);
      this.uploadingDocId = null;
      this.pendingHashes.delete(document.id);
      let serializedForQueue = serialized ?? this.serializedFiles.get(document.id);
      if (!serializedForQueue) {
        try {
          serializedForQueue = await this.documentUpload.serializeFile(file);
        } catch {}
      }

      const payloadMetadata = this.buildUploadMetadata(document, {
        queueReason: 'network-timeout',
        queuedAt: new Date().toISOString(),
      });
      if (hash) {
        payloadMetadata['hash'] = hash;
      }

      this.errorBoundary.reportNetworkTimeout({
        message: `No se pudo subir ${document.name}. Intentaremos nuevamente cuando haya conexión.`,
        context: {
          module: 'documentos',
          documentName: document.name,
          clientId: this.flowContext?.clientId
        },
        retry: () => this.processUploadedFile(file, document),
        queueRequest: {
          endpoint: '/documents/upload',
          method: 'POST',
          payload: {
            clientId: this.flowContext?.clientId,
            documentId: document.id,
            fileName: serializedForQueue?.name ?? file.name,
            size: serializedForQueue?.size ?? file.size,
            fileSize: serializedForQueue?.size ?? file.size,
            type: serializedForQueue?.type ?? file.type,
            fileType: serializedForQueue?.type ?? file.type,
            fileBase64: serializedForQueue?.base64 ?? null,
            hash: hash,
            metadata: payloadMetadata,
          }
        },
        onQueue: () => {
          this.markDocumentQueued(document);
        },
        onSaveDraft: async () => {
          document.status = DocumentStatus.Pendiente;
          this.updateCompletionStatus();
          this.persistFlowState();
          this.addAudit('saved_draft', document.name, { reason: 'network-timeout' });
        }
      });

      if (serializedForQueue) {
        this.serializedFiles.delete(document.id);
      }
    } finally {
      if (!this.showOCRPreview) {
        this.isProcessingDocument = false;
        this.currentUploadingFile = null;
        this.currentUploadingDoc = null;
      }
    }
  }

  private async processImageWithOCR(file: File, document: Document) {
    try {
      // Initialize OCR worker
      await this.ocrService.initializeWorker();

      // Subscribe to OCR progress
      this.ocrService.progress$
        .pipe(takeUntil(this.destroy$))
        .subscribe((progress: OCRProgress) => this.ocrFacade.setProcessing(progress));

      // Extract text with OCR
      const result = await this.ocrService.extractTextFromImage(file, document.name);
      this.ocrFacade.setResult(result);
      this.applyOcrExtraction(document, result);
      this.evaluateDataConsistency();

      // Show OCR preview for user confirmation
      this.currentUploadingDoc = document;
      this.isProcessingDocument = false;


    } catch (error) {
      this.ocrFacade.setStatus('error');
      this.ocrFacade.updateProgress({
        status: 'error',
        progress: 0,
        message: (error as Error)?.message ?? 'Error en OCR'
      });
      this.errorBoundary.reportOcrFailure({
        message: `El OCR falló para ${document.name}.`,
        context: {
          module: 'documentos',
          documentName: document.name,
          clientId: this.flowContext?.clientId
        },
        retry: () => this.processImageWithOCR(file, document),
        processManually: async () => {
          document.status = DocumentStatus.EnRevision;
          this.updateCompletionStatus();
          this.persistFlowState();
          this.addAudit('manual_processing', document.name);
          this.pendingHashes.delete(document.id);
        },
        skip: async () => {
          document.status = DocumentStatus.Pendiente;
          this.updateCompletionStatus();
          this.persistFlowState();
          this.addAudit('manual_skip', document.name);
          this.pendingHashes.delete(document.id);
        }
      });
      // Continue with regular upload even if OCR fails
      await this.finalizeDocumentUpload(document, file);
      this.isProcessingDocument = false;
    }
  }

  private async processPDFUpload(file: File, document: Document) {
    // For PDF files, skip OCR and proceed with upload
    await this.finalizeDocumentUpload(document, file);
    this.ocrFacade.setStatus('validated');
    this.isProcessingDocument = false;
  }

  confirmOCRResult() {
    const state = this.ocrFacade.ocrState();
    if (this.currentUploadingDoc && state.result) {
      const file = this.currentUploadingFile;
      this.finalizeDocumentUpload(this.currentUploadingDoc, file, state.result)
        .then(() => this.closeOCRPreview())
        .catch(() => this.closeOCRPreview());
    }
  }

  reprocessOCR() {
    if (this.currentUploadingDoc) {
      // Allow user to upload a different image
      this.showFileUploadDialog(this.currentUploadingDoc);
      this.closeOCRPreview();
    }
  }

  closeOCRPreview() {
    this.ocrFacade.togglePreview(false);
    if (this.currentUploadingDoc) {
      this.pendingHashes.delete(this.currentUploadingDoc.id);
    }
    this.ocrFacade.setResult(null);
    this.currentUploadingDoc = null;
    this.currentUploadingFile = null;
    this.ocrFacade.updateProgress({ status: 'idle', progress: 0, message: '' });
    this.isProcessingDocument = false;
  }

  private async finalizeDocumentUpload(document: Document, file: File | null, ocrData?: OCRResult) {
    this.uploadingDocId = document.id;
    this.setUploadProgress(document.id, file ? 0 : 100);

    try {
      if (file) {
        const hash = this.pendingHashes.get(document.id);
        const metadata = ocrData?.extractedData ? { ocrExtract: ocrData.extractedData } : {};
        await this.uploadToBackend(file, document, hash, metadata);
        this.serializedFiles.delete(document.id);
        this.setUploadProgress(document.id, 100);
      }

      this.pendingHashes.delete(document.id);

      if (ocrData && ocrData.extractedData) {
        const validation = this.ocrService.validateDocumentType(ocrData.text, document.name);

        if (validation.valid && validation.confidence > 0.7) {
          document.status = DocumentStatus.Aprobado;
          (document as any).extractedData = ocrData.extractedData;
        } else {
          document.status = DocumentStatus.EnRevision;
        }
      } else {
        document.status = DocumentStatus.Aprobado;
      }

      this.ocrFacade.setStatus(document.status === DocumentStatus.Aprobado ? 'validated' : 'error');

      this.updateCompletionStatus();
      this.addAudit('finalized', document.name, { status: document.status });

      this.errorBoundary.resolveIssueByContext(issue => issue.context?.documentName === document.name);

      if (this.completionStatus.allComplete && this.showVoicePattern && !this.voiceVerified) {
        this.voiceService.setShowPattern(true);
      }
    } catch (error) {
      this.setUploadProgress(document.id, 0);
      this.pendingHashes.delete(document.id);
      throw error;
    } finally {
      this.uploadingDocId = null;
      this.clearUploadProgress(document.id);
      if (!this.showOCRPreview) {
        this.currentUploadingFile = null;
        this.currentUploadingDoc = null;
      }
    }
  }

  async startVoiceRecording(): Promise<void> {
    if (this.isRecording) {
      return;
    }

    this.voiceService.markRecording(true);
    this.analytics.track('avi_recording_started', {
      market: this.flowContext?.market,
      businessFlow: this.flowContext?.businessFlow,
    });

    if (this.showAVI) {
      this.startAVIAnalysis();
    }

    const transcript = this.buildAviTranscript();
    const audioBlob = this.createMockAudioBlob(transcript);

    try {
      const result = await this.aviBackend.analyzeRecording({
        audio: audioBlob,
        sessionId: this.aviAnalysis?.sessionId,
        transcript,
        advisorId: this.resolveAdvisorId(),
        clientId: this.flowContext?.clientId ?? null,
        market: this.flowContext?.market ?? null,
        metadata: {
          source: 'document-upload-flow',
          completion: this.completionStatus.completedDocs / Math.max(1, this.completionStatus.totalDocs),
        },
      });

      this.voiceService.markVerified({
        status: 'completed',
        confidence: result.confidence,
        fraudRisk: this.mapDecisionToRisk(result.decision),
        decision: result.decision,
        score: result.score,
        transcript: result.transcript,
        sessionId: result.sessionId,
        fallbackUsed: result.fallbackUsed
      }, result.decision);
      this.evaluateDataConsistency();
      this.syncOnboardingSnapshot();

      this.analytics.track('avi_recording_completed', {
        decision: result.decision,
        score: result.score,
        fallbackUsed: result.fallbackUsed,
      });
      this.maybeOpenCompletionOverlay();
    } catch (error) {
      const message = (error as Error)?.message ?? 'Error desconocido';
      this.voiceService.markVerified({ status: 'error', message }, 'NO_GO');
      this.maybeOpenCompletionOverlay();
      this.analytics.track('avi_recording_failed', {
        message,
      });
      this.voiceService.updateAnalysis({ status: 'error', message });
      this.evaluateDataConsistency();
      this.syncOnboardingSnapshot();
      this.errorBoundary.reportNetworkTimeout({
        message: 'No se pudo procesar la validación de voz',
        context: {
          module: 'Documentos',
          step: 'AVI',
        },
        retry: () => this.startVoiceRecording(),
      });
    } finally {
      this.voiceService.markRecording(false);
      this.persistFlowState();
    }
  }

  private startAVIAnalysis() {
    this.voiceService.updateAnalysis({ status: 'processing', confidence: 0, fraudRisk: 'UNKNOWN' });
    this.syncOnboardingSnapshot();
    this.persistFlowState();
  }

  private normalizeCollectiveSize(value: number | undefined, rules?: TandaPolicyMetadata | undefined): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      return undefined;
    }

    const min = rules?.minMembers ?? 1;
    const max = rules?.maxMembers ?? Math.max(min, value);

    return Math.min(Math.max(Math.round(value), min), max);
  }

  private clonePolicyContext(context?: MarketPolicyContext | null): MarketPolicyContext | null {
    if (!context) {
      return null;
    }

    return {
      ...context,
      metadata: context.metadata
        ? {
            ...context.metadata,
            tanda: context.metadata.tanda ? { ...context.metadata.tanda } : undefined,
          }
        : undefined,
    };
  }

  private buildPolicyContext(
    saleType: 'contado' | 'financiero',
    requiresIncomeProof: boolean,
    collectiveSize?: number
  ): MarketPolicyContext {
    return {
      market: this.flowContext.market,
      clientType: this.flowContext.clientType,
      saleType,
      businessFlow: this.flowContext.businessFlow,
      requiresIncomeProof,
      collectiveSize
    };
  }

  private applyMetadataEffects(documents: Document[]): Document[] {
    let result = documents.map(doc => ({ ...doc }));

    if (this.policyMetadata?.protection) {
      (this.flowContext as any).protection = {
        required: this.policyMetadata.protection.required,
        coverageOptions: [...(this.policyMetadata.protection.coverageOptions ?? [])],
        defaultCoverage: this.policyMetadata.protection.defaultCoverage ?? null,
      };

      if (this.policyMetadata.protection.required) {
        this.analytics.track('protection_required_detected', {
          market: this.flowContext.market,
          clientType: this.flowContext.clientType,
          coverageOptions: this.policyMetadata.protection.coverageOptions ?? [],
        });
      }
    }

    const tandaMeta = this.policyMetadata?.tanda;
    if (tandaMeta) {
      (this.flowContext as any).tandaRules = { ...tandaMeta };
      this.analytics.track('tanda_rules_detected', {
        market: this.flowContext.market,
        minMembers: tandaMeta.minMembers,
        maxMembers: tandaMeta.maxMembers,
      });
    }

    this.analytics.track('documents_metadata_applied', {
      market: this.flowContext.market,
      clientType: this.flowContext.clientType,
      protectionRequired: this.policyMetadata?.protection?.required ?? false,
      hasTandaRules: !!tandaMeta,
      incomeThreshold: this.flowContext?.incomeThreshold ?? null,
      tandaValidationStatus: this.tandaValidationState?.status ?? null,
    });

    const incomeMeta = this.policyMetadata?.income;
    if (incomeMeta) {
      const incomeDocId = incomeMeta.documentId ?? 'doc-income';
      const shouldForce = this.showIncomeBanner;
      const monthlyPayment = this.flowContext?.monthlyPayment ?? null;
      const incomeThreshold = this.flowContext?.incomeThreshold ?? null;
      if (shouldForce && typeof monthlyPayment === 'number' && typeof incomeThreshold === 'number') {
        this.analytics.track('financing_income_required', {
          market: this.flowContext.market,
          clientType: this.flowContext.clientType,
          monthlyPayment,
          incomeThreshold,
        });
      }
      result = result.map(doc => {
        if (doc.id !== incomeDocId) {
          return doc;
        }
        return {
          ...doc,
          isOptional: shouldForce ? false : doc.isOptional,
          tooltip: shouldForce
            ? 'Obligatorio: adjunta comprobante de ingresos porque el pago supera el umbral configurado.'
            : doc.tooltip,
        };
      });
    }

    return result;
  }

  private updateCompletionStatus(triggerSync: boolean = true) {
    const previousStatus = this.cloneCompletionStatus(this.completionStatus);
    const nextStatus = this.documentRequirements.getDocumentCompletionStatus(this.requiredDocuments) as DocumentCompletionStatus;
    this.completionStatus = nextStatus;
    this.updateDocumentCollections();
    this.syncDocumentStatusChanges();
    this.persistFlowState();
    this.maybeOpenCompletionOverlay();
    this.syncEntityDocumentProgress(previousStatus, nextStatus);
    this.evaluateDataConsistency();
    if (triggerSync) {
      this.syncOnboardingSnapshot();
    }
  }

  private syncOnboardingSnapshot(documentTemplates?: Document[]): void {
    if (!this.flowContext) {
      return;
    }

    const context = {
      market: this.flowContext.market,
      saleType: this.flowContext.saleType ?? 'financiero',
      clientType: this.flowContext.clientType,
      businessFlow: this.flowContext.businessFlow,
      clientStatus: this.flowContext.contract?.status ?? null,
      requiresIncomeProof: this.determineIncomeProofRequirement(),
      collectiveSize: this.determineCollectiveSize() ?? null
    };

    this.onboardingRequirements.update({
      context,
      documents: this.requiredDocuments ?? [],
      policyMetadata: this.policyMetadata ?? null,
      completion: this.completionStatus,
      aviSession: this.buildAviSessionState(),
      aviReadiness: this.showAVI ? this.aviReadiness : null,
      flowContext: this.flowContext,
      documentTemplates,
      aviDocumentMatch: this.aviDocumentMatch
    });

    this.recordRequirementsTelemetry(this.onboardingRequirements.snapshot(), 'documents');
  }

  private recordRequirementsTelemetry(
    snapshot: OnboardingRequirementsSnapshot | null,
    origin: 'documents' | 'onboarding' | 'cotizador'
  ): void {
    if (!snapshot) {
      return;
    }

    const key = `${origin}|${snapshot.context.market}|${snapshot.context.saleType}|${snapshot.context.clientType}|${snapshot.pendingCount}`;
    if (this.lastRequirementsTelemetryKey === key) {
      return;
    }

    this.lastRequirementsTelemetryKey = key;

    if (snapshot.pendingCount > 0) {
      this.analytics.track('onboarding_requirements_pending', {
        origin,
        pending: snapshot.pendingCount,
        market: snapshot.context.market,
        saleType: snapshot.context.saleType,
        clientType: snapshot.context.clientType,
        items: snapshot.pendingRequirements.slice(0, 5).map(item => ({
          id: item.id,
          title: item.title,
          status: item.status
        }))
      });
    } else {
      this.analytics.track('onboarding_requirements_clear', {
        origin,
        market: snapshot.context.market,
        saleType: snapshot.context.saleType,
        clientType: snapshot.context.clientType
      });
    }
  }

  private trackDocumentMatchTelemetry(origin: 'documents' | 'onboarding'): void {
    const match = this.aviDocumentMatch;
    if (!match) {
      return;
    }

    const mismatches = match.fields
      .filter(field => field.status === 'mismatch')
      .map(field => field.id)
      .sort();

    const override = this.onboardingRequirements.getAviManualOverride();

    const key = [
      origin,
      match.status,
      Math.round(match.score * 100),
      mismatches.join(','),
      override?.decision ?? 'none'
    ].join('|');

    if (this.lastDocumentMatchTelemetryKey === key) {
      return;
    }

    this.lastDocumentMatchTelemetryKey = key;

    const payload = {
      origin,
      status: match.status,
      score: Math.round(match.score * 100) / 100,
      mismatches,
      hasOverride: !!override,
      overrideDecision: override?.decision ?? null,
      market: this.flowContext?.market ?? null,
      saleType: this.flowContext?.saleType ?? null,
      clientType: this.flowContext?.clientType ?? null,
      businessFlow: this.flowContext?.businessFlow ?? null,
      clientId: this.flowContext?.clientId ?? null
    };

    if (this.isDemoMode()) {
      this.demoAnalytics.track('avi_document_match', payload);
    } else {
      this.analytics.track('avi_document_match', payload);
    }
  }

  private buildAviSessionState(): OnboardingAviSessionState | null {
    if (!this.showAVI) {
      return null;
    }

    const analysis = this.aviAnalysis;
    const rawStatus = typeof analysis?.status === 'string' ? analysis.status.toLowerCase() : 'pending';

    let status: OnboardingAviSessionState['status'];
    switch (rawStatus) {
      case 'completed':
        status = 'completed';
        break;
      case 'in_progress':
        status = 'in_progress';
        break;
      case 'cancelled':
        status = 'cancelled';
        break;
      case 'pending':
      case 'not_started':
        status = 'pending';
        break;
      default:
        status = 'pending';
        break;
    }

    const decision = typeof analysis?.decision === 'string'
      ? (analysis.decision.toUpperCase() as OnboardingAviSessionState['decision'])
      : null;

    return {
      status,
      decision,
      updatedAt: typeof analysis?.updatedAt === 'number' ? analysis.updatedAt : Date.now()
    };
  }

  private async syncTandaRosterIfNeeded(): Promise<void> {
    if (!this.policyMetadata?.tanda || !this.tandaValidationState?.validationId) {
      return;
    }

    if (!this.isTandaRosterComplete()) {
      return;
    }

    if (this.lastTandaRosterHash === null && this.tandaValidationState.lastRosterUploadId) {
      this.lastTandaRosterHash = this.computeTandaRosterHash();
      return;
    }

    const rosterHash = this.computeTandaRosterHash();
    if (this.lastTandaRosterHash && this.lastTandaRosterHash === rosterHash && this.tandaValidationState.lastRosterUploadId) {
      return;
    }

    try {
      const updated = await this.tandaValidation.syncRoster(this.requiredDocuments, {
        clientId: this.flowContext?.clientId
      });

      if (updated) {
        this.tandaValidationState = updated;
        this.lastTandaRosterHash = rosterHash;
        this.persistFlowState();
      }
    } catch (error) {
      this.analytics.track('tanda_roster_sync_failed', {
        validationId: this.tandaValidationState.validationId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private isTandaRosterComplete(): boolean {
    const members = this.determineCollectiveSize() ?? 0;
    if (!members) {
      return false;
    }

    const consent = this.requiredDocuments.find(doc => doc.id === 'doc-consent' && doc.status === DocumentStatus.Aprobado);
    const roster = this.requiredDocuments.find(doc => doc.id === 'doc-roster' && doc.status === DocumentStatus.Aprobado);
    if (!consent && !roster) {
      return false;
    }

    for (let index = 1; index <= members; index++) {
      const ine = this.requiredDocuments.find(doc => doc.id === `doc-ine-${index}` && doc.status === DocumentStatus.Aprobado);
      const rfc = this.requiredDocuments.find(doc => doc.id === `doc-rfc-${index}` && doc.status === DocumentStatus.Aprobado);
      if (!ine || !rfc) {
        return false;
      }
    }

    return true;
  }

  private computeTandaRosterHash(): string {
    const relevant = this.requiredDocuments.filter(doc =>
      doc.id === 'doc-consent' ||
      doc.id === 'doc-roster' ||
      doc.id.startsWith('doc-ine-') ||
      doc.id.startsWith('doc-rfc-')
    );

    return relevant
      .map(doc => `${doc.id}:${doc.status}:${doc.updatedAt ? new Date(doc.updatedAt).getTime() : ''}`)
      .sort()
      .join('|');
  }

  private updateDocumentCollections(sourceDocs: Document[] = this.requiredDocuments): void {
    if (!sourceDocs.length) {
      this.primaryDocuments = [];
      this.memberDocumentSections = [];
      return;
    }

    const primary: Document[] = [];
    const memberMap = new Map<number, MemberDocumentSection>();

    sourceDocs.forEach(doc => {
      if (doc.group === 'member') {
        const memberIndex = this.extractMemberIndex(doc.id);
        const sectionIndex = memberIndex ?? (memberMap.size + 1);

        let section = memberMap.get(sectionIndex);
        if (!section) {
          section = {
            index: sectionIndex,
            label: this.extractMemberLabel(doc.name, sectionIndex),
            documents: []
          };
          memberMap.set(sectionIndex, section);
        }

        section.documents.push(doc);
      } else {
        primary.push(doc);
      }
    });

    this.primaryDocuments = primary;
    this.memberDocumentSections = Array.from(memberMap.values())
      .sort((a, b) => a.index - b.index)
      .map(section => ({
        ...section,
        documents: section.documents.sort((a, b) => a.id.localeCompare(b.id))
      }));

    void this.syncTandaRosterIfNeeded();
  }

  private loadDocumentsFromServer(): void {
    if (this.hasLoadedServerDocuments) {
      return;
    }

    const clientId = this.flowContext?.clientId;
    if (!clientId) {
      return;
    }

    this.hasLoadedServerDocuments = true;
    this.documentsApi.getClientDocuments(clientId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(() => {
          this.toast.error('No se pudieron obtener los documentos del cliente');
          return EMPTY;
        })
      )
      .subscribe(documents => {
        if (documents && documents.length) {
          this.hydrateDocumentsFromServer(documents);
        }
      });
  }

  private hydrateDocumentsFromServer(documents: Document[]): void {
    const map = new Map(documents.map(doc => [doc.id, doc]));
    const merged = [...this.requiredDocuments];

    documents.forEach(doc => {
      const index = merged.findIndex(existing => existing.id === doc.id);
      if (index >= 0) {
        merged[index] = { ...merged[index], ...doc };
      } else {
        merged.push(doc);
      }
    });

    this.requiredDocuments = merged;
    this.initializeDocumentStatusCache(merged);
    this.updateCompletionStatus();
  }

  private initializeDocumentStatusCache(documents: Document[]): void {
    documents.forEach(doc => {
      if (doc.id && !this.documentStatusCache.has(doc.id)) {
        this.documentStatusCache.set(doc.id, doc.status);
      }
    });
  }

  private syncDocumentStatusChanges(): void {
    const clientId = this.flowContext?.clientId;
    if (!clientId || this.requiredDocuments.length === 0) {
      return;
    }

    this.requiredDocuments.forEach(doc => {
      if (!doc.id) {
        return;
      }

      const previous = this.documentStatusCache.get(doc.id);
      if (previous === doc.status) {
        return;
      }

      const oldStatus = previous;
      this.documentStatusCache.set(doc.id, doc.status);

      this.documentsApi.updateDocumentStatus(clientId, doc.id, doc.status).pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(() => {
          if (oldStatus !== undefined) {
            this.documentStatusCache.set(doc.id, oldStatus);
          } else {
            this.documentStatusCache.delete(doc.id);
          }
          this.toast.error('No se pudo sincronizar el estado del documento');
          return EMPTY;
        })
      ).subscribe(updated => {
        if (updated) {
          this.mergeUpdatedDocument(updated);
          this.updateCompletionStatus();
        }
      });
    });
  }

  private cloneCompletionStatus(status: DocumentCompletionStatus | null): DocumentCompletionStatus | null {
    return status ? { ...status } : null;
  }

  private syncEntityDocumentProgress(
    previous: DocumentCompletionStatus | null,
    current: DocumentCompletionStatus | null
  ): void {
    if (!current || !current.totalDocs || !this.flowContext?.clientId) {
      return;
    }

    const hasChanged = previous
      ? previous.completedDocs !== current.completedDocs || previous.pendingDocs !== current.pendingDocs
      : current.completedDocs > 0 || current.pendingDocs < current.totalDocs;

    if (!hasChanged) {
      return;
    }

    const clientName = this.flowContext.clientName ?? 'Cliente';

    this.entitySync.recordDocumentCompletion({
      clientId: this.flowContext.clientId,
      clientName,
      market: this.flowContext.market as PolicyMarket,
      businessFlow: this.flowContext.businessFlow,
      validatedDocs: current.completedDocs,
      pendingDocs: current.pendingDocs,
      totalDocs: current.totalDocs,
      source: this.flowContext.source
    });

    this.presentDocumentProgressOverlay(previous, current);
  }

  private presentDocumentProgressOverlay(
    previous: DocumentCompletionStatus | null,
    current: DocumentCompletionStatus
  ): void {
    if (this.completion.isOpen() || current.pendingDocs === 0) {
      return;
    }

    const validatedDiff = previous ? current.completedDocs - previous.completedDocs : current.completedDocs;
    if (validatedDiff < 3) {
      return;
    }

    const now = Date.now();
    if (now - this.lastDocumentProgressOverlayAt < 4000) {
      return;
    }
    this.lastDocumentProgressOverlayAt = now;

    const metrics: SummaryMetric[] = [
      {
        label: 'Documentos validados',
        value: `${current.completedDocs}/${current.totalDocs}`,
        badge: 'success'
      },
      {
        label: 'Pendientes',
        value: `${current.pendingDocs}`,
        badge: 'warning'
      }
    ];

    const nextSteps = [
      'Revisa los documentos con observaciones antes de continuar.',
      'Coordina con el cliente las evidencias faltantes.'
    ];

    const actions: FlowCompletionAction[] = [
      {
        id: 'continue-validation',
        label: 'Seguir validando',
        kind: 'primary',
        execute: () => Promise.resolve()
      },
      {
        id: 'open-dashboard',
        label: 'Ir al dashboard',
        kind: 'ghost',
        execute: () => this.navigation.navigateTo('/dashboard')
      }
    ];

    this.completion.open({
      title: 'Validación masiva registrada',
      description: 'Sincronizamos los documentos marcados. Prioriza los pendientes antes de generar contratos.',
      metrics,
      nextSteps,
      actions,
      onComplete: () => this.navigation.refreshQuickActions()
    });
  }

  private mergeUpdatedDocument(updated: Document): void {
    if (!updated.id) {
      return;
    }

    const mergeDoc = (doc: Document) => doc.id === updated.id ? { ...doc, ...updated } : doc;

    this.requiredDocuments = this.requiredDocuments.map(mergeDoc);
    this.primaryDocuments = this.primaryDocuments.map(mergeDoc);
    this.memberDocumentSections = this.memberDocumentSections.map(section => ({
      ...section,
      documents: section.documents.map(mergeDoc)
    }));

    this.initializeDocumentStatusCache(this.requiredDocuments);
  }

  private extractMemberIndex(docId: string): number | null {
    const match = /-(\d+)$/.exec(docId);
    if (match) {
      const numeric = Number(match[1]);
      return Number.isFinite(numeric) ? numeric : null;
    }
    return null;
  }

  private extractMemberLabel(documentName: string, fallbackIndex: number): string {
    const parts = documentName.split(':');
    if (parts.length > 1) {
      return parts[0].trim();
    }
    return `Integrante ${fallbackIndex}`;
  }

  getDocumentTitle(doc: Document): string {
    if (doc.group === 'member') {
      const parts = doc.name.split(':');
      if (parts.length > 1) {
        return parts.slice(1).join(':').trim();
      }
    }
    return doc.name;
  }

  get canProceedToContracts(): boolean {
    const docsComplete = this.completionStatus.allComplete;
    const voiceComplete = !this.showVoicePattern || this.voiceVerified;
    const aviComplete = !this.showAVI || (this.aviAnalysis?.status === 'completed' && this.aviAnalysis?.fraudRisk !== 'HIGH');
    
    return docsComplete && voiceComplete && aviComplete;
  }

  proceedToContracts(): void {
    if (!this.canProceedToContracts) {
      return;
    }

    const contractData = {
      flowContext: this.flowContext,
      documentsComplete: true,
      voiceVerified: this.voiceVerified,
      aviAnalysis: this.aviAnalysis,
      contractType: this.getContractType()
    };

    this.flowComplete.emit(contractData);
    this.persistFlowState();

    this.hasShownCompletionOverlay = true;
    this.openCompletionOverlay(contractData);
  }

  private openCompletionOverlay(contractData: any): void {
    const metrics = this.buildDocumentCompletionMetrics();
    const nextSteps = [
      'Genera el contrato y valida condiciones financieras.',
      'Registra cualquier actividad adicional en el expediente.'
    ];

    const queryParams = {
      clientId: this.flowContext.clientId,
      source: this.flowContext.source,
      market: this.flowContext.market,
      businessFlow: this.flowContext.businessFlow
    };

    const actions: FlowCompletionAction[] = [
      {
        id: 'go-contracts',
        label: 'Generar contrato',
        kind: 'primary',
        execute: () => this.router.navigate(['/contratos/generacion'], { queryParams })
      }
    ];

    if (this.flowContext?.clientId) {
      actions.push({
        id: 'view-client',
        label: 'Ver cliente',
        kind: 'secondary',
        execute: () => this.router.navigate(['/clientes', this.flowContext!.clientId])
      });
    }

    this.hasShownCompletionOverlay = true;
    this.completion.open({
      title: 'Expediente listo para contrato',
      description: 'Los documentos, verificaciones de voz y AVI quedaron sincronizados. Elige el siguiente paso.',
      metrics,
      nextSteps,
      actions,
      onComplete: () => {
        this.globalSearch.refreshIndex(this.flowContext?.clientName);
        this.navigation.refreshQuickActions();
      }
    });
  }

  private maybeOpenCompletionOverlay(): void {
    if (this.canProceedToContracts) {
      if (!this.hasShownCompletionOverlay && !this.completion.isOpen()) {
        if (!this.flowContext) {
          return;
        }
        const contractData = {
          flowContext: this.flowContext,
          documentsComplete: true,
          voiceVerified: this.voiceVerified,
          aviAnalysis: this.aviAnalysis,
          contractType: this.getContractType()
        };
        this.openCompletionOverlay(contractData);
      }
    } else if (this.hasShownCompletionOverlay) {
      this.hasShownCompletionOverlay = false;
    }
  }

  private buildDocumentCompletionMetrics(): SummaryMetric[] {
    const status = this.store.completionStatus();
    const metrics: SummaryMetric[] = [
      {
        label: 'Documentos',
        value: `${status.completedDocs}/${status.totalDocs} completos`,
        badge: status.allComplete ? 'success' : 'warning'
      }
    ];

    metrics.push({
      label: 'Biometría de voz',
      value: this.voiceVerified ? 'Verificada' : 'Pendiente',
      badge: this.voiceVerified ? 'success' : 'warning'
    });

    metrics.push({
      label: 'Fuente de datos',
      value: this.isDemoMode() ? 'DEMO' : 'REAL',
      badge: this.isDemoMode() ? 'warning' : 'success'
    });

    if (this.showAVI) {
      const aviStatus = this.aviAnalysis?.status ?? 'pending';
      const fraudRisk = (this.aviAnalysis?.fraudRisk as string | undefined)?.toUpperCase() ?? 'LOW';
      const isRiskHigh = fraudRisk === 'HIGH';
      const aviValue = aviStatus === 'completed'
        ? (isRiskHigh ? 'Riesgo alto detectado' : 'Completada')
        : 'Pendiente';
      metrics.push({
        label: 'AVI',
        value: aviValue,
        badge: aviStatus === 'completed' ? (isRiskHigh ? 'error' : 'success') : 'warning'
      });
    }

    if (this.pendingOfflineDocs > 0) {
      metrics.push({
        label: 'Sincronización offline',
        value: `${this.pendingOfflineDocs} pendientes`,
        badge: 'warning'
      });
    }

    return metrics;
  }

  private getContractType(): string {
    if (this.flowContext.businessFlow === BusinessFlow.VentaPlazo) {
      return this.flowContext.market === 'edomex' ? 'PAQUETE_DACION_PAGO' : 'VENTA_PLAZO';
    }
    return 'PROMESA_COMPRAVENTA';
  }

  saveProgress() {
    const progressData = {
      flowContext: this.flowContext,
      requiredDocuments: this.requiredDocuments,
      voicePattern: this.voicePattern,
      voiceVerified: this.voiceVerified,
      aviAnalysis: this.aviAnalysis,
      timestamp: new Date().toISOString()
    };

    sessionStorage.setItem(`documentProgress_${this.flowContext.clientId}`, JSON.stringify(progressData));
  }

  goBack() {
    this.goBackRequested.emit();
  }

  // Helper methods for template
  getFlowTitle(): string {
    switch (this.flowContext.source) {
      case 'cotizador': return 'Cotización Generada';
      case 'simulador': return 'Simulación Completada';
      case 'nueva-oportunidad': return 'Nueva Oportunidad';
      default: return 'Proceso de Documentos';
    }
  }

  // ===== Drag & Drop =====
  onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  onDrop(event: DragEvent, document: Document): void {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      this.processUploadedFile(file, document);
    }
  }

  // ===== Hashing & Audit =====

  private addAudit(action: string, docName: string, meta?: any): void {
    this.appendAudit({ timestamp: new Date(), docName, action, meta });
    // Optionally persist minimal audit to sessionStorage
    try {
      sessionStorage.setItem('doc_audit_log', JSON.stringify(this.auditLog.slice(-200)));
    } catch {}
  }

  getSourceText(source: string): string {
    switch (source) {
      case 'cotizador': return 'Cotizador';
      case 'simulador': return 'Simulador';
      case 'nueva-oportunidad': return 'Nueva Oportunidad';
      default: return source;
    }
  }

  getBusinessFlowText(flow: BusinessFlow): string {
    switch (flow) {
      case BusinessFlow.VentaPlazo: return 'Venta a Plazo';
      case BusinessFlow.VentaDirecta: return 'Venta Directa';
      case BusinessFlow.CreditoColectivo: return 'Crédito Colectivo';
      case BusinessFlow.AhorroProgramado: return 'Ahorro Programado';
      default: return flow;
    }
  }

  getStatusText(status: DocumentStatus): string {
    switch (status) {
      case DocumentStatus.Pendiente: return 'Pendiente de subir';
      case DocumentStatus.EnRevision: return 'Procesando...';
      case DocumentStatus.Aprobado: return 'Aprobado';
      case DocumentStatus.Rechazado: return 'Rechazado - Revisar';
      default: return status;
    }
  }

  getAVIStatusText(status: string): string {
    switch (status) {
      case 'pending': return 'Pendiente';
      case 'processing': return 'Procesando';
      case 'completed': return 'Completado';
      default: return status;
    }
  }

  getFraudRiskText(risk: string): string {
    switch (risk) {
      case 'LOW': return 'Bajo';
      case 'MEDIUM': return 'Medio';
      case 'HIGH': return 'Alto';
      default: return 'Desconocido';
    }
  }

  getDocumentTooltip(documentName: string): string | undefined {
    return this.documentRequirements.getDocumentTooltip(documentName);
  }

  // OCR Helper methods
  getConfidenceLevel(confidence: number): string {
    if (confidence >= 0.8) return 'high';
    if (confidence >= 0.6) return 'medium';
    return 'low';
  }

  getExtractedDataArray(fields: any): { key: string; value: string }[] {
    return Object.entries(fields).map(([key, value]) => ({
      key: this.formatFieldName(key),
      value: value as string
    }));
  }

  private formatFieldName(key: string): string {
    const fieldNames: { [key: string]: string } = {
      'curp': 'CURP',
      'nombre': 'Nombre',
      'apellidos': 'Apellidos',
      'fechaNacimiento': 'Fecha de Nacimiento',
      'placas': 'Placas',
      'marca': 'Marca',
      'modelo': 'Modelo',
      'año': 'Año',
      'direccion': 'Dirección',
      'fecha': 'Fecha',
      'proveedor': 'Proveedor',
      'rfc': 'RFC'
    };
    
    return fieldNames[key] || key.charAt(0).toUpperCase() + key.slice(1);
  }
}
