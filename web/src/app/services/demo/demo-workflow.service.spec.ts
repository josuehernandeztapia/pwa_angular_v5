import { TestBed, fakeAsync, tick } from '@angular/core/testing';

import { DemoWorkflowService } from './demo-workflow.service';
import { DemoSeedService } from './demo-seed.service';
import { DemoAnalyticsService } from './demo-analytics.service';
import { AnalyticsService } from '@core-services/analytics.service';
import { DocumentStatus } from '@interfaces/types';

describe('DemoWorkflowService', () => {
  let service: DemoWorkflowService;
  let seeds: DemoSeedService;
  let analyticsTrack: jasmine.Spy;

  beforeEach(() => {
    analyticsTrack = jasmine.createSpy('track');

    TestBed.configureTestingModule({
      providers: [
        DemoWorkflowService,
        DemoSeedService,
        DemoAnalyticsService,
        { provide: AnalyticsService, useValue: { track: analyticsTrack } }
      ]
    });

    service = TestBed.inject(DemoWorkflowService);
    seeds = TestBed.inject(DemoSeedService);
  });

  it('updates avi decision and timestamp on simulateAviDecision', () => {
    const scenarioId = 'avi-perfecto';
    const before = seeds.getScenario(scenarioId);
    const initialTimestamp = before.aviDecisionUpdatedAt;

    service.simulateAviDecision(scenarioId, 'REVIEW');

    const snapshot = seeds.getScenario(scenarioId);
    expect(snapshot.aviDecision).toBe('REVIEW');
    expect(snapshot.aviDecisionUpdatedAt).not.toBeNull();
    if (snapshot.aviDecisionUpdatedAt != null && initialTimestamp != null) {
      expect(snapshot.aviDecisionUpdatedAt).toBeGreaterThanOrEqual(initialTimestamp);
    }
    expect(snapshot.protectionNotes?.some(note => note.includes('Entrevista AVI demo'))).toBeTrue();
    expect(analyticsTrack).toHaveBeenCalledWith('demo_avi_decision_simulated', jasmine.any(Object));
  });

  it('replaces previous avi note when toggling decision', () => {
    const scenarioId = 'avi-perfecto';

    service.simulateAviDecision(scenarioId, 'GO');
    service.simulateAviDecision(scenarioId, 'NO_GO');

    const notes = seeds.getScenario(scenarioId).protectionNotes ?? [];
    const aviNotes = notes.filter(note => note.startsWith('Entrevista AVI demo'));
    expect(aviNotes.length).toBe(1);
    expect(aviNotes[0]).toContain('NO_GO');
  });

  it('approves documents via fixDocument and emits telemetry', fakeAsync(() => {
    const scenarioId = 'errores-documentos';
    const targetDoc = seeds.getScenario(scenarioId).documents?.find(doc => doc.status !== DocumentStatus.Aprobado);
    expect(targetDoc).toBeDefined();

    analyticsTrack.calls.reset();
    service.fixDocument(scenarioId, targetDoc!.id);
    tick(400);

    const updatedDoc = seeds.getScenario(scenarioId).documents?.find(doc => doc.id === targetDoc!.id);
    expect(updatedDoc?.status).toBe(DocumentStatus.Aprobado);

    const statusCall = analyticsTrack.calls.allArgs().find(([eventName, payload]) =>
      eventName === 'demo_document_status_change' && payload['documentId'] === targetDoc!.id);
    expect(statusCall).toBeDefined();

    const fixCall = analyticsTrack.calls.allArgs().find(([eventName, payload]) =>
      eventName === 'demo_document_fix' && payload['documentId'] === targetDoc!.id);
    expect(fixCall).toBeDefined();
  }));

  it('toggleDocumentCompletion flips status and restores AVI note when all docs approved', () => {
    const scenarioId = 'avi-perfecto';
    const docId = seeds.getScenario(scenarioId).documents?.[0]?.id;
    expect(docId).toBeDefined();

    analyticsTrack.calls.reset();

    service.toggleDocumentCompletion(scenarioId, docId!); // set to pending
    let doc = seeds.getScenario(scenarioId).documents?.find(item => item.id === docId);
    expect(doc?.status).toBe(DocumentStatus.Pendiente);

    service.toggleDocumentCompletion(scenarioId, docId!); // back to approved
    doc = seeds.getScenario(scenarioId).documents?.find(item => item.id === docId);
    expect(doc?.status).toBe(DocumentStatus.Aprobado);

    const notes = seeds.getScenario(scenarioId).protectionNotes ?? [];
    expect(notes.some(note => note.includes('AVI listo para ejecutarse'))).toBeTrue();

    const fixCall = analyticsTrack.calls.allArgs().find(([eventName, payload]) =>
      eventName === 'demo_document_fix' && payload['documentId'] === docId);
    expect(fixCall).toBeDefined();
  });
});
