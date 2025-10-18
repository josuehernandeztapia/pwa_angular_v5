import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';

import { FlowContextService } from '@core-services/flow-context.service';
import { AnalyticsService } from '@core-services/analytics.service';
import { IconComponent } from '@shared/icon/icon.component';

interface ProductOffering {
  id: string;
  name: string;
  description: string;
  audience: string[];
  status: 'active' | 'beta' | 'sunset';
  metrics: {
    activation: string;
    nps: string;
    margin: string;
  };
  lastUpdated: string;
  owner: string;
}

@Component({
  selector: 'app-productos-catalog',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './productos-catalog.component.html',
  styleUrls: ['./productos-catalog.component.scss']
})
export class ProductosCatalogComponent implements OnInit {
  private readonly flowContext = inject(FlowContextService);
  private readonly analytics = inject(AnalyticsService);

  readonly offerings = signal<ProductOffering[]>(this.bootstrapOfferings());

  readonly activeOfferings = computed(() =>
    this.offerings().filter(item => item.status === 'active')
  );

  readonly betaOfferings = computed(() =>
    this.offerings().filter(item => item.status === 'beta')
  );

  readonly sunsetOfferings = computed(() =>
    this.offerings().filter(item => item.status === 'sunset')
  );

  readonly totalSegments = computed(() =>
    new Set(this.offerings().flatMap(item => item.audience)).size
  );

  ngOnInit(): void {
    this.flowContext.setBreadcrumbs(['Dashboard', 'Productos']);
    this.analytics.track('products_catalog_viewed', {
      totalOfferings: this.offerings().length,
      active: this.activeOfferings().length,
      beta: this.betaOfferings().length
    });
  }

  trackById(_: number, item: ProductOffering): string {
    return item.id;
  }

  requestEnable(offering: ProductOffering): void {
    this.analytics.track('products_catalog_interest', {
      productId: offering.id,
      productName: offering.name,
      status: offering.status
    });
  }

  private bootstrapOfferings(): ProductOffering[] {
    return [
      {
        id: 'vehiculo-admin',
        name: 'Gestión Integral de Flota',
        description: 'Panel operativo para administración de unidades, mantenimiento preventivo y generación de pólizas de seguro.',
        audience: ['operaciones', 'postventa'],
        status: 'active',
        metrics: {
          activation: '92%',
          nps: '+37',
          margin: '13%'
        },
        lastUpdated: 'Sep 2025',
        owner: 'Ops Enablement'
      },
      {
        id: 'proteccion-premium',
        name: 'Protección Premium Conductores',
        description: 'Coberturas ampliadas con scoring dinámico HASE y activación automática tras firma digital.',
        audience: ['ventas', 'postventa'],
        status: 'active',
        metrics: {
          activation: '78%',
          nps: '+21',
          margin: '18%'
        },
        lastUpdated: 'Ago 2025',
        owner: 'Risk & Insurance'
      },
      {
        id: 'tanda-savings',
        name: 'Tanda Ahorro Inteligente',
        description: 'Ahorro programado con asignación automática vía motor consensus. Disponible en pilotos EdoMex.',
        audience: ['ventas', 'experiencia'],
        status: 'beta',
        metrics: {
          activation: '32%',
          nps: '+12',
          margin: '7%'
        },
        lastUpdated: 'Oct 2025',
        owner: 'Tanda Lab'
      },
      {
        id: 'leasing-corporativo',
        name: 'Leasing Corporativo',
        description: 'Planes financieros empresariales con onboarding asistido y facturación electrónica integrada.',
        audience: ['corporativo'],
        status: 'beta',
        metrics: {
          activation: '14%',
          nps: '+5',
          margin: '11%'
        },
        lastUpdated: 'Jul 2025',
        owner: 'Finance Squad'
      },
      {
        id: 'club-beneficios',
        name: 'Club Conductores',
        description: 'Programa de lealtad con micro-recompensas y marketplace de aliados. En proceso de sunset controlado.',
        audience: ['experiencia'],
        status: 'sunset',
        metrics: {
          activation: '68%',
          nps: '+3',
          margin: '4%'
        },
        lastUpdated: 'Jun 2025',
        owner: 'CX Lab'
      }
    ];
  }
}
