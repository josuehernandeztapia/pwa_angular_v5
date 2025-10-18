import { Injectable, computed, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map, tap } from 'rxjs/operators';

import { HttpClientService, ApiResponse } from '@core-services/http-client.service';
import { environment } from '@environments/environment';
import {
  HealthTriggerEvent,
  ProtectionApplicationRequest,
  ProtectionApplicationResponse,
  ProtectionApprovalRequest,
  ProtectionDenialRequest,
  ProtectionPlan,
  ProtectionScenario,
  ProtectionSelectRequest,
  ProtectionSignRequest,
  ProtectionSimulateRequest,
  ProtectionSimulateResponse,
  ProtectionState
} from '@interfaces/protection';
import { ProtectionMockAdapter } from '@internal-services/mock-adapters/protection-mock.adapter';

interface ProtectionStateSnapshot {
  lastPlan?: ProtectionPlan | null;
  lastSimulation?: ProtectionSimulateResponse | null;
  lastState?: ProtectionState;
}

@Injectable({ providedIn: 'root' })
export class ProtectionApiService {
  private readonly stateSignal = signal<Record<string, ProtectionStateSnapshot>>({});
  readonly state = this.stateSignal.asReadonly();
  readonly plans = computed(() =>
    Object.fromEntries(
      Object.entries(this.state()).map(([contractId, snapshot]) => [contractId, snapshot.lastPlan ?? null])
    )
  );

  constructor(
    private readonly http: HttpClientService,
    private readonly mock: ProtectionMockAdapter
  ) {}

  getPlan(contractId: string): Observable<ProtectionPlan> {
    const cached = this.state()[contractId]?.lastPlan;
    if (cached) {
      return of(cached);
    }

    if (environment.features.enableMockData) {
      return this.mock.getPlan(contractId).pipe(
        tap(plan => this.patchState(contractId, { lastPlan: plan }))
      );
    }

    return this.http.get<ProtectionPlan>(`protection/plan/${contractId}`, {
      showLoading: false
    }).pipe(
      map(this.unwrapData),
      tap(plan => this.patchState(contractId, { lastPlan: plan }))
    );
  }

  simulate(request: ProtectionSimulateRequest): Observable<ProtectionSimulateResponse> {
    if (environment.features.enableMockData) {
      return this.mock.simulate(request).pipe(
        tap(response => this.patchState(request.contractId, { lastSimulation: response }))
      );
    }

    return this.http.post<ProtectionSimulateResponse>('protection/simulate', request, {
      showLoading: false
    }).pipe(
      map(this.unwrapData),
      tap(response => this.patchState(request.contractId, { lastSimulation: response }))
    );
  }

  select(request: ProtectionSelectRequest): Observable<{ success: boolean; newState: ProtectionState }> {
    if (environment.features.enableMockData) {
      return this.mock.select(request).pipe(
        tap(result => this.patchState(request.contractId, {
          lastState: result.newState,
          lastPlan: this.updatePlanSelectedScenario(request.contractId, request.scenario, result.newState)
        }))
      );
    }

    return this.http.post<{ success: boolean; newState: ProtectionState }>('protection/select', request, {
      showLoading: false
    }).pipe(
      map(this.unwrapData),
      tap(result => this.patchState(request.contractId, {
        lastState: result.newState,
        lastPlan: this.updatePlanSelectedScenario(request.contractId, request.scenario, result.newState)
      }))
    );
  }

  approve(request: ProtectionApprovalRequest): Observable<{ success: boolean; newState: ProtectionState }> {
    if (environment.features.enableMockData) {
      return this.mock.approve(request).pipe(
        tap(result => this.patchState(request.contractId, { lastState: result.newState }))
      );
    }

    return this.http.post<{ success: boolean; newState: ProtectionState }>('protection/approve', request, {
      showLoading: false
    }).pipe(
      map(this.unwrapData),
      tap(result => this.patchState(request.contractId, { lastState: result.newState }))
    );
  }

  deny(request: ProtectionDenialRequest): Observable<{ success: boolean; newState: ProtectionState }> {
    if (environment.features.enableMockData) {
      return this.mock.deny(request).pipe(
        tap(result => this.patchState(request.contractId, { lastState: result.newState }))
      );
    }

    return this.http.post<{ success: boolean; newState: ProtectionState }>('protection/deny', request, {
      showLoading: false
    }).pipe(
      map(this.unwrapData),
      tap(result => this.patchState(request.contractId, { lastState: result.newState }))
    );
  }

  sign(request: ProtectionSignRequest): Observable<{ success: boolean; newState: ProtectionState }> {
    if (environment.features.enableMockData) {
      return this.mock.sign(request).pipe(
        tap(result => this.patchState(request.contractId, {
          lastState: result.newState,
          lastPlan: this.updatePlanSignature(request.contractId, request)
        }))
      );
    }

    return this.http.post<{ success: boolean; newState: ProtectionState }>('protection/sign', request, {
      showLoading: false
    }).pipe(
      map(this.unwrapData),
      tap(result => this.patchState(request.contractId, {
        lastState: result.newState,
        lastPlan: this.updatePlanSignature(request.contractId, request)
      }))
    );
  }

  apply(request: ProtectionApplicationRequest): Observable<ProtectionApplicationResponse> {
    if (environment.features.enableMockData) {
      return this.mock.apply(request).pipe(
        tap(response => this.patchState(request.contractId, {
          lastState: 'APPLIED',
          lastPlan: this.updatePlanApplication(request.contractId, response)
        }))
      );
    }

    return this.http.post<ProtectionApplicationResponse>('protection/apply', request, {
      showLoading: false
    }).pipe(
      map(this.unwrapData),
      tap(response => this.patchState(request.contractId, {
        lastState: 'APPLIED',
        lastPlan: this.updatePlanApplication(request.contractId, response)
      }))
    );
  }

  expire(contractId: string): Observable<{ success: boolean; newState: ProtectionState }> {
    if (environment.features.enableMockData) {
      return this.mock.expire(contractId).pipe(
        tap(result => this.patchState(contractId, { lastState: result.newState }))
      );
    }

    return this.http.post<{ success: boolean; newState: ProtectionState }>('protection/expire', { contractId }, {
      showLoading: false
    }).pipe(
      map(this.unwrapData),
      tap(result => this.patchState(contractId, { lastState: result.newState }))
    );
  }

  triggerHealthEvent(event: HealthTriggerEvent): Observable<{
    triggered: boolean;
    contractId: string;
    newState?: ProtectionState;
    reason: string;
  }> {
    if (environment.features.enableMockData) {
      return this.mock.triggerHealthEvent(event);
    }

    return this.http.post<{
      triggered: boolean;
      contractId: string;
      newState?: ProtectionState;
      reason: string;
    }>('health/events', event, {
      showLoading: false
    }).pipe(map(this.unwrapData));
  }

  getUsageHistory(contractId: string): Observable<Array<{
    type: string;
    appliedAt: string;
    duration: number;
    paymentChange: number;
    status: 'completed' | 'active' | 'cancelled';
  }>> {
    if (environment.features.enableMockData) {
      return this.mock.getUsageHistory(contractId);
    }

    return this.http.get<Array<{
      type: string;
      appliedAt: string;
      duration: number;
      paymentChange: number;
      status: 'completed' | 'active' | 'cancelled';
    }>>(`protection/history/${contractId}`, {
      showLoading: false
    }).pipe(map(this.unwrapData));
  }

  getPolicyLimits(contractType: string, market: string): Observable<{
    difMax: number;
    extendMax: number;
    stepDownMaxPct: number;
    irrMin: number;
    mMin: number;
    annual: {
      maxRestructures: number;
      resetDate: string;
    };
  }> {
    if (environment.features.enableMockData) {
      return this.mock.getPolicyLimits(contractType, market);
    }

    return this.http.get<{
      difMax: number;
      extendMax: number;
      stepDownMaxPct: number;
      irrMin: number;
      mMin: number;
      annual: {
        maxRestructures: number;
        resetDate: string;
      };
    }>(`protection/policy-limits`, {
      params: { contractType, market },
      showLoading: false
    }).pipe(map(this.unwrapData));
  }

  checkEligibility(contractId: string): Observable<{
    isEligible: boolean;
    reasons: string[];
    nextEligibilityDate?: string;
    usageRemaining: {
      defer: number;
      stepdown: number;
      recalendar: number;
      collective: number;
    };
    healthScore?: number;
    riskFactors?: string[];
  }> {
    if (environment.features.enableMockData) {
      return this.mock.checkEligibility(contractId);
    }

    return this.http.get<{
      isEligible: boolean;
      reasons: string[];
      nextEligibilityDate?: string;
      usageRemaining: {
        defer: number;
        stepdown: number;
        recalendar: number;
        collective: number;
      };
      healthScore?: number;
      riskFactors?: string[];
    }>(`protection/eligibility/${contractId}`, {
      showLoading: false
    }).pipe(map(this.unwrapData));
  }

  getMifielSigningUrl(contractId: string, scenarioType: string): Observable<{
    signingUrl: string;
    sessionId: string;
    documentId: string;
    expiresAt: string;
  }> {
    if (environment.features.enableMockData) {
      return this.mock.getMifielSigningUrl(contractId, scenarioType);
    }

    return this.http.post<{
      signingUrl: string;
      sessionId: string;
      documentId: string;
      expiresAt: string;
    }>('protection/mifiel/create', {
      contractId,
      scenarioType
    }, {
      showLoading: false
    }).pipe(map(this.unwrapData));
  }

  validateScenario(contractId: string, scenario: ProtectionScenario): Observable<{
    isValid: boolean;
    warnings: string[];
    errors: string[];
    adjustedScenario?: ProtectionScenario;
  }> {
    if (environment.features.enableMockData) {
      return this.mock.validateScenario(contractId, scenario);
    }

    return this.http.post<{
      isValid: boolean;
      warnings: string[];
      errors: string[];
      adjustedScenario?: ProtectionScenario;
    }>('protection/validate', {
      contractId,
      scenario
    }, {
      showLoading: false
    }).pipe(map(this.unwrapData));
  }

  getNotifications(clientId: string): Observable<Array<{
    id: string;
    type: 'eligible' | 'approved' | 'ready_to_sign' | 'applied' | 'expired';
    contractId: string;
    message: string;
    actionUrl?: string;
    createdAt: string;
    read: boolean;
  }>> {
    if (environment.features.enableMockData) {
      return this.mock.getNotifications(clientId);
    }

    return this.http.get<Array<{
      id: string;
      type: 'eligible' | 'approved' | 'ready_to_sign' | 'applied' | 'expired';
      contractId: string;
      message: string;
      actionUrl?: string;
      createdAt: string;
      read: boolean;
    }>>(`protection/notifications/${clientId}`, {
      showLoading: false
    }).pipe(map(this.unwrapData));
  }

  markNotificationRead(notificationId: string): Observable<{ success: boolean }> {
    if (environment.features.enableMockData) {
      return this.mock.markNotificationRead(notificationId);
    }

    return this.http.patch<{ success: boolean }>(`protection/notifications/${notificationId}`, {
      read: true
    }, {
      showLoading: false
    }).pipe(map(this.unwrapData));
  }

  clearCache(contractId?: string): void {
    if (contractId) {
      const next = { ...this.state() };
      delete next[contractId];
      this.stateSignal.set(next);
      return;
    }
    this.stateSignal.set({});
  }

  private unwrapData = <T>(response: ApiResponse<T>): T => {
    if (!response || response.success === false) {
      throw new Error(response?.error || 'Solicitud a protección fallida');
    }
    return response.data as T;
  };

  private patchState(contractId: string, partial: ProtectionStateSnapshot): void {
    const current = this.stateSignal()[contractId] ?? {};
    this.stateSignal.set({
      ...this.stateSignal(),
      [contractId]: {
        ...current,
        ...partial
      }
    });
  }

  private updatePlanSelectedScenario(contractId: string, scenario: ProtectionScenario, newState: ProtectionState): ProtectionPlan | null {
    const currentPlan = this.state()[contractId]?.lastPlan;
    if (!currentPlan) {
      return null;
    }

    return {
      ...currentPlan,
      selected: scenario,
      state: newState
    };
  }

  private updatePlanSignature(contractId: string, request: ProtectionSignRequest): ProtectionPlan | null {
    const currentPlan = this.state()[contractId]?.lastPlan;
    if (!currentPlan) {
      return null;
    }

    return {
      ...currentPlan,
      state: 'SIGNED',
      mifielSessionId: request.mifielSessionId,
      signedDocumentUrl: request.signedDocumentUrl,
      audit: {
        ...currentPlan.audit,
        updatedAt: new Date().toISOString()
      }
    };
  }

  private updatePlanApplication(contractId: string, response: ProtectionApplicationResponse): ProtectionPlan | null {
    const currentPlan = this.state()[contractId]?.lastPlan;
    if (!currentPlan) {
      return null;
    }

    return {
      ...currentPlan,
      state: 'APPLIED',
      newPaymentSchedule: response.newSchedule,
      audit: {
        ...currentPlan.audit,
        updatedAt: new Date().toISOString()
      }
    };
  }
}
