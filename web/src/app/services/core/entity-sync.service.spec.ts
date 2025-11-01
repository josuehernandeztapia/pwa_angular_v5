import { EntitySyncService } from './entity-sync.service';
import { ClientDataService } from '@feature-services/clients/client-data.service';
import { DashboardService } from '@feature-services/dashboard/dashboard.service';
import { GlobalSearchService } from './global-search.service';
import { Actor, BusinessFlow, Client, EventLog, EventType } from '@interfaces/types';
import { environment } from '@environments/environment';
import { PolicyMarket } from '@feature-services/configuration/market-policy.service';

describe('EntitySyncService', () => {
  let service: EntitySyncService;
  let dashboard: jasmine.SpyObj<DashboardService>;
  let globalSearch: jasmine.SpyObj<GlobalSearchService>;
  const originalDemoFlag = environment.features.enableMockData;

  beforeEach(() => {
    const clientData = {} as ClientDataService;

    dashboard = jasmine.createSpyObj<DashboardService>('DashboardService', [
      'addActivity',
      'addOpportunityToPipeline',
      'moveOpportunityStage'
    ]);

    globalSearch = jasmine.createSpyObj<GlobalSearchService>('GlobalSearchService', ['recordRecent']);

    service = new EntitySyncService(clientData, dashboard, globalSearch);
    environment.features.enableMockData = false;
  });

  afterEach(() => {
    dashboard.addActivity.calls.reset();
    globalSearch.recordRecent.calls.reset();
    environment.features.enableMockData = originalDemoFlag;
  });

  function buildClient(overrides: Partial<Client> = {}): Client {
    return {
      id: 'client-1',
      name: 'Juan Pérez',
      flow: BusinessFlow.VentaPlazo,
      status: 'Nuevo',
      documents: [],
      events: [],
      ...overrides
    };
  }

  function buildEvent(overrides: Partial<EventLog> = {}): EventLog {
    return {
      id: 'evt-1',
      timestamp: new Date(),
      message: 'Evento de prueba',
      actor: Actor.Asesor,
      type: EventType.AdvisorAction,
      ...overrides
    };
  }

  it('should push activity and recent when a client is updated', () => {
    const client = buildClient({ status: 'Aprobado', market: 'edomex' });

    service.recordClientUpdated(client, { status: 'Aprobado' });

    expect(dashboard.addActivity).toHaveBeenCalledWith(jasmine.objectContaining({
      type: 'client_updated',
      clientName: 'Juan Pérez'
    }));

    expect(globalSearch.recordRecent).toHaveBeenCalledWith(jasmine.objectContaining({
      id: `client-${client.id}`,
      label: client.name
    }));
  });

  it('should map client timeline events to dashboard activities', () => {
    const client = buildClient({ market: 'aguascalientes' });
    const event = buildEvent({
      type: EventType.Contribution,
      details: { amount: 5000, currency: 'MXN' }
    });

    service.recordClientEvent(client, event);

    expect(dashboard.addActivity).toHaveBeenCalledWith(jasmine.objectContaining({
      type: 'payment_received',
      amount: 5000,
      clientName: client.name
    }));

    expect(globalSearch.recordRecent).toHaveBeenCalled();
  });

  it('records document completion metrics and moves pipeline when completed', () => {
    service.recordDocumentCompletion({
      clientId: 'client-1',
      clientName: 'Juan Pérez',
      market: 'edomex' as PolicyMarket,
      businessFlow: BusinessFlow.VentaPlazo,
      validatedDocs: 5,
      pendingDocs: 0,
      totalDocs: 5
    });

    expect(dashboard.addActivity).toHaveBeenCalledWith(jasmine.objectContaining({
      type: 'doc_approved',
      clientName: 'Juan Pérez'
    }));
    expect(dashboard.moveOpportunityStage).toHaveBeenCalledWith('edomex', 'client-1', 'Aprobado');
    expect(globalSearch.recordRecent).toHaveBeenCalledWith(jasmine.objectContaining({
      id: 'documents-client-1',
      origin: 'real'
    }));
  });

  it('queues document follow up when there are pending docs', () => {
    service.recordDocumentCompletion({
      clientId: 'client-2',
      clientName: 'Ana López',
      market: 'aguascalientes' as PolicyMarket,
      businessFlow: BusinessFlow.VentaPlazo,
      validatedDocs: 3,
      pendingDocs: 2,
      totalDocs: 5
    });

    expect(dashboard.addOpportunityToPipeline).toHaveBeenCalledWith('aguascalientes', 'Expediente en Proceso', 'client-2');
  });

  it('records AVI completion and moves stage', () => {
    service.recordAviStatus({
      clientId: 'client-3',
      clientName: 'Carlos',
      market: 'edomex' as PolicyMarket,
      businessFlow: BusinessFlow.VentaPlazo,
      status: 'completed',
      complianceScore: 92,
      sessionId: 'avi-1',
      durationSeconds: 180
    });

    expect(dashboard.addActivity).toHaveBeenCalledWith(jasmine.objectContaining({
      type: 'avi_completed',
      clientName: 'Carlos'
    }));
    expect(dashboard.moveOpportunityStage).toHaveBeenCalledWith('edomex', 'client-3', 'Expediente en Proceso');
    expect(globalSearch.recordRecent).toHaveBeenCalledWith(jasmine.objectContaining({
      id: 'avi-client-3',
      origin: 'real'
    }));
  });

  it('records post sale evidence in activity and search', () => {
    service.recordPostSaleEvidence({
      clientId: 'client-4',
      clientName: 'Post Venta',
      photosUploaded: 4,
      requiredPhotos: 4,
      suggestionsGenerated: 2,
      quoteId: 'quote-123'
    });

    expect(dashboard.addActivity).toHaveBeenCalledWith(jasmine.objectContaining({
      type: 'post_sale_evidence',
      clientName: 'Post Venta'
    }));
    expect(globalSearch.recordRecent).toHaveBeenCalledWith(jasmine.objectContaining({
      id: 'postventa-client-4',
      origin: 'real'
    }));
  });

  it('decorates client updates with highlights', () => {
    const client = buildClient({ id: 'client-5', name: 'María' });

    service.recordClientUpdate({
      client,
      updates: { status: 'Aprobado', market: 'edomex' as PolicyMarket },
      collectedDocuments: 4,
      pendingDocuments: 1
    });

    expect(dashboard.addActivity).toHaveBeenCalledWith(jasmine.objectContaining({
      message: jasmine.stringMatching('docs: 4/5'),
      clientName: 'María'
    }));
  });
});
