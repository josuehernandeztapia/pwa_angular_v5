import { Injectable, Renderer2, RendererFactory2, DestroyRef, inject, PLATFORM_ID } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';

export interface ScriptLoadOptions {
  src: string;
  type?: string;
  async?: boolean;
  defer?: boolean;
  attributes?: Record<string, string>;
  forceReload?: boolean;
  target?: 'head' | 'body';
  preserveOnDestroy?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ScriptLoaderService {
  private readonly documentRef = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private readonly renderer: Renderer2;

  private readonly loadedScripts = new Map<string, HTMLScriptElement>();

  constructor(rendererFactory: RendererFactory2) {
    this.renderer = rendererFactory.createRenderer(null, null);

    this.destroyRef.onDestroy(() => {
      for (const [src, element] of this.loadedScripts.entries()) {
        const preserve = element.dataset['preserveOnDestroy'] === 'true';
        if (!preserve) {
          this.removeScript(src);
        }
      }
      this.loadedScripts.clear();
    });
  }

  async load(options: ScriptLoadOptions): Promise<HTMLScriptElement | null> {
    if (!isPlatformBrowser(this.platformId)) {
      return null;
    }

    const existing = this.getExistingScript(options.src);

    if (existing && !options.forceReload) {
      return existing;
    }

    if (existing && options.forceReload) {
      this.removeScript(options.src);
    }

    const script = this.renderer.createElement('script') as HTMLScriptElement;
    script.src = options.src;

    if (options.type) {
      script.type = options.type;
    }

    script.async = options.async ?? true;
    script.defer = options.defer ?? false;

    if (options.attributes) {
      Object.entries(options.attributes).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          this.renderer.setAttribute(script, key, value);
        }
      });
    }

    if (options.preserveOnDestroy) {
      script.dataset['preserveOnDestroy'] = 'true';
    }

    const target = options.target === 'body' ? this.documentRef.body : this.documentRef.head;
    this.renderer.appendChild(target ?? this.documentRef.body, script);

    const loadPromise = new Promise<HTMLScriptElement>((resolve, reject) => {
      const onLoad = () => {
        cleanup();
        this.loadedScripts.set(options.src, script);
        resolve(script);
      };
      const onError = () => {
        cleanup();
        this.removeScript(options.src);
        reject(new Error(`Failed to load script: ${options.src}`));
      };

      const cleanup = () => {
        script.removeEventListener('load', onLoad);
        script.removeEventListener('error', onError);
      };

      script.addEventListener('load', onLoad);
      script.addEventListener('error', onError);
    });

    return loadPromise;
  }

  markLoaded(options: ScriptLoadOptions, element: HTMLScriptElement): void {
    if (isPlatformBrowser(this.platformId)) {
      this.loadedScripts.set(options.src, element);
    }
  }

  private getExistingScript(src: string): HTMLScriptElement | null {
    if (!isPlatformBrowser(this.platformId)) {
      return null;
    }

    const cached = this.loadedScripts.get(src);
    if (cached) {
      return cached;
    }

    const selector = `script[src="${src}"]`;
    return this.documentRef.querySelector(selector);
  }

  private removeScript(src: string): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const element = this.loadedScripts.get(src) ?? this.documentRef.querySelector(`script[src="${src}"]`);
    if (element?.parentNode) {
      element.parentNode.removeChild(element);
    }
    this.loadedScripts.delete(src);
  }
}
