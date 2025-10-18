import { HttpClient } from '@angular/common/http';
import { Injectable, Optional } from '@angular/core';
import { firstValueFrom, TimeoutError } from 'rxjs';
import { timeout } from 'rxjs/operators';

import { AnalyticsService } from '@core-services/analytics.service';
import { MonitoringService } from '@core-services/monitoring.service';
import { FlowContextService } from '@core-services/flow-context.service';
import { resolveBffBaseUrl } from '@services/utils/resolve-bff-base-url.util';

export type AviDecision = 'GO' | 'REVIEW' | 'NO_GO';

export interface AviRecordingPayload {
  audio: Blob;
  sessionId?: string;
  transcript?: string;
  advisorId?: string | null;
  clientId?: string | null;
  market?: string | null;
  metadata?: Record<string, any>;
}

export interface AviBackendResult {
  sessionId: string;
  decision: AviDecision;
  score: number;
  confidence: number;
  transcript: string;
  processedAt: number;
  flags?: string[];
  fallbackUsed?: boolean;
}

interface RemoteAviResponse {
  sessionId: string;
  decision: AviDecision;
  score: number;
  confidence: number;
  transcript: string;
  flags?: string[];
}

@Injectable({ providedIn: 'root' })
export class AviBackendService {
  private readonly contextKey = 'avi';
  private readonly timeoutMs = 7000;
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpClient,
    private readonly analytics: AnalyticsService,
    private readonly monitoring: MonitoringService,
    @Optional() private readonly flowContext?: FlowContextService,
  ) {
    this.baseUrl = resolveBffBaseUrl();
  }

  async analyzeRecording(payload: AviRecordingPayload): Promise<AviBackendResult> {
    const sessionId = payload.sessionId ?? `avi-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const formData = new FormData();
    formData.append('audio', payload.audio, `avi-${sessionId}.webm`);
    formData.append('sessionId', sessionId);
    if (payload.transcript) {
      formData.append('transcript', payload.transcript);
    }
    if (payload.advisorId) {
      formData.append('advisorId', payload.advisorId);
    }
    if (payload.clientId) {
      formData.append('clientId', payload.clientId);
    }
    if (payload.market) {
      formData.append('market', payload.market);
    }

    let remote: RemoteAviResponse | null = null;
    let fallbackUsed = false;

    try {
      remote = await firstValueFrom(
        this.http
          .post<RemoteAviResponse>(`${this.baseUrl}/v1/avi/analyze`, formData)
          .pipe(timeout(this.timeoutMs))
      );
      this.monitoring.captureInfo(
        'avi',
        'analyze.success',
        'Sesión AVI analizada correctamente',
        {
          sessionId,
          score: remote.score,
          decision: remote.decision,
          confidence: remote.confidence,
        },
        { notifyExternally: true, channels: ['datadog'] }
      );
    } catch (error) {
      fallbackUsed = true;
      const isTimeout = error instanceof TimeoutError;
      this.monitoring.captureWarning(
        'avi',
        'analyze',
        isTimeout ? 'Timeout al analizar sesión AVI, usando respuesta simulada' : 'Fallo al analizar sesión AVI, usando respuesta simulada',
        { sessionId, error },
        { notifyExternally: true, channels: ['slack', 'datadog'] }
      );
      remote = this.buildFallbackResult(sessionId, payload.transcript);
    }

    const result: AviBackendResult = {
      sessionId: remote.sessionId,
      decision: remote.decision,
      score: remote.score,
      confidence: remote.confidence,
      transcript: remote.transcript,
      processedAt: Date.now(),
      flags: remote.flags ?? [],
      fallbackUsed,
    };

    this.analytics.track('avi_recording_processed', {
      sessionId: result.sessionId,
      decision: result.decision,
      score: result.score,
      confidence: result.confidence,
      fallbackUsed,
    });

    this.persistResult(result, payload);

    return result;
  }

  private persistResult(result: AviBackendResult, payload: AviRecordingPayload): void {
    if (!this.flowContext) {
      return;
    }

    this.flowContext.updateContext<any>(this.contextKey, current => {
      const base = current ?? {
        sessionId: result.sessionId,
        startedAt: Date.now(),
        status: 'IN_PROGRESS',
        responses: []
      };

      return {
        ...base,
        sessionId: result.sessionId,
        status: 'COMPLETED',
        processedAt: result.processedAt,
        score: result.score,
        decision: result.decision,
        confidence: result.confidence,
        transcript: result.transcript,
        flags: result.flags ?? [],
        requiresSupervisor: result.decision === 'REVIEW',
        fallbackUsed: result.fallbackUsed,
        metadata: {
          ...(base.metadata ?? {}),
          ...(payload.metadata ?? {})
        }
      };
    }, {
      breadcrumbs: ['Dashboard', 'AVI']
    });
  }

  private buildFallbackResult(sessionId: string, transcript?: string | null): RemoteAviResponse {
    const fallbackScore = transcript?.length
      ? Math.min(980, 620 + transcript.length)
      : 780;

    const decision: AviDecision = fallbackScore >= 750
      ? 'GO'
      : fallbackScore >= 600
        ? 'REVIEW'
        : 'NO_GO';

    return {
      sessionId,
      decision,
      score: Math.round(fallbackScore),
      confidence: decision === 'GO' ? 0.82 : decision === 'REVIEW' ? 0.65 : 0.48,
      transcript: transcript ?? 'Transcripción simulada generada localmente.',
      flags: decision === 'GO' ? ['voice_consistent'] : ['requires_followup']
    };
  }
}
