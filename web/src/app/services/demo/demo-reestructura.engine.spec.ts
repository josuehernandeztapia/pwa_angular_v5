import { TestBed, fakeAsync, tick } from '@angular/core/testing';

import { DemoReestructuraEngine } from './demo-reestructura.engine';
import { DemoSeedService } from './demo-seed.service';
import { DemoAnalyticsService } from './demo-analytics.service';
import { AnalyticsService } from '@core-services/analytics.service';

describe('DemoReestructuraEngine', () => {
  let engine: DemoReestructuraEngine;
  let seeds: DemoSeedService;
  let analyticsTrack: jasmine.Spy;

  beforeEach(() => {
    analyticsTrack = jasmine.createSpy('track');

    TestBed.configureTestingModule({
      providers: [
        DemoReestructuraEngine,
        DemoSeedService,
        DemoAnalyticsService,
        { provide: AnalyticsService, useValue: { track: analyticsTrack } }
      ]
    });

    engine = TestBed.inject(DemoReestructuraEngine);
    seeds = TestBed.inject(DemoSeedService);
  });

  it('records finance events when applying scenarios', fakeAsync(() => {
    engine.applyScenario('stepdown', { scenarioId: 'proteccion-reestructura' });
    tick(400);

    let snapshot = seeds.getScenario('proteccion-reestructura');
    expect(snapshot.financeEvents?.[0].kind).toBe('scenario-applied');

    engine.simulateLatePayment({ scenarioId: 'proteccion-reestructura' });
    tick(400);
    snapshot = seeds.getScenario('proteccion-reestructura');
    expect(snapshot.financeEvents?.some(event => event.kind === 'late-payment')).toBeTrue();

    engine.simulateExtraPayment({ scenarioId: 'proteccion-reestructura' });
    tick(400);
    snapshot = seeds.getScenario('proteccion-reestructura');
    expect(snapshot.financeEvents?.some(event => event.kind === 'extra-payment')).toBeTrue();
  }));

  it('updates client payment plan when applying demo scenarios', fakeAsync(() => {
    const originalProtection = seeds.getScenario('proteccion-reestructura').client?.paymentPlan?.monthlyPayment;
    expect(originalProtection).toBe(6800);

    engine.applyScenario('stepdown', { scenarioId: 'proteccion-reestructura' });
    tick(400);

    const protectionSnapshot = seeds.getScenario('proteccion-reestructura');
    expect(protectionSnapshot.client?.paymentPlan?.monthlyPayment).toBe(5600);
    expect(protectionSnapshot.financeScenarios?.baseScenarioId).toBe('stepdown');

    engine.applyWhatIf('recalendar');
    tick(400);

    const whatIfSnapshot = seeds.getScenario('finanzas-whatif');
    expect(whatIfSnapshot.financeScenarios?.baseScenarioId).toBe('recalendar');
    if (whatIfSnapshot.client?.paymentPlan) {
      expect(whatIfSnapshot.client.paymentPlan.monthlyPayment).toBe(5100);
    }

    // Base scenario updates should continue to track analytics events
    expect(analyticsTrack).toHaveBeenCalledWith('demo_finance_scenario_applied', jasmine.objectContaining({ optionId: 'recalendar' }));
  }));

  it('clears finance events on reset', fakeAsync(() => {
    engine.simulateLatePayment({ scenarioId: 'proteccion-reestructura' });
    tick(400);
    expect(seeds.getScenario('proteccion-reestructura').financeEvents?.length ?? 0).toBeGreaterThan(0);

    engine.resetFinanceScenario('proteccion-reestructura');
    tick(300);
    expect(seeds.getScenario('proteccion-reestructura').financeEvents).toEqual([]);
  }));
});
