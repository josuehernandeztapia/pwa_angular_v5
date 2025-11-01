import { Injectable, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Observable, of } from 'rxjs';
import { map, tap, take } from 'rxjs/operators';

import { HttpClientService, ApiResponse } from '@core-services/http-client.service';
import { ClientsMockAdapter } from '@internal-services/mock-adapters/clients-mock.adapter';
import { Client, Document, DocumentStatus, EventLog, Ecosystem } from '@interfaces/types';
import { CollectiveCreditGroup } from '@interfaces/tanda';
import { EcosystemHierarchyNode } from '@internal-services/mock-adapters/clients-mock.adapter';
import { environment } from '@environments/environment';
import { DemoModeService } from '@core-services/demo-mode.service';

@Injectable({ providedIn: 'root' })
export class ClientsApiService {
  private readonly clientsSignal = signal<Client[]>([]);
  readonly clients = this.clientsSignal.asReadonly();
  readonly clients$ = toObservable(this.clients);

  constructor(
    private readonly httpClient: HttpClientService,
    private readonly mockClients: ClientsMockAdapter,
    private readonly demoMode: DemoModeService
  ) {
    this.demoMode.isDemoMode$.subscribe(isDemo => {
      this.clientsSignal.set([]);
      if (isDemo) {
        this.getClients().pipe(take(1)).subscribe();
      }
    });
  }

  /**
   * Fetch clients (optionally filtered).
   */
  getClients(filters?: {
    market?: string;
    flow?: string;
    status?: string;
    search?: string;
  }): Observable<Client[]> {
    if (environment.features.enableMockData) {
      return this.mockClients.getClients().pipe(
        map(clients => this.applyFilters(clients, filters)),
        tap(clients => this.clientsSignal.set(clients))
      );
    }

    return this.httpClient.get<Client[]>('clients', {
      params: filters as any,
      showLoading: true
    }).pipe(
      map(response => response.data || []),
      tap(clients => this.clientsSignal.set(clients))
    );
  }

  searchClients(query: string): Observable<Client[]> {
    return this.getClients({ search: query });
  }

  getClientById(id: string): Observable<Client | null> {
    if (environment.features.enableMockData) {
      return this.mockClients.getClientById(id);
    }

    return this.httpClient.get<Client>(`clients/${id}`).pipe(
      map(response => response.data || null)
    );
  }

  createClient(clientData: Partial<Client>): Observable<Client> {
    if (environment.features.enableMockData) {
      return this.mockClients.createClient(clientData).pipe(
        tap(client => this.clientsSignal.set([...this.clientsSignal(), client]))
      );
    }

    return this.httpClient.post<Client>('clients', clientData, {
      successMessage: 'Cliente creado exitosamente'
    }).pipe(
      map(response => response.data!),
      tap(client => this.clientsSignal.set([...this.clientsSignal(), client]))
    );
  }

  updateClient(id: string, clientData: Partial<Client>): Observable<Client> {
    if (environment.features.enableMockData) {
      return this.mockClients.updateClient(id, clientData).pipe(
        map(client => client!),
        tap(client => this.replaceClient(client))
      );
    }

    return this.httpClient.put<Client>(`clients/${id}`, clientData, {
      successMessage: 'Cliente actualizado exitosamente'
    }).pipe(
      map(response => response.data!),
      tap(client => this.replaceClient(client))
    );
  }

  deleteClient(id: string): Observable<boolean> {
    if (environment.features.enableMockData) {
      return this.mockClients.deleteClient(id).pipe(
        tap(success => {
          if (success) {
            this.removeClient(id);
          }
        })
      );
    }

    return this.httpClient.delete<ApiResponse>(`clients/${id}`, {
      successMessage: 'Cliente eliminado exitosamente'
    }).pipe(
      map(response => response.success),
      tap(success => {
        if (success) {
          this.removeClient(id);
        }
      })
    );
  }

  addClientEvent(clientId: string, event: Partial<EventLog>): Observable<EventLog> {
    if (environment.features.enableMockData) {
      return this.mockClients.addClientEvent(clientId, event).pipe(
        map(client => client?.events[0]!)
      );
    }

    return this.httpClient.post<EventLog>(`clients/${clientId}/events`, event).pipe(
      map(response => response.data!)
    );
  }

  getClientDocuments(clientId: string): Observable<Document[]> {
    if (environment.features.enableMockData) {
      return this.mockClients.getClientById(clientId).pipe(
        map(client => client?.documents ?? [])
      );
    }

    return this.httpClient.get<Document[]>(`clients/${clientId}/documents`).pipe(
      map(response => response.data || [])
    );
  }

  uploadDocument(clientId: string, documentId: string, file: File): Observable<Document> {
    if (environment.features.enableMockData) {
      return this.mockClients.updateDocumentStatus(clientId, documentId, DocumentStatus.EnRevision).pipe(
        map(client => {
          const doc = client?.documents.find(d => d.id === documentId);
          return doc ?? {
            id: documentId,
            name: 'Documento',
            status: DocumentStatus.EnRevision
          } as Document;
        })
      );
    }

    return this.httpClient.uploadFile(`clients/${clientId}/documents/${documentId}`, file, {
      clientId,
      documentId
    }).pipe(map(response => response.data!));
  }

  updateDocumentStatus(
    clientId: string,
    documentId: string,
    status: DocumentStatus,
    changes: Partial<Document> = {}
  ): Observable<Document | null> {
    if (environment.features.enableMockData) {
      return this.mockClients.updateDocumentStatus(clientId, documentId, status, changes).pipe(
        map(client => client?.documents.find(doc => doc.id === documentId) ?? null),
        tap(document => {
          if (document) {
            this.patchClientDocument(clientId, document);
          }
        })
      );
    }

    return this.httpClient.patch<Document>(`clients/${clientId}/documents/${documentId}`, { status, ...changes }, {
      showLoading: false,
      showError: false
    }).pipe(
      map(response => response.data || null),
      tap(document => {
        if (document) {
          this.patchClientDocument(clientId, document);
        }
      })
    );
  }

  getEcosystems(): Observable<Ecosystem[]> {
    if (environment.features.enableMockData) {
      return this.mockClients.getEcosystems();
    }

    return this.httpClient.get<Ecosystem[]>('clients/ecosystems').pipe(
      map(response => response.data || [])
    );
  }

  getCollectiveGroups(ecosystemId?: string): Observable<CollectiveCreditGroup[]> {
    if (environment.features.enableMockData) {
      return this.mockClients.getCollectiveGroups(ecosystemId);
    }

    return this.httpClient.get<CollectiveCreditGroup[]>(
      'clients/collective-groups',
      { params: ecosystemId ? { ecosystemId } : undefined }
    ).pipe(map(response => response.data || []));
  }

  getCollectiveMembers(groupId: string): Observable<Client[]> {
    if (environment.features.enableMockData) {
      return this.mockClients.getCollectiveMembers(groupId);
    }

    return this.httpClient.get<Client[]>(`clients/collective-groups/${groupId}/members`).pipe(
      map(response => response.data || [])
    );
  }

  getEcosystemHierarchy(): Observable<EcosystemHierarchyNode[]> {
    if (environment.features.enableMockData) {
      return this.mockClients.getEcosystemHierarchy();
    }

    return this.httpClient.get<EcosystemHierarchyNode[]>('clients/ecosystems/hierarchy').pipe(
      map(response => response.data || [])
    );
  }

  clearCache(): void {
    this.clientsSignal.set([]);
  }

  applyLocalDocumentPatch(clientId: string, patch: Partial<Document> & { id: string }): void {
    const client = this.clientsSignal().find(entry => entry.id === clientId);
    if (!client) {
      return;
    }

    const currentDoc = (client.documents ?? []).find(doc => doc.id === patch.id);
    const merged: Document = {
      ...(currentDoc ?? { id: patch.id, name: patch.name ?? 'Documento' } as Document),
      ...patch
    } as Document;

    this.patchClientDocument(clientId, merged);
  }

  private replaceClient(client: Client): void {
    this.clientsSignal.set(
      this.clientsSignal().map(existing => existing.id === client.id ? client : existing)
    );
  }

  private removeClient(id: string): void {
    this.clientsSignal.set(
      this.clientsSignal().filter(client => client.id !== id)
    );
  }

  private patchClientDocument(clientId: string, document: Document): void {
    const updatedClients = this.clientsSignal().map(client => {
      if (client.id !== clientId) {
        return client;
      }

      const documents = (client.documents ?? []).map(existing =>
        existing.id === document.id ? { ...existing, ...document } : existing
      );

      const hasDocument = documents.some(doc => doc.id === document.id);
      const nextDocuments = hasDocument ? documents : [...documents, document];

      return {
        ...client,
        documents: nextDocuments
      };
    });

    this.clientsSignal.set(updatedClients);
  }

  private applyFilters(clients: Client[], filters?: any): Client[] {
    if (!filters) {
      return clients;
    }

    return clients.filter(client => {
      if (filters.market && client.market !== filters.market) return false;
      if (filters.flow && client.flow !== filters.flow) return false;
      if (filters.status && client.status !== filters.status) return false;
      if (filters.search) {
        const term = filters.search.toLowerCase();
        return (
          client.name.toLowerCase().includes(term) ||
          (client.email?.toLowerCase().includes(term)) ||
          (client.phone?.includes(filters.search))
        );
      }
      return true;
    });
  }
}
