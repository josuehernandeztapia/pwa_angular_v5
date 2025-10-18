import { HttpClient } from '@angular/common/http';
import { Injectable, Optional } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

import { environment } from '@environments/environment';
import { OfflineService, OfflineProcessResult } from '@core-services/offline.service';
import { resolveFeatureFlag } from '@services/utils/ssr/feature-flags.util';

export type ClaimStatus = 'open' | 'in_review' | 'approved' | 'rejected' | 'closed';
export type ClaimType = 'warranty' | 'maintenance' | 'insurance' | 'service';

export interface ClaimRecord {
  id: string;
  folio: string;
  clientName: string;
  vehicleVin: string;
  market: 'aguascalientes' | 'edomex' | 'otros';
  type: ClaimType;
  status: ClaimStatus;
  amount: number;
  createdAt: string;
  updatedAt: string;
  assignedTo: string;
  description?: string;
  resolutionNotes?: string;
  pendingSync?: boolean;
}

export interface ClaimFormPayload {
  clientName: string;
  vehicleVin: string;
  market: 'aguascalientes' | 'edomex' | 'otros';
  type: ClaimType;
  amount: number;
  description?: string;
}

@Injectable({ providedIn: 'root' })
export class ClaimsService {
  private readonly storageKey = '__claims_records__';
  private readonly claimsSubject = new BehaviorSubject<ClaimRecord[]>(this.seedClaims());
  private readonly baseUrl: string;
  private readonly runtimeClaimsBffEnabled: boolean;
  private readonly useBff: boolean;

  constructor(
    @Optional() private readonly http?: HttpClient,
    @Optional() private readonly offline?: OfflineService
  ) {
    this.baseUrl = `${environment.apiUrl}/claims`;
    this.runtimeClaimsBffEnabled = resolveFeatureFlag('ENABLE_CLAIMS_BFF', false);
    this.useBff = Boolean(
      this.http && (environment.features.enableClaimsBff || this.runtimeClaimsBffEnabled)
    );
    this.restoreFromStorage();

    if (this.offline) {
      this.offline.processedRequests$.subscribe(result => this.handleOfflineProcessed(result));
    }
  }

  getClaims(filter?: { status?: ClaimStatus; market?: string; search?: string }): Observable<ClaimRecord[]> {
    if (this.shouldUseBackend() && this.http) {
      return this.http
        .get<any[]>(this.baseUrl, {
          params: filter ? this.buildQueryParams(filter) : undefined
        })
        .pipe(
          map(records => this.hydrateBackendRecords(records)),
          tap(records => this.updateCache(records)),
          map(records => this.filterRecords(records, filter))
        );
    }

    return this.claimsSubject.asObservable().pipe(
      map(records => this.filterRecords(records, filter))
    );
  }

  getClaimById(id: string): Observable<ClaimRecord | null> {
    if (this.shouldUseBackend()) {
      this.refreshFromBackend();
    }

    return this.claimsSubject.asObservable().pipe(
      map(records => records.find(record => record.id === id) ?? null)
    );
  }

  createClaim(payload: ClaimFormPayload): Observable<ClaimRecord> {
    const offline = this.isOffline();

    if (this.shouldUseBackend()) {
      return this.http!
        .post<any>(this.baseUrl, payload)
        .pipe(
          map(record => this.normalizeClaimRecord(record)),
          tap(() => this.refreshFromBackend())
        );
    }

    const claim = this.buildLocalClaim(payload, offline);
    this.pushLocalClaim(claim);

    if (offline) {
      this.enqueueOfflineRequest('claims', 'POST', { ...payload, tempId: claim.id });
    }

    return of(claim);
  }

  updateClaim(id: string, updates: Partial<ClaimRecord>): Observable<ClaimRecord | null> {
    const offline = this.isOffline();

    if (this.shouldUseBackend()) {
      return this.http!
        .patch<any>(`${this.baseUrl}/${id}`, updates)
        .pipe(
          map(record => this.normalizeClaimRecord(record)),
          tap(() => this.refreshFromBackend())
        );
    }

    const updated = this.applyLocalUpdate(id, updates, offline);

    if (offline && updated) {
      this.enqueueOfflineRequest(`claims/${id}`, 'PATCH', { ...updates, id });
    }

    return of(updated);
  }

  closeClaim(id: string, notes?: string): Observable<ClaimRecord | null> {
    const offline = this.isOffline();

    if (this.shouldUseBackend()) {
      return this.http!
        .post<any>(`${this.baseUrl}/${id}/close`, { notes })
        .pipe(
          map(record => this.normalizeClaimRecord(record)),
          tap(() => this.refreshFromBackend())
        );
    }

    const updated = this.applyLocalUpdate(
      id,
      {
        status: 'closed',
        resolutionNotes: notes ?? 'Cierre manual desde ClaimsService stub.'
      },
      offline
    );

    if (offline && updated) {
      this.enqueueOfflineRequest(`claims/${id}/close`, 'POST', { id, notes });
    }

    return of(updated);
  }

  getSummary(): Observable<{ total: number; open: number; inReview: number; closed: number; avgAmount: number }> {
    return this.claimsSubject.asObservable().pipe(
      map(records => {
        const total = records.length;
        const open = records.filter(record => record.status === 'open').length;
        const inReview = records.filter(record => record.status === 'in_review').length;
        const closed = records.filter(record => record.status === 'closed' || record.status === 'approved' || record.status === 'rejected').length;
        const avgAmount = total > 0 ? records.reduce((sum, record) => sum + (record.amount || 0), 0) / total : 0;
        return {
          total,
          open,
          inReview,
          closed,
          avgAmount: Math.round(avgAmount)
        };
      })
    );
  }

  healthCheck(): Observable<boolean> {
    if (!this.shouldUseBackend() || !this.http) {
      return of(false);
    }

    return this.http
      .get<void>(`${this.baseUrl}/health`, { observe: 'response' })
      .pipe(
        map(response => response.status >= 200 && response.status < 500),
        catchError(() => of(false))
      );
  }

  private persist(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.claimsSubject.value));
    } catch {
      // ignore storage errors in stub
    }
  }

  private restoreFromStorage(): void {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const records: ClaimRecord[] = JSON.parse(raw);
        if (Array.isArray(records) && records.length) {
          this.claimsSubject.next(records);
        }
      }
    } catch {
      // ignore parse errors and keep seed data
    }
  }

  private refreshFromBackend(): void {
    if (!this.shouldUseBackend() || !this.http) {
      return;
    }

    this.http
      .get<any[]>(this.baseUrl)
      .pipe(
        map(records => this.hydrateBackendRecords(records)),
        catchError(() => of<ClaimRecord[] | null>(null))
      )
      .subscribe(records => {
        if (records) {
          this.updateCache(records);
        }
      });
  }

  private shouldUseBackend(): boolean {
    return this.useBff && !!this.http && !this.isOffline();
  }

  private isOffline(): boolean {
    if (!this.offline) {
      return false;
    }
    const isOnlineSignal = this.offline.isOnline;
    return typeof isOnlineSignal === 'function' ? !isOnlineSignal() : false;
  }

  private enqueueOfflineRequest(endpoint: string, method: 'POST' | 'PATCH' | 'PUT', data?: any): void {
    if (!this.offline) {
      return;
    }
    try {
      this.offline.storeOfflineRequest(endpoint, method, data);
    } catch {
      // Ignore storage errors (private mode / quota)
    }
  }

  private hydrateBackendRecords(raw: any): ClaimRecord[] {
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.map(entry => this.normalizeClaimRecord(entry));
  }

  private updateCache(records: ClaimRecord[]): void {
    this.claimsSubject.next(records);
    this.persist();
  }

  private filterRecords(
    records: ClaimRecord[],
    filter?: { status?: ClaimStatus; market?: string; search?: string }
  ): ClaimRecord[] {
    if (!filter) {
      return records;
    }

    const search = filter.search?.trim().toLowerCase();
    return records.filter(record => {
      if (filter.status && record.status !== filter.status) {
        return false;
      }

      if (filter.market && record.market !== filter.market) {
        return false;
      }

      if (search) {
        const haystack = `${record.folio} ${record.clientName} ${record.vehicleVin}`.toLowerCase();
        if (!haystack.includes(search)) {
          return false;
        }
      }

      return true;
    });
  }

  private normalizeClaimRecord(record: any): ClaimRecord {
    const safe = record ?? {};
    const market = this.normalizeMarketValue(safe.market ?? safe.region);
    const createdAt = this.ensureIsoString(safe.createdAt ?? safe.created_at);
    const updatedAt = this.ensureIsoString(safe.updatedAt ?? safe.updated_at, createdAt);
    const baseId = safe.id ?? safe.claimId ?? safe.folio;
    const id = String(baseId ?? crypto.randomUUID());
    const folio = String(safe.folio ?? baseId ?? this.generateFolio(market));

    return {
      id,
      folio,
      clientName: this.normalizeString(safe.clientName ?? safe.client_name ?? safe.customerName, 'Cliente sin nombre'),
      vehicleVin: this.normalizeString(safe.vehicleVin ?? safe.vehicle_vin ?? safe.vin, 'VIN-ND'),
      market,
      type: this.normalizeTypeValue(safe.type ?? safe.claimType),
      status: this.normalizeStatusValue(safe.status ?? safe.state),
      amount: this.normalizeAmount(safe.amount ?? safe.totalAmount ?? safe.value),
      createdAt,
      updatedAt,
      assignedTo: this.normalizeString(safe.assignedTo ?? safe.assigned_to ?? safe.owner, 'postventa-team'),
      description: safe.description ?? safe.notes ?? undefined,
      resolutionNotes: safe.resolutionNotes ?? safe.resolution_notes ?? safe.closingNotes ?? undefined,
      pendingSync: Boolean(safe.pendingSync ?? safe.pending_sync ?? false)
    };
  }

  private normalizeStatusValue(value: any): ClaimStatus {
    const raw = typeof value === 'string' ? value.toLowerCase() : '';
    if (raw.includes('review') || raw.includes('revisi')) {
      return 'in_review';
    }
    if (raw.includes('approv') || raw.includes('aprob')) {
      return 'approved';
    }
    if (raw.includes('reject') || raw.includes('rechaz')) {
      return 'rejected';
    }
    if (raw.includes('clos') || raw.includes('cerrad')) {
      return 'closed';
    }
    return 'open';
  }

  private normalizeTypeValue(value: any): ClaimType {
    const raw = typeof value === 'string' ? value.toLowerCase() : '';
    if (raw.includes('maint') || raw.includes('manten')) {
      return 'maintenance';
    }
    if (raw.includes('insur') || raw.includes('seguro')) {
      return 'insurance';
    }
    if (raw.includes('warr') || raw.includes('garant')) {
      return 'warranty';
    }
    return 'service';
  }

  private normalizeMarketValue(value: any): 'aguascalientes' | 'edomex' | 'otros' {
    const raw = typeof value === 'string' ? value.toLowerCase() : '';
    if (raw.includes('ags') || raw.includes('agua')) {
      return 'aguascalientes';
    }
    if (raw.includes('edomex') || raw.includes('méx') || raw.includes('edom') || raw.includes('e.mex')) {
      return 'edomex';
    }
    return 'otros';
  }

  private normalizeAmount(value: any): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  private normalizeString(value: any, fallback: string): string {
    if (!value) {
      return fallback;
    }
    const result = String(value).trim();
    return result.length ? result : fallback;
  }

  private ensureIsoString(value: any, fallback?: string): string {
    const parsed = this.parseAsDate(value);
    if (parsed) {
      return parsed.toISOString();
    }
    return fallback ?? new Date().toISOString();
  }

  private parseAsDate(value: any): Date | undefined {
    if (!value) {
      return undefined;
    }
    if (value instanceof Date) {
      return isNaN(value.getTime()) ? undefined : value;
    }
    const date = new Date(value);
    return isNaN(date.getTime()) ? undefined : date;
  }

  private buildLocalClaim(payload: ClaimFormPayload, pendingSync: boolean): ClaimRecord {
    const now = new Date().toISOString();
    return {
      id: crypto.randomUUID(),
      folio: this.generateFolio(payload.market),
      clientName: payload.clientName,
      vehicleVin: payload.vehicleVin,
      market: payload.market,
      type: payload.type,
      status: 'open',
      amount: payload.amount,
      createdAt: now,
      updatedAt: now,
      assignedTo: 'postventa-team',
      description: payload.description,
      pendingSync
    };
  }

  private pushLocalClaim(claim: ClaimRecord): void {
    const next = [claim, ...this.claimsSubject.value];
    this.claimsSubject.next(next);
    this.persist();
  }

  private applyLocalUpdate(
    id: string,
    updates: Partial<ClaimRecord>,
    markPending: boolean
  ): ClaimRecord | null {
    let updatedClaim: ClaimRecord | null = null;
    const next = this.claimsSubject.value.map(claim => {
      if (claim.id !== id) {
        return claim;
      }

      updatedClaim = {
        ...claim,
        ...updates,
        pendingSync: markPending ? true : updates.pendingSync ?? claim.pendingSync,
        updatedAt: new Date().toISOString()
      };

      return updatedClaim;
    });

    if (updatedClaim) {
      this.claimsSubject.next(next);
      this.persist();
    }

    return updatedClaim;
  }

  private handleOfflineProcessed(result: OfflineProcessResult): void {
    if (!result || !result.request) {
      return;
    }

    const endpoint = this.normalizeEndpoint(result.request.endpoint ?? '');
    if (!endpoint.startsWith('claims')) {
      return;
    }

    if (!result.success) {
      return;
    }

    const method = (result.request.method ?? 'POST').toUpperCase();

    if (endpoint === 'claims' && method === 'POST') {
      const payload = result.request.data ?? {};
      const id = payload?.tempId ?? payload?.id;
      if (typeof id === 'string') {
        this.updatePendingFlag(id, false);
      } else if (this.shouldUseBackend()) {
        this.refreshFromBackend();
      }
      return;
    }

    const claimId = this.extractClaimId(endpoint);
    if (claimId) {
      this.updatePendingFlag(claimId, false);
    } else if (this.shouldUseBackend()) {
      this.refreshFromBackend();
    }
  }

  private normalizeEndpoint(endpoint: string): string {
    return endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  }

  private extractClaimId(endpoint: string): string | null {
    const normalized = this.normalizeEndpoint(endpoint);
    const parts = normalized.split('/');
    if (parts[0] !== 'claims' || parts.length < 2) {
      return null;
    }
    return parts[1] ?? null;
  }

  private updatePendingFlag(id: string, pending: boolean): void {
    let mutated = false;
    const next = this.claimsSubject.value.map(claim => {
      if (claim.id !== id) {
        return claim;
      }
      mutated = true;
      return {
        ...claim,
        pendingSync: pending
      };
    });

    if (mutated) {
      this.claimsSubject.next(next);
      this.persist();

      if (!pending && this.shouldUseBackend()) {
        this.refreshFromBackend();
      }
    }
  }

  private buildQueryParams(filter: { status?: ClaimStatus; market?: string; search?: string }): Record<string, string> {
    const params: Record<string, string> = {};
    if (filter.status) params['status'] = filter.status;
    if (filter.market) params['market'] = filter.market;
    if (filter.search) params['search'] = filter.search;
    return params;
  }

  private generateFolio(market: string): string {
    const prefix = market.slice(0, 3).toUpperCase();
    const random = Math.random().toString(36).slice(2, 6).toUpperCase();
    const timestamp = Date.now().toString().slice(-4);
    return `${prefix}-${timestamp}-${random}`;
  }

  private seedClaims(): ClaimRecord[] {
    const now = new Date();
    return [
      {
        id: crypto.randomUUID(),
        folio: 'AGS-1024-A1B2',
        clientName: 'María Hernández',
        vehicleVin: '3VWFE21C04M000111',
        market: 'aguascalientes',
        type: 'warranty',
        status: 'in_review',
        amount: 12500,
        createdAt: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        assignedTo: 'carlos.rivera',
        description: 'Falla en sistema eléctrico posterior a entrega.',
        pendingSync: false
      },
      {
        id: crypto.randomUUID(),
        folio: 'EDX-2048-F4G5',
        clientName: 'Luis Martínez',
        vehicleVin: '2FMDK4KC0BBB12345',
        market: 'edomex',
        type: 'maintenance',
        status: 'open',
        amount: 4800,
        createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        assignedTo: 'claudia.soto',
        description: 'Solicitud de servicio correctivo por fuga de aceite.',
        pendingSync: false
      },
      {
        id: crypto.randomUUID(),
        folio: 'OTR-3050-X7Z9',
        clientName: 'Sofía Delgado',
        vehicleVin: '1GCHK23124F000222',
        market: 'otros',
        type: 'insurance',
        status: 'approved',
        amount: 18990,
        createdAt: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        assignedTo: 'postventa-team',
        description: 'Reembolso de deducible por siniestro leve.',
        resolutionNotes: 'Aprobado con ajuste del 10% por depreciación.',
        pendingSync: false
      }
    ];
  }
}
