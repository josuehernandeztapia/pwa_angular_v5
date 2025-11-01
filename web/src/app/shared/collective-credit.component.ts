import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '@shared/icon/icon.component';
import { TandaSimDraft, TandaSimulationResult, TandaMonthState, TandaSimEvent } from '@interfaces/types';
import { TandaEngineService } from '@feature-services/tanda/tanda-engine.service';
import { ToastService } from '@core-services/toast.service';
import { IconName } from '@shared/icon/icon-definitions';
import { EntitySyncService } from '@core-services/entity-sync.service';
import { FlowCompletionService } from '@core-services/flow-completion.service';
import { SummaryMetric } from '@shared/summary-panel.component';
import { GlobalSearchService } from '@core-services/global-search.service';
import { NavigationService } from '@core-services/navigation.service';

interface KpiCardData {
  title: string;
  value: string;
  icon: IconName;
}

interface NewEventForm {
  t: string;
  type: 'miss' | 'extra';
  memberId: string;
  amount: string;
}

@Component({
  selector: 'app-collective-credit',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  templateUrl: './collective-credit.component.html',
  styleUrls: ['./collective-credit.component.scss'],

})
export class CollectiveCreditComponent implements OnInit {
  // Port exacto de state desde React líneas 72-75
  draft: TandaSimDraft = this.createDefaultDraft();
  result: TandaSimulationResult | null = null;
  isLoading = false;
  newEvent: NewEventForm = {
    t: '1',
    type: 'extra',
    memberId: 'M1',
    amount: '5000'
  };

  constructor(
    private tandaEngine: TandaEngineService,
    private toast: ToastService,
    private completion: FlowCompletionService,
    private entitySync: EntitySyncService,
    private globalSearch: GlobalSearchService,
    private navigation: NavigationService
  ) {}

  ngOnInit(): void {
    // Initialize newEvent with first member if available
    if (this.draft.group.members.length > 0) {
      this.newEvent.memberId = this.draft.group.members[0].id;
    }
  }

  // Port exacto de createDefaultDraft desde React líneas 7-34
  private createDefaultDraft(): TandaSimDraft {
    return {
      group: {
        name: 'Tanda Ruta 25',
        members: Array.from({ length: 5 }, (_, i) => ({
          id: `M${i + 1}`,
          name: `Miembro ${i + 1}`,
          prio: i + 1,
          status: 'active',
          C: 5000,
        })),
        product: {
          price: 950000,
          dpPct: 0.15,
          term: 60,
          rateAnnual: 0.299,
          fees: 10000,
        },
        rules: {
          allocRule: 'debt_first',
          eligibility: { requireThisMonthPaid: true },
        },
        seed: 12345,
      },
      config: {
        horizonMonths: 48,
        events: [],
      },
    };
  }

  // Port exacto de kpis computation desde React líneas 132-140
  get kpis(): KpiCardData[] | null {
    if (!this.result) return null;
    return [
      {
        title: 'Unidades Entregadas',
        value: `${this.result.kpis.deliveredCount} / ${this.draft.group.members.length}`,
        icon: 'check-circle'
      },
      {
        title: 'Primera Entrega',
        value: `Mes ${this.result.firstAwardT || 'N/A'}`,
        icon: 'calendar'
      },
      {
        title: 'Última Entrega',
        value: `Mes ${this.result.lastAwardT || 'N/A'}`,
        icon: 'users'
      },
      {
        title: 'Tiempo Promedio',
        value: `${this.result.kpis.avgTimeToAward.toFixed(1)} meses`,
        icon: 'clock'
      },
    ];
  }

  // Port exacto de handleSimulate desde React líneas 77-90
  handleSimulate(): void {
    this.isLoading = true;
    this.result = null;

    this.tandaEngine.simulateTanda(this.draft.group, this.draft.config).subscribe({
      next: (res) => {
        this.result = res;
        this.toast.success("Simulación completada con éxito.");
        this.isLoading = false;
      },
      error: (error) => {
        this.toast.error("Error al ejecutar la simulación.");
        this.isLoading = false;
      }
    });
  }

  // Port exacto de handleAddEvent desde React líneas 92-113
  handleAddEvent(): void {
    const event: TandaSimEvent = {
      t: parseInt(this.newEvent.t, 10),
      type: this.newEvent.type,
      data: {
        memberId: this.newEvent.memberId,
        amount: parseFloat(this.newEvent.amount)
      },
      id: `evt-${Date.now()}`
    };

    if (isNaN(event.t) || isNaN(event.data.amount) || !event.data.memberId) {
      this.toast.error("Por favor, introduce valores válidos para el evento.");
      return;
    }

    this.draft = {
      ...this.draft,
      config: {
        ...this.draft.config,
        events: [...this.draft.config.events, event]
      }
    };
  }

  // Port exacto de handleRemoveEvent desde React líneas 115-120
  handleRemoveEvent(id: string): void {
    this.draft = {
      ...this.draft,
      config: { 
        ...this.draft.config, 
        events: this.draft.config.events.filter(e => e.id !== id) 
      }
    };
  }

  // Port exacto de handleFormalize desde React líneas 122-130
  handleFormalize(): void {
    if (!this.result) {
      this.toast.error("Primero debes correr una simulación exitosa.");
      return;
    }
    this.entitySync.recordCollectiveSimulation(this.draft.group.name, this.draft.group.members.length);
    const metrics: SummaryMetric[] = [
      { label: 'Grupo', value: this.draft.group.name },
      { label: 'Integrantes', value: `${this.draft.group.members.length}` },
      {
        label: 'Unidades entregadas',
        value: `${this.result.kpis.deliveredCount} / ${this.draft.group.members.length}`
      },
      {
        label: 'Primera entrega',
        value: this.result.firstAwardT ? `Mes ${this.result.firstAwardT}` : 'Por definir'
      }
    ];

    const nextSteps = [
      'Genera la oportunidad colectiva con los integrantes confirmados.',
      'Define el calendario de aportaciones y comunica la primera entrega.'
    ];

    this.completion.open({
      title: 'Simulación colectiva lista',
      description: 'Continúa con el proceso para formalizar el grupo y arrancar la tanda.',
      metrics,
      nextSteps,
      actions: [
        {
          id: 'create-collective-opportunity',
          label: 'Crear oportunidad colectiva',
          kind: 'primary',
          execute: () => this.toast.info('Integración con oportunidad colectiva pendiente.')
        },
        {
          id: 'download-summary',
          label: 'Descargar resumen',
          kind: 'secondary',
          execute: () => this.toast.info('Exportar PDF disponible en próximos sprints.'),
          autoClose: false
        }
      ],
      onComplete: () => {
        this.globalSearch.refreshIndex(this.draft.group.name);
        this.navigation.refreshQuickActions();
      }
    });
  }

  // Input handlers for product parameters
  onProductPriceChange(event: any): void {
    this.draft = {
      ...this.draft,
      group: {
        ...this.draft.group,
        product: {
          ...this.draft.group.product,
          price: +event.target.value
        }
      }
    };
  }

  onDownPaymentPctChange(event: any): void {
    this.draft = {
      ...this.draft,
      group: {
        ...this.draft.group,
        product: {
          ...this.draft.group.product,
          dpPct: +event.target.value / 100
        }
      }
    };
  }

  onMonthlyContributionChange(event: any): void {
    const newContribution = +event.target.value;
    this.draft = {
      ...this.draft,
      group: {
        ...this.draft.group,
        members: this.draft.group.members.map(m => ({
          ...m,
          C: newContribution
        }))
      }
    };
  }

  onMemberCountChange(event: any): void {
    const newCount = +event.target.value;
    const currentContribution = this.draft.group.members[0]?.C || 5000;
    
    this.draft = {
      ...this.draft,
      group: {
        ...this.draft.group,
        members: Array.from({ length: newCount }, (_, i) => ({
          id: `M${i + 1}`,
          name: `Miembro ${i + 1}`,
          prio: i + 1,
          status: 'active',
          C: currentContribution,
        }))
      }
    };

    // Update newEvent memberId if current selection is no longer valid
    if (!this.draft.group.members.find(m => m.id === this.newEvent.memberId)) {
      this.newEvent.memberId = this.draft.group.members[0]?.id || 'M1';
    }
  }

  // Utility methods
  getMemberName(memberId: string): string {
    const member = this.draft.group.members.find(m => m.id === memberId);
    return member ? member.name : memberId;
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-MX', { 
      style: 'currency', 
      currency: 'MXN' 
    }).format(amount);
  }
}
