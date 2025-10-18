import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, ElementRef, ViewChild, PLATFORM_ID, Renderer2, RendererFactory2, effect, inject } from '@angular/core';

import { FocusTrapService } from '@core-services/focus-trap.service';
import { KeyboardShortcutsService, KeyboardShortcut } from '@core-services/keyboard-shortcuts.service';
import { IconComponent } from '@shared/icon/icon.component';

@Component({
  selector: 'app-keyboard-shortcuts-modal',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './keyboard-shortcuts-modal.component.html',
  styleUrls: ['./keyboard-shortcuts-modal.component.scss']
})
export class KeyboardShortcutsModalComponent {
  @ViewChild('dialog', { static: false }) dialogRef?: ElementRef<HTMLDivElement>;
  @ViewChild('closeButton', { static: false }) closeButtonRef?: ElementRef<HTMLButtonElement>;

  readonly isOpen = this.shortcutsService.isOpenSignal;
  readonly shortcuts = this.shortcutsService.shortcuts;

  private readonly destroyRef = inject(DestroyRef);
  private readonly focusTrap = inject(FocusTrapService);
  private readonly renderer: Renderer2 = inject(RendererFactory2).createRenderer(null, null);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly documentRef = inject(DOCUMENT);

  private releaseFocus?: () => void;
  private removeEscapeListener?: () => void;

  constructor(private readonly shortcutsService: KeyboardShortcutsService) {
    effect(() => {
      if (!this.isBrowser) {
        return;
      }

      if (this.isOpen()) {
        this.setupFocusManagement();
      } else {
        this.teardownFocusManagement();
      }
    });

    this.destroyRef.onDestroy(() => this.teardownFocusManagement());
  }

  close(): void {
    this.shortcutsService.close();
  }

  trackByCombo(_: number, shortcut: KeyboardShortcut): string {
    return shortcut.combo;
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

    const focusTarget = this.closeButtonRef?.nativeElement ?? dialogEl;
    queueMicrotask(() => {
      try {
        focusTarget.focus();
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

    this.releaseFocus?.();
    this.releaseFocus = undefined;

    this.focusTrap.restore();
  }
}
