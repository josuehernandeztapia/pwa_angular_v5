import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DashboardService } from '@feature-services/dashboard/dashboard.service';
import { FlowContextService } from '@core-services/flow-context.service';
import { IconComponent } from '@shared/icon/icon.component';
import { Market } from '@interfaces/types';

interface OpportunityStageView {
  name: string;
  count: number;
  clientIds: string[];
}

@Component({
  selector: 'app-opportunities-pipeline',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './opportunities-pipeline.component.html',
  styleUrls: ['./opportunities-pipeline.component.scss']
})
export class OpportunitiesPipelineComponent implements OnInit {
  private readonly dashboard = inject(DashboardService);
  private readonly flowContext = inject(FlowContextService);
  private readonly destroyRef = inject(DestroyRef);

  readonly selectedMarket = signal<Market>('all');
  readonly stages = signal<OpportunityStageView[]>([]);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  readonly totalOpportunities = computed(() => this.stages().reduce((total, stage) => total + stage.count, 0));

  readonly markets: Array<{ value: Market; label: string }> = [
    { value: 'all', label: 'Todos los mercados' },
    { value: 'aguascalientes', label: 'Aguascalientes' },
    { value: 'edomex', label: 'EdoMex' },
    { value: 'otros', label: 'Otros' }
  ];

  ngOnInit(): void {
    this.flowContext.setBreadcrumbs(['Dashboard', 'Oportunidades']);
    this.loadStages();
  }

  setMarket(value: Market): void {
    if (value === this.selectedMarket()) {
      return;
    }
    this.selectedMarket.set(value);
    this.loadStages();
  }

  trackStage(_: number, stage: OpportunityStageView): string {
    return stage.name;
  }

  trackMarket(_: number, market: { value: Market }): string {
    return market.value;
  }

  private loadStages(): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.dashboard
      .getOpportunityStages(this.selectedMarket())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: stages => {
          this.stages.set(stages);
          this.isLoading.set(false);
        },
        error: () => {
          this.stages.set([]);
          this.isLoading.set(false);
          this.error.set('No fue posible sincronizar el pipeline; estamos mostrando datos vacíos.');
        }
      });
  }
}
