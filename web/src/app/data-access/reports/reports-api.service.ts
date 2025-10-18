import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';

import { environment } from '@environments/environment';
import { resolveHttpClient } from '@services/utils/http-client.util';
import { DocumentStatus } from '@interfaces/types';

export interface PipelineStageSummary {
  stage: string;
  market: 'aguascalientes' | 'edomex' | 'otros';
  total: number;
}

export interface PendingDocumentReportRow {
  clientName: string;
  documentName: string;
  status: DocumentStatus | string;
  market?: 'aguascalientes' | 'edomex' | 'otros';
  lastUpdate?: string;
}

export interface TriggerHistoryReportRow {
  id: string;
  contractId: string;
  triggerPercentage: number;
  createdAt: string;
  triggeredBy: 'system' | 'manual';
  deliveryOrderCreated: boolean;
}

@Injectable({ providedIn: 'root' })
export class ReportsApiService {
  private readonly http: HttpClient = resolveHttpClient();
  private readonly baseUrl = `${environment.apiUrl}${environment.endpoints.reports}`;

  getPipelineSummary(): Observable<PipelineStageSummary[]> {
    if (environment.features.enableMockData) {
      return of(this.getMockPipelineSummary()).pipe(delay(200));
    }

    return this.http.get<PipelineStageSummary[]>(`${this.baseUrl}/pipeline-summary`);
  }

  getPendingDocuments(): Observable<PendingDocumentReportRow[]> {
    if (environment.features.enableMockData) {
      return of(this.getMockPendingDocuments()).pipe(delay(200));
    }

    return this.http.get<PendingDocumentReportRow[]>(`${this.baseUrl}/documents/pending`);
  }

  getTriggerHistory(): Observable<TriggerHistoryReportRow[]> {
    if (environment.features.enableMockData) {
      return of(this.getMockTriggerHistory()).pipe(delay(200));
    }

    return this.http.get<TriggerHistoryReportRow[]>(`${this.baseUrl}/triggers/history`);
  }

  private getMockPipelineSummary(): PipelineStageSummary[] {
    return [
      { stage: 'Nueva', market: 'aguascalientes', total: 12 },
      { stage: 'Expediente', market: 'aguascalientes', total: 8 },
      { stage: 'Aprobado', market: 'edomex', total: 5 },
      { stage: 'Activo', market: 'edomex', total: 3 }
    ];
  }

  private getMockPendingDocuments(): PendingDocumentReportRow[] {
    return [
      {
        clientName: 'Juan Pérez',
        documentName: 'INE Vigente',
        status: DocumentStatus.Pendiente,
        market: 'aguascalientes',
        lastUpdate: new Date().toISOString()
      },
      {
        clientName: 'María López',
        documentName: 'Comprobante de domicilio',
        status: DocumentStatus.Aprobado,
        market: 'aguascalientes',
        lastUpdate: new Date(Date.now() - 86400000).toISOString()
      },
      {
        clientName: 'Soluciones Transporte MX',
        documentName: 'Contrato firmado',
        status: DocumentStatus.Pendiente,
        market: 'edomex',
        lastUpdate: new Date(Date.now() - 2 * 86400000).toISOString()
      }
    ];
  }

  private getMockTriggerHistory(): TriggerHistoryReportRow[] {
    const now = Date.now();
    return [
      {
        id: 'trg-001',
        contractId: 'CT-1277',
        triggerPercentage: 0.52,
        createdAt: new Date(now - 3600_000).toISOString(),
        triggeredBy: 'system',
        deliveryOrderCreated: true
      },
      {
        id: 'trg-002',
        contractId: 'CT-2032',
        triggerPercentage: 0.49,
        createdAt: new Date(now - 3 * 3600_000).toISOString(),
        triggeredBy: 'manual',
        deliveryOrderCreated: false
      }
    ];
  }
}
