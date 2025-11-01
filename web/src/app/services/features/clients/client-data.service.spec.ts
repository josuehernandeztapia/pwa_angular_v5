import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ClientDataService } from './client-data.service';
import { DemoModeService } from '@core-services/demo-mode.service';
import { EntitySyncService } from '@core-services/entity-sync.service';
import { Actor, EventType } from '@interfaces/types';

describe('ClientDataService', () => {
  let service: ClientDataService;
  let entitySync: jasmine.SpyObj<EntitySyncService>;

  beforeEach(() => {
    entitySync = jasmine.createSpyObj<EntitySyncService>('EntitySyncService', [
      'recordClientUpdate',
      'recordClientEvent'
    ]);

    TestBed.configureTestingModule({
      providers: [
        ClientDataService,
        DemoModeService,
        { provide: EntitySyncService, useValue: entitySync }
      ]
    });

    service = TestBed.inject(ClientDataService);
  });

  it('should propagate client updates to EntitySyncService', fakeAsync(() => {
    service.updateClient('1', { status: 'Activo' }).subscribe();
    tick(400);

    expect(entitySync.recordClientUpdate).toHaveBeenCalled();
  }));

  it('should propagate client timeline events to EntitySyncService', fakeAsync(() => {
    service.addClientEvent('1', {
      message: 'Evento de prueba',
      actor: Actor.Asesor,
      type: EventType.AdvisorAction
    }).subscribe();
    tick(300);

    expect(entitySync.recordClientEvent).toHaveBeenCalled();
  }));
});
