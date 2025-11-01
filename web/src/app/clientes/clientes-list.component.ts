import { Component, DestroyRef, HostBinding, Optional, computed, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ClientsApiService } from '@data-access/clients/clients-api.service';
import { ToastService } from '@core-services/toast.service';
import { DownloadService } from '@core-services/download.service';
import { Client, BusinessFlow } from '@interfaces/types';
import { IconComponent } from '@shared/icon/icon.component';
import { DemoBadgeComponent } from '@shared/demo-badge.component';
import { FlowContextService } from '@core-services/flow-context.service';
import { RiskEvaluationService } from '@feature-services/risk/risk-evaluation.service';
import { RiskEvaluation } from '@interfaces/risk-evaluation';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '@environments/environment';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-clientes-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, IconComponent, DemoBadgeComponent],
  templateUrl: './clientes-list.component.html',
  styleUrls: ['./clientes-list.component.scss'],
})
export class ClientesListComponent {
  @HostBinding('class') readonly hostClass = 'clientes-list command-container';
  private readonly riskFeatureEnabled = environment.features.enableRiskEvaluation === true;

  private readonly clientes = signal<Client[]>([]);
  readonly selectedClientes = signal<Set<string>>(new Set());
  private readonly riskEvaluations = signal(new Map<string, RiskEvaluation>());

  readonly isLoading = signal(true);
  readonly currentPage = signal(1);
  readonly pageSize = signal(20);

  readonly searchTerm = signal('');
  readonly filterMarket = signal('');
  readonly filterFlow = signal('');
  readonly filterStatus = signal('');
  readonly filterHealthScore = signal('');

  readonly filters = computed(() => ({
    search: this.searchTerm().trim(),
    market: this.filterMarket(),
    flow: this.filterFlow(),
    status: this.filterStatus(),
    health: this.filterHealthScore()
  }));

  readonly hasActiveFilters = computed(() => {
    const filters = this.filters();
    return !!(filters.search || filters.market || filters.flow || filters.status || filters.health);
  });

  readonly filteredClientes = computed(() => {
    const filters = this.filters();
    const normalizedSearch = filters.search.toLowerCase();

    return this.clientes().filter(cliente => {
      const matchesSearch = !filters.search ||
        cliente.name.toLowerCase().includes(normalizedSearch) ||
        (cliente.email && cliente.email.toLowerCase().includes(normalizedSearch)) ||
        (cliente.phone && cliente.phone.includes(filters.search));

      const matchesMarket = !filters.market || cliente.market === filters.market;
      const matchesFlow = !filters.flow || cliente.flow === filters.flow;
      const matchesStatus = !filters.status || cliente.status === filters.status;
      const matchesHealthScore = !filters.health || this.matchesHealthScoreFilter(cliente, filters.health);

      return matchesSearch && matchesMarket && matchesFlow && matchesStatus && matchesHealthScore;
    });
  });

  readonly totalClientes = computed(() => this.clientes().length);

  readonly paginatedClientes = computed(() => {
    const clients = this.filteredClientes();
    if (clients.length === 0) {
      return [] as Client[];
    }

    const pageSize = this.pageSize();
    const startIndex = (this.currentPage() - 1) * pageSize;
    return clients.slice(startIndex, startIndex + pageSize);
  });

  readonly totalPages = computed(() => {
    const total = this.filteredClientes().length;
    const size = this.pageSize();
    return total === 0 ? 1 : Math.ceil(total / size);
  });

  readonly allSelected = computed(() => {
    const pageClients = this.paginatedClientes();
    if (pageClients.length === 0) {
      return false;
    }
    const selected = this.selectedClientes();
    return pageClients.every(cliente => selected.has(cliente.id));
  });

  readonly someSelected = computed(() => {
    const selected = this.selectedClientes();
    return this.paginatedClientes().some(cliente => selected.has(cliente.id));
  });

  readonly selectedCount = computed(() => this.selectedClientes().size);

  readonly visiblePages = computed(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    const pages: (number | string)[] = [];

    if (total <= 7) {
      for (let i = 1; i <= total; i++) {
        pages.push(i);
      }
      return pages;
    }

    pages.push(1);
    if (current > 4) {
      pages.push('...');
    }

    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (current < total - 3) {
      pages.push('...');
    }

    pages.push(total);
    return pages;
  });

  readonly displayRange = computed(() => {
    const total = this.filteredClientes().length;
    if (total === 0) {
      return '0';
    }

    const pageSize = this.pageSize();
    const start = (this.currentPage() - 1) * pageSize + 1;
    const end = Math.min(start + pageSize - 1, total);
    return `${start}-${end}`;
  });

  readonly summaryMetrics = computed(() => {
    const clients = this.filteredClientes();
    const total = clients.length;

    if (total === 0) {
      return {
        total: 0,
        active: 0,
        atRisk: 0,
        avgHealth: null as number | null,
        healthCount: 0
      };
    }

    const active = clients.filter(cliente => (cliente.status ?? '').toLowerCase() === 'activo').length;
    const atRisk = clients.filter(cliente => this.isAtRisk(cliente)).length;
    const healthScores = clients
      .map(cliente => cliente.healthScore)
      .filter((score): score is number => typeof score === 'number');
    const avgHealth = healthScores.length
      ? Math.round(healthScores.reduce((sum, score) => sum + score, 0) / healthScores.length)
      : null;

    return {
      total,
      active,
      atRisk,
      avgHealth,
      healthCount: healthScores.length
    };
  });

  constructor(
    private readonly clientsApi: ClientsApiService,
    private readonly toast: ToastService,
    private readonly downloadService: DownloadService,
    private readonly riskEvaluationService: RiskEvaluationService,
    @Optional() private readonly flowContext: FlowContextService | null,
    private readonly destroyRef: DestroyRef
  ) {
    this.flowContext?.setBreadcrumbs(['Dashboard', 'Clientes']);

    this.clientsApi.clients$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(clientes => {
        if (this.isLoading()) {
          this.isLoading.set(false);
        }
        this.clientes.set(clientes);
        this.selectedClientes.set(new Set());
        if (this.riskFeatureEnabled && clientes.length) {
          this.hydrateRiskEvaluations(clientes);
        }
      });

    this.clientsApi.getClients().pipe(
      catchError(() => {
        this.toast.error('Error al cargar los clientes');
        this.isLoading.set(false);
        return of<Client[]>([]);
      })
    ).subscribe();

    effect(() => {
      this.filters();
      this.currentPage.set(1);
    }, { allowSignalWrites: true });

    effect(() => {
      const total = this.totalPages();
      const current = this.currentPage();
      if (current > total) {
        this.currentPage.set(total);
      }
    }, { allowSignalWrites: true });
  }

  trackByClientId(index: number, cliente: Client): string {
    return cliente.id;
  }

  onSearchTermChange(value: string): void {
    this.searchTerm.set(value);
  }

  onMarketChange(value: string): void {
    this.filterMarket.set(value);
  }

  onFlowChange(value: string): void {
    this.filterFlow.set(value);
  }

  onStatusChange(value: string): void {
    this.filterStatus.set(value);
  }

  onHealthScoreChange(value: string): void {
    this.filterHealthScore.set(value);
  }

  clearAllFilters(): void {
    this.searchTerm.set('');
    this.filterMarket.set('');
    this.filterFlow.set('');
    this.filterStatus.set('');
    this.filterHealthScore.set('');
  }

  getClientInitials(name: string): string {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }

  getCardClasses(cliente: Client): Record<string, boolean> {
    return {
      'clientes-list__card': true,
      'clientes-list__card--selected': this.selectedClientes().has(cliente.id)
    };
  }

  getStatusClasses(status: string): Record<string, boolean> {
    const normalized = status.toLowerCase();
    return {
      'clientes-list__status-badge': true,
      'clientes-list__status-badge--active': normalized === 'activo',
      'clientes-list__status-badge--pending': normalized === 'pendiente' || normalized === 'en expediente',
      'clientes-list__status-badge--risk': normalized === 'en riesgo' || normalized === 'documentos incompletos',
      'clientes-list__status-badge--inactive': normalized === 'inactivo'
    };
  }

  getMarketName(market: string): string {
    switch (market) {
      case 'aguascalientes': return 'Aguascalientes';
      case 'edomex': return 'Estado de México';
      default: return market;
    }
  }

  formatDate(date: Date | undefined): string {
    if (!date) return 'No registrado';
    return new Intl.DateTimeFormat('es-MX', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(date);
  }

  getHealthScoreLabel(filter: string): string {
    const labels: Record<string, string> = {
      critical: 'Crítico (< 40)',
      poor: 'Regular (40-59)',
      good: 'Bueno (60-79)',
      excellent: 'Excelente (80+)'
    };
    return labels[filter] || filter;
  }

  getAvatarClasses(score: number | undefined): Record<string, boolean> {
    const level = this.getHealthScoreLevel(score);
    return {
      'clientes-list__avatar': true,
      [`clientes-list__avatar--${level}`]: true
    };
  }

  getScoreValueClasses(score: number | undefined): Record<string, boolean> {
    const level = this.getHealthScoreLevel(score);
    return {
      'clientes-list__score-value': true,
      [`clientes-list__score-value--${level}`]: true
    };
  }

  getSummaryHealthClasses(avgHealth: number | null): Record<string, boolean> {
    const level = this.getHealthScoreLevel(avgHealth ?? undefined);
    return {
      'clientes-list__insight-value': true,
      [`clientes-list__insight-value--${level}`]: avgHealth !== null
    };
  }

  callClient(cliente: Client): void {
    if (cliente.phone) {
      window.open(`tel:${cliente.phone}`, '_self');
    } else {
      this.toast.error('Este cliente no tiene teléfono registrado');
    }
  }

  toggleSelectAll(): void {
    const updated = new Set(this.selectedClientes());
    if (this.allSelected()) {
      this.paginatedClientes().forEach(cliente => updated.delete(cliente.id));
    } else {
      this.paginatedClientes().forEach(cliente => updated.add(cliente.id));
    }
    this.selectedClientes.set(updated);
  }

  toggleClientSelection(clientId: string, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    const updated = new Set(this.selectedClientes());
    if (updated.has(clientId)) {
      updated.delete(clientId);
    } else {
      updated.add(clientId);
    }
    this.selectedClientes.set(updated);
  }

  clearSelection(): void {
    this.selectedClientes.set(new Set());
  }

  onPageSizeChange(raw: number | string): void {
    const parsed = Number(raw);
    const size = Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
    this.pageSize.set(size);
    this.currentPage.set(1);
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
    }
  }

  onPageClick(page: number | string): void {
    if (typeof page !== 'number') {
      return;
    }
    this.goToPage(page);
  }

  exportSelected(): void {
    if (this.selectedClientes().size === 0) {
      this.toast.error('Selecciona al menos un cliente para exportar');
      return;
    }

    const data = this.clientes().filter(cliente => this.selectedClientes().has(cliente.id));
    this.exportToCSV(data);
  }

  getRiskBadge(cliente: Client): string | null {
    const evaluation = this.getRiskEvaluation(cliente);
    if (!evaluation) {
      return null;
    }

    const decisionLabelMap: Record<RiskEvaluation['decision'], string> = {
      GO: 'GO',
      REVIEW: 'Revision',
      'NO-GO': 'No-Go'
    };

    const categoryLabelMap: Record<RiskEvaluation['riskCategory'], string> = {
      BAJO: 'bajo',
      MEDIO: 'medio',
      ALTO: 'alto',
      CRITICO: 'critico'
    };

    return `${decisionLabelMap[evaluation.decision]} · Riesgo ${categoryLabelMap[evaluation.riskCategory]}`;
  }

  getRiskIndicatorClasses(cliente: Client): Record<string, boolean> {
    const evaluation = this.getRiskEvaluation(cliente);
    const baseClasses: Record<string, boolean> = {
      'clientes-list__indicator': true,
      'clientes-list__indicator--risk': true
    };

    if (!evaluation) {
      return baseClasses;
    }

    const normalized = evaluation.riskCategory.toLowerCase();
    return {
      ...baseClasses,
      [`clientes-list__indicator--risk-${normalized}`]: true
    };
  }

  isClientUrgent(cliente: Client): boolean {
    const evaluation = this.getRiskEvaluation(cliente);
    if (evaluation) {
      return evaluation.decision === 'NO-GO' || evaluation.riskCategory === 'CRITICO';
    }

    return (cliente.healthScore !== undefined && cliente.healthScore < 40) ||
      cliente.status === 'En Riesgo' ||
      cliente.status === 'Documentos Incompletos';
  }

  isHighValueClient(cliente: Client): boolean {
    const evaluation = this.getRiskEvaluation(cliente);
    if (evaluation) {
      return evaluation.decision === 'GO' && evaluation.scoreBreakdown.finalScore >= 80;
    }

    return (cliente.healthScore !== undefined && cliente.healthScore >= 90) &&
      cliente.status === 'Activo';
  }

  isAtRisk(cliente: Client): boolean {
    const evaluation = this.getRiskEvaluation(cliente);
    if (evaluation) {
      return evaluation.decision === 'NO-GO' ||
        evaluation.decision === 'REVIEW' ||
        evaluation.riskCategory === 'ALTO' ||
        evaluation.riskCategory === 'CRITICO';
    }

    return (cliente.healthScore !== undefined && cliente.healthScore < 60) ||
      cliente.status === 'En Riesgo';
  }

  hasProtectionAvailable(cliente: Client): boolean {
    const flowsWithProtection = new Set<BusinessFlow>([
      BusinessFlow.VentaPlazo,
      BusinessFlow.AhorroProgramado,
      BusinessFlow.CreditoColectivo,
    ]);

    return flowsWithProtection.has(cliente.flow);
  }

  getVisiblePageLabel(page: number | string): string {
    return typeof page === 'number' ? page.toString() : '…';
  }

  private hydrateRiskEvaluations(clientes: Client[]): void {
    if (!this.riskFeatureEnabled || clientes.length === 0) {
      this.riskEvaluations.set(new Map());
      return;
    }

    const requests = clientes.map(cliente =>
      this.riskEvaluationService.getEvaluationHistory(cliente.id).pipe(
        map(history => ({ clientId: cliente.id, evaluation: history[0] ?? null })),
        catchError(() => of({ clientId: cliente.id, evaluation: null }))
      )
    );

    forkJoin(requests)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(results => {
        const updated = new Map<string, RiskEvaluation>();
        results.forEach(result => {
          if (result.evaluation) {
            updated.set(result.clientId, result.evaluation);
          }
        });
        this.riskEvaluations.set(updated);
      });
  }

  private matchesHealthScoreFilter(cliente: Client, filter: string): boolean {
    const score = cliente.healthScore;
    if (score === undefined) return filter === 'critical';

    switch (filter) {
      case 'critical': return score < 40;
      case 'poor': return score >= 40 && score < 60;
      case 'good': return score >= 60 && score < 80;
      case 'excellent': return score >= 80;
      default: return true;
    }
  }

  private getHealthScoreLevel(score: number | undefined): 'excellent' | 'good' | 'poor' | 'critical' | 'unknown' {
    if (score === undefined) return 'unknown';
    if (score >= 80) return 'excellent';
    if (score >= 60) return 'good';
    if (score >= 40) return 'poor';
    return 'critical';
  }

  private getRiskEvaluation(cliente: Client): RiskEvaluation | null {
    return this.riskEvaluations().get(cliente.id) ?? null;
  }

  private exportToCSV(clientes: Client[]): void {
    const headers = [
      'Nombre',
      'Email',
      'Teléfono',
      'Estado',
      'Health Score',
      'Mercado',
      'Producto',
      'Fecha Creación'
    ];

    const csvData = [
      headers.join(','),
      ...clientes.map(cliente => [
        `"${cliente.name}"`,
        `"${cliente.email || ''}"`,
        `"${cliente.phone || ''}"`,
        `"${cliente.status}"`,
        cliente.healthScore?.toString() || '',
        `"${this.getMarketName(cliente.market || '')}"`,
        `"${cliente.flow}"`,
        cliente.createdAt ? this.formatDate(cliente.createdAt) : ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const filename = `clientes_${new Date().toISOString().split('T')[0]}.csv`;

    this.downloadService.downloadBlob(blob, {
      filename,
      revokeUrl: true
    });

    this.toast.success(`${clientes.length} clientes exportados exitosamente`);
  }
}
