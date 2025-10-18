import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { DestroyRef, Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly documentRef = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly htmlElement: HTMLElement | null = this.isBrowser
    ? (this.documentRef?.documentElement as HTMLElement | null)
    : null;
  private readonly storageKey = 'darkMode';
  private hasExplicitPreference = false;

  private readonly darkModeState = signal(this.resolveInitialPreference());
  readonly isDarkMode = this.darkModeState.asReadonly();
  readonly themeName = computed(() => (this.darkModeState() ? 'dark' : 'light'));

  constructor() {
    if (!this.isBrowser) {
      return;
    }

    this.applyTheme(this.darkModeState());
    this.watchSystemPreference();
  }

  toggle(): void {
    this.setDarkMode(!this.darkModeState());
  }

  setDarkMode(enabled: boolean): void {
    this.updateDarkMode(enabled, { persist: true, explicit: true });
  }

  private updateDarkMode(enabled: boolean, options: { persist?: boolean; explicit?: boolean } = {}): void {
    if (this.darkModeState() === enabled) {
      if (options.persist) {
        this.persistPreference(enabled);
      }
      if (options.explicit) {
        this.hasExplicitPreference = true;
      }
      return;
    }

    this.darkModeState.set(enabled);

    if (options.persist) {
      this.persistPreference(enabled);
    }

    if (options.explicit) {
      this.hasExplicitPreference = true;
    }

    this.applyTheme(enabled);
  }

  private resolveInitialPreference(): boolean {
    if (!this.isBrowser) {
      return false;
    }

    const windowRef = this.getWindow();
    if (windowRef) {
      try {
        const stored = windowRef.localStorage.getItem(this.storageKey);
        if (stored === 'true' || stored === 'false') {
          this.hasExplicitPreference = true;
          return stored === 'true';
        }
      } catch {
        /* ignore storage access issues */
      }

      const media = windowRef.matchMedia?.('(prefers-color-scheme: dark)');
      return media?.matches ?? false;
    }

    return false;
  }

  private persistPreference(enabled: boolean): void {
    const windowRef = this.getWindow();
    if (!windowRef) {
      return;
    }

    try {
      windowRef.localStorage.setItem(this.storageKey, enabled ? 'true' : 'false');
    } catch {
      /* ignore storage write issues */
    }
  }

  private applyTheme(isDark: boolean): void {
    if (!this.htmlElement) {
      return;
    }

    if (isDark) {
      this.htmlElement.classList.add('dark');
    } else {
      this.htmlElement.classList.remove('dark');
    }

    this.htmlElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }

  private watchSystemPreference(): void {
    const windowRef = this.getWindow();
    if (!windowRef?.matchMedia) {
      return;
    }

    const mediaQuery = windowRef.matchMedia('(prefers-color-scheme: dark)');
    const listener = (event: MediaQueryListEvent) => {
      if (this.hasExplicitPreference) {
        return;
      }
      this.updateDarkMode(event.matches, { persist: false });
    };

    try {
      mediaQuery.addEventListener('change', listener);
      this.destroyRef.onDestroy(() => mediaQuery.removeEventListener('change', listener));
    } catch {
      if (typeof mediaQuery.addListener === 'function') {
        mediaQuery.addListener(listener);
        this.destroyRef.onDestroy(() => mediaQuery.removeListener(listener));
      }
    }
  }

  private getWindow(): (Window & typeof globalThis) | null {
    return this.isBrowser ? (this.documentRef.defaultView as Window & typeof globalThis | null) : null;
  }
}
