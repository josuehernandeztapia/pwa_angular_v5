import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of, shareReplay, tap, map } from 'rxjs';
import { environment } from '@environments/environment';
import { DashboardStats, ActivityFeedItem, Market, OpportunityStage } from '@interfaces/types';
import { resolveHttpClient } from '@services/utils/http-client.util';
import { safeWindow } from '@services/utils/ssr/safe-window.util';
import { toObservable } from '@angular/core/rxjs-interop';

@Injectable({
  providedIn: 'root'
})
export class DashboardService {
  private readonly http: HttpClient = resolveHttpClient();
  private readonly baseUrl = environment.apiUrl;
  private readonly stageOrder: OpportunityStage['name'][] = [
    'Nuevas Oportunidades',
    'Expediente en Proceso',
    'Aprobado',
    'Activo',
    'Completado'
  ];

  // State Management
  private readonly activityFeedState = signal<ActivityFeedItem[]>([]);
  readonly activityFeed = this.activityFeedState.asReadonly();
  private readonly activityStorageKey = '__dashboard_activity_feed__';

  private readonly pipelineState = signal<Record<Market, OpportunityStage[]>>(this.buildInitialPipelineState());

  // Caching for Dashboard Stats
  private statsCache = new Map<Market | 'all', Observable<DashboardStats>>();

  constructor() {
    this.restoreActivityFeed();
  }

  /**
   * Loads the initial activity feed data.
   * This should be called by a component or resolver.
   */
  loadInitialFeed(limit: number = 15): void {
    this.getActivityFeed(limit)
      .pipe(
        tap(activities => {
          this.activityFeedState.set(activities);
          this.persistActivityFeed(activities);
        })
      )
      .subscribe(); // Subscribe to trigger the fetch
  }

  /**
   * Get dashboard statistics from backend with caching.
   */
  getDashboardStats(market: Market = 'all'): Observable<DashboardStats> {
    if (this.statsCache.has(market)) {
      return this.statsCache.get(market)!;
    }

    const params = market && market !== 'all' ? new HttpParams().set('market', market) : undefined;
    const endpoint = environment.features.enableMockData
      ? of(this.getMockDashboardStats(market))
      : this.http.get<DashboardStats>(`${this.baseUrl}/dashboard/stats`, { params });

    const cachedObservable = endpoint.pipe(
      shareReplay(1) // Cache the last emitted value
    );

    this.statsCache.set(market, cachedObservable);
    return cachedObservable;
  }

  /**
   * Get activity feed items.
   */
  private getActivityFeed(limit: number = 15): Observable<ActivityFeedItem[]> {
    if (environment.features.enableMockData) {
      return of(this.getMockActivityFeed().slice(0, limit));
    }
    
    return this.http.get<ActivityFeedItem[]>(`${this.baseUrl}/dashboard/activity`, {
      params: { limit: limit.toString() }
    });
  }

  /**
   * Add new activity to the real-time feed using signals.
   */
  addActivity(activity: ActivityFeedItem): void {
    this.activityFeedState.update(currentFeed => 
      [activity, ...currentFeed].slice(0, 50) // Keep last 50
    );
    this.persistActivityFeed(this.activityFeedState());
  }

  setActivityFeed(feed: ActivityFeedItem[]): void {
    this.activityFeedState.set(feed);
    this.persistActivityFeed(feed);
  }

  getOpportunityStages(market: Market = 'all'): Observable<OpportunityStage[]> {
    if (!environment.features.enableMockData) {
      const params = market && market !== 'all' ? new HttpParams().set('market', market) : undefined;
      return this.http.get<OpportunityStage[]>(`${this.baseUrl}/dashboard/pipeline`, { params });
    }

    this.ensurePipelineForMarket(market);

    return toObservable(this.pipelineState).pipe(
      map(pipeline => this.cloneStages(pipeline[market] ?? this.createEmptyStages()))
    );
  }

  addOpportunityToPipeline(market: Market, stage: OpportunityStage['name'], clientId: string): void {
    if (!environment.features.enableMockData || !clientId) {
      return;
    }

    const targetMarket = market === 'all' ? 'all' : market;
    this.ensurePipelineForMarket(targetMarket);

    this.pipelineState.update(current => {
      const next = this.clonePipeline(current);
      const marketStages = this.cloneStages(next[targetMarket] ?? this.createEmptyStages());
      const stageIndex = marketStages.findIndex(item => item.name === stage);

      if (stageIndex === -1) {
        return current;
      }

      const stageEntry = marketStages[stageIndex];
      if (stageEntry.clientIds.includes(clientId)) {
        return current;
      }

      const updatedClientIds = [clientId, ...stageEntry.clientIds];
      marketStages[stageIndex] = {
        ...stageEntry,
        clientIds: updatedClientIds,
        count: updatedClientIds.length
      };

      next[targetMarket] = marketStages;
      next.all = targetMarket === 'all'
        ? this.cloneStages(marketStages)
        : this.combineStages(
            Object.entries(next)
              .filter(([key]) => key !== 'all')
              .map(([, stages]) => stages)
          );

      return next;
    });
  }

  moveOpportunityStage(market: Market, clientId: string, targetStage: OpportunityStage['name']): void {
    if (!environment.features.enableMockData || !clientId) {
      return;
    }

    const targetMarket = market === 'all' ? 'all' : market;
    this.ensurePipelineForMarket(targetMarket);

    this.pipelineState.update(current => {
      const next = this.clonePipeline(current);
      const marketStages = this.cloneStages(next[targetMarket] ?? this.createEmptyStages());

      let needsUpdate = false;
      let alreadyInTarget = false;

      for (let index = 0; index < marketStages.length; index += 1) {
        const stage = marketStages[index];
        const containsClient = stage.clientIds.includes(clientId);

        if (!containsClient) {
          continue;
        }

        if (stage.name === targetStage) {
          alreadyInTarget = true;
          continue;
        }

        const filtered = stage.clientIds.filter(id => id !== clientId);
        marketStages[index] = {
          ...stage,
          clientIds: filtered,
          count: filtered.length
        };
        needsUpdate = true;
      }

      const targetIndex = marketStages.findIndex(stage => stage.name === targetStage);
      if (targetIndex === -1) {
        return current;
      }

      if (!alreadyInTarget) {
        const stage = marketStages[targetIndex];
        const updatedIds = [clientId, ...stage.clientIds.filter(id => id !== clientId)];
        marketStages[targetIndex] = {
          ...stage,
          clientIds: updatedIds,
          count: updatedIds.length
        };
        needsUpdate = true;
      }

      if (!needsUpdate) {
        return current;
      }

      next[targetMarket] = marketStages;
      next.all = targetMarket === 'all'
        ? this.cloneStages(marketStages)
        : this.combineStages(
            Object.entries(next)
              .filter(([key]) => key !== 'all')
              .map(([, stages]) => stages)
          );

      return next;
    });
  }

  getActionableGroups(market?: Market): Observable<{ title: string; description: string; clients: { id: string; name: string; avatarUrl: string; status: string }[] }[]> {
    const groups = [
      {
        title: 'Clientes con documentos faltantes',
        description: 'Priorizar recolección de documentos',
        clients: [
          { id: 'c1', name: 'Juan Pérez', avatarUrl: '', status: 'Pendiente' },
          { id: 'c2', name: 'María López', avatarUrl: '', status: 'Pendiente' }
        ]
      }
    ];
    return of(groups);
  }

  getAllClients(market?: Market): Observable<Array<{ id: string; name: string; avatarUrl: string; status: string; healthScore?: number }>> {
    const clients = [
      { id: 'c1', name: 'Juan Pérez', avatarUrl: '', status: 'Activo', healthScore: 82 },
      { id: 'c2', name: 'María López', avatarUrl: '', status: 'Expediente', healthScore: 68 },
      { id: 'c3', name: 'Carlos Ruiz', avatarUrl: '', status: 'Pendiente', healthScore: 45 }
    ];
    return of(clients);
  }

  updateMarket(market: Market): void {
    // In a real app, this would trigger a re-fetch or update a market signal.
    // For now, we clear the stats cache to ensure fresh data on next request.
    this.invalidateStatsCache(market);
  }

  invalidateStatsCache(market?: Market | 'all'): void {
    if (!market || market === 'all') {
      this.statsCache.clear();
      return;
    }
    this.statsCache.delete(market);
  }

  private ensurePipelineForMarket(market: Market): void {
    const currentState = this.pipelineState();
    if (currentState[market]) {
      return;
    }

    this.pipelineState.update(current => {
      if (current[market]) {
        return current;
      }

      const next = this.clonePipeline(current);
      next[market] = this.createEmptyStages();
      next.all = this.combineStages(
        Object.entries(next)
          .filter(([key]) => key !== 'all')
          .map(([, stages]) => stages)
      );
      return next;
    });
  }

  private buildInitialPipelineState(): Record<Market, OpportunityStage[]> {
    const marketAssignments: Record<Exclude<Market, 'all'>, Partial<Record<OpportunityStage['name'], string[]>>> = {
      aguascalientes: {
        'Nuevas Oportunidades': ['ag-1', 'ag-2', 'ag-3', 'ag-4'],
        'Expediente en Proceso': ['ag-5', 'ag-6'],
        'Aprobado': ['ag-7']
      },
      edomex: {
        'Nuevas Oportunidades': ['em-1', 'em-2', 'em-3'],
        'Expediente en Proceso': ['em-4', 'em-5'],
        'Aprobado': ['em-6']
      },
      otros: {
        'Nuevas Oportunidades': ['ot-1', 'ot-2', 'ot-3'],
        'Expediente en Proceso': ['ot-4', 'ot-5'],
        'Aprobado': ['ot-6', 'ot-7']
      }
    };

    const state = {} as Record<Market, OpportunityStage[]>;
    (Object.keys(marketAssignments) as Array<Exclude<Market, 'all'>>).forEach(market => {
      state[market] = this.createMarketPipeline(marketAssignments[market]);
    });

    state.all = this.combineStages(Object.values(state));

    return state;
  }

  private createMarketPipeline(assignments: Partial<Record<OpportunityStage['name'], string[]>>): OpportunityStage[] {
    return this.createEmptyStages().map(stage => {
      const clientIds = assignments[stage.name] ?? [];
      return {
        ...stage,
        clientIds: [...clientIds],
        count: clientIds.length
      };
    });
  }

  private createEmptyStages(): OpportunityStage[] {
    return this.stageOrder.map(name => ({
      name,
      clientIds: [],
      count: 0
    }));
  }

  private cloneStages(stages: OpportunityStage[]): OpportunityStage[] {
    return stages.map(stage => ({
      ...stage,
      clientIds: [...stage.clientIds],
      count: stage.clientIds.length
    }));
  }

  private combineStages(collections: OpportunityStage[][]): OpportunityStage[] {
    const combined = this.createEmptyStages();

    collections.forEach(stages => {
      stages.forEach(stage => {
        const index = this.stageOrder.indexOf(stage.name);
        if (index === -1) {
          return;
        }

        const mergedIds = [...combined[index].clientIds, ...stage.clientIds];
        combined[index] = {
          ...combined[index],
          clientIds: mergedIds,
          count: mergedIds.length
        };
      });
    });

    return this.cloneStages(combined);
  }

  private clonePipeline(pipeline: Record<Market, OpportunityStage[]>): Record<Market, OpportunityStage[]> {
    const clone = {} as Record<Market, OpportunityStage[]>;
    (Object.keys(pipeline) as Market[]).forEach(key => {
      clone[key] = this.cloneStages(pipeline[key]);
    });
    return clone;
  }

  private persistActivityFeed(feed: ActivityFeedItem[]): void {
    const windowRef = safeWindow();
    if (!windowRef?.localStorage) {
      return;
    }

    try {
      const serializable = feed.map(item => ({
        ...item,
        timestamp: item.timestamp instanceof Date ? item.timestamp.toISOString() : item.timestamp
      }));
      windowRef.localStorage.setItem(this.activityStorageKey, JSON.stringify(serializable));
    } catch (error) {
      console.warn('[DashboardService] Unable to persist activity feed', error);
    }
  }

  private restoreActivityFeed(): void {
    const windowRef = safeWindow();
    if (!windowRef?.localStorage) {
      return;
    }

    try {
      const raw = windowRef.localStorage.getItem(this.activityStorageKey);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return;
      }

      const restored = parsed.slice(0, 50).map((item: any) => ({
        ...item,
        timestamp: item.timestamp ? new Date(item.timestamp) : new Date()
      }));
      if (restored.length > 0) {
        this.activityFeedState.set(restored);
      }
    } catch (error) {
      console.warn('[DashboardService] Unable to restore activity feed', error);
    }
  }

  // MOCK DATA HELPERS (private)

  private getMockDashboardStats(market?: Market): DashboardStats {
    const baseStats: DashboardStats = {
      opportunitiesInPipeline: {
        nuevas: 12,
        expediente: 8,
        aprobado: 5
      },
      pendingActions: {
        clientsWithMissingDocs: 7,
        clientsWithGoalsReached: 3
      },
      activeContracts: 28,
      monthlyRevenue: {
        collected: 1250000,
        projected: 1800000
      }
    };

    if (market === 'aguascalientes') {
      return {
        ...baseStats,
        opportunitiesInPipeline: {
          nuevas: 8,
          expediente: 5,
          aprobado: 3
        },
        activeContracts: 18
      };
    }
    
    if (market === 'edomex') {
      return {
        ...baseStats,
        opportunitiesInPipeline: {
          nuevas: 4,
          expediente: 3,
          aprobado: 2
        },
        activeContracts: 10
      };
    }

    return baseStats;
  }

  private getMockActivityFeed(): ActivityFeedItem[] {
    const now = new Date();
    return [
      {
        id: 'activity-1',
        type: 'payment_received',
        timestamp: new Date(now.getTime() - 5 * 60000),
        message: 'Pago de enganche recibido',
        clientName: 'Carlos Mendoza',
        amount: 150000,
        iconType: 'currency-dollar'
      },
      {
        id: 'activity-2',
        type: 'doc_approved',
        timestamp: new Date(now.getTime() - 15 * 60000),
        message: 'INE Aprobado por el sistema',
        clientName: 'María González',
        iconType: 'check'
      },
      {
        id: 'activity-3',
        type: 'new_client',
        timestamp: new Date(now.getTime() - 30 * 60000),
        message: 'Nuevo cliente registrado',
        clientName: 'Roberto Silva',
        iconType: 'user'
      }
    ];
  }
}
