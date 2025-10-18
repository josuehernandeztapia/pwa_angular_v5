import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, Renderer2, RendererFactory2, effect, inject, signal } from '@angular/core';

type FontScale = 'base' | 'sm' | 'lg';

@Injectable({ providedIn: 'root' })
export class UserPreferencesService {
  private readonly FONT_KEY = 'ux.pref.fontScale';
  private readonly HC_KEY = 'ux.pref.hc';

  private readonly platformId = inject(PLATFORM_ID);
  private readonly documentRef = inject(DOCUMENT);
  private readonly renderer: Renderer2 = inject(RendererFactory2).createRenderer(null, null);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly windowRef: (Window & typeof globalThis) | null = this.isBrowser
    ? (this.documentRef.defaultView as Window & typeof globalThis | null)
    : null;

  private readonly fontScaleState = signal<FontScale>('base');
  private readonly highContrastState = signal(false);

  readonly fontScale = this.fontScaleState.asReadonly();
  readonly isHighContrast = this.highContrastState.asReadonly();

  constructor() {
    this.restorePreferences();

    effect(() => {
      this.applyFontScale(this.fontScaleState());
    });

    effect(() => {
      this.applyHighContrast(this.highContrastState());
    });
  }

  getFontScale(): FontScale {
    return this.fontScaleState();
  }

  setFontScale(scale: FontScale): void {
    if (!this.isValidFontScale(scale)) {
      return;
    }
    this.fontScaleState.set(scale);
    this.persistPreference(this.FONT_KEY, scale);
  }

  getHighContrast(): boolean {
    return this.highContrastState();
  }

  setHighContrast(enabled: boolean): void {
    this.highContrastState.set(enabled);
    this.persistPreference(this.HC_KEY, enabled ? '1' : '0');
  }

  private restorePreferences(): void {
    if (!this.isBrowser) {
      return;
    }

    const storedScale = this.safeGetItem(this.FONT_KEY);
    if (storedScale && this.isValidFontScale(storedScale)) {
      this.fontScaleState.set(storedScale);
    }

    const storedContrast = this.safeGetItem(this.HC_KEY);
    if (storedContrast === '1') {
      this.highContrastState.set(true);
    }
  }

  private applyFontScale(scale: FontScale): void {
    if (!this.isBrowser) {
      return;
    }

    const html = this.documentRef.documentElement;
    if (!html) {
      return;
    }

    this.renderer.removeClass(html, 'senior-sm');
    this.renderer.removeClass(html, 'senior-lg');

    if (scale === 'sm') {
      this.renderer.addClass(html, 'senior-sm');
    } else if (scale === 'lg') {
      this.renderer.addClass(html, 'senior-lg');
    }
  }

  private applyHighContrast(enabled: boolean): void {
    if (!this.isBrowser) {
      return;
    }

    const html = this.documentRef.documentElement;
    if (!html) {
      return;
    }

    if (enabled) {
      this.renderer.addClass(html, 'hc');
    } else {
      this.renderer.removeClass(html, 'hc');
    }
  }

  private persistPreference(key: string, value: string): void {
    if (!this.isBrowser) {
      return;
    }
    try {
      this.windowRef?.localStorage?.setItem(key, value);
    } catch {
      /* ignore storage write */
    }
  }

  private safeGetItem(key: string): string | null {
    if (!this.isBrowser) {
      return null;
    }
    try {
      return this.windowRef?.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  private isValidFontScale(value: string): value is FontScale {
    return value === 'base' || value === 'sm' || value === 'lg';
  }
}
