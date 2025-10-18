import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FlowContextService } from '@core-services/flow-context.service';
import { ClaimsService, ClaimRecord, ClaimStatus, ClaimType } from '@feature-services/postventa/claims.service';
import { IconComponent } from '@shared/icon/icon.component';

interface ClaimsSummary {
  total: number;
  open: number;
  inReview: number;
  closed: number;
  avgAmount: number;
}

@Component({
  selector: 'app-claims-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, IconComponent],
  templateUrl: './claims-page.component.html',
  styleUrls: ['./claims-page.component.scss']
})
export class ClaimsPageComponent implements OnInit {
  private readonly claims = inject(ClaimsService);
  private readonly flowContext = inject(FlowContextService);
  private readonly destroyRef = inject(DestroyRef);

  readonly statusFilter = signal<ClaimStatus | 'all'>('all');
  readonly marketFilter = signal<'all' | 'aguascalientes' | 'edomex' | 'otros'>('all');
  readonly search = signal('');

  readonly records = signal<ClaimRecord[]>([]);
  readonly summary = signal<ClaimsSummary | null>(null);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  readonly statuses: Array<{ value: ClaimStatus | 'all'; label: string }> = [
    { value: 'all', label: 'Todos' },
    { value: 'open', label: 'Abiertos' },
    { value: 'in_review', label: 'En revisión' },
    { value: 'approved', label: 'Aprobados' },
    { value: 'rejected', label: 'Rechazados' },
    { value: 'closed', label: 'Cerrados' }
  ];

  readonly markets: Array<{ value: 'all' | 'aguascalientes' | 'edomex' | 'otros'; label: string }> = [
    { value: 'all', label: 'Mercados' },
    { value: 'aguascalientes', label: 'AGS' },
    { value: 'edomex', label: 'EdoMex' },
    { value: 'otros', label: 'Otros' }
  ];

  readonly hasPendingSync = computed(() => this.records().some(record => record.pendingSync));

  ngOnInit(): void {
    this.flowContext.setBreadcrumbs(['Dashboard', 'Claims & Service']);
    this.loadSummary();
    this.loadClaims();
  }

  trackClaim(_: number, record: ClaimRecord): string {
    return record.id;
  }

  trackOption(_: number, option: { value: string }): string {
    return option.value;
  }

  setStatusFilter(status: ClaimStatus | 'all'): void {
    this.statusFilter.set(status);
    this.loadClaims();
  }

  setMarketFilter(market: 'all' | 'aguascalientes' | 'edomex' | 'otros'): void {
    this.marketFilter.set(market);
    this.loadClaims();
  }

  setSearch(value: string): void {
    this.search.set(value);
    this.loadClaims();
  }

  private loadClaims(): void {
    this.isLoading.set(true);
    this.error.set(null);

    const status = this.statusFilter();
    const market = this.marketFilter();
    const search = this.search().trim();

    this.claims
      .getClaims({
        status: status === 'all' ? undefined : status,
        market: market === 'all' ? undefined : market,
        search: search || undefined
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: records => {
          this.records.set(records);
          this.isLoading.set(false);
        },
        error: () => {
          this.records.set([]);
          this.isLoading.set(false);
          this.error.set('No fue posible cargar las solicitudes de servicio.');
        }
      });
  }

  private loadSummary(): void {
    this.claims
      .getSummary()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(summary => this.summary.set(summary));
  }

  statusLabel(status: ClaimStatus): string {
    switch (status) {
      case 'open':
        return 'Abierta';
      case 'in_review':
        return 'En revisión';
      case 'approved':
        return 'Aprobada';
      case 'rejected':
        return 'Rechazada';
      case 'closed':
        return 'Cerrada';
      default:
        return status;
    }
  }

  statusBadge(status: ClaimStatus): 'open' | 'warning' | 'success' | 'danger' {
    if (status === 'open') return 'open';
    if (status === 'in_review') return 'warning';
    if (status === 'approved' || status === 'closed') return 'success';
    return 'danger';
  }

  typeLabel(type: ClaimType): string {
    switch (type) {
      case 'warranty':
        return 'Garantía';
      case 'maintenance':
        return 'Mantenimiento';
      case 'insurance':
        return 'Seguro';
      case 'service':
        return 'Servicio';
      default:
        return type;
    }
  }
}
