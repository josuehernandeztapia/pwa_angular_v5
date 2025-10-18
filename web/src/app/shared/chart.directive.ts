import { Directive, Input, ElementRef, NgZone, DestroyRef, PLATFORM_ID, inject, AfterViewInit, OnChanges, SimpleChanges } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Chart, ChartConfiguration, registerables } from 'chart.js';

@Directive({
  selector: 'canvas[appChart]',
  standalone: true
})
export class ChartDirective implements AfterViewInit, OnChanges {
  @Input('appChart') chartConfig?: ChartConfiguration;

  private static chartRegistered = false;

  private readonly elementRef = inject(ElementRef<HTMLCanvasElement>);
  private readonly ngZone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);

  private chart?: Chart;
  private viewInitialized = false;

  constructor() {
    this.destroyRef.onDestroy(() => this.destroyChart());
  }

  ngAfterViewInit(): void {
    this.viewInitialized = true;
    this.renderChart();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['chartConfig'] && this.viewInitialized) {
      this.renderChart();
    }
  }

  private renderChart(): void {
    if (!this.chartConfig || !this.isBrowser()) {
      this.destroyChart();
      return;
    }

    this.ngZone.runOutsideAngular(() => {
      const config = this.chartConfig;
      if (!config) {
        return;
      }
      this.destroyChart();
      this.ensureChartRegistered();

      const context = this.elementRef.nativeElement.getContext('2d');
      if (!context) {
        return;
      }

      this.chart = this.instantiateChart(context, config);
    });
  }

  private instantiateChart(context: CanvasRenderingContext2D, config: ChartConfiguration): Chart {
    return new Chart(context, config);
  }

  private destroyChart(): void {
    this.chart?.destroy();
    this.chart = undefined;
  }

  private ensureChartRegistered(): void {
    if (ChartDirective.chartRegistered || !this.isBrowser()) {
      return;
    }
    Chart.register(...registerables);
    ChartDirective.chartRegistered = true;
  }

  private isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }
}
