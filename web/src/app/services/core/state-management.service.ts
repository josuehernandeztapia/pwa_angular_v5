import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { EMPTY, Observable, interval, of, throwError } from 'rxjs';
import { catchError, finalize, map, switchMap, take, tap } from 'rxjs/operators';

import {
  Client,
  NavigationContext,
  Quote
} from '@interfaces/types';
import { NotificationBase } from '@interfaces/notification';
import { ClientsApiService } from '@data-access/clients/clients-api.service';
import { DashboardApiService, DashboardStats } from '@data-access/dashboard/dashboard-api.service';
import { ScenariosApiService } from '@data-access/scenarios/scenarios-api.service';

type View =
  | 'dashboard'
  | 'clientes'
  | 'simulador'
  | 'cotizador'
  | 'documentos'
  | 'configuracion'
  | string;

type SidebarAlertMap = Record<string, number | undefined>;

type AppNotification = NotificationBase;

interface ShellState {
  activeView: View;
  clients: Client[];
  selectedClient: Client | null;
  isLoading: boolean;
  notifications: AppNotification[];
  unreadCount: number;
  simulatingClient: Client | null;
  simulationMode: 'acquisition' | 'savings';
  sidebarAlerts: SidebarAlertMap;
  isSidebarCollapsed: boolean;
  isOpportunityModalOpen: boolean;
  navigationContext: NavigationContext | null;
}

const createInitialState = (): ShellState => ({
  activeView: 'dashboard',
  clients: [],
  selectedClient: null,
  isLoading: true,
  notifications: [],
  unreadCount: 0,
  simulatingClient: null,
  simulationMode: 'acquisition',
  sidebarAlerts: {},
  isSidebarCollapsed: false,
  isOpportunityModalOpen: false,
  navigationContext: null
});

@Injectable({
  providedIn: 'root'
})
export class StateManagementService {
  private readonly destroyRef = inject(DestroyRef);

  private readonly state = signal<ShellState>(createInitialState());

  readonly activeView = computed(() => this.state().activeView);
  readonly clients = computed(() => this.state().clients);
  readonly selectedClient = computed(() => this.state().selectedClient);
  readonly isLoading = computed(() => this.state().isLoading);
  readonly notifications = computed(() => this.state().notifications);
  readonly unreadCount = computed(() => this.state().unreadCount);
  readonly simulatingClient = computed(() => this.state().simulatingClient);
  readonly simulationMode = computed(() => this.state().simulationMode);
  readonly sidebarAlerts = computed(() => this.state().sidebarAlerts);
  readonly isSidebarCollapsed = computed(() => this.state().isSidebarCollapsed);
  readonly isOpportunityModalOpen = computed(() => this.state().isOpportunityModalOpen);
  readonly navigationContext = computed(() => this.state().navigationContext);

  readonly activeView$ = toObservable(this.activeView);
  readonly clients$ = toObservable(this.clients);
  readonly selectedClient$ = toObservable(this.selectedClient);
  readonly isLoading$ = toObservable(this.isLoading);
  readonly notifications$ = toObservable(this.notifications);
  readonly unreadCount$ = toObservable(this.unreadCount);
  readonly simulatingClient$ = toObservable(this.simulatingClient);
  readonly simulationMode$ = toObservable(this.simulationMode);
  readonly sidebarAlerts$ = toObservable(this.sidebarAlerts);
  readonly isSidebarCollapsed$ = toObservable(this.isSidebarCollapsed);
  readonly isOpportunityModalOpen$ = toObservable(this.isOpportunityModalOpen);
  readonly navigationContext$ = toObservable(this.navigationContext);

  constructor(
    private readonly clientsApi: ClientsApiService,
    private readonly dashboardApi: DashboardApiService,
    private readonly scenariosApi: ScenariosApiService
  ) {
    this.initializeState();
    this.startNotificationPolling();
  }

  /**
   * Trigger initial fetch with automatic subscription cleanup.
   */
  private initializeState(): void {
    this.fetchClients()
      .pipe(take(1), catchError(() => EMPTY))
      .subscribe();
  }

  private setState(patch: Partial<ShellState>): void {
    this.state.update(current => ({ ...current, ...patch }));
  }

  /**
   * Calculate sidebar alerts derived from client state.
   */
  private calculateSidebarAlerts(clients: Client[]): Observable<SidebarAlertMap> {
    if (!clients.length) {
      return of({});
    }

    return this.dashboardApi.getStats().pipe(
      map(stats => {
        const alerts: SidebarAlertMap = {};

        const pendingDocs = clients.filter(client =>
          client.status === 'Expediente Pendiente' ||
          client.documents?.some(doc => doc.status === 'Pendiente')
        ).length;

        const overduePayers = clients.filter(client =>
          client.paymentPlan &&
          (client.paymentPlan.currentMonthProgress ?? 0) < (client.paymentPlan.monthlyGoal ?? 0) * 0.8
        ).length;

        if (pendingDocs > 0) {
          alerts['clientes'] = pendingDocs;
        }
        if (overduePayers > 0) {
          alerts['oportunidades'] = overduePayers;
        }
        const ecosystemPending = Number(stats.ecosystems?.pending ?? 0);
        if (ecosystemPending > 0) {
          alerts['ecosistemas'] = ecosystemPending;
        }
        const activeGroups = Number(stats.groups?.active ?? 0);
        if (activeGroups > 0) {
          alerts['grupos-colectivos'] = activeGroups;
        }

        return alerts;
      }),
      catchError(() => of({}))
    );
  }

  /**
   * Fetch clients from API and update reactive state.
   */
  fetchClients(clientIdToSelect?: string): Observable<Client[]> {
    this.setState({ isLoading: true });

    return this.clientsApi.getClients().pipe(
      map(rawClients =>
        rawClients.map(client => ({
          ...client,
          events: client.events?.map(event => ({
            ...event,
            timestamp: new Date(event.timestamp as any)
          })) ?? []
        }))
      ),
      switchMap(clients =>
        this.calculateSidebarAlerts(clients).pipe(
          take(1),
          map(alerts => ({ clients, alerts }))
        )
      ),
      tap(({ clients, alerts }) => {
        const selectedClient = clientIdToSelect
          ? clients.find(client => client.id === clientIdToSelect) ?? null
          : this.state().selectedClient;

        this.setState({
          clients,
          sidebarAlerts: alerts,
          selectedClient
        });
      }),
      map(({ clients }) => clients),
      catchError(error => {
        return throwError(() => error);
      }),
      finalize(() => this.setState({ isLoading: false }))
    );
  }

  /**
   * Periodic notification polling with automatic teardown.
   */
  private startNotificationPolling(): void {
    interval(8000).pipe(
      takeUntilDestroyed(this.destroyRef),
      switchMap(() => this.clients$),
      switchMap(clients => {
        if (!clients.length) {
          return of<AppNotification | null>(null);
        }

        return this.dashboardApi.getStats().pipe(
          map(stats => this.buildSyntheticNotification(clients, stats)),
          catchError(() => of(null))
        );
      })
    ).subscribe(alert => {
      if (!alert) {
        return;
      }

      const notifications = [alert, ...this.state().notifications];
      this.setState({
        notifications,
        unreadCount: this.state().unreadCount + 1
      });
    });
  }

  private buildSyntheticNotification(clients: Client[], stats: DashboardStats): AppNotification | null {
    if (Math.random() <= 0.7) {
      return null;
    }

    const randomClient = clients[Math.floor(Math.random() * clients.length)];
    const messages = [
      `Nuevo cliente registrado: ${randomClient?.name}`,
      `Pago recibido de ${randomClient?.name}`,
      `Documentos aprobados para ${randomClient?.name}`,
      `Actualiza tu portafolio: ${stats.clients?.total ?? 0} activos`
    ];

    return {
      id: `notif-${Date.now()}`,
      type: 'info',
      title: 'Actividad del sistema',
      message: messages[Math.floor(Math.random() * messages.length)],
      timestamp: new Date(),
      clientId: randomClient?.id
    } as AppNotification;
  }

  /**
   * Synchronise state after a client update.
   */
  handleClientUpdate(updatedClient: Client): void {
    const sanitizedClient: Client = {
      ...updatedClient,
      events: updatedClient.events.map(event => ({
        ...event,
        timestamp: new Date(event.timestamp as any)
      }))
    };

    const clients = this.state().clients.map(client =>
      client.id === sanitizedClient.id ? sanitizedClient : client
    );

    this.setState({
      clients,
      selectedClient: sanitizedClient
    });

    this.calculateSidebarAlerts(clients)
      .pipe(take(1))
      .subscribe(alerts => this.setState({ sidebarAlerts: alerts }));
  }

  handleClientCreated(newClient: Client, mode: 'acquisition' | 'savings'): void {
    const clients = [...this.state().clients, newClient];

    this.setState({
      clients,
      simulatingClient: newClient,
      simulationMode: mode,
      activeView: 'simulador',
      selectedClient: null
    });

    this.calculateSidebarAlerts(clients)
      .pipe(take(1))
      .subscribe(alerts => this.setState({ sidebarAlerts: alerts }));
  }

  handleFormalize(quote: Quote): Observable<void> {
    const simulatingClient = this.state().simulatingClient;

    if (!simulatingClient) {
      throw new Error('No simulating client found');
    }

    return this.scenariosApi.createCotizacionScenario({
      clientName: simulatingClient.name,
      flow: simulatingClient.flow,
      market: simulatingClient.market ?? 'all'
    }).pipe(
      switchMap(() =>
        this.clientsApi.updateClient(simulatingClient.id, {
          status: 'Activo',
          healthScore: 85
        })
      ),
      switchMap(() => this.fetchClients(simulatingClient.id)),
      map(() => void 0)
    );
  }

  handleNotificationAction(notification: AppNotification): void {
    if (!notification.clientId) {
      return;
    }

    const client = this.state().clients.find(c => c.id === notification.clientId);
    if (!client) {
      return;
    }

    this.setState({
      selectedClient: client,
      simulatingClient: null,
      activeView: 'dashboard'
    });
  }

  handleMarkAsRead(): void {
    this.setState({ unreadCount: 0 });
  }

  handleSelectClient(client: Client | null, context?: NavigationContext): void {
    this.setState({
      selectedClient: client,
      navigationContext: context ?? null
    });
  }

  handleViewChange(view: View): void {
    this.setState({
      selectedClient: null,
      simulatingClient: null,
      navigationContext: null,
      activeView: view
    });
  }

  handleBackFromDetail(): void {
    this.setState({
      selectedClient: null,
      navigationContext: null
    });
  }

  setActiveView(view: View): void {
    this.setState({ activeView: view });
  }

  setSelectedClient(client: Client | null): void {
    this.setState({ selectedClient: client });
  }

  setSimulatingClient(client: Client | null): void {
    this.setState({ simulatingClient: client });
  }

  setSimulationMode(mode: 'acquisition' | 'savings'): void {
    this.setState({ simulationMode: mode });
  }

  setIsSidebarCollapsed(collapsed: boolean): void {
    this.setState({ isSidebarCollapsed: collapsed });
  }

  setIsOpportunityModalOpen(open: boolean): void {
    this.setState({ isOpportunityModalOpen: open });
  }

  setNavigationContext(context: NavigationContext | null): void {
    this.setState({ navigationContext: context });
  }

  getCurrentState(): ShellState {
    return { ...this.state() };
  }

  resetState(): void {
    this.state.set(createInitialState());
  }
}
