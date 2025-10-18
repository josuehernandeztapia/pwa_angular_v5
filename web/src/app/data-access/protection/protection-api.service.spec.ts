import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { ProtectionApiService } from './protection-api.service';
import { HttpClientService, ApiResponse } from '@core-services/http-client.service';
import { ProtectionMockAdapter } from '@internal-services/mock-adapters/protection-mock.adapter';
import {
  ProtectionApplicationRequest,
  ProtectionApplicationResponse,
  ProtectionPlan,
  ProtectionSimulateRequest,
  ProtectionSimulateResponse,
  ProtectionState
} from '@interfaces/protection';
import { environment } from '@environments/environment';

describe('ProtectionApiService', () => {
  let service: ProtectionApiService;
  let http: jasmine.SpyObj<HttpClientService>;
  let mockAdapter: jasmine.SpyObj<ProtectionMockAdapter>;
  const contractId = 'ctr-123';
  const originalMockFlag = environment.features.enableMockData;

  beforeEach(() => {
    http = jasmine.createSpyObj<HttpClientService>('HttpClientService', ['get', 'post', 'patch']);
    mockAdapter = jasmine.createSpyObj<ProtectionMockAdapter>('ProtectionMockAdapter', [
      'getPlan',
      'simulate',
      'select',
      'approve',
      'deny',
      'sign',
      'apply',
      'expire',
      'triggerHealthEvent',
      'checkEligibility',
      'getMifielSigningUrl',
      'validateScenario',
      'getNotifications',
      'markNotificationRead',
      'getUsageHistory',
      'getPolicyLimits'
    ]);

    TestBed.configureTestingModule({
      providers: [
        ProtectionApiService,
        { provide: HttpClientService, useValue: http },
        { provide: ProtectionMockAdapter, useValue: mockAdapter }
      ]
    });

    service = TestBed.inject(ProtectionApiService);
  });

  afterEach(() => {
    environment.features.enableMockData = originalMockFlag;
    service.clearCache();
  });

  it('caches plan responses in mock mode', done => {
    environment.features.enableMockData = true;
    const plan = { contractId, clientId: 'cli-1', state: 'ELIGIBLE' } as ProtectionPlan;
    mockAdapter.getPlan.and.returnValue(of(plan));

    service.getPlan(contractId).subscribe(result => {
      expect(result).toBe(plan);
      expect(service.plans()[contractId]).toEqual(plan);
      done();
    });
  });

  it('delegates simulate to HTTP when mock disabled', done => {
    environment.features.enableMockData = false;
    const response: ApiResponse<ProtectionSimulateResponse> = {
      success: true,
      data: { scenarios: [], eligibilityCheck: { isEligible: true, reason: '', usageRemaining: { defer: 0, stepdown: 0, recalendar: 0, collective: 0 } } }
    };
    http.post.and.returnValue(of(response));

    service.simulate({ contractId, monthK: 12, options: {} } as ProtectionSimulateRequest).subscribe(result => {
      expect(http.post).toHaveBeenCalledWith('protection/simulate', jasmine.any(Object), jasmine.any(Object));
      expect(result).toEqual(response.data!);
      done();
    });
  });

  it('updates cached plan when applying protection in mock mode', done => {
    environment.features.enableMockData = true;
    const plan = { contractId, clientId: 'cli-1', state: 'ELIGIBLE' } as ProtectionPlan;
    mockAdapter.getPlan.and.returnValue(of(plan));
    mockAdapter.apply.and.callFake((request: ProtectionApplicationRequest) => {
      const payload: ProtectionApplicationResponse = {
        success: true,
        newSchedule: [],
        notifications: { email: true, push: false, whatsapp: true }
      };
      return of(payload);
    });

    service.getPlan(contractId).subscribe(() => {
      service.apply({ contractId } as ProtectionApplicationRequest).subscribe(result => {
        expect(result.success).toBeTrue();
        const cached = service.plans()[contractId];
        expect(cached?.state).toBe('APPLIED');
        done();
      });
    });
  });

  it('persists last state from select flow in HTTP mode', done => {
    environment.features.enableMockData = false;
    const apiResponse: ApiResponse<{ success: boolean; newState: ProtectionState }> = {
      success: true,
      data: { success: true, newState: 'PENDING_APPROVAL' }
    };
    http.post.and.returnValue(of(apiResponse));

    service.select({ contractId, scenario: { id: 'scn', type: 'DEFER', params: {} } as any }).subscribe(result => {
      expect(result.newState).toBe('PENDING_APPROVAL');
      expect(service.state()[contractId]?.lastState).toBe('PENDING_APPROVAL');
      done();
    });
  });

  it('delegates eligibility check to mock adapter when enabled', done => {
    environment.features.enableMockData = true;
    const payload = {
      isEligible: true,
      reasons: [],
      usageRemaining: { defer: 1, stepdown: 1, recalendar: 1, collective: 1 }
    } as any;
    mockAdapter.checkEligibility.and.returnValue(of(payload));

    service.checkEligibility(contractId).subscribe(result => {
      expect(mockAdapter.checkEligibility).toHaveBeenCalledWith(contractId);
      expect(result.isEligible).toBeTrue();
      done();
    });
  });

  it('marks notification as read via HTTP when mock disabled', done => {
    environment.features.enableMockData = false;
    const response: ApiResponse<{ success: boolean }> = { success: true, data: { success: true } };
    http.patch.and.returnValue(of(response));

    service.markNotificationRead('notif-1').subscribe(result => {
      expect(http.patch).toHaveBeenCalledWith('protection/notifications/notif-1', { read: true }, jasmine.any(Object));
      expect(result.success).toBeTrue();
      done();
    });
  });
});
