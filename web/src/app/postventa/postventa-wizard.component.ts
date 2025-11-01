import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PostventaService, PhotoMeta, Suggestion } from '@feature-services/postventa/postventa.service';
import { FlowContextService } from '@core-services/flow-context.service';
import { IconComponent } from '@shared/icon/icon.component';
import { FlowCompletionService } from '@core-services/flow-completion.service';
import { SummaryMetric } from '@shared/summary-panel.component';
import { NavigationService } from '@core-services/navigation.service';
import { EntitySyncService } from '@core-services/entity-sync.service';
import { DemoModeService } from '@core-services/demo-mode.service';
import { DemoAnalyticsService } from '@services/demo/demo-analytics.service';
import { DemoPostventaService } from '@services/demo/demo-postventa.service';

interface LocalPhoto extends PhotoMeta {
  previewUrl: string;
  file?: File;
}

@Component({
  selector: 'app-postventa-wizard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IconComponent],
  templateUrl: './postventa-wizard.component.html',
  styleUrls: ['./postventa-wizard.component.scss']
})
export class PostventaWizardComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly postventa = inject(PostventaService);
  private readonly flowContext = inject(FlowContextService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly completion = inject(FlowCompletionService);
  private readonly navigation = inject(NavigationService);
  private readonly entitySync = inject(EntitySyncService);
  private readonly demoMode = inject(DemoModeService);
  private readonly demoAnalytics = inject(DemoAnalyticsService);
  private readonly demoPostventa = inject(DemoPostventaService);

  readonly wizardForm = this.fb.nonNullable.group({
    customerId: this.fb.nonNullable.control('CL-001', Validators.required),
    quoteId: this.fb.control<string | null>(null)
  });

  readonly photos = signal<LocalPhoto[]>([]);
  readonly suggestions = signal<Suggestion[]>([]);
  readonly isAnalyzing = signal(false);
  readonly feedback = signal<string | null>(null);
  readonly isDemoMode = this.demoMode.isDemoMode;
  readonly activeDemoScenario = this.demoMode.activeScenario;
  readonly isPostventaDemo = computed(() => this.isDemoMode() && this.activeDemoScenario() === 'postventa-entrega');
  readonly demoNotes = this.demoPostventa.notes;
  readonly demoIncidents = this.demoPostventa.incidents;
  readonly demoEvidenceLoaded = computed(() => this.demoPostventa.evidence().some(item => !!item.loadedAt));

  readonly pendingKinds = computed(() => {
    const uploaded = new Set(this.photos().map(photo => photo.kind));
    return this.requiredKinds.filter(kind => !uploaded.has(kind.value));
  });

  readonly requiredKinds: Array<{ value: LocalPhoto['kind']; label: string; helper: string }> = [
    { value: 'front', label: 'Frente', helper: 'Foto frontal con placa visible.' },
    { value: 'side', label: 'Lateral', helper: 'Costado completo mostrando estado de vestiduras.' },
    { value: 'interior', label: 'Interior', helper: 'Tablero y asientos principales.' },
    { value: 'detail', label: 'Detalle', helper: 'Daños, accesorios o puntos relevantes.' }
  ];

  private lastTrackedDemoScenario: string | null = null;

  constructor() {
    effect(() => {
      if (!this.isPostventaDemo()) {
        this.lastTrackedDemoScenario = null;
        return;
      }

      const scenarioId = this.activeDemoScenario();
      const snapshot = this.demoMode.activeScenarioState();
      if (!scenarioId || !snapshot) {
        return;
      }

      if (this.lastTrackedDemoScenario !== scenarioId) {
        this.demoAnalytics.trackFlowStart({ scenario: scenarioId, feature: 'postventa', step: 'wizard-init' });
        this.lastTrackedDemoScenario = scenarioId;
        if (snapshot.client?.id) {
          this.wizardForm.patchValue({ customerId: snapshot.client.id }, { emitEvent: false });
        }
      }

      const evidenceLoaded = snapshot.deliveryEvidence?.filter(item => item.loadedAt) ?? [];
      if (evidenceLoaded.length) {
        const existing = this.photos();
        const placeholders: LocalPhoto[] = evidenceLoaded
          .map(item => ({ kind: item.kind, url: item.dataUrl, previewUrl: item.dataUrl }))
          .filter(item => !existing.some(photo => photo.previewUrl === item.previewUrl));

        if (placeholders.length) {
          this.photos.set([...existing, ...placeholders]);
        }
      }
    });
  }

  ngOnInit(): void {
    this.flowContext.setBreadcrumbs(['Dashboard', 'Postventa']);
    this.ensureDraftQuote();
  }

  onAddPhotos(kind: LocalPhoto['kind'], files: FileList | null): void {
    if (!files?.length) {
      return;
    }

    const nextPhotos = [...this.photos()];
    Array.from(files).forEach(file => {
      const previewUrl = URL.createObjectURL(file);
      nextPhotos.push({ kind, url: previewUrl, previewUrl, file });
    });
    this.photos.set(nextPhotos);

    if (this.completion.isOpen()) {
      this.completion.close();
    }

    if (this.isPostventaDemo()) {
      const scenario = this.activeDemoScenario();
      this.demoAnalytics.track('postventa_photo_added', {
        scenario,
        kind,
        total: nextPhotos.length
      });
    }
  }

  analyze(): void {
    if (!this.photos().length) {
      this.feedback.set('Carga al menos una fotografía antes de analizar.');
      return;
    }

    if (this.isPostventaDemo()) {
      this.demoAnalytics.track('postventa_analysis_requested', {
        scenario: this.activeDemoScenario(),
        photos: this.photos().length
      });
    }

    this.isAnalyzing.set(true);
    this.feedback.set(null);

    const photoMeta: PhotoMeta[] = this.photos().map(photo => ({ kind: photo.kind, url: photo.url }));

    this.postventa
      .analyzePhotos(photoMeta)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: suggestions => {
          this.suggestions.set(suggestions);
          this.isAnalyzing.set(false);
          this.feedback.set('Análisis completado. Puedes agregar conceptos sugeridos a la cotización.');
          this.syncPostSaleEvidence('success');
          this.presentCompletionOverlay('success');
          if (this.isPostventaDemo()) {
            this.demoAnalytics.track('postventa_analysis_completed', {
              scenario: this.activeDemoScenario(),
              suggestions: suggestions.length,
              mode: 'service'
            });
          }
        },
        error: () => {
          this.suggestions.set(this.createFallbackSuggestions());
          this.isAnalyzing.set(false);
          this.feedback.set('Mostrando sugerencias heurísticas por indisponibilidad del analizador.');
          this.syncPostSaleEvidence('fallback');
          this.presentCompletionOverlay('fallback');
          if (this.isPostventaDemo()) {
            this.demoAnalytics.track('postventa_analysis_failed', {
              scenario: this.activeDemoScenario()
            });
          }
        }
      });
  }

  trackPhoto(_: number, photo: LocalPhoto): string {
    return photo.previewUrl;
  }

  trackSuggestion(_: number, suggestion: Suggestion): string {
    return suggestion.id;
  }

  photosByKind(kind: LocalPhoto['kind']): LocalPhoto[] {
    return this.photos().filter(photo => photo.kind === kind);
  }

  loadDemoEvidence(): void {
    if (!this.isPostventaDemo()) {
      return;
    }

    const evidence = this.demoPostventa.loadEvidence();
    if (!evidence.length) {
      this.feedback.set('No hay evidencia demo disponible en este escenario.');
      return;
    }

    const existing = this.photos();
    const converted: LocalPhoto[] = evidence.map(item => ({
      kind: item.kind,
      url: item.dataUrl,
      previewUrl: item.dataUrl
    }));

    const merged = [...existing];
    converted.forEach(photo => {
      if (!merged.some(existingPhoto => existingPhoto.previewUrl === photo.previewUrl)) {
        merged.push(photo);
      }
    });

    this.photos.set(merged);

    if (!this.suggestions().length) {
      this.suggestions.set(this.createFallbackSuggestions());
    }

    this.feedback.set('Evidencia demo cargada. Ejecuta el análisis para mostrar recomendaciones.');
  }

  simulateDemoIncident(incidentId: string): void {
    if (!this.isPostventaDemo()) {
      return;
    }
    const update = this.demoPostventa.simulateIncident(incidentId);
    if (!update) {
      this.feedback.set('No fue posible simular la incidencia demo.');
      return;
    }
    if (!update.wasChanged) {
      this.feedback.set('La incidencia demo ya se encontraba activa.');
      return;
    }
    this.feedback.set(`Incidencia demo activada: ${update.incident.title}`);
  }

  resolveDemoIncident(incidentId: string): void {
    if (!this.isPostventaDemo()) {
      return;
    }
    const update = this.demoPostventa.resolveIncident(incidentId);
    if (!update) {
      this.feedback.set('No fue posible resolver la incidencia demo.');
      return;
    }
    if (!update.wasChanged) {
      this.feedback.set('La incidencia demo ya estaba resuelta.');
      return;
    }
    this.feedback.set(`Incidencia demo resuelta: ${update.incident.title}`);
  }

  resetDemoScenario(): void {
    if (!this.isPostventaDemo()) {
      this.resetWizardState();
      return;
    }
    this.demoPostventa.resetScenario();
    this.resetWizardState();
    this.feedback.set('Escenario demo de postventa reiniciado.');
  }

  private ensureDraftQuote(): void {
    const { customerId } = this.wizardForm.getRawValue();
    this.postventa
      .getOrCreateDraftQuote(customerId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: draft => this.wizardForm.patchValue({ quoteId: draft.id }),
        error: () => this.feedback.set('No fue posible recuperar la cotización draft. Se trabajará en modo offline.')
      });
  }

  private createFallbackSuggestions(): Suggestion[] {
    return [
      { id: 'acc-001', name: 'Cámara de reversa', qty: 1, selected: true, price: 3500 },
      { id: 'acc-002', name: 'Kit vestiduras', qty: 1, selected: false, price: 2200 },
      { id: 'serv-003', name: 'Pulido exterior', qty: 1, selected: false, price: 1800 }
    ];
  }

  private presentCompletionOverlay(status: 'success' | 'fallback'): void {
    const metrics = this.buildCompletionMetrics(status);
    const nextSteps = [
      'Añade los conceptos recomendados a la cotización postventa.',
      'Agenda los trabajos y comunica al cliente los hallazgos.'
    ];

    const quoteId = this.wizardForm.controls.quoteId.value;

    const actions = [
      {
        id: 'open-dashboard',
        label: 'Ir al dashboard',
        kind: 'primary' as const,
        execute: () => this.navigation.navigateTo('/dashboard')
      },
      {
        id: 'open-quote',
        label: 'Abrir cotización postventa',
        kind: 'secondary' as const,
        execute: () => this.navigation.navigateTo('/cotizador', {
          source: 'postventa',
          view: 'postventa-upsell',
          quoteId: quoteId ?? undefined
        })
      },
      {
        id: 'new-management',
        label: 'Registrar nueva gestión',
        kind: 'ghost' as const,
        execute: () => {
          this.resetWizardState();
          return Promise.resolve();
        }
      }
    ];

    this.completion.open({
      title: status === 'success' ? 'Sugerencias listas' : 'Sugerencias heurísticas generadas',
      description: status === 'success'
        ? 'El analizador identificó oportunidades para upselling. Revisa la cotización y anota hallazgos.'
        : 'Usamos un modelo heurístico por indisponibilidad del analizador. Revisa y ajusta antes de compartir.',
      metrics,
      nextSteps,
      actions,
      onComplete: () => this.navigation.refreshQuickActions()
    });
  }

  private buildCompletionMetrics(status: 'success' | 'fallback'): SummaryMetric[] {
    const photosCount = this.photos().length;
    const suggestionsCount = this.suggestions().length;
    const pendingKinds = this.pendingKinds();

    const metrics: SummaryMetric[] = [
      {
        label: 'Fotografías capturadas',
        value: `${photosCount} / ${this.requiredKinds.length}`,
        badge: photosCount >= this.requiredKinds.length ? 'success' : 'warning'
      },
      {
        label: 'Sugerencias',
        value: suggestionsCount ? `${suggestionsCount} disponibles` : 'Sin resultados',
        badge: suggestionsCount ? 'success' : 'warning'
      }
    ];

    metrics.push({
      label: 'Tipos pendientes',
      value: pendingKinds.length ? `${pendingKinds.length}` : 'Completado',
      badge: pendingKinds.length ? 'warning' : 'success'
    });

    if (status === 'fallback') {
      metrics.push({
        label: 'Analizador',
        value: 'Modo heurístico',
        badge: 'warning'
      });
    }

    return metrics;
  }

  private resetWizardState(): void {
    this.photos.set([]);
    this.suggestions.set([]);
    this.feedback.set(null);
  }

  private syncPostSaleEvidence(mode: 'success' | 'fallback'): void {
    const clientId = this.wizardForm.controls.customerId.value;
    if (!clientId) {
      return;
    }

    this.entitySync.recordPostSaleEvidence({
      clientId,
      clientName: clientId,
      photosUploaded: this.photos().length,
      requiredPhotos: this.requiredKinds.length,
      suggestionsGenerated: this.suggestions().length,
      quoteId: this.wizardForm.controls.quoteId.value
    });
  }
}
