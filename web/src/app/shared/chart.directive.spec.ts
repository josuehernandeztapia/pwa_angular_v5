import { Component } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { PLATFORM_ID } from '@angular/core';
import { ChartConfiguration, Chart } from 'chart.js';
import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';

import { ChartDirective } from './chart.directive';
import { ChartHarness } from './chart.harness';

@Component({
  standalone: true,
  imports: [ChartDirective],
  template: `<canvas [appChart]="config"></canvas>`
})
class ChartHostComponent {
  config?: ChartConfiguration<'line'>;
}

describe('ChartDirective', () => {
  let fixture: ComponentFixture<ChartHostComponent>;
  let host: ChartHostComponent;
  let loader: HarnessLoader;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChartHostComponent],
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }]
    }).compileComponents();

    fixture = TestBed.createComponent(ChartHostComponent);
    host = fixture.componentInstance;
    loader = TestbedHarnessEnvironment.loader(fixture);
    (ChartDirective as any).chartRegistered = false; // Reset static flag for tests
  });

  function createConfig(color: string = 'rgba(0,0,0,1)'): ChartConfiguration<'line'> {
    return {
      type: 'line',
      data: {
        labels: ['Jan', 'Feb'],
        datasets: [
          {
            label: 'Demo',
            data: [1, 2],
            borderColor: color
          }
        ]
      }
    };
  }

  it('creates a chart when configuration is provided', async () => {
    host.config = createConfig();
    fixture.detectChanges();

    const harness = await loader.getHarness(ChartHarness);
    expect(await harness.isChartRendered()).toBeTrue();
  });

  it('recreates the chart when configuration changes', () => {
    // This test is better with spies to ensure the old instance is destroyed
    const directive = fixture.debugElement.query(By.directive(ChartDirective)).injector.get(ChartDirective);
    const firstChart = { destroy: jasmine.createSpy('destroyFirst') } as unknown as Chart;
    const secondChart = { destroy: jasmine.createSpy('destroySecond') } as unknown as Chart;
    const instantiateSpy = spyOn<any>(directive, 'instantiateChart').and.returnValues(firstChart, secondChart);

    host.config = createConfig('red');
    fixture.detectChanges();

    host.config = createConfig('blue');
    fixture.detectChanges();

    expect(firstChart.destroy).toHaveBeenCalledTimes(1);
    expect(instantiateSpy).toHaveBeenCalledTimes(2);
  });

  it('destroys the chart when configuration becomes undefined', async () => {
    host.config = createConfig();
    fixture.detectChanges();
    const harness = await loader.getHarness(ChartHarness);
    expect(await harness.isChartRendered()).toBe(true);

    host.config = undefined;
    fixture.detectChanges();

    expect(await harness.isChartRendered()).toBe(false);
  });

  it('does not instantiate charts when running on the server platform', async () => {
    // Re-bootstrap with server platform ID
    await TestBed.resetTestingModule()
      .configureTestingModule({
        imports: [ChartHostComponent],
        providers: [{ provide: PLATFORM_ID, useValue: 'server' }]
      })
      .compileComponents();

    const serverFixture = TestBed.createComponent(ChartHostComponent);
    serverFixture.componentInstance.config = createConfig();
    serverFixture.detectChanges();
    const serverLoader = TestbedHarnessEnvironment.loader(serverFixture);
    const harness = await serverLoader.getHarness(ChartHarness);

    expect(await harness.isChartRendered()).toBe(false);
  });

  it('registers chart.js plugins only once', () => {
    const registerSpy = spyOn(Chart, 'register').and.callFake(() => {});
    const directive = fixture.debugElement.query(By.directive(ChartDirective)).injector.get(ChartDirective);
    spyOn<any>(directive, 'instantiateChart').and.returnValue({ destroy: () => {} } as unknown as Chart);

    host.config = createConfig();
    fixture.detectChanges();

    host.config = createConfig('green');
    fixture.detectChanges();

    expect(registerSpy).toHaveBeenCalledTimes(1);
  });
});