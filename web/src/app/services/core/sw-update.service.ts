import { DestroyRef, Injectable, PLATFORM_ID, inject } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { SwUpdate, VersionEvent } from '@angular/service-worker';
import { BehaviorSubject, Subscription, timer } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Injectable({ providedIn: 'root' })
export class SwUpdateService {
  private readonly documentRef = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly windowRef: (Window & typeof globalThis) | null = this.isBrowser
    ? (this.documentRef.defaultView as Window & typeof globalThis | null)
    : null;
  // Emits when a new version is ready
  public readonly updateAvailable$ = new BehaviorSubject<boolean>(false);

  private latestEvent?: VersionEvent;
  private autoReloadSub?: Subscription;

  constructor(private swUpdate: SwUpdate) {
    this.initialize();
    this.destroyRef.onDestroy(() => {
      this.autoReloadSub?.unsubscribe();
      this.autoReloadSub = undefined;
    });
  }

  private initialize(): void {
    if (!this.swUpdate.isEnabled || !this.isBrowser) {
      return;
    }

    this.swUpdate.versionUpdates
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event: VersionEvent) => {
        if (event.type === 'VERSION_READY') {
          this.latestEvent = event;
          this.updateAvailable$.next(true);

          // Conditional auto-reload: less disruptive when tab is hidden
          // If page is hidden, update soon; otherwise, consider delayed auto-update
      if (this.documentRef.visibilityState === 'hidden') {
        this.scheduleAutoReload(2000);
      } else {
        // Grace period to let the user click an Update CTA (banner)
        this.scheduleAutoReload(10000);
          }
        }
      });
  }

  /** Trigger update immediately (used by UI banner CTA) */
  async updateNow(): Promise<void> {
    if (!this.swUpdate.isEnabled || !this.isBrowser) return;
    try {
      this.autoReloadSub?.unsubscribe();
      this.autoReloadSub = undefined;
      await this.swUpdate.activateUpdate();
      this.windowRef?.location.reload();
    } catch {
      // no-op: best-effort
    }
  }

  /** Schedule an automatic update with a small delay */
  private scheduleAutoReload(delayMs: number): void {
    const windowRef = this.windowRef;
    if (!windowRef) {
      return;
    }

    this.autoReloadSub?.unsubscribe();
    this.autoReloadSub = timer(delayMs)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(async () => {
        if (!this.swUpdate.isEnabled) {
          return;
        }
        try {
          await this.swUpdate.activateUpdate();
          windowRef.location.reload();
        } catch {
          // swallow
        }
      });
  }
}
