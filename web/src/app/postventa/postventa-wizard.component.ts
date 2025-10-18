import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PostventaService, PhotoMeta, Suggestion } from '@feature-services/postventa/postventa.service';
import { FlowContextService } from '@core-services/flow-context.service';
import { IconComponent } from '@shared/icon/icon.component';

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

  readonly wizardForm = this.fb.nonNullable.group({
    customerId: this.fb.nonNullable.control('CL-001', Validators.required),
    quoteId: this.fb.control<string | null>(null)
  });

  readonly photos = signal<LocalPhoto[]>([]);
  readonly suggestions = signal<Suggestion[]>([]);
  readonly isAnalyzing = signal(false);
  readonly feedback = signal<string | null>(null);

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
  }

  analyze(): void {
    if (!this.photos().length) {
      this.feedback.set('Carga al menos una fotografía antes de analizar.');
      return;
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
        },
        error: () => {
          this.suggestions.set(this.createFallbackSuggestions());
          this.isAnalyzing.set(false);
          this.feedback.set('Mostrando sugerencias heurísticas por indisponibilidad del analizador.');
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
}
