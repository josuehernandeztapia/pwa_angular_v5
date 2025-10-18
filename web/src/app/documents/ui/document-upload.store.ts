import { Injectable, signal } from '@angular/core';

import { OfflineData } from '@core-services/offline.service';
import { Document } from '@interfaces/types';
import {
  DocumentCompletionStatus,
  MemberDocumentSection
} from '../types/document-upload.models';
import { TandaFlowContextState } from '@feature-services/tanda/tanda-validation.service';

const INITIAL_COMPLETION_STATUS: DocumentCompletionStatus = {
  totalDocs: 0,
  completedDocs: 0,
  pendingDocs: 0,
  completionPercentage: 0,
  allComplete: false
};

@Injectable({ providedIn: 'root' })
export class DocumentUploadStore {
  private readonly requiredDocumentsSignal = signal<Document[]>([]);
  private readonly completionStatusSignal = signal<DocumentCompletionStatus>(INITIAL_COMPLETION_STATUS);
  private readonly primaryDocumentsSignal = signal<Document[]>([]);
  private readonly memberSectionsSignal = signal<MemberDocumentSection[]>([]);
  private readonly tandaStateSignal = signal<TandaFlowContextState | null>(null);
  private readonly syncMessageSignal = signal<string | null>(null);
  private readonly queuedRequestsSignal = signal<OfflineData[]>([]);
  private readonly offlineStateSignal = signal<{ isOffline: boolean; pendingDocs: number }>({
    isOffline: false,
    pendingDocs: 0
  });
  private readonly queueInProgressSignal = signal<Set<string>>(new Set());
  private readonly uploadProgressSignal = signal<Record<string, number>>({});
  private readonly retryCountsSignal = signal<Record<string, number>>({});
  private readonly auditLogSignal = signal<Array<{ timestamp: Date; docName: string; action: string; meta?: any }>>([]);

  // Getters
  requiredDocuments(): Document[] {
    return this.requiredDocumentsSignal();
  }

  completionStatus(): DocumentCompletionStatus {
    return this.completionStatusSignal();
  }

  primaryDocuments(): Document[] {
    return this.primaryDocumentsSignal();
  }

  memberSections(): MemberDocumentSection[] {
    return this.memberSectionsSignal();
  }

  tandaState(): TandaFlowContextState | null {
    return this.tandaStateSignal();
  }

  syncMessage(): string | null {
    return this.syncMessageSignal();
  }

  queuedRequests(): OfflineData[] {
    return this.queuedRequestsSignal();
  }

  offlineState(): { isOffline: boolean; pendingDocs: number } {
    return this.offlineStateSignal();
  }

  queueInProgress(): Set<string> {
    return this.queueInProgressSignal();
  }

  uploadProgress(): Record<string, number> {
    return this.uploadProgressSignal();
  }

  retryCounts(): Record<string, number> {
    return this.retryCountsSignal();
  }

  auditLog(): Array<{ timestamp: Date; docName: string; action: string; meta?: any }> {
    return this.auditLogSignal();
  }

  // Mutations
  setRequiredDocuments(docs: Document[]): void {
    this.requiredDocumentsSignal.set(docs);
  }

  updateRequiredDocuments(updater: (docs: Document[]) => Document[]): void {
    this.requiredDocumentsSignal.update(updater);
  }

  setCompletionStatus(status: DocumentCompletionStatus): void {
    this.completionStatusSignal.set(status);
  }

  setPrimaryDocuments(docs: Document[]): void {
    this.primaryDocumentsSignal.set(docs);
  }

  setMemberSections(sections: MemberDocumentSection[]): void {
    this.memberSectionsSignal.set(sections);
  }

  setTandaState(state: TandaFlowContextState | null): void {
    this.tandaStateSignal.set(state);
  }

  setSyncMessage(message: string | null): void {
    this.syncMessageSignal.set(message);
  }

  setQueuedRequests(requests: OfflineData[]): void {
    this.queuedRequestsSignal.set(requests);
  }

  setOfflineState(isOffline: boolean, pendingDocs: number): void {
    this.offlineStateSignal.set({ isOffline, pendingDocs });
  }

  addQueueAction(queueId: string): void {
    this.queueInProgressSignal.update((set) => {
      const next = new Set(set);
      next.add(queueId);
      return next;
    });
  }

  removeQueueAction(queueId: string): void {
    this.queueInProgressSignal.update((set) => {
      const next = new Set(set);
      next.delete(queueId);
      return next;
    });
  }

  setUploadProgress(docId: string, progress: number): void {
    this.uploadProgressSignal.update((map) => ({ ...map, [docId]: progress }));
  }

  clearUploadProgress(docId: string): void {
    this.uploadProgressSignal.update((map) => {
      const next = { ...map };
      delete next[docId];
      return next;
    });
  }

  incrementRetryCount(docId: string): void {
    this.retryCountsSignal.update((map) => ({ ...map, [docId]: (map[docId] ?? 0) + 1 }));
  }

  resetRetryCount(docId: string): void {
    this.retryCountsSignal.update((map) => {
      if (!(docId in map)) {
        return map;
      }
      const next = { ...map };
      next[docId] = 0;
      return next;
    });
  }

  appendAuditEntry(entry: { timestamp: Date; docName: string; action: string; meta?: any }): void {
    this.auditLogSignal.update((log) => [...log, entry]);
  }

  resetAuditLog(): void {
    this.auditLogSignal.set([]);
  }
}
