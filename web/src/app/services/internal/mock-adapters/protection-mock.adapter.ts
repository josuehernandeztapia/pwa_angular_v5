import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';

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
  ProtectionState,
  ProtectionType
} from '@interfaces/protection';
import { MockUtilityAdapter } from './utility-mock.adapter';

interface PlanCacheEntry {
  plan: ProtectionPlan;
  updatedAt: number;
}

@Injectable({ providedIn: 'root' })
export class ProtectionMockAdapter {
  private readonly planCache = new Map<string, PlanCacheEntry>();

  constructor(private readonly mockUtils: MockUtilityAdapter) {}

  getPlan(contractId: string): Observable<ProtectionPlan> {
    const cached = this.planCache.get(contractId);
    if (cached) {
      return of(cached.plan);
    }

    const plan = this.buildMockPlan(contractId);
    this.planCache.set(contractId, { plan, updatedAt: Date.now() });
    return this.mockUtils.mockApi(plan, 400);
  }

  simulate(request: ProtectionSimulateRequest): Observable<ProtectionSimulateResponse> {
    const scenarios = this.buildMockScenarios(request.contractId, request.options.requestedType);
    const response: ProtectionSimulateResponse = {
      scenarios,
      eligibilityCheck: {
        isEligible: true,
        reason: 'Cliente con salud financiera estable',
        usageRemaining: {
          defer: 2,
          stepdown: 1,
          recalendar: 2,
          collective: 1
        }
      }
    };

    return this.mockUtils.mockApi(response, 500);
  }

  select(request: ProtectionSelectRequest): Observable<{ success: boolean; newState: ProtectionState }> {
    return this.mockUtils.mockApi({ success: true, newState: 'PENDING_APPROVAL' as ProtectionState }, 350).pipe(
      map(result => {
        this.patchPlan(request.contractId, plan => ({
          ...plan,
          selected: request.scenario,
          state: 'PENDING_APPROVAL'
        }));
        return result;
      })
    );
  }

  approve(_request: ProtectionApprovalRequest): Observable<{ success: boolean; newState: ProtectionState }> {
    return this.mockUtils.mockApi({ success: true, newState: 'READY_TO_SIGN' as ProtectionState }, 350);
  }

  deny(request: ProtectionDenialRequest): Observable<{ success: boolean; newState: ProtectionState }> {
    return this.mockUtils.mockApi({ success: true, newState: 'REJECTED' as ProtectionState }, 300).pipe(
      map(result => {
        this.patchPlan(request.contractId, plan => ({ ...plan, state: 'REJECTED' }));
        return result;
      })
    );
  }

  sign(request: ProtectionSignRequest): Observable<{ success: boolean; newState: ProtectionState }> {
    return this.mockUtils.mockApi({ success: true, newState: 'SIGNED' as ProtectionState }, 300).pipe(
      map(result => {
        this.patchPlan(request.contractId, plan => ({
          ...plan,
          state: 'SIGNED',
          audit: {
            ...plan.audit,
            updatedAt: new Date().toISOString()
          },
          mifielSessionId: request.mifielSessionId,
          signedDocumentUrl: request.signedDocumentUrl
        }));
        return result;
      })
    );
  }

  apply(request: ProtectionApplicationRequest): Observable<ProtectionApplicationResponse> {
    const schedule = Array.from({ length: 6 }, (_, index) => ({
      month: index + 1,
      payment: 8500 + index * 320,
      principal: 6500 + index * 280,
      interest: 2000 + index * 40,
      balance: 120000 - index * 7500
    }));

    const response: ProtectionApplicationResponse = {
      success: true,
      newSchedule: schedule,
      odooContractId: `OD-${request.contractId}`,
      neonTransactionId: `NEON-${Date.now()}`,
      notifications: {
        whatsapp: true,
        email: true,
        push: false
      }
    };

    return this.mockUtils.mockApi(response, 400).pipe(
      map(result => {
        this.patchPlan(request.contractId, plan => ({
          ...plan,
          state: 'APPLIED',
          newPaymentSchedule: result.newSchedule
        }));
        return result;
      })
    );
  }

  expire(contractId: string): Observable<{ success: boolean; newState: ProtectionState }> {
    return this.mockUtils.mockApi({ success: true, newState: 'EXPIRED' as ProtectionState }, 250).pipe(
      map(result => {
        this.patchPlan(contractId, plan => ({ ...plan, state: 'EXPIRED' }));
        return result;
      })
    );
  }

  triggerHealthEvent(event: HealthTriggerEvent): Observable<{
    triggered: boolean;
    contractId: string;
    newState?: ProtectionState;
    reason: string;
  }> {
    const triggered = event.type !== 'manual_request';
    return this.mockUtils.mockApi({
      triggered,
      contractId: event.contractId,
      newState: triggered ? 'ELIGIBLE' : undefined,
      reason: triggered ? 'Anomalía detectada en telemetría GNV' : 'Evento manual sin criterios suficientes'
    }, 280);
  }

  checkEligibility(_contractId: string): Observable<{
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
    return this.mockUtils.mockApi({
      isEligible: true,
      reasons: ['Historial de pagos estable', 'Saldo al corriente'],
      nextEligibilityDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      usageRemaining: {
        defer: 2,
        stepdown: 1,
        recalendar: 1,
        collective: 1
      },
      healthScore: 88,
      riskFactors: ['Downtime leve', 'Uso de combustibles']
    }, 260);
  }

  getMifielSigningUrl(contractId: string, scenarioType: string): Observable<{
    signingUrl: string;
    sessionId: string;
    documentId: string;
    expiresAt: string;
  }> {
    return this.mockUtils.mockApi({
      signingUrl: `https://demo.mifiel.com/sign/${contractId}/${scenarioType}`,
      sessionId: `session-${Date.now()}`,
      documentId: `doc-${contractId}`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    }, 240);
  }

  validateScenario(_contractId: string, scenario: ProtectionScenario): Observable<{
    isValid: boolean;
    warnings: string[];
    errors: string[];
    adjustedScenario?: ProtectionScenario;
  }> {
    const warnings: string[] = scenario.type === 'DEFER' ? ['Impacto en flujo de efectivo'] : [];
    return this.mockUtils.mockApi({
      isValid: true,
      warnings,
      errors: [],
      adjustedScenario: scenario
    }, 210);
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
    const notifications = [
      {
        id: `notif-${clientId}-1`,
        type: 'eligible' as const,
        contractId: `ctr-${clientId}`,
        message: 'Cliente elegible para protección. Simula escenarios para continuar.',
        actionUrl: `/proteccion/${clientId}`,
        createdAt: new Date().toISOString(),
        read: false
      }
    ];
    return this.mockUtils.mockApi(notifications, 180);
  }

  markNotificationRead(_notificationId: string): Observable<{ success: boolean }> {
    return this.mockUtils.mockApi({ success: true }, 160);
  }

  getUsageHistory(_contractId: string): Observable<Array<{
    type: string;
    appliedAt: string;
    duration: number;
    paymentChange: number;
    status: 'completed' | 'active' | 'cancelled';
  }>> {
    const history = [
      {
        type: 'DEFER',
        appliedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
        duration: 2,
        paymentChange: 0,
        status: 'completed' as const
      },
      {
        type: 'STEPDOWN',
        appliedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        duration: 1,
        paymentChange: -2500,
        status: 'active' as const
      }
    ];

    return this.mockUtils.mockApi(history, 220);
  }

  getPolicyLimits(_contractType: string, _market: string): Observable<{
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
    return this.mockUtils.mockApi({
      difMax: 3,
      extendMax: 6,
      stepDownMaxPct: 0.4,
      irrMin: 0.18,
      mMin: 5500,
      annual: {
        maxRestructures: 2,
        resetDate: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString()
      }
    }, 180);
  }

  /**
   * Reset cache (used by tests)
   */
  clear(): void {
    this.planCache.clear();
  }

  private patchPlan(contractId: string, updater: (plan: ProtectionPlan) => ProtectionPlan): void {
    const current = this.planCache.get(contractId)?.plan ?? this.buildMockPlan(contractId);
    const updated = updater(current);
    this.planCache.set(contractId, { plan: updated, updatedAt: Date.now() });
  }

  private buildMockPlan(contractId: string): ProtectionPlan {
    const scenarios = this.buildMockScenarios(contractId);
    return {
      contractId,
      clientId: `client-${contractId}`,
      state: 'ELIGIBLE',
      scenarios,
      policy: {
        difMax: 3,
        extendMax: 6,
        stepDownMaxPct: 0.45,
        irrMin: 0.2,
        mMin: 5500
      },
      used: {
        defer: 0,
        stepdown: 0,
        recalendar: 0,
        collective: 0
      },
      audit: {
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date().toISOString(),
        reason: 'Solicitud preventiva',
        triggeredBy: 'manual'
      },
      eligibilityReason: 'El cliente mantiene un historial positivo de pagos y alto puntaje de salud.',
      currentBalance: 245000,
      currentMonthlyPayment: 9800,
      remainingTerm: 24,
      nextEligibilityDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString()
    };
  }

  private buildMockScenarios(contractId: string, requested?: ProtectionType | ''): ProtectionScenario[] {
    const basePayment = 9800;
    const baseTerm = 24;

    const scenarios: ProtectionScenario[] = [
      {
        id: `${contractId}-defer`,
        type: 'DEFER',
        description: 'Diferir pagos por 2 meses y redistribuir saldo pendiente.',
        params: { months: 2, capitalizeInterest: true },
        impact: {
          paymentChange: 0,
          termChange: 2,
          totalCostChange: 4200
        },
        irr: 0.21,
        tirOK: true,
        newPayment: basePayment,
        newTerm: baseTerm + 2,
        score: 82,
        eligible: true
      },
      {
        id: `${contractId}-stepdown`,
        type: 'STEPDOWN',
        description: 'Reduce temporalmente el pago mensual en 30% y recupera al final.',
        params: { months: 1, reduction: 0.3 },
        impact: {
          paymentChange: -basePayment * 0.3,
          termChange: 0,
          totalCostChange: 2800
        },
        irr: 0.2,
        tirOK: true,
        newPayment: basePayment * 0.7,
        newTerm: baseTerm,
        score: 76,
        eligible: true
      },
      {
        id: `${contractId}-recalendar`,
        type: 'RECALENDAR',
        description: 'Extiende el plazo 4 meses conservando el pago actual.',
        params: { months: 4 },
        impact: {
          paymentChange: 0,
          termChange: 4,
          totalCostChange: 5100
        },
        irr: 0.195,
        tirOK: true,
        newPayment: basePayment,
        newTerm: baseTerm + 4,
        score: 70,
        eligible: true
      }
    ];

    if (requested) {
      return scenarios.filter(s => s.type === requested);
    }

    return scenarios;
  }
}
