import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { FlowContextService } from '@core-services/flow-context.service';
import { ClientsApiService } from '@data-access/clients/clients-api.service';
import { Client, Document, DocumentStatus } from '@interfaces/types';
import { IconComponent } from '@shared/icon/icon.component';

interface ExpedienteItem {
  id: string;
  client: string;
  updatedAt: Date;
  completeness: number;
  missingDocs: string[];
}

@Component({
  selector: 'app-expedientes',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './expedientes.component.html',
  styleUrls: ['./expedientes.component.scss']
})
export class ExpedientesComponent implements OnInit {
  private readonly flowContext = inject(FlowContextService);
  private readonly clientsApi = inject(ClientsApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly expedientes = signal<ExpedienteItem[]>([]);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    this.flowContext.setBreadcrumbs(['Dashboard', 'Expedientes']);
  }

  ngOnInit(): void {
    this.loadExpedientes();
  }

  trackExpediente(_: number, item: ExpedienteItem): string {
    return item.id;
  }

  reload(): void {
    this.loadExpedientes();
  }

  private loadExpedientes(): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.clientsApi
      .getClients()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: clients => {
          const mapped = clients
            .map(client => this.mapClientToExpediente(client))
            .filter((item): item is ExpedienteItem => item !== null)
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

          this.expedientes.set(mapped);
          this.isLoading.set(false);
        },
        error: () => {
          this.expedientes.set([]);
          this.isLoading.set(false);
          this.error.set('No fue posible recuperar los expedientes digitales.');
        }
      });
  }

  private mapClientToExpediente(client: Client): ExpedienteItem | null {
    const documents = client.documents ?? [];
    if (!documents.length) {
      return null;
    }

    const approved = documents.filter(doc => this.isApproved(doc)).length;
    const completeness = documents.length ? approved / documents.length : 0;
    const missingDocs = documents
      .filter(doc => !this.isApproved(doc))
      .map(doc => doc.name ?? doc.id)
      .filter(Boolean);

    const updatedAt = this.resolveUpdatedAt(client, documents);

    return {
      id: client.id,
      client: client.name,
      updatedAt,
      completeness,
      missingDocs
    };
  }

  private resolveUpdatedAt(client: Client, documents: Document[]): Date {
    const dates: Array<string | Date | undefined> = [
      client.updatedAt,
      client.lastModified,
      client.lastPaymentDate,
      ...documents.flatMap(doc => [doc.updatedAt, doc.completedAt, doc.reviewedAt, doc.createdAt]),
      ...(client.events ?? []).map(event => event.timestamp)
    ];

    const latest = dates
      .map(value => (typeof value === 'string' ? new Date(value) : value))
      .filter((value): value is Date => value instanceof Date && !isNaN(value.getTime()))
      .sort((a, b) => b.getTime() - a.getTime())[0];

    return latest ?? new Date();
  }

  private isApproved(doc: Document): boolean {
    return (doc.status as DocumentStatus) === DocumentStatus.Aprobado;
  }
}
