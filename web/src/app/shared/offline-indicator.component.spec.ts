import { ComponentFixture, TestBed, fakeAsync, tick } from "@angular/core/testing";
import { BehaviorSubject } from "rxjs";

import { OfflineIndicatorComponent } from "./offline-indicator.component";
import { OfflineService, OfflineData, OfflineProcessResult } from "@core-services/offline.service";

class OfflineServiceStub {
  private onlineSubject = new BehaviorSubject<boolean>(false);
  readonly online$ = this.onlineSubject.asObservable();
  readonly pendingRequests$ = new BehaviorSubject<OfflineData[]>([]);
  readonly processedRequests$ = new BehaviorSubject<OfflineProcessResult | null>(null);

  setOnline(isOnline: boolean): void {
    this.onlineSubject.next(isOnline);
  }

  setPending(count: number): void {
    const items: OfflineData[] = Array.from({ length: count }).map((_, index) => ({
      id: `req-${index}`,
      timestamp: Date.now(),
      data: {},
      endpoint: '/test',
      method: 'POST'
    }));
    this.pendingRequests$.next(items);
  }

  isOnline(): boolean {
    return this.onlineSubject.value;
  }

  connectionStatus() {
    return { isOnline: this.isOnline(), lastChanged: Date.now() };
  }

  getOfflineCapabilities() {
    return { pendingCount: this.pendingRequests$.value.length };
  }

  getConnectionQuality(): string {
    return 'excellent';
  }
}

describe("OfflineIndicatorComponent", () => {
  let fixture: ComponentFixture<OfflineIndicatorComponent>;
  let component: OfflineIndicatorComponent;
  let service: OfflineServiceStub;

  beforeEach(() => {
    service = new OfflineServiceStub();

    TestBed.configureTestingModule({
      imports: [OfflineIndicatorComponent],
      providers: [
        { provide: OfflineService, useValue: service }
      ]
    });

    fixture = TestBed.createComponent(OfflineIndicatorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("shows indicator while offline and auto hides after reconnection", fakeAsync(() => {
    service.setOnline(false);
    fixture.detectChanges();
    expect(component.showIndicator()).toBeTrue();

    service.setOnline(true);
    fixture.detectChanges();
    expect(component.showIndicator()).toBeTrue();

    tick(3000);
    fixture.detectChanges();
    expect(component.showIndicator()).toBeFalse();
  }));

  it("remains expanded when pending requests exist", fakeAsync(() => {
    service.setOnline(false);
    service.setPending(2);
    fixture.detectChanges();

    service.setOnline(true);
    fixture.detectChanges();

    tick(3000);
    fixture.detectChanges();
    expect(component.showIndicator()).toBeTrue();
  }));
});
