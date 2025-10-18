import { Injectable, PLATFORM_ID, Renderer2, RendererFactory2, inject } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';

export interface DownloadOptions {
  filename: string;
  target?: '_self' | '_blank';
  revokeUrl?: boolean;
}

@Injectable({ providedIn: 'root' })
export class DownloadService {
  private readonly documentRef = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly renderer: Renderer2;

  constructor(rendererFactory: RendererFactory2) {
    this.renderer = rendererFactory.createRenderer(null, null);
  }

  downloadBlob(blob: Blob, options: DownloadOptions): void {
    if (!this.isBrowser) {
      return;
    }

    const url = URL.createObjectURL(blob);
    this.downloadFromUrl(url, {
      filename: options.filename,
      target: options.target,
      revokeUrl: options.revokeUrl ?? true
    });
  }

  downloadFromUrl(url: string, options: DownloadOptions): void {
    if (!this.isBrowser) {
      return;
    }

    const anchor = this.renderer.createElement('a') as HTMLAnchorElement;
    this.renderer.setAttribute(anchor, 'href', url);
    this.renderer.setAttribute(anchor, 'download', options.filename);

    if (options.target) {
      this.renderer.setAttribute(anchor, 'target', options.target);
      if (options.target === '_blank') {
        this.renderer.setAttribute(anchor, 'rel', 'noopener noreferrer');
      }
    }

    this.renderer.setStyle(anchor, 'display', 'none');
    this.renderer.appendChild(this.documentRef.body, anchor);
    anchor.click();
    this.renderer.removeChild(this.documentRef.body, anchor);

    if (options.revokeUrl) {
      URL.revokeObjectURL(url);
    }
  }

  downloadText(content: string, mimeType: string, options: DownloadOptions): void {
    const blob = new Blob([content], { type: mimeType });
    this.downloadBlob(blob, options);
  }
}
