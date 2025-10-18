import { Injectable, signal, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of, shareReplay, tap } from 'rxjs';
import { environment } from '@environments/environment';
import { DashboardStats, ActivityFeedItem, Market } from '@interfaces/types';
import { resolveHttpClient } from '@services/utils/http-client.util';

@Injectable({
  providedIn: 'root'
})
export class DashboardService {
  private readonly http: HttpClient = resolveHttpClient();
  private readonly baseUrl = environment.apiUrl;

  // State Management with Signals
  private readonly activityFeedState = signal<ActivityFeedItem[]>([]);
  readonly activityFeed = this.activityFeedState.asReadonly();

  // Caching for Dashboard Stats
  private statsCache = new Map<Market | 'all', Observable<DashboardStats>>();

  /**
   * Loads the initial activity feed data.
   * This should be called by a component or resolver.
   */
  loadInitialFeed(limit: number = 15): void {
    this.getActivityFeed(limit)
      .pipe(
        tap(activities => this.activityFeedState.set(activities))
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
  }

  setActivityFeed(feed: ActivityFeedItem[]): void {
    this.activityFeedState.set(feed);
  }

  // The following methods return mock data and remain unchanged for now.
  getOpportunityStages(market?: Market): Observable<{ name: 'Nuevas Oportunidades' | 'Expediente en Proceso' | 'Aprobado' | 'Activo' | 'Completado'; clientIds: string[]; count: number }[]> {
    const stages: { name: 'Nuevas Oportunidades' | 'Expediente en Proceso' | 'Aprobado' | 'Activo' | 'Completado'; clientIds: string[]; count: number }[] = [
      { name: 'Nuevas Oportunidades', clientIds: ['c1','c2','c3','c4','c5','c6','c7','c8','c9','c10'], count: 10 },
      { name: 'Expediente en Proceso', clientIds: ['c11','c12','c13','c14','c15','c16'], count: 6 },
      { name: 'Aprobado', clientIds: ['c17','c18','c19','c20'], count: 4 }
    ];
    return of(stages);
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
