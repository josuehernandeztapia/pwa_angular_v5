import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { DashboardService } from './dashboard.service';
import { environment } from '@environments/environment';
import { ActivityFeedItem, Market, OpportunityStage } from '@interfaces/types';
import { Subscription } from 'rxjs';

describe('DashboardService', () => {
  let service: DashboardService;

  // Set the mock data flag to true to match the test environment behavior
  const originalMockFlag = environment.features.enableMockData;

  beforeAll(() => {
    environment.features.enableMockData = true;
  });

  afterAll(() => {
    environment.features.enableMockData = originalMockFlag;
  });

  beforeEach(() => {
    localStorage.removeItem('__dashboard_activity_feed__');
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [DashboardService]
    });
    service = TestBed.inject(DashboardService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('activityFeed signal should be empty initially', () => {
    expect(service.activityFeed()).toEqual([]);
  });

  it('loadInitialFeed should populate signal from mock data', () => {
    const mockActivities = (service as any).getMockActivityFeed();
    service.loadInitialFeed();
    const feed = service.activityFeed();
    const expectedActivities = mockActivities.slice(0, 15);
    expect(feed.length).toBe(expectedActivities.length);
    expect(feed[0]?.id).toBe(expectedActivities[0]?.id);
  });

  it('addActivity should add an item to the beginning of the feed', () => {
    const initialActivity: ActivityFeedItem = { id: '1', type: 'new_client', message: 'First', timestamp: new Date(), clientName: 'Client A', iconType: 'user' };
    const newActivity: ActivityFeedItem = { id: '2', type: 'payment_received', message: 'Second', timestamp: new Date(), clientName: 'Client B', iconType: 'currency-dollar' };

    service.addActivity(initialActivity);
    expect(service.activityFeed()).toEqual([initialActivity]);

    service.addActivity(newActivity);
    expect(service.activityFeed()).toEqual([newActivity, initialActivity]);
  });

  it('getDashboardStats should cache requests for the same market (with mock data)', fakeAsync(() => {
    const market: Market = 'edomex';
    const spy = spyOn(service as any, 'getMockDashboardStats').and.callThrough();

    // First call
    service.getDashboardStats(market).subscribe();
    tick();

    // Second call
    service.getDashboardStats(market).subscribe();
    tick();

    expect(spy).toHaveBeenCalledTimes(1);
  }));

  it('getDashboardStats should make separate requests for different markets (with mock data)', fakeAsync(() => {
    const market1: Market = 'edomex';
    const market2: Market = 'aguascalientes';
    const spy = spyOn(service as any, 'getMockDashboardStats').and.callThrough();

    // First call
    service.getDashboardStats(market1).subscribe();
    tick();

    // Second call
    service.getDashboardStats(market2).subscribe();
    tick();

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledWith(market1);
    expect(spy).toHaveBeenCalledWith(market2);
  }));

  it('getOpportunityStages should emit initial pipeline and respond to additions', fakeAsync(() => {
    let latest: OpportunityStage[] = [];
    const subscription: Subscription = service.getOpportunityStages('aguascalientes').subscribe(stages => {
      latest = stages;
    });

    tick();

    const initialStage = latest.find(stage => stage.name === 'Nuevas Oportunidades');
    expect(initialStage).toBeTruthy();
    expect(initialStage?.count).toBe(4);

    service.addOpportunityToPipeline('aguascalientes', 'Nuevas Oportunidades', 'new-client-1');
    tick();

    const updatedStage = latest.find(stage => stage.name === 'Nuevas Oportunidades');
    expect(updatedStage?.clientIds[0]).toBe('new-client-1');
    expect(updatedStage?.count).toBe(5);

    subscription.unsubscribe();
  }));

  it('should refresh the aggregated pipeline when an opportunity is added', fakeAsync(() => {
    let aggregated: OpportunityStage[] = [];
    const subscription: Subscription = service.getOpportunityStages('all').subscribe(stages => {
      aggregated = stages;
    });

    tick();

    const initialStage = aggregated.find(stage => stage.name === 'Nuevas Oportunidades');
    const initialCount = initialStage?.count ?? 0;

    service.addOpportunityToPipeline('edomex', 'Nuevas Oportunidades', 'agg-client-1');
    tick();

    const updatedStage = aggregated.find(stage => stage.name === 'Nuevas Oportunidades');
    expect(updatedStage?.clientIds.includes('agg-client-1')).toBe(true);
    expect(updatedStage?.count).toBe(initialCount + 1);

    subscription.unsubscribe();
  }));

  it('should avoid duplicating client ids when adding the same opportunity twice', fakeAsync(() => {
    let latest: OpportunityStage[] = [];
    const subscription: Subscription = service.getOpportunityStages('aguascalientes').subscribe(stages => (latest = stages));

    tick();

    service.addOpportunityToPipeline('aguascalientes', 'Nuevas Oportunidades', 'dup-client');
    service.addOpportunityToPipeline('aguascalientes', 'Nuevas Oportunidades', 'dup-client');
    tick();

    const stage = latest.find(item => item.name === 'Nuevas Oportunidades');
    const occurrences = stage?.clientIds.filter(id => id === 'dup-client').length ?? 0;
    expect(occurrences).toBe(1);

    subscription.unsubscribe();
  }));
});
