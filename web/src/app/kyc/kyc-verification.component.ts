import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { FlowContextService } from '@core-services/flow-context.service';
import { ToastService } from '@core-services/toast.service';
import { AnalyticsService } from '@core-services/analytics.service';
import { ClientsApiService } from '@data-access/clients/clients-api.service';
import { Client, DOC_NAME_COMPROBANTE, DOC_NAME_INE } from '@interfaces/types';
import { MetaMapService } from '@feature-services/integrations/metamap.service';
import { IconComponent } from '@shared/icon/icon.component';

@Component({
  selector: 'app-kyc-verification',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  templateUrl: './kyc-verification.component.html',
  styleUrls: ['./kyc-verification.component.scss']
})
export class KycVerificationComponent implements OnInit {
  private readonly flowContext = inject(FlowContextService);
  private readonly toast = inject(ToastService);
  private readonly analytics = inject(AnalyticsService);
  private readonly clientsApi = inject(ClientsApiService);
  private readonly metaMap = inject(MetaMapService);
  private readonly destroyRef = inject(DestroyRef);

  readonly clients = signal<Client[]>([]);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly selectedClientId = signal<string | null>(null);

  readonly selectedClient = computed(() => {
    const id = this.selectedClientId();
    if (!id) {
      return null;
    }
    return this.clients().find(client => client.id === id) ?? null;
  });

  readonly kycStatus = computed(() => {
    const client = this.selectedClient();
    return client ? this.metaMap.validateKycPrerequisites(client) : null;
  });

  readonly kycStateLabel = computed(() => {
    const status = this.kycStatus();
    if (!status) {
      return 'Selecciona un cliente para evaluar.';
    }
    if (status.isKycComplete) {
      return 'KYC completado';
    }
    if (!status.canStartKyc) {
      return 'Bloqueado hasta completar documentos base';
    }
    return 'Listo para iniciar verificación biométrica';
  });

  readonly documentChecklist = computed(() => {
    const status = this.kycStatus();
    if (!status) {
      return [] as Array<{ label: string; ok: boolean }>;
    }

    return [
      {
        label: 'Identificación oficial (INE)',
        ok: status.missingDocs.indexOf(DOC_NAME_INE) === -1
      },
      {
        label: 'Comprobante de domicilio',
        ok: status.missingDocs.indexOf(DOC_NAME_COMPROBANTE) === -1
      },
      {
        label: 'Biometría MetaMap',
        ok: status.isKycComplete
      }
    ];
  });

  ngOnInit(): void {
    this.flowContext.setBreadcrumbs(['Documentos', 'KYC']);
    this.analytics.track('kyc_lab_panel_viewed');
    this.loadClients();
  }

  loadClients(): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.clientsApi
      .getClients()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: clients => {
          this.isLoading.set(false);
          this.clients.set(clients);
          if (!this.selectedClientId() && clients.length) {
            this.selectedClientId.set(clients[0].id);
          }
        },
        error: () => {
          this.isLoading.set(false);
          this.error.set('No fue posible cargar clientes para KYC.');
        }
      });
  }

  selectClient(clientId: string): void {
    this.selectedClientId.set(clientId || null);
    this.analytics.track('kyc_lab_client_selected', { clientId });
  }

  startKyc(): void {
    const client = this.selectedClient();
    const status = this.kycStatus();
    if (!client || !status) {
      return;
    }

    if (status.isKycComplete) {
      this.toast.info('El KYC ya fue completado para este cliente.');
      return;
    }

    if (!status.canStartKyc) {
      this.toast.warning(status.tooltipMessage);
      return;
    }

    this.analytics.track('kyc_lab_simulation_started', { clientId: client.id });

    this.metaMap
      .completeKyc(client.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
          this.toast.success('KYC marcado como completado.');
          this.analytics.track('kyc_lab_simulation_completed', { clientId: updated.id });
          this.refreshClient(updated);
        },
        error: () => {
          this.toast.error('No se pudo completar KYC. Verifica integración con MetaMap.');
        }
      });
  }

  private refreshClient(updated: Client): void {
    const current = this.clients();
    const index = current.findIndex(item => item.id === updated.id);
    if (index === -1) {
      return;
    }

    const next = [...current];
    next.splice(index, 1, updated);
    this.clients.set(next);
  }
}
