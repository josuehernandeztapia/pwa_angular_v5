import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { StateManagementService } from './state-management.service';
import { ClientsApiService } from '@data-access/clients/clients-api.service';
import { DashboardApiService, DashboardStats } from '@data-access/dashboard/dashboard-api.service';
import { ScenariosApiService } from '@data-access/scenarios/scenarios-api.service';
import {
  Actor,
  BusinessFlow,
  Client,
  DocumentStatus,
  EventType
} from '@interfaces/types';

describe('StateManagementService', () => {
  let service: StateManagementService;
  let clientsApi: jasmine.SpyObj<ClientsApiService>;
  let dashboardApi: jasmine.SpyObj<DashboardApiService>;
  let scenariosApi: jasmine.SpyObj<ScenariosApiService>;

  const baseDashboardStats: DashboardStats = {
    clients: { total: 1, active: 1, new_this_month: 0 },
    ecosystems: { total: 0, active: 0, pending: 0 },
    groups: { total: 0, active: 0, units_delivered: 0 },
    recentActivity: []
  };

  beforeEach(() => {
    clientsApi = jasmine.createSpyObj<ClientsApiService>('ClientsApiService', [
      'getClients',
      'updateClient'
    ]);

    dashboardApi = jasmine.createSpyObj<DashboardApiService>('DashboardApiService', ['getStats']);
    scenariosApi = jasmine.createSpyObj<ScenariosApiService>('ScenariosApiService', [
      'createCotizacionScenario'
    ]);

    clientsApi.getClients.and.returnValue(of([]));
    clientsApi.updateClient.and.returnValue(of(makeClient({ status: 'Activo' })));
    dashboardApi.getStats.and.returnValue(of(baseDashboardStats));

    TestBed.configureTestingModule({
      providers: [
        StateManagementService,
        { provide: ClientsApiService, useValue: clientsApi },
        { provide: DashboardApiService, useValue: dashboardApi },
        { provide: ScenariosApiService, useValue: scenariosApi }
      ]
    });

    service = TestBed.inject(StateManagementService);
  });

  function makeClient(partial: Partial<Client> = {}): Client {
    return {
      id: 'client-1',
      name: 'Cliente de prueba',
      flow: BusinessFlow.VentaPlazo,
      status: 'Expediente Pendiente',
      documents: [
        { id: 'doc-1', name: 'INE', status: DocumentStatus.Pendiente }
      ],
      events: [
        {
          id: 'evt-1',
          timestamp: new Date('2024-01-01T00:00:00Z'),
          message: 'Evento inicial',
          actor: Actor.Asesor,
          type: EventType.AdvisorAction
        }
      ],
      ...partial
    } as Client;
  }

  it('updates reactive state when clients are fetched', () => {
    const client = makeClient();
    clientsApi.getClients.and.returnValue(of([client]));

    service.fetchClients().subscribe();

    expect(service.clients().length).toBe(1);
    expect(service.sidebarAlerts()['clientes']).toBe(1);
    expect(service.isLoading()).toBeFalse();
  });

  it('tracks simulation context when a new client is created', () => {
    const client = makeClient({ id: 'client-99', name: 'Nuevo cliente' });

    service.handleClientCreated(client, 'savings');

    expect(service.simulatingClient()).toEqual(client);
    expect(service.simulationMode()).toBe('savings');
    expect(service.activeView()).toBe('simulador');
  });

  it('resets state to initial snapshot', () => {
    service.setActiveView('clientes');
    service.setIsSidebarCollapsed(true);

    service.resetState();

    expect(service.activeView()).toBe('dashboard');
    expect(service.isSidebarCollapsed()).toBeFalse();
    expect(service.clients().length).toBe(0);
  });
});
