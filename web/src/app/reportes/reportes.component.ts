import { CommonModule } from '@angular/common';
import { Component, OnDestroy, signal } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { DownloadService } from '@core-services/download.service';
import { FlowContextService } from '@core-services/flow-context.service';
import { ReportsApiService, PipelineStageSummary, PendingDocumentReportRow, TriggerHistoryReportRow } from '@data-access/reports/reports-api.service';
import { IconComponent } from '@shared/icon/icon.component';

interface ReportDefinition {
  id: string;
  name: string;
  description: string;
  format: 'csv' | 'json';
  type: ReportType;
}

type ReportType = 'pipelineSummary' | 'documentsPending' | 'triggerHistory';

interface ReportState {
  loading: boolean;
  error: string | null;
}

@Component({
  selector: 'app-reportes',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './reportes.component.html',
  styleUrls: ['./reportes.component.scss']
})
export class ReportesComponent implements OnDestroy {
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly downloader: DownloadService,
    private readonly flowContext: FlowContextService,
    private readonly reportsApi: ReportsApiService
  ) {
    this.flowContext.setBreadcrumbs(['Dashboard', 'Reportes']);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  readonly reports: ReadonlyArray<ReportDefinition> = [
    {
      id: 'pipeline-summary',
      name: 'Pipeline por etapa',
      description: 'Concentrado de oportunidades por etapa y mercado (fuente: BFF /reports/pipeline-summary).',
      format: 'csv',
      type: 'pipelineSummary'
    },
    {
      id: 'document-status',
      name: 'Documentos pendientes',
      description: 'Checklist de documentos faltantes por cliente según el BFF de documentos.',
      format: 'csv',
      type: 'documentsPending'
    },
    {
      id: 'trigger-history',
      name: 'Historial de triggers',
      description: 'Registro de triggers automáticos y creación de órdenes de entrega.',
      format: 'json',
      type: 'triggerHistory'
    }
  ];

  private readonly reportStates = signal<Record<string, ReportState>>(
    this.reports.reduce<Record<string, ReportState>>((acc, report) => {
      acc[report.id] = { loading: false, error: null };
      return acc;
    }, {})
  );


  isReportLoading(reportId: string): boolean {
    return this.reportStates()[reportId]?.loading ?? false;
  }

  reportError(reportId: string): string | null {
    return this.reportStates()[reportId]?.error ?? null;
  }

  download(report: ReportDefinition): void {
    if (this.isReportLoading(report.id)) {
      return;
    }

    this.setReportState(report.id, { loading: true, error: null });

    let request$: Observable<any> | null = null;
    switch (report.type) {
      case 'pipelineSummary':
        request$ = this.reportsApi.getPipelineSummary();
        break;
      case 'documentsPending':
        request$ = this.reportsApi.getPendingDocuments();
        break;
      case 'triggerHistory':
        request$ = this.reportsApi.getTriggerHistory();
        break;
      default:
        request$ = null;
    }

    if (!request$) {
      this.setReportState(report.id, { loading: false, error: 'Reporte no soportado.' });
      return;
    }

    request$
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data: any) => {
          try {
            this.downloadReport(report, data as unknown);
            this.setReportState(report.id, { loading: false, error: null });
          } catch (error) {
            this.setReportState(report.id, {
              loading: false,
              error: 'No fue posible preparar el archivo para descarga.'
            });
          }
        },
        error: () => {
          this.setReportState(report.id, {
            loading: false,
            error: 'No fue posible descargar el reporte desde el BFF. Intenta nuevamente.'
          });
        }
      });
  }

  private downloadReport(report: ReportDefinition, payload: unknown): void {
    const filename = this.buildFilename(report);

    if (report.type === 'triggerHistory') {
      const rows = payload as TriggerHistoryReportRow[];
      const json = JSON.stringify(rows, null, 2);
      this.downloader.downloadText(json, 'application/json;charset=utf-8', {
        filename,
        target: '_self'
      });
      return;
    }

    const rows = report.type === 'pipelineSummary'
      ? this.formatPipelineRows(payload as PipelineStageSummary[])
      : this.formatDocumentRows(payload as PendingDocumentReportRow[]);

    const csv = this.generateCsv(rows);
    this.downloader.downloadText(csv, 'text/csv;charset=utf-8', {
      filename,
      target: '_self'
    });
  }

  private formatPipelineRows(data: PipelineStageSummary[]): string[][] {
    const header = ['Etapa', 'Mercado', 'Total'];
    const body = data.map(row => [row.stage, this.formatMarket(row.market), String(row.total)]);
    return [header, ...body];
  }

  private formatDocumentRows(data: PendingDocumentReportRow[]): string[][] {
    const header = ['Cliente', 'Documento', 'Estado', 'Mercado', 'Última actualización'];
    const body = data.map(row => [
      row.clientName,
      row.documentName,
      String(row.status),
      this.formatMarket(row.market),
      row.lastUpdate ? new Date(row.lastUpdate).toLocaleString('es-MX') : 'N/D'
    ]);
    return [header, ...body];
  }

  private formatMarket(market?: 'aguascalientes' | 'edomex' | 'otros'): string {
    switch (market) {
      case 'aguascalientes':
        return 'AGS';
      case 'edomex':
        return 'EdoMex';
      case 'otros':
        return 'Otros';
      default:
        return 'N/D';
    }
  }

  private generateCsv(rows: string[][]): string {
    return rows
      .map(row => row.map(value => `"${value.replace(/"/g, '""')}"`).join(','))
      .join('\n');
  }

  private buildFilename(report: ReportDefinition): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${report.id}-${timestamp}.${report.format}`;
  }

  private setReportState(reportId: string, patch: Partial<ReportState>): void {
    this.reportStates.update(state => ({
      ...state,
      [reportId]: {
        ...(state[reportId] ?? { loading: false, error: null }),
        ...patch
      }
    }));
  }
}
