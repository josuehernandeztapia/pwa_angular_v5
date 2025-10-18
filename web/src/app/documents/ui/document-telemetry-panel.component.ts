import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { BoundaryIssue, BoundaryIssueStatus, BoundaryIssueType } from '@core-services/error-boundary.service';
import { OfflineData } from '@core-services/offline.service';

export interface DocumentTelemetryStats {
  total: number;
  queued: number;
  processing: number;
  ocrFailures: number;
  networkTimeouts: number;
  offlineQueued: number;
}

@Component({
  selector: 'app-document-telemetry-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './document-telemetry-panel.component.html',
  styleUrls: ['./document-telemetry-panel.component.scss']
})
export class DocumentTelemetryPanelComponent {
  @Input() stats: DocumentTelemetryStats = {
    total: 0,
    queued: 0,
    processing: 0,
    ocrFailures: 0,
    networkTimeouts: 0,
    offlineQueued: 0
  };
  @Input() issues: BoundaryIssue[] = [];
  @Input() queuedRequests: OfflineData[] = [];
  @Input() busyQueueIds: ReadonlySet<string> | string[] = new Set<string>();

  @Output() retryIssue = new EventEmitter<string>();
  @Output() dismissIssue = new EventEmitter<string>();
  @Output() retryQueued = new EventEmitter<string>();
  @Output() discardQueued = new EventEmitter<string>();

  protected formatType(type: BoundaryIssueType): string {
    switch (type) {
      case 'network-timeout':
        return 'Timeout de red';
      case 'ocr-failure':
        return 'Error de OCR';
      case 'offline-queued':
        return 'Acción en cola offline';
      default:
        return 'Incidencia';
    }
  }

  protected formatStatus(status: BoundaryIssueStatus): string {
    switch (status) {
      case 'queued':
        return 'En cola';
      case 'processing':
        return 'En proceso';
      case 'resolved':
        return 'Resuelta';
      case 'failed':
        return 'Fallida';
      default:
        return status;
    }
  }

  protected queueLabel(request: OfflineData): string {
    const metaName = request.data?.metadata?.documentName;
    if (typeof metaName === 'string' && metaName.trim().length > 0) {
      return metaName;
    }
    if (typeof request.data?.fileName === 'string') {
      return request.data.fileName;
    }
    if (typeof request.data?.documentId === 'string') {
      return request.data.documentId;
    }
    return request.endpoint || 'Acción en cola';
  }

  protected isBusy(id: string): boolean {
    if (this.busyQueueIds instanceof Set) {
      return this.busyQueueIds.has(id);
    }
    if (Array.isArray(this.busyQueueIds)) {
      return this.busyQueueIds.includes(id);
    }
    return false;
  }

  protected trackIssue(_index: number, issue: BoundaryIssue): string {
    return issue.id;
  }

  protected trackQueue(_index: number, request: OfflineData): string {
    return request.id;
  }

  onRetryIssue(id: string): void {
    this.retryIssue.emit(id);
  }

  onDismissIssue(id: string): void {
    this.dismissIssue.emit(id);
  }

  onRetryQueued(id: string): void {
    this.retryQueued.emit(id);
  }

  onDiscardQueued(id: string): void {
    this.discardQueued.emit(id);
  }
}
