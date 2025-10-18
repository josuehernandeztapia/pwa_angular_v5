import { ComponentFixture, TestBed, fakeAsync, tick } from "@angular/core/testing";
import { BehaviorSubject } from "rxjs";

import { OfflineQueueBannerComponent } from "./offline-queue-banner.component";
import { OfflineService, OfflineData, OfflineProcessResult } from "@core-services/offline.service";
import { AnalyticsService } from "@core-services/analytics.service";

class OfflineServiceStub {
  private onlineSubject = new BehaviorSubject<boolean>(false);
  readonly online$ = this.onlineSubject.asObservable();
  readonly pendingRequests$ = new BehaviorSubject<OfflineData[]>([]);
  readonly processedRequests$ = new BehaviorSubject<OfflineProcessResult | null>(null);

  emitProcessed(result: OfflineProcessResult): void {
    this.processedRequests$.next(result);
  }

  emitOnline(isOnline: boolean): void {
    this.onlineSubject.next(isOnline);
  }
}

class AnalyticsServiceStub {
  track(): void {}
}

describe("OfflineQueueBannerComponent", () => {
  let fixture: ComponentFixture<OfflineQueueBannerComponent>;
  let component: OfflineQueueBannerComponent;
  let service: OfflineServiceStub;

  beforeEach(() => {
    service = new OfflineServiceStub();

    TestBed.configureTestingModule({
      imports: [OfflineQueueBannerComponent],
      providers: [
        { provide: OfflineService, useValue: service },
        { provide: AnalyticsService, useClass: AnalyticsServiceStub }
      ]
    });

    fixture = TestBed.createComponent(OfflineQueueBannerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("shows sync message and clears it after timer when queue is flushed", fakeAsync(() => {
    service.emitProcessed({
      request: {
        id: "1",
        timestamp: Date.now(),
        data: {},
        endpoint: "/test",
        method: "POST"
      },
      success: true
    });

    fixture.detectChanges();
    expect(component.lastSyncMessage).toContain("Sincronizamos la cola");

    tick(4000);
    fixture.detectChanges();
    expect(component.lastSyncMessage).toBeNull();
  }));

  it("ignores processed events for other endpoints", fakeAsync(() => {
    component.endpointPrefix = "/protected";

    service.emitProcessed({
      request: {
        id: "2",
        timestamp: Date.now(),
        data: {},
        endpoint: "/other",
        method: "POST"
      },
      success: true
    });

    fixture.detectChanges();
    expect(component.lastSyncMessage).toBeNull();

    tick(5000);
    expect(component.lastSyncMessage).toBeNull();
  }));
});
