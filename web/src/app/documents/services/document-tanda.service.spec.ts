import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { DocumentTandaService } from './document-tanda.service';
import { MarketPolicyService, TandaPolicyMetadata } from '@feature-services/configuration/market-policy.service';
import { TandaValidationService } from '@feature-services/tanda/tanda-validation.service';
import { FlowContext } from '../types/document-upload.models';
import { BusinessFlow } from '@interfaces/types';

describe('DocumentTandaService', () => {
  let service: DocumentTandaService;
  let marketPolicy: jasmine.SpyObj<MarketPolicyService>;
  let tandaValidation: jasmine.SpyObj<TandaValidationService>;

  beforeEach(() => {
    marketPolicy = jasmine.createSpyObj<MarketPolicyService>('MarketPolicyService', ['getPolicyMetadata']);
    tandaValidation = jasmine.createSpyObj<TandaValidationService>(
      'TandaValidationService',
      ['validate', 'syncRoster'],
      {
        current: null,
        state$: of(null)
      }
    );

    TestBed.configureTestingModule({
      providers: [
        DocumentTandaService,
        { provide: MarketPolicyService, useValue: marketPolicy },
        { provide: TandaValidationService, useValue: tandaValidation }
      ]
    });

    service = TestBed.inject(DocumentTandaService);
  });

  it('hydrates and dismisses banner state', () => {
    service.hydrate({ bannerDismissed: true, contribution: 123 });
    expect(service.tandaState().bannerDismissed).toBeTrue();
    expect(service.tandaState().contribution).toBe(123);

    service.dismissBanner();
    expect(service.tandaState().bannerDismissed).toBeTrue();
  });

  it('updates rules and validation snapshots', () => {
    const rules: TandaPolicyMetadata = {
      minMembers: 2,
      maxMembers: 10,
      minContribution: 1000,
      maxContribution: 2000,
      minRounds: 6,
      maxRounds: 12
    } as any;

    service.updateRules(rules);
    expect(service.tandaState().rules).toBe(rules);

    const validation: any = { validationId: 'abc', status: 'processing' };
    service.setValidation(validation);
    expect(service.tandaState().validation).toBe(validation);
  });

  it('builds config for collective flow', () => {
    const rules: TandaPolicyMetadata = {
      minMembers: 3,
      maxMembers: 12,
      minContribution: 500,
      maxContribution: 1500,
      minRounds: 4,
      maxRounds: 10
    } as any;

    marketPolicy.getPolicyMetadata.and.returnValue({ tanda: rules } as any);

    const flowContext: FlowContext = {
      source: 'nueva-oportunidad',
      market: 'edomex',
      businessFlow: BusinessFlow.CreditoColectivo,
      clientType: 'colectivo',
      saleType: 'financiero',
      policyContext: {
        metadata: { tanda: rules }
      } as any,
      simulatorData: { groupContribution: 800 },
      protection: null,
      contract: null
    };

    const config = service.buildConfig(flowContext);

    expect(config).not.toBeNull();
    expect(config?.members).toBeDefined();
    expect(service.tandaState().rules).toEqual(rules);
  });

  it('returns null config for non-collective flow', () => {
    const flowContext: FlowContext = {
      source: 'nueva-oportunidad',
      market: 'edomex',
      businessFlow: BusinessFlow.VentaPlazo,
      clientType: 'individual',
      protection: null,
      contract: null
    };

    const config = service.buildConfig(flowContext);
    expect(config).toBeNull();
  });
});
