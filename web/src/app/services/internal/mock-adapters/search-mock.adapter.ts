import { Injectable } from '@angular/core';
import { forkJoin, Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';

import { BusinessFlow, Client } from '@interfaces/types';
import { CollectiveCreditGroup } from '@interfaces/tanda';
import { ClientDataService } from '@feature-services/clients/client-data.service';
import { CollectiveGroupDataService } from '@feature-services/clients/collective-group-data.service';

export interface MockSearchPayload {
  clients: Client[];
  quotes: Array<{
    id: string;
    label: string;
    clientId: string;
    clientName: string;
    market?: string;
    amount?: number;
    status?: string;
  }>;
  documents: Array<{
    id: string;
    name: string;
    status?: string;
    clientId: string;
    clientName: string;
  }>;
  contracts: Array<{
    id: string;
    label: string;
    contractId: string;
    clientId: string;
    clientName: string;
    market?: string;
    status?: string;
    documentsComplete: boolean;
    protectionRequired: boolean;
    protectionApplied: boolean;
    pendingOfflineRequests: number;
    updatedAt: number;
    businessFlow?: BusinessFlow;
    aviDecision?: string;
    aviStatus?: string;
    requiresVoiceVerification?: boolean;
  }>;
  total: number;
}

@Injectable({ providedIn: 'root' })
export class SearchMockAdapter {
  constructor(
    private readonly clientDataService: ClientDataService,
    private readonly collectiveGroupDataService: CollectiveGroupDataService
  ) {}

  search(query: string): Observable<MockSearchPayload> {
    const sanitized = (query || '').trim();
    if (!sanitized) {
      return of({ clients: [], quotes: [], documents: [], contracts: [], total: 0 });
    }

    return forkJoin({
      clients: this.clientDataService.searchClients(sanitized),
      groups: this.collectiveGroupDataService.searchGroups(sanitized)
    }).pipe(
      map(({ clients, groups }) => {
        const topClients = clients.slice(0, 10);
        const documents = this.buildDocumentMatches(topClients, sanitized);
        const quotes = this.buildQuoteMatches(topClients, sanitized, groups);
        const contracts = this.buildContractMatches(topClients);

        return {
          clients: topClients,
          quotes,
          documents,
          contracts,
          total: topClients.length + quotes.length + documents.length + contracts.length
        };
      })
    );
  }

  private buildDocumentMatches(clients: Client[], query: string): Array<{
    id: string;
    name: string;
    status?: string;
    clientId: string;
    clientName: string;
  }> {
    const lower = query.toLowerCase();
    const matches: Array<{ id: string; name: string; status?: string; clientId: string; clientName: string }> = [];

    clients.forEach(client => {
      (client.documents || []).forEach((doc, index) => {
        const docName = (doc.name || '').toString();
        if (docName.toLowerCase().includes(lower)) {
          matches.push({
            id: `${client.id}-doc-${doc.id || index}`,
            name: docName,
            status: (doc.status as any) ?? undefined,
            clientId: client.id,
            clientName: client.name
          });
        }
      });
    });

    return matches.slice(0, 10);
  }

  private buildQuoteMatches(
    clients: Client[],
    query: string,
    groups: CollectiveCreditGroup[]
  ): Array<{
    id: string;
    label: string;
    clientId: string;
    clientName: string;
    market?: string;
    amount?: number;
    status?: string;
  }> {
    const lower = query.toLowerCase();
    const matches: Array<{ id: string; label: string; clientId: string; clientName: string; market?: string; amount?: number; status?: string }> = [];

    clients.forEach((client, idx) => {
      const quoteId = `Q-${client.id}-${idx + 1}`;
      const label = `Cotización ${client.name}`;
      if (label.toLowerCase().includes(lower) || quoteId.toLowerCase().includes(lower)) {
        matches.push({
          id: quoteId,
          label,
          clientId: client.id,
          clientName: client.name,
          market: client.market as any,
          amount: (client as any).remainderAmount ?? undefined,
          status: client.status
        });
      }
    });

    groups.forEach(group => {
      if (group.name.toLowerCase().includes(lower)) {
        matches.push({
          id: `GROUP-${group.id}`,
          label: `Cotización colectiva ${group.name}`,
          clientId: group.id,
          clientName: group.name,
          amount: group.savingsGoalPerUnit,
          status: group.status as any
        });
      }
    });

    return matches.slice(0, 10);
  }

  private buildContractMatches(clients: Client[]): Array<{
    id: string;
    label: string;
    contractId: string;
    clientId: string;
    clientName: string;
    market?: string;
    status?: string;
    documentsComplete: boolean;
    protectionRequired: boolean;
    protectionApplied: boolean;
    pendingOfflineRequests: number;
    updatedAt: number;
    businessFlow?: BusinessFlow;
    aviDecision?: string;
    aviStatus?: string;
    requiresVoiceVerification?: boolean;
  }> {
    const now = Date.now();
    return clients
      .filter(client => ['Aprobado', 'Activo', 'En seguimiento'].includes(client.status))
      .map((client, index) => {
        const contractId = `CON-${client.id}-${index + 1}`;
        const label = `Contrato ${client.name}`;
        const protectionRequired = client.flow !== BusinessFlow.VentaDirecta;
        const protectionApplied = !!client.protectionPlan;
        const documentsComplete = Boolean(
          client.documents?.length &&
          client.documents.every(doc => doc.status === 'Aprobado')
        );

        return {
          id: `${client.id}-contract-${index + 1}`,
          label,
          contractId,
          clientId: client.id,
          clientName: client.name,
          market: client.market as any,
          status: client.status,
          documentsComplete,
          protectionRequired,
          protectionApplied,
          pendingOfflineRequests: 0,
          updatedAt: now - index * 45_000,
          businessFlow: client.flow,
          aviDecision: 'go',
          aviStatus: 'completed',
          requiresVoiceVerification: protectionRequired
        };
      })
      .slice(0, 10);
  }
}
