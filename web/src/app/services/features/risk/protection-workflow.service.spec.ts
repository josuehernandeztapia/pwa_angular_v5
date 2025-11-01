import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { ToastService } from '@core-services/toast.service';
import { AnalyticsService } from '@core-services/analytics.service';
import { MonitoringService } from '@core-services/monitoring.service';
import { FlowContextService } from '@core-services/flow-context.service';
import {
  ProtectionPlan,
  ProtectionSimulateResponse,
  ProtectionScenario
} from '@interfaces/protection';
import { ProtectionService } from '@feature-services/risk/protection.service';
import { ProtectionWorkflowService } from './protection-workflow.service';
import { ProtectionApiService } from '@data-access/protection/protection-api.service';
import { environment } from '@environments/environment';

class ToastServiceStub {
  success = jasmine.createSpy('success');
  error = jasmine.createSpy('error');
  info = jasmine.createSpy('info');
}

class AnalyticsServiceStub {
  track = jasmine.createSpy('track');
  metric = jasmine.createSpy('metric');
}

class MonitoringServiceStub {
  captureInfo = jasmine.createSpy('captureInfo');
  captureWarning = jasmine.createSpy('captureWarning');
  captureError = jasmine.createSpy('captureError');
}

class FlowContextServiceStub {
  saveContext = jasmine.createSpy('saveContext');
}

class ProtectionServiceStub {
  planResponse: ProtectionPlan;
  simulationResponse: ProtectionSimulateResponse;

  constructor() {
    const now = new Date().toISOString();
    this.planResponse = {
      contractId: 'CT-1',
      clientId: 'CL-1',
      state: 'IDLE',
      scenarios: [],
      policy: { difMax: 0, extendMax: 0, stepDownMaxPct: 0, irrMin: 0, mMin: 0 },
      used: { defer: 0, stepdown: 0, recalendar: 0, collective: 0 },
      audit: { createdAt: now, updatedAt: now }
    };

    this.simulationResponse = {
      scenarios: [
        {
          type: 'DEFER',
          params: {},
          id: 'sim-1',
          title: 'Escenario diferimiento',
          score: 82
        }
      ],
      eligibilityCheck: {
        isEligible: true,
        reason: 'Cliente elegible para diferimiento',
        usageRemaining: { defer: 1, stepdown: 0, recalendar: 0, collective: 0 }
      }
    };
  }

  getPlan = jasmine.createSpy('getPlan').and.callFake(() => of(this.planResponse));
  simulate = jasmine.createSpy('simulate').and.callFake(() => of(this.simulationResponse));
  select = jasmine.createSpy('select').and.returnValue(of({ success: true, newState: 'PENDING_APPROVAL' }));
  approve = jasmine.createSpy('approve').and.returnValue(of({ success: true, newState: 'READY_TO_SIGN' }));
  apply = jasmine.createSpy('apply').and.returnValue(of({ success: true, newSchedule: [] }));
  deny = jasmine.createSpy('deny').and.returnValue(of({ success: true, newState: 'REJECTED' }));
  sign = jasmine.createSpy('sign').and.returnValue(of({ success: true, newState: 'SIGNED' }));
  triggerHealthEvent = jasmine.createSpy('triggerHealthEvent').and.returnValue(of({
    triggered: false,
    contractId: 'CT-1',
    reason: 'Sin cambios'
  }));
  getMifielSigningUrl = jasmine.createSpy('getMifielSigningUrl').and.returnValue(of({
    signingUrl: 'https://example.com',
    sessionId: 'session-1',
    documentId: 'doc-1',
    expiresAt: new Date().toISOString()
  }));
}

describe('ProtectionWorkflowService', () => {
  let service: ProtectionWorkflowService;
  let protectionStub: ProtectionServiceStub;
  let toastStub: ToastServiceStub;
  let originalMockFlag: boolean;

  beforeEach(() => {
    protectionStub = new ProtectionServiceStub();
    toastStub = new ToastServiceStub();
    originalMockFlag = environment.features.enableMockData;
    environment.features.enableMockData = false;

    TestBed.configureTestingModule({
      providers: [
        ProtectionWorkflowService,
        { provide: ProtectionService, useValue: protectionStub },
        { provide: ProtectionApiService, useValue: null },
        { provide: ToastService, useValue: toastStub },
        { provide: AnalyticsService, useClass: AnalyticsServiceStub },
        { provide: MonitoringService, useClass: MonitoringServiceStub },
        { provide: FlowContextService, useClass: FlowContextServiceStub }
      ]
    });

    service = TestBed.inject(ProtectionWorkflowService);
  });

  afterEach(() => {
    environment.features.enableMockData = originalMockFlag;
  });

  it('loads protection plan and exposes it through signal', () => {
    service.loadPlan('CT-1');

    expect(protectionStub.getPlan).toHaveBeenCalledWith('CT-1');
    expect(service.currentPlan()).toEqual(protectionStub.planResponse);
    expect(service.currentState()).toBe('IDLE');
  });

  it('simulates scenarios and moves plan to ELIGIBLE selecting the first scenario', () => {
    service.loadPlan('CT-1');
    service.simulateScenarios('CT-1', 12, { triggerReason: undefined });

    expect(protectionStub.simulate).toHaveBeenCalled();
    expect(service.currentState()).toBe('ELIGIBLE');
    expect(service.availableScenarios().length).toBe(1);
    expect(service.selectedScenario()).toEqual(protectionStub.simulationResponse.scenarios[0]);
    expect(toastStub.success).toHaveBeenCalledWith('1 opciones de protección disponibles');
  });

  it('executes selection, approval and application transitions', () => {
    service.loadPlan('CT-1');
    service.simulateScenarios('CT-1', 12, { triggerReason: undefined });

    const scenario = service.availableScenarios()[0] as ProtectionScenario;
    service.selectScenario('CT-1', scenario);
    expect(service.currentState()).toBe('PENDING_APPROVAL');

    service.approveScenario('CT-1', 'advisor-qa');
    expect(service.currentState()).toBe('READY_TO_SIGN');

    service.applySelectedScenario('CT-1');
    expect(service.currentState()).toBe('APPLIED');
    expect(toastStub.success).toHaveBeenCalledWith('¡Protección aplicada exitosamente!');
  });
});
