import { DestroyRef, Injectable, Optional, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, firstValueFrom, TimeoutError } from 'rxjs';
import { catchError, finalize, switchMap, timeout, tap } from 'rxjs/operators';

import { AnalyticsService } from '@core-services/analytics.service';
import { MonitoringService } from '@core-services/monitoring.service';
import { ProtectionService } from '@feature-services/risk/protection.service';
import { FlowContextService } from '@core-services/flow-context.service';
import { ToastService } from '@core-services/toast.service';
import { ProtectionApiService } from '@data-access/protection/protection-api.service';
import { environment } from '@environments/environment';
import {
  HealthTriggerEvent,
  ProtectionApplicationRequest,
  ProtectionApplicationResponse,
  ProtectionSimulateRequest,
  ProtectionSimulateResponse,
  ProtectionScenario,
  ProtectionSelectRequest,
  ProtectionApprovalRequest,
  ProtectionSignRequest,
  ProtectionPlan,
  ProtectionState,
  ProtectionType,
  PROTECTION_STATE_DESCRIPTIONS,
  getValidTransitions
} from '@interfaces/protection';
import { safeWindow } from '@services/utils/ssr/safe-window.util';

export interface ProtectionWorkflowOptions {
  contractId?: string;
  effectiveDate?: string;
  coverageType?: string | null;
  score?: number | null;
  scoreSource?: 'api' | 'mock' | 'manual';
  advisorId?: string | null;
  clientId?: string | null;
  market?: string;
  metadata?: Record<string, any>;
}

export interface ProtectionFlowContextState {
  applied: boolean;
  appliedAt: number;
  coverageType: string | null;
  score?: number | null;
  scoreSource?: 'api' | 'mock' | 'manual';
  advisorId?: string | null;
  contractId?: string;
  effectiveDate?: string;
  scheduleLength?: number;
  notifications?: ProtectionApplicationResponse['notifications'];
  fallbackUsed?: boolean;
  clientId?: string | null;
  market?: string;
  metadata?: Record<string, any>;
}

type StepResult<T> = { value: T; fallback: boolean };

export interface ProtectionLabScenario {
  title: string;
  metrics: Array<{ label: string; value: string }>;
}

@Injectable({ providedIn: 'root' })
export class ProtectionWorkflowService {
  private readonly contextKey = 'protection';
  private readonly applyTimeoutMs = 8000;
  private readonly planTimeoutMs = 6000;

  private readonly destroyRef = inject(DestroyRef);

  private readonly currentPlanSignal = signal<ProtectionPlan | null>(null);
  private readonly lastSimulationSignal = signal<ProtectionSimulateResponse | null>(null);
  private readonly loadingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);
  private readonly simulatingSignal = signal(false);
  private readonly lastActionSignal = signal<string | null>(null);

  private readonly loadPlanTrigger = new Subject<string>();
  private readonly simulateTrigger = new Subject<ProtectionSimulateRequest>();
  private readonly selectTrigger = new Subject<ProtectionSelectRequest>();
  private readonly healthTrigger = new Subject<HealthTriggerEvent>();

  private pendingSimulation: ProtectionSimulateResponse | null = null;

  readonly currentPlan = this.currentPlanSignal.asReadonly();
  readonly lastSimulation = this.lastSimulationSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly simulating = this.simulatingSignal.asReadonly();
  readonly lastAction = this.lastActionSignal.asReadonly();

  readonly hasPlan = computed(() => this.currentPlanSignal() !== null);
  readonly currentState = computed<ProtectionState>(() => this.currentPlanSignal()?.state ?? 'IDLE');
  readonly availableScenarios = computed(() => this.currentPlanSignal()?.scenarios ?? []);
  readonly selectedScenario = computed(() => this.currentPlanSignal()?.selected ?? null);
  readonly hasPendingSelection = computed(() => this.selectedScenario() !== null && this.currentState() !== 'APPLIED');
  readonly hasScenarios = computed(() => this.availableScenarios().length > 0);
  readonly statusInfo = computed(() => {
    const plan = this.currentPlanSignal();
    if (!plan) return null;

    return {
      ...PROTECTION_STATE_DESCRIPTIONS[plan.state],
      plan,
      state: plan.state
    };
  });
  readonly eligibilityInfo = computed(() => {
    const plan = this.currentPlanSignal();
    if (!plan) return null;

    return {
      isEligible: plan.state === 'ELIGIBLE',
      reason: plan.eligibilityReason,
      usageRemaining: plan.used,
      nextEligibility: plan.nextEligibilityDate
    };
  });
  readonly validTransitions = computed(() => getValidTransitions(this.currentState()));
  readonly canSimulate = computed(() => ['IDLE', 'ELIGIBLE'].includes(this.currentState()) && !this.loadingSignal());
  readonly canSelect = computed(() => this.currentState() === 'ELIGIBLE' && this.hasScenarios() && !this.loadingSignal());
  readonly canApprove = computed(() => this.currentState() === 'PENDING_APPROVAL' && !this.loadingSignal());
  readonly canSign = computed(() => this.currentState() === 'READY_TO_SIGN' && !this.loadingSignal());

  constructor(
    private readonly protection: ProtectionService,
    @Optional() private readonly protectionApi: ProtectionApiService | null,
    private readonly analytics: AnalyticsService,
    private readonly monitoring: MonitoringService,
    private readonly toast: ToastService,
    @Optional() private readonly flowContext?: FlowContextService,
  ) {
    this.setupReactiveStreams();
  }

  private get protectionClient(): ProtectionService | ProtectionApiService {
    if (environment.features.enableMockData && this.protectionApi) {
      return this.protectionApi;
    }
    return this.protection;
  }

  private setupReactiveStreams(): void {
    this.loadPlanTrigger
      .pipe(
        tap(() => {
          this.loadingSignal.set(true);
          this.errorSignal.set(null);
          this.lastActionSignal.set('loading');
        }),
        switchMap(contractId =>
          this.protectionClient.getPlan(contractId).pipe(
            tap(plan => {
              let nextPlan = plan;
              if (this.pendingSimulation) {
                nextPlan = this.applySimulationToPlan(plan, this.pendingSimulation);
                this.pendingSimulation = null;
              }
              this.currentPlanSignal.set(nextPlan);
              this.lastActionSignal.set('loaded');
            }),
            catchError(error => {
              this.errorSignal.set(error.userMessage || 'Error al cargar plan de protección');
              this.toast.error('Error al cargar plan de protección');
              return EMPTY;
            }),
            finalize(() => this.loadingSignal.set(false))
          )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();

    this.simulateTrigger
      .pipe(
        tap(() => {
          this.simulatingSignal.set(true);
          this.errorSignal.set(null);
          this.lastActionSignal.set('simulating');
        }),
        switchMap(request =>
          this.protectionClient.simulate(request).pipe(
            tap(response => this.handleSimulationResponse(response)),
            catchError(error => {
              this.errorSignal.set(error.userMessage || 'Error al simular escenarios');
              this.toast.error('Error al simular escenarios de protección');
              return EMPTY;
            }),
            finalize(() => this.simulatingSignal.set(false))
          )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();

    this.selectTrigger
      .pipe(
        tap(() => {
          this.loadingSignal.set(true);
          this.errorSignal.set(null);
          this.lastActionSignal.set('selecting');
        }),
        switchMap(request =>
          this.protectionClient.select(request).pipe(
            tap(response => {
              if (!response.success) {
                return;
              }
              const plan = this.currentPlanSignal();
              if (!plan) {
                return;
              }
              this.currentPlanSignal.set({
                ...plan,
                selected: request.scenario,
                state: response.newState,
                audit: {
                  ...plan.audit,
                  updatedAt: new Date().toISOString()
                }
              });
              this.lastActionSignal.set('selected');
              this.toast.success('Escenario seleccionado, esperando aprobación');
            }),
            catchError(error => {
              this.errorSignal.set(error.userMessage || 'Error al seleccionar escenario');
              this.toast.error('Error al seleccionar escenario');
              return EMPTY;
            }),
            finalize(() => this.loadingSignal.set(false))
          )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();

    this.healthTrigger
      .pipe(
        switchMap(event =>
          this.protectionClient.triggerHealthEvent(event).pipe(
            tap(result => {
              if (!result.triggered || !result.newState) {
                return;
              }
              const plan = this.currentPlanSignal();
              if (!plan) {
                return;
              }
              this.currentPlanSignal.set({
                ...plan,
                state: result.newState,
                eligibilityReason: result.reason,
                audit: {
                  ...plan.audit,
                  updatedAt: new Date().toISOString(),
                  triggeredBy: 'automatic',
                  reason: result.reason
                }
              });
              if (result.newState === 'ELIGIBLE') {
                this.toast.info('Protección disponible por cambio en situación financiera');
              }
            }),
            catchError(() => EMPTY)
          )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }

  private handleSimulationResponse(response: ProtectionSimulateResponse): void {
    this.lastSimulationSignal.set(response);
    const plan = this.currentPlanSignal();

    if (!plan) {
      this.pendingSimulation = response;
      this.lastActionSignal.set('simulated');
      this.notifySimulationResult(response);
      return;
    }

    this.currentPlanSignal.set(this.applySimulationToPlan(plan, response));
    this.lastActionSignal.set('simulated');
    this.pendingSimulation = null;
    this.notifySimulationResult(response);
  }

  private applySimulationToPlan(plan: ProtectionPlan, response: ProtectionSimulateResponse): ProtectionPlan {
    const firstScenario = response.scenarios[0] ?? null;

    return {
      ...plan,
      scenarios: response.scenarios,
      selected: firstScenario,
      state: 'ELIGIBLE',
      eligibilityReason: response.eligibilityCheck.reason,
      used: response.eligibilityCheck.usageRemaining
    };
  }

  private notifySimulationResult(response: ProtectionSimulateResponse): void {
    if (response.scenarios.length === 0) {
      this.toast.info('No hay escenarios de protección disponibles en este momento');
    } else {
      this.toast.success(`${response.scenarios.length} opciones de protección disponibles`);
    }
  }

  loadPlan(contractId: string): void {
    const trimmed = contractId.trim();
    if (!trimmed) {
      return;
    }
    this.loadPlanTrigger.next(trimmed);
  }

  simulateScenarios(contractId: string, monthK: number, options: ProtectionSimulateRequest['options']): void {
    const trimmed = contractId.trim();
    if (!trimmed) {
      return;
    }
    const request: ProtectionSimulateRequest = {
      contractId: trimmed,
      monthK,
      options
    };
    this.simulateTrigger.next(request);
  }

  selectScenario(contractId: string, scenario: ProtectionScenario, reason?: string): void {
    if (!this.canSelect()) {
      this.toast.error('No puedes seleccionar escenarios en este momento');
      return;
    }

    const request: ProtectionSelectRequest = {
      contractId: contractId.trim(),
      scenario,
      reason
    };
    this.selectTrigger.next(request);
  }

  approveScenario(contractId: string, approvedBy: string, notes?: string): void {
    if (!this.canApprove()) {
      this.toast.error('No puedes aprobar en este momento');
      return;
    }

    this.loadingSignal.set(true);
    this.lastActionSignal.set('approving');

    this.protectionClient
      .approve({ contractId: contractId.trim(), approvedBy, notes })
      .pipe(
        tap(response => {
          if (!response.success) {
            return;
          }
          const plan = this.currentPlanSignal();
          if (!plan) {
            return;
          }
          this.currentPlanSignal.set({
            ...plan,
            state: response.newState,
            audit: {
              ...plan.audit,
              updatedAt: new Date().toISOString(),
              approvedBy
            }
          });
          this.lastActionSignal.set('approved');
          this.toast.success('Protección aprobada, listo para firmar');
        }),
        catchError(error => {
          this.errorSignal.set(error.userMessage || 'Error al aprobar protección');
          this.toast.error('Error al aprobar protección');
          return EMPTY;
        }),
        finalize(() => this.loadingSignal.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }

  denyScenario(contractId: string, deniedBy: string, reason: string): void {
    this.loadingSignal.set(true);
    this.lastActionSignal.set('denying');

    this.protectionClient
      .deny({ contractId: contractId.trim(), deniedBy, reason })
      .pipe(
        tap(response => {
          if (!response.success) {
            return;
          }
          const plan = this.currentPlanSignal();
          if (!plan) {
            return;
          }
          this.currentPlanSignal.set({
            ...plan,
            state: response.newState,
            audit: {
              ...plan.audit,
              updatedAt: new Date().toISOString(),
              rejectedReason: reason
            }
          });
          this.lastActionSignal.set('denied');
          this.toast.info('Solicitud de protección denegada');
        }),
        catchError(error => {
          this.errorSignal.set(error.userMessage || 'Error al denegar protección');
          this.toast.error('Error al denegar protección');
          return EMPTY;
        }),
        finalize(() => this.loadingSignal.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }

  signDocument(contractId: string, scenarioType: ProtectionType): void {
    if (!this.canSign()) {
      this.toast.error('No puedes firmar en este momento');
      return;
    }

    this.loadingSignal.set(true);
    this.lastActionSignal.set('creating_mifiel');

    this.protectionClient
      .getMifielSigningUrl(contractId.trim(), scenarioType)
      .pipe(
        tap(response => this.openMifielWindow(contractId, response.sessionId, response.documentId, response.signingUrl)),
        catchError(error => {
          this.errorSignal.set(error.userMessage || 'Error al crear sesión de firma');
          this.toast.error('Error al crear sesión de firma');
          return EMPTY;
        }),
        finalize(() => this.loadingSignal.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }

  applySelectedScenario(contractId: string, effectiveDate?: string): void {
    this.loadingSignal.set(true);
    this.lastActionSignal.set('applying');

    this.protectionClient
      .apply({ contractId: contractId.trim(), effectiveDate })
      .pipe(
        tap(response => {
          if (!response.success) {
            return;
          }
          const plan = this.currentPlanSignal();
          if (!plan) {
            return;
          }
          this.currentPlanSignal.set({
            ...plan,
            state: 'APPLIED',
            newPaymentSchedule: response.newSchedule,
            audit: {
              ...plan.audit,
              updatedAt: new Date().toISOString()
            }
          });
          this.lastActionSignal.set('applied');
          this.toast.success('¡Protección aplicada exitosamente!');
        }),
        catchError(error => {
          this.errorSignal.set(error.userMessage || 'Error al aplicar protección');
          this.toast.error('Error al aplicar protección');
          return EMPTY;
        }),
        finalize(() => this.loadingSignal.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }

  triggerHealthEvent(event: HealthTriggerEvent): void {
    this.healthTrigger.next(event);
  }

  canTransitionTo(targetState: ProtectionState): boolean {
    return this.validTransitions().some(transition => transition.to === targetState);
  }

  getScenarioById(type: string): ProtectionScenario | undefined {
    return this.availableScenarios().find(entry => entry.type === type);
  }

  clearError(): void {
    this.errorSignal.set(null);
  }

  reset(): void {
    this.currentPlanSignal.set(null);
    this.lastSimulationSignal.set(null);
    this.loadingSignal.set(false);
    this.simulatingSignal.set(false);
    this.errorSignal.set(null);
    this.lastActionSignal.set(null);
    this.pendingSimulation = null;
  }

  async applyProtection(options: ProtectionWorkflowOptions = {}): Promise<ProtectionFlowContextState> {
    const contractId = options.contractId ?? `mock-contract-${Date.now()}`;
    const coverageType = options.coverageType ?? null;
    const metadata = options.metadata ?? {};
    const startedAt = Date.now();

    this.analytics.track('protection_workflow_start', {
      contractId,
      coverageType,
      source: options.scoreSource ?? 'manual',
    });

    let fallbackUsed = false;
    const planBefore = await this.tryFetchPlan(contractId).catch(error => {
      fallbackUsed = true;
      this.monitoring.captureWarning('protection', 'plan.fetch', 'No se pudo obtener el plan de protección, usando datos simulados', {
        contractId,
        error
      });
      return null;
    });

    const simulationResult = await this.trySimulate(contractId, options).catch(error => {
      fallbackUsed = true;
      this.monitoring.captureWarning('protection', 'simulate', 'Fallo al simular protección, usando escenarios simulados', {
        contractId,
        error
      });
      return this.buildMockSimulation(contractId, coverageType);
    });

    const scenario = this.pickScenario(simulationResult, coverageType, planBefore) ?? this.buildFallbackScenario(contractId, coverageType);

    const selectOutcome = await this.trySelectScenario(contractId, scenario);
    fallbackUsed = fallbackUsed || selectOutcome.fallback;
    let workflowState: ProtectionState = selectOutcome.value;

    const approveOutcome = await this.tryApproveScenario(contractId, options.advisorId);
    fallbackUsed = fallbackUsed || approveOutcome.fallback;
    workflowState = approveOutcome.value;

    const signOutcome = await this.trySignScenario(contractId, options, planBefore);
    fallbackUsed = fallbackUsed || signOutcome.fallback;
    workflowState = signOutcome.value;

    const applyOutcome = await this.tryApplyScenario(contractId, options, coverageType);
    fallbackUsed = fallbackUsed || applyOutcome.fallback;
    const response = applyOutcome.value;

    if (response?.success) {
      workflowState = 'APPLIED';
    }

    const planAfter = await this.tryFetchPlan(contractId).catch(error => {
      fallbackUsed = true;
      this.monitoring.captureWarning('protection', 'plan.refresh', 'No se pudo refrescar el plan de protección, usando datos simulados', {
        contractId,
        error
      });
      return null;
    });

    const appliedAt = Date.now();
    const state: ProtectionFlowContextState = {
      applied: !!response?.success,
      appliedAt,
      coverageType,
      score: options.score ?? null,
      scoreSource: options.scoreSource ?? (fallbackUsed ? 'mock' : 'api'),
      advisorId: options.advisorId ?? null,
      contractId,
      effectiveDate: options.effectiveDate,
      scheduleLength: response?.newSchedule?.length ?? 0,
      notifications: response?.notifications,
      fallbackUsed,
      clientId: options.clientId ?? null,
      market: options.market,
      metadata: {
        ...metadata,
        workflowState,
        scenarioId: scenario?.id ?? null,
        odooContractId: response?.odooContractId,
        neonTransactionId: response?.neonTransactionId,
        initialPlanState: planBefore?.state ?? null,
        finalPlanState: planAfter?.state ?? null
      }
    };

    this.trackWorkflowResult(state, fallbackUsed);

    if (this.flowContext) {
      this.flowContext.saveContext(this.contextKey, state, {
        breadcrumbs: ['Dashboard', 'Protección']
      });
    }

    const durationMs = Date.now() - startedAt;
    this.analytics.metric('protection.workflow.duration_ms', durationMs, {
      contractId,
      fallbackUsed,
      coverageType,
      applied: state.applied,
    });

    return state;
  }

  private trackWorkflowResult(state: ProtectionFlowContextState, fallbackUsed: boolean): void {
    if (state.applied) {
      this.monitoring.captureInfo(
        'protection',
        'workflow.completed',
        'Workflow de protección completado',
        {
          contractId: state.contractId,
          coverageType: state.coverageType,
          score: state.score,
          fallbackUsed,
        },
        { notifyExternally: true, channels: ['datadog'] }
      );
      this.analytics.track('protection_workflow_completed', {
        contractId: state.contractId,
        coverageType: state.coverageType,
        score: state.score,
        scoreSource: state.scoreSource,
        scheduleLength: state.scheduleLength,
        fallbackUsed,
      });
      return;
    }

    this.monitoring.captureWarning(
      'protection',
      'workflow.failed',
      'Workflow de protección terminó sin aplicar cobertura',
      {
        contractId: state.contractId,
        coverageType: state.coverageType,
        fallbackUsed,
      },
      { notifyExternally: true, channels: ['slack', 'datadog'] }
    );
    this.analytics.track('protection_workflow_failed', {
      contractId: state.contractId,
      coverageType: state.coverageType,
      fallbackUsed,
    });
  }

  private async tryFetchPlan(contractId: string): Promise<ProtectionPlan> {
    return firstValueFrom(
      this.protectionClient.getPlan(contractId).pipe(timeout(this.planTimeoutMs))
    );
  }

  private async trySimulate(contractId: string, options: ProtectionWorkflowOptions): Promise<ProtectionSimulateResponse> {
    const request: ProtectionSimulateRequest = {
      contractId,
      monthK: typeof options.metadata?.['monthK'] === 'number' ? options.metadata['monthK'] : 0,
      options: {
        triggerReason: options.metadata?.['triggerReason'] ?? 'manual',
        requestedType: options.metadata?.['requestedType'] as ProtectionType | undefined,
        customParams: options.metadata?.['customParams']
      }
    };

    return firstValueFrom(
      this.protectionClient.simulate(request).pipe(timeout(this.applyTimeoutMs))
    );
  }

  private pickScenario(
    simulation: ProtectionSimulateResponse | null,
    coverageType: string | null,
    plan: ProtectionPlan | null
  ): ProtectionScenario | null {
    const normalizedCoverage = coverageType?.toLowerCase() ?? null;

    const candidate = simulation?.scenarios?.find(scenario => {
      const descriptor = `${scenario.description ?? ''} ${scenario.type ?? ''}`.toLowerCase();
      if (!normalizedCoverage) {
        return true;
      }
      return descriptor.includes(normalizedCoverage) || String((scenario as any).coverageType ?? '').toLowerCase() === normalizedCoverage;
    });

    if (candidate) {
      return candidate;
    }

    if (simulation?.scenarios?.length) {
      return simulation.scenarios[0];
    }

    if (plan?.scenarios?.length) {
      return plan.scenarios[0];
    }

    return null;
  }

  private buildFallbackScenario(contractId: string, coverageType: string | null): ProtectionScenario {
    const normalized = coverageType?.toLowerCase() ?? 'standard';
    const baseType: ProtectionType = normalized === 'premium' ? 'STEPDOWN' : 'DEFER';

    return {
      id: `${contractId}-scenario-${normalized}`,
      type: baseType,
      params: normalized === 'premium'
        ? { reductionPercentage: 0.25, durationMonths: 4 }
        : { deferMonths: 2 },
      description: normalized === 'premium'
        ? 'Reducción temporal de mensualidad con prima premium'
        : 'Diferimiento de pagos por 2 meses',
      impact: {
        paymentChange: normalized === 'premium' ? -1800 : -900,
        termChange: normalized === 'premium' ? 2 : 1,
        totalCostChange: normalized === 'premium' ? 3500 : 2100
      },
      eligible: true,
      score: normalized === 'premium' ? 86 : 72
    } as ProtectionScenario;
  }

  private buildMockSimulation(contractId: string, coverageType: string | null): ProtectionSimulateResponse {
    const scenario = this.buildFallbackScenario(contractId, coverageType);
    return {
      scenarios: [scenario],
      eligibilityCheck: {
        isEligible: true,
        reason: 'Mock eligibility',
        usageRemaining: {
          defer: 2,
          stepdown: 2,
          recalendar: 1,
          collective: 1
        }
      }
    };
  }

  private async trySelectScenario(contractId: string, scenario: ProtectionScenario): Promise<StepResult<ProtectionState>> {
    const request: ProtectionSelectRequest = {
      contractId,
      scenario,
      reason: 'Auto selección desde workflow dev'
    };

    try {
      const response = await firstValueFrom(
        this.protectionClient.select(request).pipe(timeout(this.applyTimeoutMs))
      );
      return { value: response.newState, fallback: false };
    } catch (error) {
      this.monitoring.captureWarning('protection', 'select', 'Fallo al seleccionar escenario, usando transición simulada', {
        contractId,
        scenario,
        error
      });
      return { value: 'PENDING_APPROVAL', fallback: true };
    }
  }

  private async tryApproveScenario(contractId: string, advisorId?: string | null): Promise<StepResult<ProtectionState>> {
    const request: ProtectionApprovalRequest = {
      contractId,
      approvedBy: advisorId ?? 'advisor-dev',
      notes: 'Aprobación automática en entorno de desarrollo'
    };

    try {
      const response = await firstValueFrom(
        this.protectionClient.approve(request).pipe(timeout(this.applyTimeoutMs))
      );
      return { value: response.newState, fallback: false };
    } catch (error) {
      this.monitoring.captureWarning('protection', 'approve', 'Fallo al aprobar protección, usando transición simulada', {
        contractId,
        error
      });
      return { value: 'READY_TO_SIGN', fallback: true };
    }
  }

  private async trySignScenario(
    contractId: string,
    options: ProtectionWorkflowOptions,
    plan: ProtectionPlan | null
  ): Promise<StepResult<ProtectionState>> {
    const signRequest: ProtectionSignRequest = {
      contractId,
      mifielSessionId: (options.metadata?.['mifielSessionId'] as string) ?? plan?.mifielSessionId ?? `mock-mifiel-${contractId}`,
      signedDocumentUrl: (options.metadata?.['signedDocumentUrl'] as string) ?? plan?.signedDocumentUrl ?? `https://mock.conductores.mx/contracts/${contractId}/signed.pdf`
    };

    try {
      const response = await firstValueFrom(
        this.protectionClient.sign(signRequest).pipe(timeout(this.applyTimeoutMs))
      );
      return { value: response.newState, fallback: false };
    } catch (error) {
      this.monitoring.captureWarning('protection', 'sign', 'Fallo al firmar documentación de protección, usando transición simulada', {
        contractId,
        error
      });
      return { value: 'SIGNED', fallback: true };
    }
  }

  private async tryApplyScenario(
    contractId: string,
    options: ProtectionWorkflowOptions,
    coverageType: string | null
  ): Promise<StepResult<ProtectionApplicationResponse | null>> {
    const request: ProtectionApplicationRequest = {
      contractId,
      effectiveDate: options.effectiveDate
    };

    try {
      const response = await firstValueFrom(
        this.protectionClient.apply(request).pipe(timeout(this.applyTimeoutMs))
      );
      this.monitoring.captureInfo(
        'protection',
        'apply.success',
        'Respuesta de aplicación de protección recibida',
        {
          contractId,
          coverageType,
          scheduleLength: response.newSchedule?.length ?? 0,
        },
        { notifyExternally: true, channels: ['datadog'] }
      );
      return { value: response, fallback: false };
    } catch (error) {
      const isTimeout = error instanceof TimeoutError;
      this.monitoring.captureWarning(
        'protection',
        'apply',
        isTimeout ? 'Timeout al aplicar protección, usando flujo simulado' : 'Fallo al aplicar protección, usando flujo simulado',
        { contractId, error },
        { notifyExternally: true, channels: ['slack', 'datadog'] }
      );
      return { value: this.buildMockResponse(contractId, coverageType), fallback: true };
    }
  }

  generateLabScenario(): ProtectionLabScenario {
    return {
      title: 'Cobertura Premium Demo',
      metrics: [
        { label: 'Cobertura total', value: '$750,000' },
        { label: 'Prima mensual', value: '$2,950' },
        { label: 'Beneficiarios', value: 'Familia directa' }
      ]
    };
  }

  private buildMockResponse(contractId: string, coverageType?: string | null): ProtectionApplicationResponse {
    const totalMonths = 6;
    const basePayment = 8500;

    const newSchedule = Array.from({ length: totalMonths }, (_, index) => ({
      month: index + 1,
      payment: Math.max(0, basePayment - (coverageType === 'premium' ? 1800 : 900)),
      principal: Math.max(0, basePayment * 0.6),
      interest: Math.max(0, basePayment * 0.4 - (coverageType === 'premium' ? 600 : 300)),
      balance: Math.max(0, basePayment * (totalMonths - index - 1))
    }));

    return {
      success: true,
      newSchedule,
      odooContractId: `mock-odoo-${contractId}`,
      neonTransactionId: `mock-neon-${Date.now()}`,
      notifications: {
        whatsapp: true,
        email: true,
      push: false
      }
    };
  }

  private openMifielWindow(contractId: string, sessionId: string, documentId: string, signingUrl: string): void {
    const win = safeWindow();
    if (!win) {
      this.handleMifielCompletion(contractId, sessionId, documentId);
      return;
    }

    const popup = win.open(signingUrl, 'mifiel_signing', 'width=800,height=600,scrollbars=yes,resizable=yes');
    if (!popup) {
      this.handleMifielCompletion(contractId, sessionId, documentId);
      return;
    }

    const interval = win.setInterval(() => {
      if (popup.closed) {
        win.clearInterval(interval);
        this.handleMifielCompletion(contractId, sessionId, documentId);
      }
    }, 1000);
  }

  private handleMifielCompletion(contractId: string, sessionId: string, documentUrl: string): void {
    this.loadingSignal.set(true);
    this.lastActionSignal.set('signing');

    this.protectionClient
      .sign({ contractId: contractId.trim(), mifielSessionId: sessionId, signedDocumentUrl: documentUrl })
      .pipe(
        tap(response => {
          if (!response.success) {
            return;
          }
          const plan = this.currentPlanSignal();
          if (!plan) {
            return;
          }
          this.currentPlanSignal.set({
            ...plan,
            state: response.newState,
            mifielSessionId: sessionId,
            signedDocumentUrl: documentUrl,
            audit: {
              ...plan.audit,
              updatedAt: new Date().toISOString()
            }
          });
          this.lastActionSignal.set('signed');
          this.toast.success('Documento firmado exitosamente, aplicando cambios');

          const win = safeWindow();
          if (win) {
            win.setTimeout(() => this.applySelectedScenario(contractId), 2000);
          } else {
            this.applySelectedScenario(contractId);
          }
        }),
        catchError(error => {
          this.errorSignal.set(error.userMessage || 'Error al confirmar firma');
          this.toast.error('Error al confirmar firma');
          return EMPTY;
        }),
        finalize(() => this.loadingSignal.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }
}
