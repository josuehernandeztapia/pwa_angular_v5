import { DestroyRef, Injectable, Optional, PLATFORM_ID, inject, signal, computed } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { fromEvent, merge, BehaviorSubject, Subject, firstValueFrom, timer } from 'rxjs';
import { map, startWith, distinctUntilChanged, debounceTime, filter, switchMap } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { environment } from '@environments/environment';
import { AnalyticsService } from '@core-services/analytics.service';
import { HttpClientService } from '@core-services/http-client.service';
import { DocumentUploadService } from '@feature-services/documents/document-upload.service';
import { MonitoringService } from '@core-services/monitoring.service';
import { FlowContextService } from '@core-services/flow-context.service';

export interface OfflineData {
  id: string;
  timestamp: number;
  data: any;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  attempts?: number;
}

export interface OfflineProcessResult {
  request: OfflineData;
  success: boolean;
  error?: any;
}

export interface ConnectionStatus {
  isOnline: boolean;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  lastChanged: number;
}

@Injectable({
  providedIn: 'root'
})
export class OfflineService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly documentRef = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly windowRef: (Window & typeof globalThis) | null = this.isBrowser ? (this.documentRef.defaultView as Window & typeof globalThis | null) : null;
  private readonly STORAGE_PREFIX = 'offline_';
  private readonly MAX_OFFLINE_STORAGE = 50; // Máximo 50 requests almacenados
  private readonly CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 días en ms

  // Signals para estado reactivo
  public readonly connectionStatus = signal<ConnectionStatus>({
    isOnline: this.getNavigatorOnline(),
    lastChanged: Date.now()
  });

  // Computed properties
  public readonly isOnline = computed(() => this.connectionStatus().isOnline);
  public readonly isOffline = computed(() => !this.connectionStatus().isOnline);

  // Observables tradicionales para compatibilidad
  private connectionSubject = new BehaviorSubject<boolean>(this.getNavigatorOnline());
  public readonly online$ = this.connectionSubject.asObservable();
  public readonly offline$ = this.online$.pipe(map(online => !online));

  // Queue de requests pendientes
  private pendingRequests: OfflineData[] = [];
  private readonly pendingRequestsSubject = new BehaviorSubject<OfflineData[]>([]);
  public readonly pendingRequests$ = this.pendingRequestsSubject.asObservable();
  private readonly processedRequestsSubject = new Subject<OfflineProcessResult>();
  public readonly processedRequests$ = this.processedRequestsSubject.asObservable();

  constructor(
    @Optional() private readonly analytics?: AnalyticsService,
    @Optional() private readonly httpClient?: HttpClientService,
    @Optional() private readonly documentUpload?: DocumentUploadService,
    @Optional() private readonly monitoring?: MonitoringService,
    @Optional() private readonly flowContext?: FlowContextService
  ) {
    this.initializeConnectivityMonitoring();
    this.loadPendingRequests();
    this.setupConnectionHandlers();
    this.syncFlowContextQueue();
  }

  private auditEvent(event: string, metadata: Record<string, any> = {}): void {
    this.monitoring?.auditEvent(event, metadata);
  }

  private trackQueueMetric(event: string, payload: Record<string, any> = {}): void {
    if (!this.analytics) {
      return;
    }

    const sanitized: Record<string, any> = {
      queueLength: this.pendingRequests.length,
      ...payload,
    };

    if (sanitized['error'] instanceof Error) {
      sanitized['error'] = sanitized['error'].message;
    }

    this.analytics.track(event, sanitized);
  }

  private syncFlowContextQueue(): void {
    if (!this.flowContext) {
      return;
    }

    const snapshot = {
      pending: this.pendingRequests.length,
      endpoints: this.pendingRequests
        .slice(0, 5)
        .map(request => this.normalizeEndpoint(request.endpoint ?? '')),
      lastUpdated: Date.now()
    };

    this.flowContext.saveContext('offlineQueue', snapshot, {
      breadcrumbs: ['Dashboard', 'Offline']
    });
  }

  private getNavigatorOnline(): boolean {
    return this.windowRef?.navigator?.onLine ?? true;
  }

  private getLocalStorage(): Storage | null {
    if (!this.windowRef) {
      return null;
    }

    try {
      return this.windowRef.localStorage;
    } catch {
      return null;
    }
  }

  private initializeConnectivityMonitoring(): void {
    if (!environment.features.enableOfflineMode || !this.windowRef) {
      return;
    }

    const readOnline = () => this.getNavigatorOnline();

    const onlineEvents$ = fromEvent(this.windowRef, 'online').pipe(map(() => true));
    const offlineEvents$ = fromEvent(this.windowRef, 'offline').pipe(map(() => false));

    merge(onlineEvents$, offlineEvents$)
      .pipe(
        startWith(readOnline()),
        debounceTime(100),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(isOnline => {
        this.updateConnectionStatus(isOnline);
      });

    const navigatorRef = this.windowRef.navigator as any;
    const connection = navigatorRef?.connection;
    if (connection?.addEventListener) {
      this.updateNetworkInfo();
      fromEvent(connection, 'change')
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => {
          this.updateNetworkInfo();
        });
    }
  }

  private updateConnectionStatus(isOnline: boolean): void {
    const currentStatus = this.connectionStatus();

    if (currentStatus.isOnline !== isOnline) {
      this.connectionStatus.set({
        ...currentStatus,
        isOnline,
        lastChanged: Date.now()
      });

      this.connectionSubject.next(isOnline);

      if (isOnline) {
        this.processPendingRequests();
      }
    }
  }

  private updateNetworkInfo(): void {
    const connection = this.windowRef?.navigator ? (this.windowRef.navigator as any).connection : undefined;
    if (!connection) {
      return;
    }

    const currentStatus = this.connectionStatus();

    this.connectionStatus.set({
      ...currentStatus,
      effectiveType: connection.effectiveType,
      downlink: connection.downlink,
      rtt: connection.rtt
    });
  }

  private setupConnectionHandlers(): void {
    if (!this.isBrowser) {
      return;
    }

    this.online$
      .pipe(
        filter(isOnline => isOnline),
        switchMap(() => timer(1000)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        if (this.pendingRequests.length > 0) {
          this.processPendingRequests();
        }
      });

    timer(60 * 60 * 1000, 60 * 60 * 1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cleanupExpiredCache());
  }

  // Almacenar request para procesamiento offline
  public storeOfflineRequest(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' = 'GET',
    data?: any
  ): void {
    if (!environment.features.enableOfflineMode) {
      return;
    }

    const offlineData: OfflineData = {
      id: this.generateRequestId(),
      timestamp: Date.now(),
      endpoint,
      method,
      data,
      attempts: 0
    };

    // Agregar a la queue
    this.pendingRequests.push(offlineData);

    // Limitar tamaño de la queue
    let trimmed = false;
    if (this.pendingRequests.length > this.MAX_OFFLINE_STORAGE) {
      this.pendingRequests.shift(); // Remove oldest
      trimmed = true;
    }

    // Persistir en localStorage
    this.savePendingRequests();
    this.pendingRequestsSubject.next([...this.pendingRequests]);
    this.syncFlowContextQueue();

    const auditPayload = {
      endpoint,
      method,
      trimmed,
    };

    this.trackQueueMetric('offline_queue_enqueued', auditPayload);
    this.auditEvent('offline_queue_enqueued', auditPayload);
  }

  // Procesar requests pendientes cuando vuelve la conexión
  private async processPendingRequests(): Promise<void> {
    if (this.pendingRequests.length === 0) {
      return;
    }

    const requests = [...this.pendingRequests];
    this.pendingRequests = [];
    this.pendingRequestsSubject.next([]);
    this.syncFlowContextQueue();

    const flushStartPayload = { pending: requests.length };
    this.trackQueueMetric('offline_queue_flush_start', flushStartPayload);
    this.auditEvent('offline_queue_flush_start', flushStartPayload);

    for (const request of requests) {
      let success = false;
      let error: any;
      let attempts = request.attempts ?? 0;
      try {
        await this.executeRequest(request);
        success = true;
        const requestFlushedPayload = {
          endpoint: request.endpoint,
          method: request.method,
          attempts,
        };
        this.trackQueueMetric('offline_queue_request_flushed', requestFlushedPayload);
        this.auditEvent('offline_queue_request_flushed', requestFlushedPayload);
      } catch (err) {
        error = err;
        attempts = attempts + 1;
        this.pendingRequests.push({ ...request, attempts });
        const requestFailedPayload = {
          endpoint: request.endpoint,
          method: request.method,
          attempts,
          error,
        };
        this.trackQueueMetric('offline_queue_request_failed', requestFailedPayload);
        this.auditEvent('offline_queue_request_failed', requestFailedPayload);
      }

      this.processedRequestsSubject.next({ request: { ...request, attempts }, success, error });
    }

    this.savePendingRequests();
    this.pendingRequestsSubject.next([...this.pendingRequests]);
    this.syncFlowContextQueue();

    const flushCompletePayload = {
      remaining: this.pendingRequests.length,
      processed: requests.length,
    };
    this.trackQueueMetric('offline_queue_flush_complete', flushCompletePayload);
    this.auditEvent('offline_queue_flush_complete', flushCompletePayload);

    if (this.analytics) {
      this.analytics.track('offline_queue_flush', {
        feature: 'global-shell',
        remaining: this.pendingRequests.length,
        processed: requests.length,
      });
    }
  }

  private canProcessOnline(): boolean {
    if (!this.httpClient) {
      return false;
    }

    const features: Record<string, any> = environment.features as any;
    if (features['forceOfflineQueueMock'] === true) {
      return false;
    }

    if (features['forceOfflineQueueMock'] === false) {
      return true;
    }

    return features['enableMockData'] !== true;
  }

  public getPendingRequestsSnapshot(): OfflineData[] {
    return [...this.pendingRequests];
  }

  public async flushQueueNow(): Promise<void> {
    await this.processPendingRequests();
  }

  public clearPendingRequests(reason: string = 'manual'): void {
    if (this.pendingRequests.length === 0) {
      return;
    }

    this.pendingRequests = [];
    this.savePendingRequests();
    this.pendingRequestsSubject.next([]);
    this.syncFlowContextQueue();

    const clearedPayload = { reason };
    this.trackQueueMetric('offline_queue_cleared', clearedPayload);
    this.auditEvent('offline_queue_cleared', clearedPayload);

    if (this.analytics) {
      this.analytics.track('offline_queue_cleared', { reason });
    }
  }

  private normalizeEndpoint(endpoint: string): string {
    if (!endpoint) {
      return endpoint;
    }
    return endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  }

  private isDocumentUploadRequest(request: OfflineData): boolean {
    const endpoint = this.normalizeEndpoint(request.endpoint ?? '');
    return endpoint === 'documents/upload';
  }

  private canProcessDocumentUpload(request: OfflineData): boolean {
    if (!this.documentUpload || !this.canProcessOnline()) {
      return false;
    }

    const payload = request.data;
    return Boolean(
      payload &&
      typeof payload.clientId === 'string' &&
      typeof payload.documentId === 'string' &&
      typeof payload.fileBase64 === 'string' &&
      payload.fileBase64.length > 0
    );
  }

  private async processDocumentUploadRequest(request: OfflineData): Promise<void> {
    const payload = request.data ?? {};

    if (!this.documentUpload) {
      await this.dispatchHttpRequest(request);
      return;
    }

    const fileName = payload.fileName || `${payload.documentId || 'document'}.bin`;
    const fileType = payload.fileType || payload.type || 'application/octet-stream';

    await this.documentUpload.uploadQueuedDocument({
      clientId: payload.clientId,
      documentId: payload.documentId,
      fileBase64: payload.fileBase64,
      fileName,
      fileType,
      fileSize: payload.fileSize ?? payload.size,
      hash: payload.hash,
      metadata: payload.metadata,
    });

    const documentUploadedPayload = {
      endpoint: request.endpoint,
      documentId: payload.documentId,
      size: payload.fileSize ?? payload.size,
    };
    this.trackQueueMetric('offline_queue_document_uploaded', documentUploadedPayload);
    this.auditEvent('offline_queue_document_uploaded', documentUploadedPayload);
  }

  private async dispatchHttpRequest(request: OfflineData): Promise<void> {
    if (!this.httpClient) {
      await this.simulateApiCall(request);
      return;
    }

    const method = (request.method ?? 'POST').toUpperCase() as OfflineData['method'];
    const endpoint = this.normalizeEndpoint(request.endpoint);
    const payload = request.data ?? {};

    switch (method) {
      case 'GET':
        await firstValueFrom(
          this.httpClient.get<any>(endpoint, {
            showLoading: false,
            showError: false,
            params: typeof payload === 'object' ? payload : undefined
          })
        );
        break;
      case 'DELETE':
        await firstValueFrom(
          this.httpClient.delete<any>(endpoint, {
            showLoading: false,
            showError: true
          })
        );
        break;
      case 'PUT':
      case 'PATCH':
        await firstValueFrom(
          this.httpClient.put<any>(endpoint, payload, {
            showLoading: false,
            showError: true
          })
        );
        break;
      case 'POST':
      default:
        await firstValueFrom(
          this.httpClient.post<any>(endpoint, payload, {
            showLoading: false,
            showError: true
          })
        );
        break;
    }
  }

  private async executeRequest(request: OfflineData): Promise<void> {
    if (this.isDocumentUploadRequest(request) && this.canProcessDocumentUpload(request)) {
      await this.processDocumentUploadRequest(request);
      return;
    }

    if (!this.canProcessOnline()) {
      await this.simulateApiCall(request);
      return;
    }

    await this.dispatchHttpRequest(request);
  }

  public async replayRequest(id: string): Promise<boolean> {
    const index = this.pendingRequests.findIndex(item => item.id === id);
    if (index === -1) {
      return false;
    }

    const [request] = this.pendingRequests.splice(index, 1);
    this.pendingRequestsSubject.next([...this.pendingRequests]);
    this.savePendingRequests();
    this.syncFlowContextQueue();

    try {
      await this.executeRequest(request);
      const manualReplaySuccessPayload = {
        endpoint: request.endpoint,
        method: request.method,
        attempts: request.attempts ?? 0,
      };
      this.trackQueueMetric('offline_queue_manual_replay_success', manualReplaySuccessPayload);
      this.auditEvent('offline_queue_manual_replay_success', manualReplaySuccessPayload);
      this.processedRequestsSubject.next({ request, success: true });
      return true;
    } catch (error) {
      const attempts = (request.attempts ?? 0) + 1;
      const retried: OfflineData = { ...request, attempts };
      this.pendingRequests.unshift(retried);
      this.savePendingRequests();
      this.pendingRequestsSubject.next([...this.pendingRequests]);
      this.syncFlowContextQueue();
      const manualReplayFailedPayload = {
        endpoint: request.endpoint,
        method: request.method,
        attempts,
        error,
      };
      this.trackQueueMetric('offline_queue_manual_replay_failed', manualReplayFailedPayload);
      this.auditEvent('offline_queue_manual_replay_failed', manualReplayFailedPayload);
      this.processedRequestsSubject.next({ request: retried, success: false, error });
      throw error;
    }
  }

  public discardRequest(id: string): boolean {
    const index = this.pendingRequests.findIndex(item => item.id === id);
    if (index === -1) {
      return false;
    }

    const [removed] = this.pendingRequests.splice(index, 1);
    this.savePendingRequests();
    this.pendingRequestsSubject.next([...this.pendingRequests]);

    const discardPayload = {
      endpoint: removed.endpoint,
      method: removed.method,
      attempts: removed.attempts ?? 0,
    };
    this.trackQueueMetric('offline_queue_discarded', discardPayload);
    this.auditEvent('offline_queue_discarded', discardPayload);

    this.processedRequestsSubject.next({ request: removed, success: false, error: 'discarded' });
    return true;
  }

  private async simulateApiCall(request: OfflineData): Promise<void> {
    // Simular latencia de red
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

    // Simular 90% de éxito
    if (Math.random() < 0.9) {
      return Promise.resolve();
    } else {
      throw new Error('Simulated network error');
    }
  }

  // Cache management
  public cacheData(key: string, data: any, ttl: number = this.CACHE_DURATION): void {
    if (!environment.features.enableOfflineMode) {
      return;
    }

    const storage = this.getLocalStorage();
    if (!storage) {
      return;
    }

    const cacheEntry = {
      data,
      timestamp: Date.now(),
      ttl
    };

    try {
      storage.setItem(`${this.STORAGE_PREFIX}cache_${key}`, JSON.stringify(cacheEntry));
    } catch (error) {
      // No-op: storage quota might be exceeded
    }
  }

  public getCachedData<T>(key: string): T | null {
    if (!environment.features.enableOfflineMode) {
      return null;
    }

    const storage = this.getLocalStorage();
    if (!storage) {
      return null;
    }

    try {
      const cached = storage.getItem(`${this.STORAGE_PREFIX}cache_${key}`);
      if (!cached) {
        return null;
      }

      const cacheEntry = JSON.parse(cached);
      const isExpired = Date.now() - cacheEntry.timestamp > cacheEntry.ttl;

      if (isExpired) {
        storage.removeItem(`${this.STORAGE_PREFIX}cache_${key}`);
        return null;
      }

      return cacheEntry.data as T;
    } catch (error) {
      return null;
    }
  }

  public clearCache(): void {
    const storage = this.getLocalStorage();
    if (!storage) {
      return;
    }

    this.getStorageKeys(storage).forEach(key => {
      if (key.startsWith(`${this.STORAGE_PREFIX}cache_`)) {
        storage.removeItem(key);
      }
    });
  }

  private cleanupExpiredCache(): void {
    const storage = this.getLocalStorage();
    if (!storage) {
      return;
    }

    this.getStorageKeys(storage).forEach(key => {
      if (!key.startsWith(`${this.STORAGE_PREFIX}cache_`)) {
        return;
      }

      try {
        const cached = storage.getItem(key);
        if (!cached) {
          return;
        }

        const cacheEntry = JSON.parse(cached);
        const isExpired = Date.now() - cacheEntry.timestamp > cacheEntry.ttl;

        if (isExpired) {
          storage.removeItem(key);
        }
      } catch {
        storage.removeItem(key);
      }
    });
  }

  private savePendingRequests(): void {
    const storage = this.getLocalStorage();
    if (!storage) {
      return;
    }

    try {
      storage.setItem(
        `${this.STORAGE_PREFIX}pending`,
        JSON.stringify(this.pendingRequests)
      );
    } catch (error) {
      // No-op: storage quota might be exceeded
    }
  }

  private loadPendingRequests(): void {
    const storage = this.getLocalStorage();
    if (!storage) {
      return;
    }

    try {
      const stored = storage.getItem(`${this.STORAGE_PREFIX}pending`);
      if (stored) {
        const parsed: OfflineData[] = JSON.parse(stored).map((entry: any) => ({
          id: entry.id ?? this.generateRequestId(),
          timestamp: entry.timestamp ?? Date.now(),
          endpoint: entry.endpoint,
          method: entry.method ?? 'POST',
          data: entry.data,
          attempts: entry.attempts ?? 0
        }));
        this.pendingRequests = parsed;
        this.pendingRequestsSubject.next([...this.pendingRequests]);
        this.syncFlowContextQueue();
      }
    } catch (error) {
      this.pendingRequests = [];
    }
  }

  // Utility methods
  public getConnectionQuality(): 'excellent' | 'good' | 'fair' | 'poor' | 'offline' {
    const status = this.connectionStatus();

    if (!status.isOnline) {
      return 'offline';
    }

    if (!status.rtt || !status.downlink) {
      return 'good'; // Default when network info not available
    }

    if (status.rtt < 150 && status.downlink > 5) {
      return 'excellent';
    } else if (status.rtt < 300 && status.downlink > 1.5) {
      return 'good';
    } else if (status.rtt < 600 && status.downlink > 0.5) {
      return 'fair';
    } else {
      return 'poor';
    }
  }

  public getOfflineCapabilities(): {
    canCache: boolean;
    canQueue: boolean;
    storageAvailable: boolean;
    pendingCount: number;
  } {
    const storage = this.getLocalStorage();
    return {
      canCache: environment.features.enableOfflineMode && !!storage,
      canQueue: environment.features.enableOfflineMode,
      storageAvailable: this.checkStorageAvailable(),
      pendingCount: this.pendingRequests.length
    };
  }

  private checkStorageAvailable(): boolean {
    const storage = this.getLocalStorage();
    if (!storage) {
      return false;
    }

    try {
      const test = '__storage_test__';
      storage.setItem(test, 'test');
      storage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }

  // Force connectivity check (útil para testing)
  public async checkConnectivity(): Promise<boolean> {
    const windowRef = this.windowRef;
    const navigatorRef = windowRef?.navigator;

    if (!navigatorRef) {
      return false;
    }

    if (navigatorRef.onLine === false) {
      return false;
    }

    const fetchFn = windowRef?.fetch?.bind(windowRef) ?? (typeof fetch === 'function' ? fetch : null);
    if (!fetchFn) {
      return navigatorRef.onLine ?? false;
    }

    try {
      // Intentar hacer una request pequeña
      const response = await fetchFn('/favicon.ico', {
        method: 'HEAD',
        cache: 'no-cache'
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private getStorageKeys(storage: Storage): string[] {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key) {
        keys.push(key);
      }
    }
    return keys;
  }

  private generateRequestId(): string {
    return `offline-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}
