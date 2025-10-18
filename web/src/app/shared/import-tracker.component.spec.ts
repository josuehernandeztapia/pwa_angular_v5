import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { ImportTrackerComponent } from './import-tracker.component';
import { IntegratedImportTrackerService } from '@feature-services/postventa/integrated-import-tracker.service';
import { BusinessFlow, Client } from '@interfaces/types';

describe('ImportTrackerComponent', () => {
  let fixture: ComponentFixture<ImportTrackerComponent>;
  let component: ImportTrackerComponent;
  let trackerService: jasmine.SpyObj<IntegratedImportTrackerService>;

  const demoClient: Client = {
    id: 'client-001',
    name: 'Cliente Demo',
    flow: BusinessFlow.VentaPlazo,
    status: 'En progreso',
    documents: [],
    events: []
  };

  beforeEach(async () => {
    trackerService = jasmine.createSpyObj<IntegratedImportTrackerService>(
      'IntegratedImportTrackerService',
      ['getIntegratedImportStatus', 'updateImportMilestone']
    );

    trackerService.getIntegratedImportStatus.and.returnValue(of(null));
    trackerService.updateImportMilestone.and.returnValue(of({
      pedidoPlanta: { status: 'in_progress' }
    } as any));

    await TestBed.configureTestingModule({
      imports: [ImportTrackerComponent],
      providers: [
        { provide: IntegratedImportTrackerService, useValue: trackerService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ImportTrackerComponent);
    component = fixture.componentInstance;
    component.client = demoClient;
    fixture.detectChanges();
  });

  it('updates milestone without runtime errors and clears loading state', () => {
    expect(() => component.updateMilestone('pedidoPlanta')).not.toThrow();

    expect(trackerService.updateImportMilestone).toHaveBeenCalledWith(
      'client-001',
      'pedidoPlanta',
      'in_progress',
      jasmine.objectContaining({ notes: jasmine.any(String) })
    );

    expect(component.loading()).toBeFalse();
  });
});
