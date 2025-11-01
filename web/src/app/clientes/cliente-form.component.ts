import { Component, OnDestroy, OnInit, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { IconComponent } from '@shared/icon/icon.component';
import { ToastService } from '@core-services/toast.service';
import { ClientsApiService } from '@data-access/clients/clients-api.service';
import { CustomValidators } from '@validators/custom-validators';
import { Client, BusinessFlow } from '@interfaces/types';
import { FlowContextService } from '@core-services/flow-context.service';
import { ErrorBoundaryService } from '@core-services/error-boundary.service';
import { FlowCompletionService, FlowCompletionAction } from '@core-services/flow-completion.service';
import { GlobalSearchService } from '@core-services/global-search.service';
import { NavigationService } from '@core-services/navigation.service';
import { SummaryMetric } from '@shared/summary-panel.component';
import { EntitySyncService } from '@core-services/entity-sync.service';
import { PolicyMarket } from '@feature-services/configuration/market-policy.service';

@Component({
  selector: 'app-cliente-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IconComponent],
  templateUrl: './cliente-form.component.html',
  styleUrls: ['./cliente-form.component.scss']
})
export class ClienteFormComponent implements OnInit, OnDestroy {
  clienteForm!: FormGroup;
  isEditMode = false;
  isLoading = false;
  clientId?: string;
  private returnTo: string | null = null;
  private returnUrl: string | null = null;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private clientsApi: ClientsApiService,
    private toast: ToastService,
    private errorBoundary: ErrorBoundaryService,
    private flowCompletion: FlowCompletionService,
    private entitySync: EntitySyncService,
    private globalSearch: GlobalSearchService,
    private navigation: NavigationService,
    @Optional() private flowContext?: FlowContextService
  ) {}

  ngOnInit(): void {
    this.createForm();
    this.checkEditMode();
    this.returnTo = this.route.snapshot.queryParamMap.get('returnTo');
    this.returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    this.restoreDraftFromContext();
    this.updateBreadcrumbs();
  }

  ngOnDestroy(): void {
    if (!this.isEditMode) {
      this.flowContext?.saveContext('cliente-form', { formValues: this.clienteForm.value }, {
        ttlMs: 10 * 60 * 1000,
        breadcrumbs: ['Dashboard', 'Clientes', 'Nuevo']
      });
    } else {
      this.flowContext?.clearContext('cliente-form', false);
    }
  }

  private createForm(): void {
    this.clienteForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', [Validators.required, CustomValidators.mexicanPhone]],
      rfc: ['', [CustomValidators.rfc]],
      market: ['aguascalientes', [Validators.required]],
      flow: [BusinessFlow.VentaPlazo, [Validators.required]],
      notes: ['']
    });
  }

  private checkEditMode(): void {
    this.clientId = this.route.snapshot.params['id'];
    if (this.clientId) {
      this.isEditMode = true;
      this.loadClient(this.clientId);
    }
  }

  private updateBreadcrumbs(clientName?: string): void {
    const trail = ['Dashboard', 'Clientes'];
    if (this.isEditMode) {
      trail.push(clientName || 'Editar');
    } else {
      trail.push('Nuevo');
    }
    this.flowContext?.setBreadcrumbs(trail);
  }

  private loadClient(id: string): void {
    this.isLoading = true;
    this.clientsApi.getClientById(id).subscribe({
      next: (client) => {
        if (client) {
          this.clienteForm.patchValue({
            name: client.name,
            email: client.email,
            phone: client.phone,
            rfc: client.rfc || '',
            market: client.market,
            flow: client.flow,
            notes: ''
          });
          this.updateBreadcrumbs(client.name);
        }
        this.isLoading = false;
      },
      error: (error) => {
        this.toast.error('Error al cargar el cliente');
        this.isLoading = false;
        this.router.navigate(['/clientes']);
      }
    });
  }

  private restoreDraftFromContext(): void {
    if (this.isEditMode) {
      return;
    }

    const stored = this.flowContext?.getContextData<{ formValues: any }>('cliente-form');
    if (stored?.formValues) {
      this.clienteForm.patchValue(stored.formValues);
    }
  }

  onSubmit(): void {
    if (this.clienteForm.invalid) {
      this.markFormGroupTouched();
      this.toast.error('Por favor, corrige los errores en el formulario');
      return;
    }

    this.isLoading = true;
    const formData = this.clienteForm.value;

    if (this.isEditMode && this.clientId) {
      this.clientsApi.updateClient(this.clientId, formData).subscribe({
        next: client => {
          this.isLoading = false;
          this.errorBoundary.resolveIssueByContext(issue => issue.context?.module === 'clientes' && issue.context?.clientId === this.clientId);
          void this.presentFlowCompletion(client, 'update');
        },
        error: () => {
          this.isLoading = false;
          this.toast.error('No se pudo actualizar el cliente');
          this.handleClientPersistenceError('update', formData);
        }
      });
    } else {
      this.clientsApi.createClient(formData).subscribe({
        next: (client) => {
          this.isLoading = false;
          this.errorBoundary.resolveIssueByContext(issue => issue.context?.module === 'clientes' && issue.context?.clientId === client.id);
          void this.presentFlowCompletion(client, 'create', formData);
        },
        error: () => {
          this.isLoading = false;
          this.toast.error('No se pudo crear el cliente');
          this.handleClientPersistenceError('create', formData);
        }
      });
    }
  }

  // Methods referenced by specs
  createClient(): void {
    // Delegate to onSubmit (create flow)
    this.isEditMode = false;
    this.onSubmit();
  }

  updateClient(): void {
    // Delegate to onSubmit (update flow)
    this.isEditMode = true;
    this.onSubmit();
  }

  onMarketChange(market: string): void {
    this.clienteForm.patchValue({ market });
  }

  onRfcInput(event: any): void {
    // Convertir a mayúsculas
    const value = event.target.value.toUpperCase();
    this.clienteForm.patchValue({ rfc: value });
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.clienteForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  private markFormGroupTouched(): void {
    Object.keys(this.clienteForm.controls).forEach(key => {
      const control = this.clienteForm.get(key);
      control?.markAsTouched();
    });
  }

  goBack(): void {
    this.router.navigate(['/clientes']);
  }

  private async presentFlowCompletion(client: Client, mode: 'create' | 'update', payload?: any): Promise<void> {
    this.flowContext?.clearContext('cliente-form');

    const title = mode === 'create' ? 'Cliente creado exitosamente' : 'Cliente actualizado exitosamente';
    const description = mode === 'create'
      ? `${client.name} está listo para continuar con documentos, oportunidades o cotizaciones.`
      : 'Los datos del cliente se guardaron y se propagaron al resto de la aplicación.';

    let metrics = this.buildClientMetrics(client);

    if (mode === 'create') {
      try {
        const market = (payload?.market ?? client.market ?? 'aguascalientes') as PolicyMarket;
        const flow = (payload?.flow ?? client.flow ?? BusinessFlow.VentaPlazo) as BusinessFlow;
        const syncResult = await this.entitySync.recordClientCreation({
          clientName: client.name,
          market,
          businessFlow: flow,
          email: payload?.email ?? client.email,
          phone: payload?.phone ?? client.phone
        });

        if (syncResult?.metrics?.length) {
          metrics = syncResult.metrics;
        }
      } catch (error) {
        console.error('[ClienteForm] Error registrando sincronización de cliente', error);
      }
    }

    this.flowCompletion.open({
      title,
      description,
      metrics,
      actions: this.buildCompletionActions(client, mode),
      onComplete: () => {
        this.globalSearch.refreshIndex(client.name);
        this.navigation.refreshQuickActions();
      }
    });
  }

  private buildClientMetrics(client: Client): SummaryMetric[] {
    const metrics: SummaryMetric[] = [];

    if (client.healthScore != null) {
      metrics.push({ label: 'Health Score', value: this.formatHealthScore(client.healthScore) });
    }

    if (client.market) {
      metrics.push({ label: 'Mercado', value: this.formatMarket(client.market) });
    }

    if (client.flow) {
      metrics.push({ label: 'Flujo', value: this.formatFlow(client.flow) });
    }

    return metrics;
  }

  private buildCompletionActions(client: Client, mode: 'create' | 'update'): FlowCompletionAction[] {
    const actions: FlowCompletionAction[] = [];

    if (this.shouldReturnToCotizador()) {
      actions.push({
        id: 'return-cotizador',
        label: 'Volver al cotizador',
        kind: 'primary',
        execute: () => this.handleReturnToCotizador(client)
      });
      actions.push({
        id: 'documents',
        label: 'Cargar documentos',
        kind: 'secondary',
        execute: () => this.goToDocuments(client)
      });
    } else {
      actions.push({
        id: 'documents',
        label: 'Cargar documentos',
        kind: 'primary',
        execute: () => this.goToDocuments(client)
      });
    }

    actions.push({
      id: 'create-opportunity',
      label: 'Crear oportunidad vinculada',
      kind: 'secondary',
      execute: () => this.createOpportunity(client)
    });

    actions.push({
      id: 'view-client',
      label: 'Ver ficha del cliente',
      kind: this.shouldReturnToCotizador() ? 'ghost' : 'secondary',
      execute: () => this.viewClientDetail(client)
    });

    if (mode === 'create') {
      actions.push({
        id: 'register-another',
        label: 'Registrar otro cliente',
        kind: 'ghost',
        execute: () => this.resetFormForCreation()
      });
    }

    return actions;
  }

  private formatHealthScore(score: number): string {
    if (Number.isFinite(score)) {
      if (score > 1 && score <= 100) {
        return `${Math.round(score)}%`;
      }
      return String(Math.round(score));
    }
    return 'Sin dato';
  }

  private formatMarket(market: string): string {
    switch (market) {
      case 'aguascalientes':
        return 'Aguascalientes';
      case 'edomex':
      case 'estado_de_mexico':
        return 'Estado de México';
      default:
        return market;
    }
  }

  private formatFlow(flow: BusinessFlow): string {
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

  private shouldReturnToCotizador(): boolean {
    return this.returnTo === 'cotizador';
  }

  private goToDocuments(client: Client): Promise<boolean> {
    return this.router.navigate(['/documentos'], {
      queryParams: {
        clientId: client.id,
        source: 'cliente-flow'
      }
    });
  }

  private createOpportunity(client: Client): Promise<boolean> {
    return this.router.navigate(['/nueva-oportunidad'], {
      queryParams: {
        source: 'cliente-flow',
        clientId: client.id,
        clientName: client.name,
        market: client.market,
        suggestedFlow: this.mapFlowToQueryParam(client.flow)
      }
    });
  }

  private viewClientDetail(client: Client): Promise<boolean> {
    return this.router.navigate(['/clientes', client.id]);
  }

  private resetFormForCreation(): void {
    const market = this.clienteForm.get('market')?.value || 'aguascalientes';

    this.isEditMode = false;
    this.clientId = undefined;

    this.clienteForm.reset({
      name: '',
      email: '',
      phone: '',
      rfc: '',
      market,
      flow: BusinessFlow.VentaPlazo,
      notes: ''
    });

    this.clienteForm.markAsPristine();
    this.clienteForm.markAsUntouched();
    this.flowContext?.clearContext('cliente-form');
    this.updateBreadcrumbs();
  }

  private handleReturnToCotizador(client: Client): Promise<boolean> {
    this.flowContext?.updateContext('cotizador', (ctx) => {
      const next = { ...(ctx || {}) } as any;
      next.clientId = client.id;
      next.clientName = client.name;
      next.lastClientSync = Date.now();
      return next;
    });

    const target = this.returnUrl || '/cotizador';
    return this.router.navigateByUrl(target);
  }

  private mapFlowToQueryParam(flow: BusinessFlow | undefined): string | undefined {
    switch (flow) {
      case BusinessFlow.VentaDirecta:
        return 'venta_directa';
      case BusinessFlow.AhorroProgramado:
        return 'ahorro_programado';
      case BusinessFlow.CreditoColectivo:
        return 'credito_colectivo';
      case BusinessFlow.VentaPlazo:
        return 'venta_plazo';
      default:
        return undefined;
    }
  }

  private handleClientPersistenceError(action: 'create' | 'update', payload: any): void {
    const endpoint = action === 'create' ? 'clients' : `clients/${this.clientId}`;
    const method = action === 'create' ? 'POST' : 'PUT';

    this.persistDraft(payload);

    this.errorBoundary.reportNetworkTimeout({
      message: action === 'create'
        ? 'Intentaremos crear el cliente cuando vuelva la conexión.'
        : 'Intentaremos actualizar el cliente cuando vuelva la conexión.',
      context: {
        module: 'clientes',
        clientId: this.clientId ?? undefined
      },
      retry: () => this.retryClientRequest(action, payload),
      queueRequest: {
        endpoint,
        method,
        payload
      },
      onSaveDraft: () => this.persistDraft(payload)
    });
  }

  private persistDraft(payload: any): void {
    this.flowContext?.saveContext('cliente-form', { formValues: payload }, {
      ttlMs: 10 * 60 * 1000,
      breadcrumbs: ['Dashboard', 'Clientes', this.isEditMode ? 'Editar' : 'Nuevo']
    });
  }

  private async retryClientRequest(action: 'create' | 'update', payload: any): Promise<Client> {
    if (action === 'create') {
      return firstValueFrom(this.clientsApi.createClient(payload));
    }

    if (!this.clientId) {
      throw new Error('No hay cliente seleccionado para reintentar.');
    }

    return firstValueFrom(this.clientsApi.updateClient(this.clientId, payload));
  }

}
