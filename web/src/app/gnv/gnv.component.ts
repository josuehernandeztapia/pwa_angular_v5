import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { GnvDataService } from '@feature-services/gnv/gnv-data.service';
import { FlowContextService } from '@core-services/flow-context.service';
import { IconComponent } from '@shared/icon/icon.component';

interface ConsumptionRecord {
  driver_id: string;
  vehicle_id: string;
  station_name: string;
  timestamp: string;
  total_cost: number;
  volume_leq: number;
  transaction_reference: string;
}

interface MonthlySummary {
  driver_id: string;
  month: string;
  total_volume_leq: number;
  total_cost: number;
  transaction_count: number;
  average_price_per_leq: number;
  stations_used: string[];
  payment_status?: 'pending' | 'paid' | 'overdue';
  payment_link?: string;
}

interface StationInfo {
  id: string;
  name: string;
  city: string;
  state: string;
  active: boolean;
}

@Component({
  selector: 'app-gnv',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IconComponent],
  templateUrl: './gnv.component.html',
  styleUrls: ['./gnv.component.scss']
})
export class GnvComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly gnv = inject(GnvDataService);
  private readonly flowContext = inject(FlowContextService);
  private readonly destroyRef = inject(DestroyRef);

  readonly filtersForm = this.fb.nonNullable.group({
    driverId: this.fb.nonNullable.control('demo-driver', Validators.required),
    state: this.fb.nonNullable.control('edomex')
  });

  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly consumption = signal<ConsumptionRecord[]>([]);
  readonly summary = signal<MonthlySummary | null>(null);
  readonly stations = signal<StationInfo[]>([]);

  readonly totalCostFormatted = computed(() => {
    const monthly = this.summary();
    return monthly ? this.formatCurrency(monthly.total_cost) : '$0.00';
  });

  readonly totalVolumeFormatted = computed(() => {
    const monthly = this.summary();
    return monthly ? `${monthly.total_volume_leq.toFixed(2)} LEQ` : '0 LEQ';
  });

  ngOnInit(): void {
    this.flowContext.setBreadcrumbs(['Dashboard', 'GNV']);
    this.loadData();

    this.filtersForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadData());
  }

  private loadData(): void {
    if (this.filtersForm.invalid) {
      return;
    }

    const { driverId, state } = this.filtersForm.getRawValue();
    const month = this.currentMonth();

    this.isLoading.set(true);
    this.error.set(null);

    forkJoin({
      consumption: this.gnv.getDriverConsumption(driverId),
      summary: this.gnv.getMonthlyConsumption(driverId, month),
      stations: this.gnv.getGNVStations(state)
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ consumption, summary, stations }) => {
          this.consumption.set(consumption as ConsumptionRecord[]);
          this.summary.set(summary as MonthlySummary);
          this.stations.set(stations as StationInfo[]);
          this.isLoading.set(false);
        },
        error: () => {
          this.error.set('Mostramos datos mock porque el servicio de GNV no respondió.');
          this.isLoading.set(false);
        }
      });
  }

  trackConsumption(_: number, record: ConsumptionRecord): string {
    return record.transaction_reference;
  }

  trackStation(_: number, station: StationInfo): string {
    return station.id;
  }

  private currentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(value);
  }
}
