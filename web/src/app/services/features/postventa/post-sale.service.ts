import { Injectable, Optional } from '@angular/core';
import { Observable, of, timer } from 'rxjs';
import { catchError, filter, map, tap } from 'rxjs/operators';

import { OfflineData, OfflineProcessResult, OfflineService } from '@core-services/offline.service';
import { HttpClientService } from '@core-services/http-client.service';
import { environment } from '@environments/environment';
import type { AttachmentType } from '@feature-services/postventa/cases.service';
import type { ManualOCRData } from '@shared/manual-ocr-entry.component';
import { VisionOCRRetryService, OCRResult } from '@feature-services/documents/vision-ocr-retry.service';
import { AnalyticsService } from '@core-services/analytics.service';

export interface PostSaleCase {
  id: string;
  status: 'open' | 'need_info' | 'in_progress' | 'solved';
  createdAt: string;
}

export interface PostSaleOfflinePayload {
  feature: 'postventa-photo';
  caseId: string;
  stepId: AttachmentType;
  fileName: string;
  fileSize: number;
  queuedAt: number;
}

export interface PostSalePhotoUploadResult {
  status: 'processed' | 'queued';
  caseId: string;
  stepId: AttachmentType;
  confidence?: number;
  missing?: string[];
  requiresManualReview?: boolean;
  retryCount?: number;
  fallbackUsed?: boolean;
  processingTime?: number;
  offlineQueued?: boolean;
  offlineSynced?: boolean;
  payload?: PostSaleOfflinePayload;
}

export interface PostSalePhotoOptions {
  threshold: number;
}

@Injectable({ providedIn: 'root' })
export class PostSaleService {
  private readonly storageKey = '__post_sale_cases__';
  private readonly metricsKey = '__post_sale_metrics__';
  private readonly photoFeature = 'postventa-photo';
  private readonly stubLatencyMs = 120;
  private readonly caseRequestTimeoutMs = Math.min(environment.timeouts?.api ?? 30000, 20000);
  private readonly metricsRequestTimeoutMs = Math.min(environment.timeouts?.api ?? 30000, 10000);
  private readonly photoRequestTimeoutMs = Math.min(environment.timeouts?.fileUpload ?? 120000, 45000);
  private readonly apiRetryAttempts = 2;

  readonly online$ = this.offline.online$;
  readonly pendingPhotoRequests$ = this.offline.pendingRequests$.pipe(
    map(requests => requests.filter(request => this.isPhotoRequest(request)))
  );
  readonly processedPhotoRequests$ = this.offline.processedRequests$.pipe(
    filter(result => this.isPhotoRequest(result.request))
  );

  constructor(
    private readonly offline: OfflineService,
    private readonly ocrRetry: VisionOCRRetryService,
    @Optional() private readonly analytics?: AnalyticsService,
    @Optional() private readonly httpClient?: HttpClientService
  ) {}

  private unwrap<T>(resp: any, message: string): T {
    if (resp?.success && resp.data) return resp.data;
    if (resp && !resp.hasOwnProperty('success')) return resp; // Direct response
    throw new Error(message);
  }

  createCase(): Observable<PostSaleCase> {
    if (this.canUseBff()) {
      return this.httpClient!
        .post<any>('postventa/cases', {}, {
          showLoading: false,
          showError: true,
          retryAttempts: this.apiRetryAttempts,
          timeoutMs: this.caseRequestTimeoutMs
        })
        .pipe(
          map(resp => this.unwrap<PostSaleCase>(resp, 'Failed to create post-sale case')),
          tap(record => {
            this.persistCase(record);
            this.analytics?.track('post_sale_case_initialized', { caseId: record.id, source: 'bff' });
          }),
          catchError(error => {
            this.analytics?.track('post_sale_case_bff_failed', { error: this.normalizeError(error) });
            return of(this.createLocalCase('bff-fallback'));
          })
        );
    }

    return timer(this.stubLatencyMs).pipe(map(() => this.createLocalCase('stub')));
  }

  private createLocalCase(source: 'stub' | 'bff-fallback'): PostSaleCase {
    const record: PostSaleCase = {
      id: `CASE-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 8)}`,
      status: 'open',
      createdAt: new Date().toISOString()
    };

    this.persistCase(record);
    this.analytics?.track('post_sale_case_initialized', { caseId: record.id, source });
    return record;
  }

  processPhoto(
    caseId: string,
    stepId: AttachmentType,
    file: File,
    options: PostSalePhotoOptions
  ): Observable<PostSalePhotoUploadResult> {
    if (!caseId) {
      return of({ status: 'queued', caseId: 'unknown', stepId, offlineQueued: true });
    }

    if (!this.offline.isOnline()) {
      const payload = this.enqueueOffline(caseId, stepId, file);
      return of({
        status: 'queued',
        caseId,
        stepId,
        confidence: 0,
        missing: ['sync_pending'],
        offlineQueued: true,
        payload
      });
    }

    return this.resolvePhotoPipeline(caseId, stepId, file, options).pipe(
      map(result => this.buildPhotoResult(caseId, stepId, result)),
      tap(result => {
        this.analytics?.track('post_sale_photo_processed', {
          caseId,
          stepId,
          confidence: result.confidence ?? 0,
          fallback: result.fallbackUsed === true,
          retryCount: result.retryCount ?? 0
        });
      }),
      catchError(error => {
        const fallback = this.buildFallbackResult(caseId, stepId);
        this.analytics?.track('post_sale_photo_stubbed', {
          caseId,
          stepId,
          error: this.normalizeError(error)
        });
        return of(fallback);
      })
    );
  }

  recordFirstRecommendation(caseId: string, millis: number): Observable<void> {
    if (this.canUseBff()) {
      return this.httpClient!
        .post<any>(`postventa/cases/${caseId}/metrics/first-recommendation`, { millis }, {
          showLoading: false,
          showError: false,
          retryAttempts: this.apiRetryAttempts,
          timeoutMs: this.metricsRequestTimeoutMs
        })
        .pipe(
          map(() => void 0),
          tap(() => {
            this.persistMetric(caseId, 'firstRecommendationMs', millis);
            this.analytics?.track('post_sale_first_recommendation', { caseId, millis, source: 'bff' });
          }),
          catchError(error => {
            this.persistMetric(caseId, 'firstRecommendationMs', millis);
            this.analytics?.track('post_sale_first_recommendation', {
              caseId,
              millis,
              source: 'fallback',
              error: this.normalizeError(error)
            });
            return of(void 0);
          })
        );
    }

    this.persistMetric(caseId, 'firstRecommendationMs', millis);
    this.analytics?.track('post_sale_first_recommendation', { caseId, millis, source: 'local' });
    return of(void 0);
  }

  recordNeedInfo(caseId: string, fields: string[]): Observable<void> {
    if (this.canUseBff()) {
      return this.httpClient!
        .post<any>(`postventa/cases/${caseId}/metrics/need-info`, { fields }, {
          showLoading: false,
          showError: false,
          retryAttempts: this.apiRetryAttempts,
          timeoutMs: this.metricsRequestTimeoutMs
        })
        .pipe(
          map(() => void 0),
          tap(() => {
            this.persistMetric(caseId, 'needInfoFields', fields);
            this.analytics?.track('post_sale_need_info', { caseId, fields, source: 'bff' });
          }),
          catchError(error => {
            this.persistMetric(caseId, 'needInfoFields', fields);
            this.analytics?.track('post_sale_need_info', {
              caseId,
              fields,
              source: 'fallback',
              error: this.normalizeError(error)
            });
            return of(void 0);
          })
        );
    }

    this.persistMetric(caseId, 'needInfoFields', fields);
    this.analytics?.track('post_sale_need_info', { caseId, fields, source: 'local' });
    return of(void 0);
  }

  storeManualEntry(caseId: string, stepId: AttachmentType, data: ManualOCRData): Observable<void> {
    if (this.canUseBff()) {
      return this.httpClient!
        .post<any>(`postventa/cases/${caseId}/manual-ocr`, {
          stepId,
          fields: data.fields,
          confidence: data.confidence,
          isManual: data.isManual,
        }, {
          showLoading: false,
          showError: false,
          retryAttempts: this.apiRetryAttempts,
          timeoutMs: this.metricsRequestTimeoutMs
        })
        .pipe(
          map(() => void 0),
          tap(() => {
            this.persistMetric(caseId, `manualEntry:${stepId}`, {
              fields: data.fields,
              confidence: data.confidence,
              savedAt: Date.now()
            });
            this.analytics?.track('post_sale_manual_entry_saved', {
              caseId,
              stepId,
              confidence: data.confidence,
              fields: Object.keys(data.fields ?? {}),
              source: 'bff'
            });
          }),
          catchError(error => {
            this.persistMetric(caseId, `manualEntry:${stepId}`, {
              fields: data.fields,
              confidence: data.confidence,
              savedAt: Date.now()
            });
            this.analytics?.track('post_sale_manual_entry_saved', {
              caseId,
              stepId,
              confidence: data.confidence,
              fields: Object.keys(data.fields ?? {}),
              source: 'fallback',
              error: this.normalizeError(error)
            });
            return of(void 0);
          })
        );
    }

    this.persistMetric(caseId, `manualEntry:${stepId}`, {
      fields: data.fields,
      confidence: data.confidence,
      savedAt: Date.now()
    });
    this.analytics?.track('post_sale_manual_entry_saved', {
      caseId,
      stepId,
      confidence: data.confidence,
      fields: Object.keys(data.fields ?? {}),
      source: 'local'
    });
    return of(void 0);
  }

  mapOfflineResult(result: OfflineProcessResult): PostSalePhotoUploadResult | null {
    if (!this.isPhotoRequest(result.request)) {
      return null;
    }

    const payload = result.request.data as PostSaleOfflinePayload | undefined;
    if (!payload) {
      return null;
    }

    if (result.success) {
      const confidence = this.generateConfidence(payload.stepId);
      return {
        status: 'processed',
        caseId: payload.caseId,
        stepId: payload.stepId,
        confidence,
        missing: this.generateMissing(payload.stepId, confidence),
        requiresManualReview: confidence < 0.7,
        retryCount: result.request.attempts ?? 0,
        fallbackUsed: confidence < 0.65,
        offlineSynced: true
      };
    }

    return {
      status: 'queued',
      caseId: payload.caseId,
      stepId: payload.stepId,
      confidence: 0,
      missing: ['sync_pending'],
      retryCount: result.request.attempts ?? 0,
      offlineQueued: true,
      payload
    };
  }

  private simulateOcr(stepId: AttachmentType, threshold: number): Observable<OCRResult> {
    const mockImageUrl = `data:image/jpeg;base64,${stepId}-${Date.now()}`;
    return this.ocrRetry.ocrWithRetry(mockImageUrl, stepId, {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 5000,
      confidenceThreshold: threshold,
      enableFallback: true
    });
  }

  private buildPhotoResult(caseId: string, stepId: AttachmentType, ocr: OCRResult): PostSalePhotoUploadResult {
    const confidence = ocr.confidence ?? 0;
    return {
      status: 'processed',
      caseId,
      stepId,
      confidence,
      missing: this.generateMissing(stepId, confidence, ocr.fields),
      requiresManualReview: confidence < 0.7 || (ocr.fields && Object.keys(ocr.fields).length === 0),
      retryCount: ocr.retryCount,
      fallbackUsed: ocr.fallbackUsed,
      processingTime: ocr.processingTime
    };
  }

  private buildFallbackResult(caseId: string, stepId: AttachmentType): PostSalePhotoUploadResult {
    return {
      status: 'processed',
      caseId,
      stepId,
      confidence: 0,
      missing: ['manual_review'],
      requiresManualReview: true,
      retryCount: 0,
      fallbackUsed: true
    };
  }

  private enqueueOffline(caseId: string, stepId: AttachmentType, file: File): PostSaleOfflinePayload {
    const payload: PostSaleOfflinePayload = {
      feature: this.photoFeature,
      caseId,
      stepId,
      fileName: file.name,
      fileSize: file.size,
      queuedAt: Date.now()
    };

    this.offline.storeOfflineRequest(`/postventa/cases/${caseId}/photos`, 'POST', payload);
    this.analytics?.track('post_sale_photo_offline_enqueued', {
      caseId,
      stepId,
      size: file.size
    });

    return payload;
  }

  private resolvePhotoPipeline(
    caseId: string,
    stepId: AttachmentType,
    _file: File,
    options: PostSalePhotoOptions
  ): Observable<OCRResult> {
    if (this.canUseBff()) {
      return this.httpClient!.post<any>('postventa/photos/analyze', {
        caseId,
        stepId,
        confidenceThreshold: options.threshold
      }, {
        showLoading: false,
        showError: true,
        retryAttempts: this.apiRetryAttempts,
        timeoutMs: this.photoRequestTimeoutMs
      }).pipe(map(resp => this.unwrap<OCRResult>(resp, 'Failed to analyze OCR')));
    }

    return this.simulateOcr(stepId, options.threshold);
  }

  private canUseBff(): boolean {
    return Boolean(this.httpClient && environment.features.enablePostSaleBff);
  }

  private isPhotoRequest(request: OfflineData | null | undefined): boolean {
    if (!request) {
      return false;
    }

    const payload = request.data as PostSaleOfflinePayload | undefined;
    return Boolean(payload && payload.feature === this.photoFeature && payload.stepId);
  }

  private generateConfidence(stepId: AttachmentType): number {
    const base = stepId === 'vin' ? 0.68 : 0.74;
    const jitter = Math.random() * 0.26; // up to ~1.0
    return Math.min(0.98, base + jitter);
  }

  private generateMissing(stepId: AttachmentType, confidence: number, fields: Record<string, any> = {}): string[] {
    if (confidence >= 0.75) {
      return [];
    }

    switch (stepId) {
      case 'vin':
        return fields['vin'] ? [] : ['vin'];
      case 'odometer':
        return fields['kilometers'] ? [] : ['kilometers'];
      case 'plate':
        return fields['plate'] ? [] : ['plate'];
      default:
        return [];
    }
  }

  private persistCase(record: PostSaleCase): void {
    try {
      const existing = this.restoreCases();
      existing[record.id] = record;
      localStorage.setItem(this.storageKey, JSON.stringify(existing));
    } catch {
      // Ignore storage errors
    }
  }

  private persistMetric(caseId: string, key: string, value: unknown): void {
    try {
      const metrics = this.restoreMetrics();
      const entry = metrics[caseId] ?? {};
      entry[key] = value;
      metrics[caseId] = entry;
      localStorage.setItem(this.metricsKey, JSON.stringify(metrics));
    } catch {
      // Ignore storage errors
    }
  }

  private normalizeError(error: unknown): string {
    if (!error) {
      return 'unknown';
    }
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  private restoreCases(): Record<string, PostSaleCase> {
    try {
      const raw = localStorage.getItem(this.storageKey);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  private restoreMetrics(): Record<string, Record<string, unknown>> {
    try {
      const raw = localStorage.getItem(this.metricsKey);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
}
