import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ActivityFeedItem, BusinessFlow, Client, EventLog, EventType, Market } from '@interfaces/types';
import { PolicyMarket } from '@feature-services/configuration/market-policy.service';
import { ClientDataService } from '@feature-services/clients/client-data.service';
import { DashboardService } from '@feature-services/dashboard/dashboard.service';
import { GlobalSearchService, GlobalSearchResult, GlobalSearchDataOrigin } from './global-search.service';
import { SummaryMetric } from '@shared/summary-panel.component';
import { environment } from '@environments/environment';

export interface OpportunitySyncPayload {
  clientName: string;
  market: PolicyMarket;
  businessFlow: BusinessFlow;
  includeProtection: boolean;
}

export interface OpportunitySyncResult {
  opportunityId: string;
  clientId: string;
  metrics: SummaryMetric[];
}

export interface QuoteSyncPayload {
  quoteLabel: string;
  market: PolicyMarket;
  amountToFinance: number;
  monthlyPayment: number;
  clientName?: string;
  businessFlow: BusinessFlow;
}

export interface QuoteSyncResult {
  quoteId: string;
}

export interface ClientSyncPayload {
  clientName: string;
  market: PolicyMarket;
  businessFlow: BusinessFlow;
  email?: string;
  phone?: string;
}

export interface ClientSyncResult {
  clientId: string;
  metrics: SummaryMetric[];
}

export interface DocumentCompletionSyncPayload {
  clientId: string;
  clientName: string;
  market: PolicyMarket;
  businessFlow: BusinessFlow;
  validatedDocs: number;
  pendingDocs: number;
  totalDocs: number;
  source?: string;
}

export interface AviStatusSyncPayload {
  clientId: string;
  clientName: string;
  market?: PolicyMarket;
  businessFlow?: BusinessFlow;
  status: 'completed' | 'cancelled';
  complianceScore?: number;
  sessionId?: string;
  durationSeconds?: number;
  pendingDocuments?: number;
}

export interface PostSaleEvidenceSyncPayload {
  clientId: string;
  clientName: string;
  market?: PolicyMarket;
  photosUploaded: number;
  requiredPhotos?: number;
  suggestionsGenerated?: number;
  quoteId?: string | null;
}

export interface ClientUpdateSyncPayload {
  client: Client;
  updates: Partial<Client>;
  collectedDocuments?: number;
  pendingDocuments?: number;
  note?: string;
}

@Injectable({ providedIn: 'root' })
export class EntitySyncService {
  constructor(
    private readonly clientData: ClientDataService,
    private readonly dashboard: DashboardService,
    private readonly globalSearch: GlobalSearchService
  ) {}

  async recordOpportunityCreation(payload: OpportunitySyncPayload): Promise<OpportunitySyncResult> {
    const client = await firstValueFrom(this.clientData.createClient({
      name: payload.clientName,
      flow: payload.businessFlow,
      status: 'Nuevo',
      market: payload.market
    }));

    const opportunityId = `opp-${Date.now()}`;
    this.dashboard.addOpportunityToPipeline(payload.market, 'Nuevas Oportunidades', client.id);
    this.dashboard.addActivity({
      id: `activity-${opportunityId}`,
      type: 'new_client',
      timestamp: new Date(),
      message: `Nueva oportunidad (${this.getFlowLabel(payload.businessFlow)}) creada`,
      clientName: payload.clientName,
      iconType: 'plus'
    });

    this.globalSearch.recordRecent(this.buildOpportunitySearchResult(opportunityId, client.id, payload));

    const metrics: SummaryMetric[] = [
      { label: 'Mercado', value: this.getMarketLabel(payload.market) },
      { label: 'Flujo', value: this.getFlowLabel(payload.businessFlow) },
      { label: 'Tipo de cliente', value: this.getClientTypeLabel(payload.businessFlow) }
    ];

    if (payload.includeProtection) {
      metrics.push({ label: 'Protección', value: 'Requerida', badge: 'success' });
    }

    return {
      opportunityId,
      clientId: client.id,
      metrics
    };
  }

  async recordQuotePrepared(payload: QuoteSyncPayload): Promise<QuoteSyncResult> {
    const quoteId = `quote-${Date.now()}`;
    this.dashboard.addActivity({
      id: `activity-${quoteId}`,
      type: 'contract_signed',
      timestamp: new Date(),
      message: `Cotización preparada (${this.getFlowLabel(payload.businessFlow)})`,
      clientName: payload.clientName,
      amount: payload.amountToFinance,
      iconType: 'currency-dollar'
    });

    this.globalSearch.recordRecent({
      id: quoteId,
      label: `${payload.clientName ?? 'Cotización'} — ${this.getMarketLabel(payload.market)}`,
      type: 'quote',
      description: `Monto: ${this.formatCurrency(payload.amountToFinance)} · PMT: ${this.formatCurrency(payload.monthlyPayment)}`,
      route: ['/cotizador'],
      queryParams: {
        source: 'global-search',
        preset: `${payload.market}-plazo`,
        quoteId
      },
      origin: this.resolveOrigin()
    });

    return { quoteId };
  }

  recordCollectiveSimulation(groupName: string, members: number): void {
    this.dashboard.addActivity({
      id: `activity-tanda-${Date.now()}`,
      type: 'goal_reached',
      timestamp: new Date(),
      message: `Simulación colectiva lista para formalizar (${groupName})`,
      clientName: `${members} integrantes`,
      iconType: 'users'
    });
  }

  async recordClientCreation(payload: ClientSyncPayload): Promise<ClientSyncResult> {
    this.dashboard.addActivity({
      id: `activity-client-${Date.now()}`,
      type: 'new_client',
      timestamp: new Date(),
      message: `Nuevo cliente agregado (${this.getFlowLabel(payload.businessFlow)})`,
      clientName: payload.clientName,
      iconType: 'user-plus'
    });

    this.globalSearch.recordRecent({
      id: `client-temp-${Date.now()}`,
      label: `${payload.clientName} — Cliente`,
      type: 'client',
      description: `Cliente • ${this.getMarketLabel(payload.market)}`,
      route: ['/clientes'],
      queryParams: {
        search: payload.clientName,
        source: 'global-search'
      },
      origin: this.resolveOrigin()
    });

    const metrics: SummaryMetric[] = [
      { label: 'Mercado', value: this.getMarketLabel(payload.market) },
      { label: 'Flujo', value: this.getFlowLabel(payload.businessFlow) },
      { label: 'Tipo de cliente', value: this.getClientTypeLabel(payload.businessFlow) }
    ];

    if (payload.email) {
      metrics.push({ label: 'Email', value: 'Configurado', badge: 'success' });
    }

    if (payload.phone) {
      metrics.push({ label: 'Teléfono', value: 'Configurado', badge: 'success' });
    }

    return {
      clientId: `client-${Date.now()}`,
      metrics
    };
  }

  recordClientEvent(client: Client, event: EventLog): void {
    const activity = this.buildActivityFromClientEvent(client, event);
    this.dashboard.addActivity(activity);
    this.globalSearch.recordRecent(this.buildClientSearchResult(client));
  }

  recordDocumentCompletion(payload: DocumentCompletionSyncPayload): void {
    const { clientId, clientName, market, validatedDocs, pendingDocs, totalDocs, businessFlow, source } = payload;
    const timestamp = new Date();
    const normalizedMarket = (market ?? 'all') as Market;
    const message = pendingDocs > 0
      ? `${clientName}: ${validatedDocs}/${totalDocs} documentos validados (${pendingDocs} pendientes)`
      : `${clientName}: expediente completo listo para contrato`;

    this.dashboard.addActivity({
      id: `activity-documents-${clientId}-${timestamp.getTime()}`,
      type: 'doc_approved',
      timestamp,
      message,
      clientName,
      iconType: pendingDocs > 0 ? 'file-text' : 'file-check'
    });

    if (pendingDocs <= 0) {
      this.dashboard.moveOpportunityStage(normalizedMarket, clientId, 'Aprobado');
    } else {
      this.dashboard.addOpportunityToPipeline(normalizedMarket, 'Expediente en Proceso', clientId);
    }

    this.globalSearch.recordRecent({
      id: `documents-${clientId}`,
      label: `${clientName} — Documentos`,
      type: 'document',
      description: `Documentos • ${validatedDocs}/${totalDocs} validados${pendingDocs ? ` · ${pendingDocs} pendientes` : ''}`,
      route: ['/documentos'],
      queryParams: {
        clientId,
        source: source ?? 'entity-sync',
        flow: businessFlow
      },
      origin: this.resolveOrigin()
    });
  }

  recordAviStatus(payload: AviStatusSyncPayload): void {
    const { clientId, clientName, market, status, complianceScore, businessFlow, durationSeconds, sessionId } = payload;
    const timestamp = new Date();
    const normalizedMarket = ((market ?? 'aguascalientes') as Market);
    const iconType = status === 'completed' ? 'microphone' : 'x-circle';
    const scoreLabel = complianceScore !== undefined ? `Score ${Math.round(complianceScore)}` : 'Sin score';
    const message = status === 'completed'
      ? `Entrevista AVI completada (${scoreLabel})`
      : 'Entrevista AVI cancelada por el asesor';

    this.dashboard.addActivity({
      id: `activity-avi-${clientId}-${timestamp.getTime()}`,
      type: status === 'completed' ? 'avi_completed' : 'avi_cancelled',
      timestamp,
      message,
      clientName,
      iconType
    });

    if (status === 'completed') {
      this.dashboard.moveOpportunityStage(normalizedMarket, clientId, 'Expediente en Proceso');
    }

    this.globalSearch.recordRecent({
      id: `avi-${clientId}`,
      label: `${clientName} — AVI`,
      type: 'client',
      description: status === 'completed'
        ? `AVI completada · ${scoreLabel}`
        : 'AVI cancelada',
      route: ['/documentos'],
      queryParams: {
        clientId,
        section: 'avi',
        sessionId,
        duration: durationSeconds,
        source: 'entity-sync',
        ...(businessFlow ? { flow: businessFlow } : {}),
        ...(market ? { market } : {})
      },
      origin: this.resolveOrigin()
    });
  }

  recordPostSaleEvidence(payload: PostSaleEvidenceSyncPayload): void {
    const { clientId, clientName, market, photosUploaded, requiredPhotos = 4, suggestionsGenerated = 0, quoteId } = payload;
    const timestamp = new Date();
    const completionLabel = `${photosUploaded}/${requiredPhotos} fotos`;

    this.dashboard.addActivity({
      id: `activity-postsale-${clientId}-${timestamp.getTime()}`,
      type: 'post_sale_evidence',
      timestamp,
      message: `Evidencia postventa sincronizada (${completionLabel})`,
      clientName,
      iconType: 'camera'
    });

    this.globalSearch.recordRecent({
      id: `postventa-${clientId}`,
      label: `${clientName} — Postventa`,
      type: 'document',
      description: `Postventa • ${completionLabel} · ${suggestionsGenerated} sugerencias`,
      route: ['/postventa'],
      queryParams: {
        clientId,
        quoteId: quoteId ?? undefined,
        source: 'entity-sync',
        ...(market ? { market } : {})
      },
      origin: this.resolveOrigin()
    });
  }

  recordClientUpdate(payload: ClientUpdateSyncPayload): void {
    const { client, updates, collectedDocuments, pendingDocuments, note } = payload;
    const highlights: string[] = [];

    if (updates.status) {
      highlights.push(`estatus: ${updates.status}`);
    }

    if (updates.flow) {
      highlights.push(`flujo: ${this.getFlowLabel(updates.flow)}`);
    }

    if (updates.market) {
      highlights.push(`mercado: ${this.getMarketLabel(updates.market)}`);
    }

    if (typeof collectedDocuments === 'number' && typeof pendingDocuments === 'number') {
      highlights.push(`docs: ${collectedDocuments}/${collectedDocuments + pendingDocuments}`);
    }

    if (note) {
      highlights.push(note);
    }

    const message = highlights.length
      ? `Datos de ${client.name} actualizados (${highlights.join(', ')})`
      : `Datos de ${client.name} actualizados.`;

    this.dashboard.addActivity({
      id: `activity-client-update-${client.id}-${Date.now()}`,
      type: 'client_updated',
      timestamp: new Date(),
      message,
      clientName: client.name,
      iconType: 'user-cog'
    });

    this.globalSearch.recordRecent({
      ...this.buildClientSearchResult(client),
      origin: this.resolveOrigin()
    });
  }

  recordClientUpdated(client: Client, updates: Partial<Client>): void {
    this.recordClientUpdate({ client, updates });
  }

  private resolveOrigin(): GlobalSearchDataOrigin {
    return environment.features.enableMockData ? 'demo' : 'real';
  }

  private buildOpportunitySearchResult(opportunityId: string, clientId: string, payload: OpportunitySyncPayload): GlobalSearchResult {
    return {
      id: opportunityId,
      label: `${payload.clientName} — Nueva oportunidad`,
      type: 'client',
      description: `Oportunidad • ${this.getMarketLabel(payload.market)}`,
      route: ['/documentos'],
      queryParams: {
        clientId,
        source: 'opportunity'
      },
      origin: this.resolveOrigin()
    };
  }

  private buildClientSearchResult(client: Client): GlobalSearchResult {
    return {
      id: `client-${client.id}`,
      label: client.name,
      type: 'client',
      description: this.buildClientDescription(client),
      route: ['/clientes', client.id],
      queryParams: {
        source: 'global-search'
      },
      origin: this.resolveOrigin()
    };
  }

  private buildClientDescription(client: Client): string {
    const segments: string[] = [];

    if (client.status) {
      segments.push(client.status);
    }

    if (client.flow) {
      segments.push(this.getFlowLabel(client.flow));
    }

    if (client.market) {
      segments.push(this.getMarketLabel(client.market));
    }

    return segments.length ? segments.join(' • ') : 'Cliente';
  }

  private buildActivityFromClientEvent(client: Client, event: EventLog): ActivityFeedItem {
    const base: ActivityFeedItem = {
      id: `activity-${event.id}`,
      type: 'client_event',
      timestamp: event.timestamp ?? new Date(),
      message: event.message,
      clientName: client.name,
      iconType: 'user'
    };

    switch (event.type) {
      case EventType.Contribution:
      case EventType.Collection:
        base.type = 'payment_received';
        base.iconType = 'currency-dollar';
        if (event.details?.amount) {
          base.amount = event.details.amount;
        }
        break;
      case EventType.DocumentSubmission:
      case EventType.DocumentReview:
      case EventType.KYCCompleted:
        base.type = 'doc_approved';
        base.iconType = 'file-check';
        break;
      case EventType.GoalAchieved:
        base.type = 'goal_reached';
        base.iconType = 'target';
        break;
      default:
        base.iconType = 'user';
        break;
    }

    return base;
  }

  private getMarketLabel(market: PolicyMarket | Market | undefined): string {
    switch (market) {
      case 'aguascalientes':
        return 'Aguascalientes';
      case 'edomex':
        return 'EdoMex';
      case 'otros':
        return 'Otros mercados';
      case 'all':
        return 'Todos los mercados';
      default:
        return market ?? 'Mercado';
    }
  }

  private getFlowLabel(flow: BusinessFlow): string {
    switch (flow) {
      case BusinessFlow.VentaDirecta:
        return 'Venta directa';
      case BusinessFlow.AhorroProgramado:
        return 'Ahorro programado';
      case BusinessFlow.CreditoColectivo:
        return 'Crédito colectivo';
      default:
        return 'Venta a plazo';
    }
  }

  private getClientTypeLabel(flow: BusinessFlow): string {
    return flow === BusinessFlow.CreditoColectivo ? 'Colectivo' : 'Individual';
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount ?? 0);
  }
}
