import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { DocumentTelemetryPanelComponent, DocumentTelemetryStats } from './document-telemetry-panel.component';
import { BoundaryIssue } from '@core-services/error-boundary.service';
import { OfflineData } from '@core-services/offline.service';

describe('DocumentTelemetryPanelComponent', () => {
  let fixture: ComponentFixture<DocumentTelemetryPanelComponent>;
  let component: DocumentTelemetryPanelComponent;

  const baseStats: DocumentTelemetryStats = {
    total: 2,
    queued: 1,
    processing: 0,
    ocrFailures: 1,
    networkTimeouts: 0,
    offlineQueued: 3
  };

  const issues: BoundaryIssue[] = [
    {
      id: 'issue-1',
      type: 'network-timeout',
      status: 'queued',
      message: 'Timeout al subir el documento',
      attempts: 1,
      createdAt: Date.now()
    } as BoundaryIssue
  ];

  const queued: OfflineData[] = [
    {
      id: 'req-1',
      endpoint: '/documents',
      data: { documentId: 'doc-1', metadata: { queueReason: 'Sin red' } },
      attempts: 2
    } as OfflineData
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DocumentTelemetryPanelComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(DocumentTelemetryPanelComponent);
    component = fixture.componentInstance;
    component.stats = { ...baseStats };
    component.issues = issues;
    component.queuedRequests = queued;
    component.busyQueueIds = new Set<string>();
    fixture.detectChanges();
  });

  it('muestra los contadores de telemetría', () => {
    const offlineCounter = fixture.debugElement.query(By.css('[data-cy="telemetry-offline"]')).nativeElement
      .textContent;
    const queueCounter = fixture.debugElement.query(By.css('[data-cy="telemetry-queued"]')).nativeElement
      .textContent;

    expect(offlineCounter).toContain('3');
    expect(queueCounter).toContain('1');
  });

  it('emite eventos al reintentar una incidencia', () => {
    const retrySpy = spyOn(component.retryIssue, 'emit');
    const retryButton = fixture.debugElement.query(By.css('[data-cy="telemetry-retry"]'));
    retryButton.nativeElement.click();

    expect(retrySpy).toHaveBeenCalledWith('issue-1');
  });

  it('emite eventos al sincronizar una solicitud en cola', () => {
    const retryQueuedSpy = spyOn(component.retryQueued, 'emit');
    const retryButton = fixture.debugElement.query(By.css('[data-cy="telemetry-queue-retry"]'));
    retryButton.nativeElement.click();

    expect(retryQueuedSpy).toHaveBeenCalledWith('req-1');
  });
});
