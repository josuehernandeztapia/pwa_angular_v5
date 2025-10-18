import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { ProductosCatalogComponent } from './productos-catalog.component';
import { FlowContextService } from '@core-services/flow-context.service';
import { AnalyticsService } from '@core-services/analytics.service';

class FlowContextServiceStub {
  breadcrumbs = signal<string[]>([]);
  setBreadcrumbs = jasmine.createSpy('setBreadcrumbs');
}

class AnalyticsServiceStub {
  track = jasmine.createSpy('track');
}

describe('ProductosCatalogComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductosCatalogComponent],
      providers: [
        { provide: FlowContextService, useClass: FlowContextServiceStub },
        { provide: AnalyticsService, useClass: AnalyticsServiceStub }
      ]
    }).compileComponents();
  });

  it('should create component and expose active offerings', () => {
    const fixture = TestBed.createComponent(ProductosCatalogComponent);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
    expect(component.activeOfferings().length).toBeGreaterThan(0);
  });
});
