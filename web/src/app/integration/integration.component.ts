import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { IntegratedImportStatus, IntegratedImportTrackerService } from '@feature-services/postventa/integrated-import-tracker.service';
import { FlowContextService } from '@core-services/flow-context.service';
import { IconComponent } from '@shared/icon/icon.component';
import { ImportMilestoneStatus, ImportStatus } from '@interfaces/postventa';

@Component({
  selector: 'app-integration-dashboard',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './integration.component.html',
  styleUrls: ['./integration.component.scss']
})
export class IntegrationComponent implements OnInit {
  private readonly tracker = inject(IntegratedImportTrackerService);
  private readonly flowContext = inject(FlowContextService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly clientId = signal<string | null>(null);
  readonly status = signal<IntegratedImportStatus | null>(null);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly milestones: ReadonlyArray<{ key: keyof ImportStatus; label: string }> = [
    { key: 'pedidoPlanta', label: 'Pedido a planta' },
    { key: 'unidadFabricada', label: 'Unidad fabricada' },
    { key: 'transitoMaritimo', label: 'Tránsito marítimo' },
    { key: 'enAduana', label: 'En aduana' },
    { key: 'liberada', label: 'Liberada' },
    { key: 'documentosTransferidos', label: 'Documentos transferidos' },
    { key: 'placasEntregadas', label: 'Placas entregadas' },
    { key: 'entregada', label: 'Unidad entregada' }
  ];

  ngOnInit(): void {
    this.flowContext.setBreadcrumbs(['Dashboard', 'Integraciones']);
    this.observeClientId();
  }

  reload(): void {
    const clientId = this.clientId();
    if (clientId) {
      this.load(clientId);
    }
  }

  private observeClientId(): void {
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.syncClientFromSources());

    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.syncClientFromSources());

    this.syncClientFromSources();
  }

  private syncClientFromSources(): void {
    const resolved = this.resolveClientId();
    const current = this.clientId();

    if (resolved && resolved !== current) {
      this.clientId.set(resolved);
      this.load(resolved);
    } else if (!resolved) {
      this.clientId.set(null);
      this.status.set(null);
      this.isLoading.set(false);
    } else if (!this.status() && !this.isLoading()) {
      this.load(resolved);
    }
  }

  private resolveClientId(): string | null {
    const paramClientId = this.route.snapshot.paramMap.get('clientId');
    if (paramClientId) {
      return paramClientId;
    }

    const queryClientId = this.route.snapshot.queryParamMap.get('clientId');
    if (queryClientId) {
      return queryClientId;
    }

    const contextClient = this.flowContext.getContextData<{ clientId?: string }>('client');
    if (contextClient?.clientId) {
      return contextClient.clientId;
    }

    const cotizadorContext = this.flowContext.getContextData<{ clientId?: string }>('cotizador');
    if (cotizadorContext?.clientId) {
      return cotizadorContext.clientId;
    }

    return null;
  }

  private load(clientId: string): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.tracker
      .getIntegratedImportStatus(clientId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: status => {
          if (!status) {
            this.status.set(this.createFallbackStatus(clientId));
          } else {
            this.status.set(status);
          }
          this.isLoading.set(false);
        },
        error: () => {
          this.status.set(this.createFallbackStatus(clientId));
          this.isLoading.set(false);
          this.error.set('Se muestran datos de referencia: BFF de integraciones no disponible.');
        }
      });
  }

  private createFallbackStatus(clientId: string): IntegratedImportStatus {
    const now = new Date();
    const day = 24 * 3600 * 1000;
    return {
      clientId,
      pedidoPlanta: { status: 'completed', completionDate: new Date(now.getTime() - 90 * day) },
      unidadFabricada: { status: 'completed', completionDate: new Date(now.getTime() - 75 * day) },
      transitoMaritimo: { status: 'in_progress', startDate: new Date(now.getTime() - 30 * day) },
      enAduana: { status: 'in_progress', startDate: new Date(now.getTime() - 5 * day) },
      liberada: { status: 'pending', estimatedDate: new Date(now.getTime() + 5 * day) },
      entregada: { status: 'pending' },
      documentosTransferidos: { status: 'in_progress', startDate: new Date(now.getTime() - 2 * day) },
      placasEntregadas: { status: 'pending' },
      triggerHistory: [],
      syncStatus: 'pending',
      lastSyncDate: now,
      estimatedDeliveryDate: new Date(now.getTime() + 7 * day),
      nextAction: 'Coordinación de entrega con cliente'
    } as IntegratedImportStatus;
  }

  formatMilestoneStatus(key: keyof ImportStatus): string {
    const item = this.getMilestone(key);
    if (!item) {
      return 'Sin datos';
    }

    const explicit = item.status ?? (item.completed ? 'completed' : item.inProgress ? 'in_progress' : 'pending');
    switch (explicit) {
      case 'completed':
        return 'Completado';
      case 'in_progress':
        return 'En progreso';
      case 'pending':
      default:
        return 'Pendiente';
    }
  }

  milestoneStatusClass(key: keyof ImportStatus): string {
    const milestone = this.getMilestone(key);
    const explicit = milestone?.status ?? (milestone?.completed ? 'completed' : milestone?.inProgress ? 'in_progress' : 'pending');
    return `integration__chip integration__chip--${explicit ?? 'pending'}`;
  }

  milestoneDate(key: keyof ImportStatus): string {
    const milestone = this.getMilestone(key);
    if (!milestone) {
      return 'N/D';
    }

    const date = milestone.completionDate ?? milestone.completedAt ?? milestone.estimatedDate ?? milestone.startDate;
    return date ? this.formatDate(date) : 'Sin fecha';
  }

  syncBadgeClass(): string {
    const status = this.status()?.syncStatus ?? 'pending';
    return `integration__sync integration__sync--${status}`;
  }

  formatDate(value?: Date | string): string {
    if (!value) {
      return 'Sin fecha';
    }
    const date = typeof value === 'string' ? new Date(value) : value;
    return new Intl.DateTimeFormat('es-MX', {
      day: 'numeric',
      month: 'short'
    }).format(date);
  }

  private getMilestone(key: keyof ImportStatus): ImportMilestoneStatus | undefined {
    const current = this.status();
    if (!current) {
      return undefined;
    }
    return current[key] as ImportMilestoneStatus | undefined;
  }
}
