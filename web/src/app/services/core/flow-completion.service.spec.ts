import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FlowCompletionService, FlowCompletionAction } from './flow-completion.service';
import { FlowContextService } from './flow-context.service';
import { SummaryMetric } from '@shared/summary-panel.component';

class FlowContextServiceStub {
  breadcrumbs: string[] = [];
  setBreadcrumbs(breadcrumbs: string[]): void {
    this.breadcrumbs = breadcrumbs;
  }
}

describe('FlowCompletionService', () => {
  let service: FlowCompletionService;
  let flowContext: FlowContextServiceStub;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        FlowCompletionService,
        { provide: FlowContextService, useClass: FlowContextServiceStub }
      ]
    });

    service = TestBed.inject(FlowCompletionService);
    flowContext = TestBed.inject(FlowContextService) as unknown as FlowContextServiceStub;
  });

  it('should open and expose state', () => {
    const metrics: SummaryMetric[] = [{ label: 'Mercado', value: 'AGS' }];
    service.open({
      title: 'Prueba',
      metrics,
      actions: [{ id: 'ok', label: 'Aceptar', execute: () => undefined }]
    });

    expect(service.state()).not.toBeNull();
    expect(flowContext.breadcrumbs.length).toBe(0);
  });

  it('should propagate breadcrumbs when provided', () => {
    service.open({
      title: 'Checklist',
      breadcrumbs: ['Dashboard', 'Resumen'],
      actions: [{ id: 'dismiss', label: 'Cerrar', execute: () => undefined }]
    });

    expect(flowContext.breadcrumbs).toEqual(['Dashboard', 'Resumen']);
  });

  it('should execute actions and close by default', async () => {
    let executed = false;
    const action: FlowCompletionAction = {
      id: 'primary',
      label: 'Continuar',
      execute: () => {
        executed = true;
      }
    };

    service.open({ title: 'Confirmación', actions: [action] });
    await service.execute(action);

    expect(executed).toBeTrue();
    expect(service.state()).toBeNull();
  });

  it('should keep overlay when action throws', async () => {
    const action: FlowCompletionAction = {
      id: 'error',
      label: 'Fallar',
      execute: () => {
        throw new Error('fail');
      }
    };

    service.open({ title: 'Error', actions: [action] });
    await service.execute(action);

    expect(service.state()).not.toBeNull();
  });

  it('should respect autoClose=false', async () => {
    const action: FlowCompletionAction = {
      id: 'manual-close',
      label: 'Quedar abierto',
      autoClose: false,
      execute: () => undefined
    };

    service.open({ title: 'Manual', actions: [action] });
    await service.execute(action);

    expect(service.state()).not.toBeNull();
  });

  it('should execute onComplete callback when closed', fakeAsync(() => {
    const onComplete = jasmine.createSpy('onComplete').and.returnValue(Promise.resolve());

    service.open({
      title: 'Cliente creado',
      actions: [{ id: 'close', label: 'Cerrar', execute: () => undefined }],
      onComplete
    });

    service.close();
    tick();

    expect(onComplete).toHaveBeenCalledTimes(1);
  }));
});
