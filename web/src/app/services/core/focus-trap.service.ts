import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class FocusTrapService {
  private static listenerAttached = false;
  private static lastFocused: HTMLElement | null = null;
  private static originalElementFocus: ((this: HTMLElement, options?: FocusOptions) => void) | null = null;

  private previouslyFocused: HTMLElement | null = null;

  constructor() {
    if (!FocusTrapService.listenerAttached) {
      if (!FocusTrapService.originalElementFocus) {
        FocusTrapService.originalElementFocus = HTMLElement.prototype.focus;
        const originalFocus = FocusTrapService.originalElementFocus;
        HTMLElement.prototype.focus = function (this: HTMLElement, options?: FocusOptions): void {
          FocusTrapService.lastFocused = this;
          if (typeof originalFocus === 'function') {
            originalFocus.call(this, options);
          }
        };
      }

      const recordFocus = (event: FocusEvent) => {
        const target = event.target as HTMLElement | null;
        if (target instanceof HTMLElement && target !== document.body) {
          FocusTrapService.lastFocused = target;
        }
      };

      document.addEventListener('focus', recordFocus, true);
      document.addEventListener('focusin', recordFocus, true);

      FocusTrapService.listenerAttached = true;
    }
  }

  remember(): void {
    let active = this.getCurrentFocus();
    if (!active && FocusTrapService.lastFocused && FocusTrapService.lastFocused.isConnected) {
      active = FocusTrapService.lastFocused;
    }

    if (active) {
      FocusTrapService.lastFocused = active;
    }

    this.previouslyFocused = active ?? null;
  }

  restore(): void {
    const target = this.previouslyFocused;
    this.previouslyFocused = null;

    if (!target) {
      return;
    }

    FocusTrapService.lastFocused = target;

    try {
      target.focus({ preventScroll: true });
      if (this.getCurrentFocus() === target) {
        return;
      }
    } catch {
      // ignore and attempt fallback
    }

    try {
      target.focus();
    } catch {
      // ignore focus errors
    }
  }

  trap(container: HTMLElement): () => void {
    const focusableSelectors = [
      'a[href]', 'area[href]', 'input:not([disabled])', 'select:not([disabled])', 'textarea:not([disabled])',
      'button:not([disabled])', 'iframe', 'object', 'embed', '[contenteditable]', '[tabindex]:not([tabindex="-1"])'
    ].join(',');

    const getFocusable = (): HTMLElement[] => Array.from(container.querySelectorAll<HTMLElement>(focusableSelectors))
      .filter(el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length));

    const keydown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') {
        return;
      }

      const focusable = getFocusable();
      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = this.getCurrentFocus();
      const outside = !active || !container.contains(active);

      if (event.shiftKey) {
        if (outside || active === first) {
          event.preventDefault();
          last.focus();
          FocusTrapService.lastFocused = last;
        }
        return;
      }

      if (outside || active === last) {
        event.preventDefault();
        first.focus();
        FocusTrapService.lastFocused = first;
      }
    };

    container.addEventListener('keydown', keydown);
    return () => container.removeEventListener('keydown', keydown);
  }

  private getCurrentFocus(): HTMLElement | null {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) {
      return active;
    }

    const last = FocusTrapService.lastFocused;
    if (last && last.isConnected) {
      return last;
    }

    const fallback = document.querySelector<HTMLElement>(':focus');
    if (fallback && fallback !== document.body) {
      return fallback;
    }

    return null;
  }
}
