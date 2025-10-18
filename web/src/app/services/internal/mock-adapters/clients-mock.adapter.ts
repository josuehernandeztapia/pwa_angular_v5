import { Injectable } from '@angular/core';
import { Observable, of, combineLatest } from 'rxjs';
import { delay, map } from 'rxjs/operators';

import { Client, Document, DocumentStatus, EventLog, Actor, EventType, BusinessFlow, Ecosystem } from '@interfaces/types';
import { CollectiveCreditGroup } from '@interfaces/tanda';
import { ClientDataService } from '@feature-services/clients/client-data.service';
import { EcosystemDataService } from '@feature-services/clients/ecosystem-data.service';
import { CollectiveGroupDataService } from '@feature-services/clients/collective-group-data.service';

export interface EcosystemHierarchyNode {
  ecosystem: Ecosystem;
  groups: Array<{ group: CollectiveCreditGroup; members: Client[] }>;
}

@Injectable({ providedIn: 'root' })
export class ClientsMockAdapter {
  private readonly NETWORK_SIMULATION = {
    fast: 200,
    normal: 500,
    slow: 1200
  } as const;

  constructor(
    private readonly clientDataService: ClientDataService,
    private readonly ecosystemDataService: EcosystemDataService,
    private readonly collectiveGroupDataService: CollectiveGroupDataService
  ) {}

  getClients(): Observable<Client[]> {
    return this.clientDataService.getClients().pipe(delay(this.getNetworkDelay()));
  }

  getClientById(id: string): Observable<Client | null> {
    return this.clientDataService.getClientById(id).pipe(delay(this.getNetworkDelay()));
  }

  createClient(payload: Partial<Client>): Observable<Client> {
    return this.clientDataService.createClient(payload).pipe(delay(this.NETWORK_SIMULATION.slow));
  }

  updateClient(id: string, updates: Partial<Client>): Observable<Client | null> {
    return this.clientDataService.updateClient(id, updates).pipe(delay(this.NETWORK_SIMULATION.normal));
  }

  deleteClient(id: string): Observable<boolean> {
    return this.clientDataService.deleteClient(id).pipe(delay(this.NETWORK_SIMULATION.normal));
  }

  addClientEvent(clientId: string, event: Partial<EventLog>): Observable<Client | null> {
    const payload: Omit<EventLog, 'id' | 'timestamp'> = {
      message: event.message ?? 'Evento registrado',
      type: event.type ?? EventType.System,
      actor: event.actor ?? Actor.Sistema,
      details: event.details
    };
    return this.clientDataService.addClientEvent(clientId, payload).pipe(delay(this.NETWORK_SIMULATION.fast));
  }

  // Ecosystem/Collective endpoints previously served by MockApiService
  getEcosystems(): Observable<Ecosystem[]> {
    return this.ecosystemDataService.getEcosystems().pipe(delay(this.NETWORK_SIMULATION.normal));
  }

  getCollectiveGroups(ecosystemId?: string): Observable<CollectiveCreditGroup[]> {
    if (!ecosystemId) {
      return this.collectiveGroupDataService.getCollectiveGroups().pipe(
        delay(this.NETWORK_SIMULATION.normal)
      );
    }

    return combineLatest([
      this.collectiveGroupDataService.getCollectiveGroups(),
      this.clientDataService.getClients()
    ]).pipe(
      map(([groups, clients]) => {
        const allowedGroupIds = new Set(
          clients
            .filter(client => client.ecosystemId === ecosystemId && client.collectiveCreditGroupId)
            .map(client => client.collectiveCreditGroupId as string)
        );

        return groups.filter(group => allowedGroupIds.has(group.id));
      }),
      delay(this.NETWORK_SIMULATION.normal)
    );
  }

  getCollectiveMembers(groupId: string): Observable<Client[]> {
    return this.clientDataService.getClients().pipe(
      map(clients => clients.filter(client => client.collectiveCreditGroupId === groupId)),
      delay(this.NETWORK_SIMULATION.normal)
    );
  }

  getEcosystemHierarchy(): Observable<EcosystemHierarchyNode[]> {
    return combineLatest([
      this.ecosystemDataService.getEcosystems(),
      this.collectiveGroupDataService.getCollectiveGroups(),
      this.clientDataService.getClients()
    ]).pipe(
      map(([ecosystems, groups, clients]) => ecosystems.map(ecosystem => ({
        ecosystem,
        groups: groups
          .filter(group => group.ecosystemId === ecosystem.id)
          .map(group => ({
            group,
            members: clients.filter(client => client.collectiveCreditGroupId === group.id)
          }))
      }))),
      delay(this.NETWORK_SIMULATION.normal)
    );
  }

  updateDocumentStatus(
    clientId: string,
    documentId: string,
    status: DocumentStatus | Document['status'],
    changes: Partial<Document> = {}
  ): Observable<Client | null> {
    return this.clientDataService.updateDocumentStatus(clientId, documentId, status as DocumentStatus, changes).pipe(
      delay(this.NETWORK_SIMULATION.normal)
    );
  }

  private getNetworkDelay(): number {
    const conditions = ['fast', 'normal', 'slow'] as const;
    const randomCondition = conditions[Math.floor(Math.random() * conditions.length)];
    return this.NETWORK_SIMULATION[randomCondition];
  }
}
