import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Output, ViewChild, PLATFORM_ID, Renderer2, RendererFactory2, effect, inject, input, output } from '@angular/core';
import { FocusTrapService } from '@core-services/focus-trap.service';
import { IconComponent } from '@shared/icon/icon.component';

@Component({
  selector: 'app-modal-accessible',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './modal-accessible.component.html',
  styleUrls: ['./modal-accessible.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModalAccessibleComponent {
  readonly open = input(false);
  readonly title = input('');
  readonly ariaLabelledby = input<string | undefined>(undefined);
  readonly ariaDescribedby = input<string | undefined>(undefined);
  readonly closed = output<void>();

  @ViewChild('dialog', { static: false }) dialogRef?: ElementRef<HTMLElement>;

  private readonly focusTrap = inject(FocusTrapService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly renderer: Renderer2 = inject(RendererFactory2).createRenderer(null, null);
  private readonly documentRef = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  private releaseFocus?: () => void;
  private removeEscapeListener?: () => void;

  constructor() {
    effect(() => {
      if (!this.isBrowser) {
        return;
      }

      if (this.open()) {
        this.setupFocusManagement();
      } else {
        this.teardownFocusManagement();
      }
    });

    this.destroyRef.onDestroy(() => this.teardownFocusManagement());
  }

  onBackdrop(_: MouseEvent): void {
    this.close();
  }

  close(): void {
    this.closed.emit();
  }

  private setupFocusManagement(): void {
    if (this.releaseFocus) {
      return;
    }

    this.focusTrap.remember();

    const dialogEl = this.dialogRef?.nativeElement;
    if (!dialogEl) {
      queueMicrotask(() => this.setupFocusManagement());
      return;
    }

    this.releaseFocus = this.focusTrap.trap(dialogEl);

    const preferAutofocus = dialogEl.querySelector<HTMLElement>('[data-autofocus]');
    const firstFocusable = preferAutofocus ?? dialogEl.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');

    queueMicrotask(() => {
      try {
        (firstFocusable ?? dialogEl).focus();
      } catch {
        /* ignore focus errors */
      }
    });

    if (!this.removeEscapeListener) {
      this.removeEscapeListener = this.renderer.listen(this.documentRef, 'keydown', (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          this.close();
        }
      });
    }
  }

  private teardownFocusManagement(): void {
    this.removeEscapeListener?.();
    this.removeEscapeListener = undefined;

    try {
      this.releaseFocus?.();
    } catch {
      /* ignore trap cleanup issues */
    }
    this.releaseFocus = undefined;

    this.focusTrap.restore();
  }
}
