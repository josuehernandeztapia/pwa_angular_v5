import { CommonModule } from '@angular/common';
import { Component, DestroyRef, HostBinding, OnInit, Optional, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Client, EventLog } from '@interfaces/types';
import { ImportStatus } from '@interfaces/postventa';
import { IconComponent } from '@shared/icon/icon.component';
import { AviVerificationModalComponent } from '@shared/avi-verification-modal.component';
import { FlowContextService } from '@core-services/flow-context.service';
import { ClientsApiService } from '@data-access/clients/clients-api.service';
import { ToastService } from '@core-services/toast.service';

@Component({
  selector: 'app-cliente-detail',
  standalone: true,
  imports: [CommonModule, IconComponent, RouterModule, AviVerificationModalComponent],
  templateUrl: './cliente-detail.component.html',
  styleUrls: ['./cliente-detail.component.scss']
})
export class ClienteDetailComponent implements OnInit {
  @HostBinding('class') readonly hostClass = 'cliente-detail';

  private readonly destroyRef = inject(DestroyRef);

  readonly client = signal<Client | null>(null);
  readonly showAviModal = signal(false);
  readonly isGeneratingPDF = signal(false);
  readonly clientEvents = signal<EventLog[]>([]);

  readonly documentStats = computed(() => {
    const documents = this.client()?.documents ?? [];
    const approved = documents.filter(d => d.status === 'Aprobado').length;
    return `${approved}/${documents.length}`;
  });

  readonly healthScoreClasses = computed(() => {
    const score = this.client()?.healthScore;
    const level = this.getScoreLevel(score);
    return {
      'metric-value': true,
      [`metric-value--${level}`]: true
    };
  });

  readonly savingsProgress = computed(() => this.client()?.currentSavings ?? 0);
  readonly savingsGoal = computed(() => this.client()?.savingsGoal ?? 100000);
  readonly paymentProgress = computed(() => this.client()?.completedPayments ?? 0);
  readonly totalPayments = computed(() => this.client()?.totalPayments ?? 24);
  readonly remainingPayments = computed(() => `${this.totalPayments() - this.paymentProgress()} de ${this.totalPayments()}`);
  readonly lastContributionDate = computed(() => this.formatDate(this.client()?.lastPaymentDate));
  readonly nextPaymentDue = computed(() => this.formatDate(this.client()?.nextPaymentDue));
  readonly estimatedCompletion = computed(() => this.calculateEstimatedCompletion());
  readonly aviMunicipality = computed<'aguascalientes' | 'edomex'>(() => {
    const market = (this.client()?.market ?? '').toLowerCase();
    return market === 'edomex' ? 'edomex' : 'aguascalientes';
  });

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly clientsApi: ClientsApiService,
    private readonly toast: ToastService,
    @Optional() private readonly flowContext?: FlowContextService
  ) {}

  ngOnInit(): void {
    this.flowContext?.setBreadcrumbs(['Dashboard', 'Clientes', 'Detalle']);

    this.route.params
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const clientId = params['id'];
        this.loadClient(clientId);
      });

    effect(() => {
      const currentClient = this.client();
      if (currentClient) {
        this.flowContext?.setBreadcrumbs(['Dashboard', 'Clientes', currentClient.name]);
      }
    }, { allowSignalWrites: false });
  }

  createQuote(): void {
    const currentClient = this.client();
    if (!currentClient) {
      return;
    }

    this.flowContext?.saveContext('cotizador', {
      clientId: currentClient.id,
      clientName: currentClient.name
    });

    this.router.navigate(['/cotizador'], {
      queryParams: {
        clientId: currentClient.id,
        source: 'cliente-detail'
      }
    });
  }

  canStartAviVerification(): boolean {
    return this.client()?.status === 'Expediente en Proceso';
  }

  startAviVerification(): void {
    this.showAviModal.set(true);
  }

  onAviCompleted(result: any): void {
    this.showAviModal.set(false);
    const currentClient = this.client();
    if (!currentClient) {
      return;
    }

    const updates = {
      name: result.extractedData.nombre ?? currentClient.name,
      rfc: result.extractedData.rfc ?? currentClient.rfc,
      status: result.riskScore < 30 ? 'Verificación AVI Completada' : 'Requiere Supervisión'
    };

    this.clientsApi.updateClient(currentClient.id, updates).subscribe({
      next: client => {
        const normalizedEvents = (client.events ?? []).map(event => ({
          ...event,
          timestamp: new Date(event.timestamp as any)
        } as EventLog)).sort((a, b) => new Date(b.timestamp as any).getTime() - new Date(a.timestamp as any).getTime());

        this.client.set({ ...client, events: normalizedEvents });
        this.clientEvents.set(normalizedEvents);
        this.toast.success('Información del cliente actualizada');
      },
      error: () => {
        this.toast.error('No se pudo actualizar la información del cliente');
        this.client.set({ ...currentClient, ...updates });
      }
    });
  }

  onAviClosed(): void {
    this.showAviModal.set(false);
  }

  getStatusBadgeClasses(status?: string | null): Record<string, boolean> {
    const normalized = (status ?? '').toLowerCase();

    return {
      'cliente-status-badge': true,
      'cliente-status-badge--active': normalized.includes('activo') || normalized.includes('complet'),
      'cliente-status-badge--blocked': normalized.includes('bloque') || normalized.includes('rechaz'),
      'cliente-status-badge--progress': normalized.includes('proceso') || normalized.includes('pend'),
      'cliente-status-badge--neutral': !normalized || (
        !normalized.includes('activo') &&
        !normalized.includes('complet') &&
        !normalized.includes('bloque') &&
        !normalized.includes('rechaz') &&
        !normalized.includes('proceso') &&
        !normalized.includes('pend')
      )
    };
  }

  getFlowDisplayName(flow: any): string {
    const flowNames: Record<string, string> = {
      'VentaDirecta': 'Venta Directa',
      'VentaPlazo': 'Venta a Plazo',
      'AhorroProgramado': 'Ahorro Programado',
      'CreditoColectivo': 'Crédito Colectivo'
    };
    return flowNames[flow] || flow || 'No definido';
  }

  getMunicipalityName(market: any): string {
    const municipalities: Record<string, string> = {
      'aguascalientes': 'Aguascalientes',
      'edomex': 'Estado de México'
    };
    return municipalities[market] || market || 'No definido';
  }

  getImportStatus(): ImportStatus | undefined {
    return this.client()?.importStatus as ImportStatus | undefined;
  }

  getImportStatusKeys(): string[] {
    return Object.keys(this.getImportStatus() ?? {});
  }

  getImportStatusItem(key: string): Record<string, unknown> | undefined {
    const status = this.getImportStatus();
    return status ? (status as any)[key] : undefined;
  }

  formatDate(date: Date | undefined | null): string {
    if (!date) {
      return 'No registrado';
    }

    return new Date(date).toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }

  getEventFeed(): EventLog[] {
    return this.clientEvents().slice(0, 5);
  }

  // Traditional methods placeholders
  canStartKyc(): boolean {
    return this.client()?.status === 'Documentos Completos';
  }

  startTraditionalKyc(): void {}

  canGenerateContract(): boolean {
    const status = this.client()?.status;
    return status === 'KYC Completado' || status === 'Verificación AVI Completada';
  }

  generateContract(): void {}

  viewDocuments(): void {}

  private loadClient(clientId: string | undefined): void {
    if (!clientId) {
      this.toast.error('No se encontró el identificador del cliente');
      return;
    }

    this.clientsApi.getClientById(clientId).subscribe({
      next: client => {
        if (!client) {
          this.toast.warning('El cliente no existe o fue eliminado');
          this.client.set(null);
          this.clientEvents.set([]);
          return;
        }

        const normalizedEvents = (client.events ?? []).map(event => ({
          ...event,
          timestamp: new Date(event.timestamp as any)
        } as EventLog));

        const normalizedClient: Client = {
          ...client,
          events: normalizedEvents
        };

        this.client.set(normalizedClient);
        this.clientEvents.set(normalizedEvents.sort((a, b) => (
          new Date(b.timestamp as any).getTime() - new Date(a.timestamp as any).getTime()
        )));
      },
      error: () => {
        this.toast.error('No se pudo cargar la información del cliente');
        this.client.set(null);
        this.clientEvents.set([]);
      }
    });
  }

  private getScoreLevel(score: number | undefined | null): 'excellent' | 'good' | 'poor' | 'neutral' {
    if (score == null) return 'neutral';
    if (score >= 80) return 'excellent';
    if (score >= 60) return 'good';
    if (score >= 40) return 'poor';
    return 'poor';
  }

  private calculateEstimatedCompletion(): string {
    const completed = this.client()?.completedPayments ?? 0;
    const total = this.client()?.totalPayments ?? 24;
    const status = completed >= total ? 'Pagos completados' : `${completed}/${total}`;
    return status;
  }

}
