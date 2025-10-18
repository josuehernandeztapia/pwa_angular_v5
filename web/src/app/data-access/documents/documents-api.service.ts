import { Injectable, Optional } from '@angular/core';
import { Observable, of } from 'rxjs';

import { ClientsApiService } from '@data-access/clients/clients-api.service';
import { OfflineService } from '@core-services/offline.service';
import { Document, DocumentStatus } from '@interfaces/types';

@Injectable({ providedIn: 'root' })
export class DocumentsApiService {
  constructor(
    private readonly clientsApi: ClientsApiService,
    @Optional() private readonly offline?: OfflineService
  ) {}

  getClientDocuments(clientId: string): Observable<Document[]> {
    return this.clientsApi.getClientDocuments(clientId);
  }

  updateDocumentStatus(
    clientId: string,
    documentId: string,
    status: DocumentStatus,
    changes: Partial<Document> = {}
  ): Observable<Document | null> {
    if (this.shouldEnqueueOffline()) {
      const payload = { status, ...changes };
      this.offline?.storeOfflineRequest(`clients/${clientId}/documents/${documentId}`, 'PATCH', payload);
      this.clientsApi.applyLocalDocumentPatch(clientId, {
        id: documentId,
        ...payload
      });
      return of({ id: documentId, ...payload } as Document);
    }

    return this.clientsApi.updateDocumentStatus(clientId, documentId, status, changes);
  }

  private shouldEnqueueOffline(): boolean {
    return Boolean(this.offline && this.offline.isOffline());
  }
}
