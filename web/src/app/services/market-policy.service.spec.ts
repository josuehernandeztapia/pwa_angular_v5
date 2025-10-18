import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';

import {
  MarketPolicyService,
  RemoteMarketPolicyConfig,
  MarketPolicyContext
} from '@feature-services/configuration/market-policy.service';
import { HttpClientService } from '@core-services/http-client.service';
import { ConfigurationService } from '@core-services/configuration.service';
import { BusinessFlow } from '@interfaces/types';

class HttpClientServiceStub {
  lastPut?: { url: string; body: any; options?: any };
  response$ = of({});

  put(url: string, body: any, options?: any) {
    this.lastPut = { url, body, options };
    return this.response$;
  }
}

class ConfigurationServiceStub {
  response: any = {};

  loadNamespace<T>(_namespace: string, _fallback: T) {
    return of(this.response as T);
  }
}

describe('MarketPolicyService', () => {
  let service: MarketPolicyService;
  let http: HttpClientServiceStub;
  let configuration: ConfigurationServiceStub;

  const baseContext: MarketPolicyContext = {
    market: 'aguascalientes',
    clientType: 'individual',
    saleType: 'financiero',
    businessFlow: BusinessFlow.VentaPlazo,
  };

  beforeEach(() => {
    http = new HttpClientServiceStub();
    configuration = new ConfigurationServiceStub();

    TestBed.configureTestingModule({
      providers: [
        MarketPolicyService,
        { provide: HttpClientService, useValue: http },
        { provide: ConfigurationService, useValue: configuration }
      ]
    });

    service = TestBed.inject(MarketPolicyService);
  });

  function expectSnapshot(config: RemoteMarketPolicyConfig): void {
    expect(service.getRemoteConfigSnapshot()).toEqual(config);
    expect(typeof service.getRemoteConfigUpdatedAt()).toBe('number');
  }

  it('persists remote policies via HttpClientService and updates in-memory cache', async () => {
    const remoteConfig: RemoteMarketPolicyConfig = {
      ags: {
        documents: [
          { id: 'doc-updated', label: 'Documento Actualizado', optional: false },
          { id: 'doc-income', label: 'Comprobante de ingresos', optional: false }
        ],
        metadata: {
          ocrThreshold: 0.91,
          expiryRules: {
            'doc-updated': '<= 45d'
          }
        }
      }
    };

    await firstValueFrom(service.savePoliciesToRemote(remoteConfig));

    expect(http.lastPut?.url).toBe('config/market-policies');
    expect(http.lastPut?.body).toEqual(remoteConfig);

    expectSnapshot(remoteConfig);

    const result = service.getPolicyDocuments(baseContext);
    expect(result.documents.map(doc => doc.id)).toEqual(['doc-updated', 'doc-income']);
    expect(result.metadata.ocrThreshold).toBe(0.91);
  });

  it('registers policies provided by remote configuration', () => {
    const remoteConfig: RemoteMarketPolicyConfig = {
      'edomex-individual': {
        documents: [
          { id: 'doc-remoto', label: 'Documento Remoto', optional: true }
        ],
        metadata: {
          ocrThreshold: 0.9
        }
      }
    };

    service.registerPoliciesFromRemoteConfig(remoteConfig);

    expectSnapshot(remoteConfig);

    const context: MarketPolicyContext = {
      ...baseContext,
      market: 'edomex'
    };

    const result = service.getPolicyDocuments(context);
    expect(result.documents.map(doc => doc.id)).toEqual(['doc-remoto']);
    expect(result.metadata.ocrThreshold).toBe(0.9);
  });

  it('maps unknown remote keys to default market and preserves snapshot', () => {
    const remoteConfig: RemoteMarketPolicyConfig = {
      'custom-market': {
        documents: [
          { id: 'doc-x', label: 'Doc X', optional: true }
        ],
        metadata: {
          ocrThreshold: 0.7
        }
      }
    };

    service.registerPoliciesFromRemoteConfig(remoteConfig);

    expectSnapshot(remoteConfig);

    const result = service.getPolicyDocuments({
      market: 'otros',
      clientType: 'individual',
      saleType: 'contado'
    });

    expect(result.documents.map(doc => doc.id)).toEqual(['doc-x']);
    expect(result.metadata.ocrThreshold).toBe(0.7);
  });
});
