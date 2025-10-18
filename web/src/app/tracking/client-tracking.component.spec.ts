import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';

import { ClientTrackingComponent } from './client-tracking.component';
import { DeliveriesService } from '@feature-services/logistics/deliveries.service';
import { FlowContextService } from '@core-services/flow-context.service';
import { ClientDeliveryInfo } from '@interfaces/deliveries';

class DeliveriesStub {
  getClientTracking = jasmine.createSpy('getClientTracking').and.returnValue(of([] as ClientDeliveryInfo[]));
}

class FlowContextStub {
  setBreadcrumbs = jasmine.createSpy('setBreadcrumbs');
}

describe('ClientTrackingComponent', () => {
  let deliveries: DeliveriesStub;

  beforeEach(() => {
    deliveries = new DeliveriesStub();

    TestBed.configureTestingModule({
      imports: [ClientTrackingComponent],
      providers: [
        { provide: DeliveriesService, useValue: deliveries },
        { provide: FlowContextService, useClass: FlowContextStub },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ clientId: 'C-101' }))
          }
        }
      ]
    });
  });

  it('loads tracking data for the provided client id', () => {
    const fixture = TestBed.runInInjectionContext(() => TestBed.createComponent(ClientTrackingComponent));
    fixture.detectChanges();

    expect(deliveries.getClientTracking).toHaveBeenCalledWith('C-101');
    expect(fixture.componentInstance.clientId()).toBe('C-101');
  });
});
