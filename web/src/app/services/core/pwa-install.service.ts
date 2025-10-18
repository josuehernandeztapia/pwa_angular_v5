import { DestroyRef, Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, interval } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
}

interface InstallInstructions {
  platform: string;
  instructions: string[];
}

interface PwaSupportSnapshot {
  serviceWorker: boolean;
  manifest: boolean;
  installPrompt: boolean;
  notifications: boolean;
  backgroundSync: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class PwaInstallService {
  private readonly documentRef = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly windowRef: (Window & typeof globalThis) | null = this.isBrowser
    ? (this.documentRef.defaultView as Window & typeof globalThis | null)
    : null;

  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private readonly installPromptSubject = new BehaviorSubject<boolean>(false);

  public readonly canInstall = signal<boolean>(false);
  public readonly isInstalled = signal<boolean>(false);
  public readonly isStandalone = signal<boolean>(false);

  public readonly installPrompt$ = this.installPromptSubject.asObservable();

  constructor() {
    if (this.isBrowser) {
      this.initializeInstallTracking();
    }
  }

  private initializeInstallTracking(): void {
    const windowRef = this.windowRef;
    if (!windowRef) {
      return;
    }

    this.checkInstallationStatus();

    const beforeInstallListener = (event: Event) => {
      event.preventDefault();
      this.deferredPrompt = event as BeforeInstallPromptEvent;
      this.canInstall.set(true);
      this.installPromptSubject.next(true);
    };

    const appInstalledListener = () => {
      this.isInstalled.set(true);
      this.canInstall.set(false);
      this.deferredPrompt = null;
      this.installPromptSubject.next(false);
    };

    windowRef.addEventListener('beforeinstallprompt', beforeInstallListener);
    windowRef.addEventListener('appinstalled', appInstalledListener);

    interval(5000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.checkInstallationStatus();
      });

    this.destroyRef.onDestroy(() => {
      windowRef.removeEventListener('beforeinstallprompt', beforeInstallListener);
      windowRef.removeEventListener('appinstalled', appInstalledListener);
    });
  }

  private checkInstallationStatus(): void {
    const windowRef = this.windowRef;
    if (!windowRef) {
      return;
    }

    const matchMediaStandalone = windowRef.matchMedia?.('(display-mode: standalone)').matches ?? false;
    const navigatorStandalone = (windowRef.navigator as any)?.standalone === true;
    const referrerStandalone = this.documentRef.referrer?.includes('android-app://') ?? false;
    const isStandalone = matchMediaStandalone || navigatorStandalone || referrerStandalone;

    this.isStandalone.set(isStandalone);

    const storage = this.getLocalStorage();
    const wasInstalled = storage?.getItem('pwa-installed') === 'true';

    if (isStandalone && !wasInstalled) {
      storage?.setItem('pwa-installed', 'true');
      this.isInstalled.set(true);
    } else {
      this.isInstalled.set(isStandalone || wasInstalled);
    }
  }

  async showInstallPrompt(): Promise<{
    outcome: 'accepted' | 'dismissed' | 'unavailable';
    platform?: string;
  }> {
    if (!this.deferredPrompt || !this.windowRef) {
      return { outcome: 'unavailable' };
    }

    try {
      const prompt = this.deferredPrompt;
      await prompt.prompt();

      const choiceResult = await prompt.userChoice;

      this.deferredPrompt = null;
      this.canInstall.set(false);
      this.installPromptSubject.next(false);

      const storage = this.getLocalStorage();
      storage?.setItem('pwa-install-prompted', 'true');
      if (choiceResult.outcome === 'accepted') {
        storage?.setItem('pwa-install-accepted', 'true');
      }

      return {
        outcome: choiceResult.outcome,
        platform: choiceResult.platform
      };
    } catch {
      return { outcome: 'unavailable' };
    }
  }

  hasBeenPromptedBefore(): boolean {
    return this.getLocalStorage()?.getItem('pwa-install-prompted') === 'true';
  }

  previouslyAcceptedInstall(): boolean {
    return this.getLocalStorage()?.getItem('pwa-install-accepted') === 'true';
  }

  resetInstallTracking(): void {
    const storage = this.getLocalStorage();
    storage?.removeItem('pwa-install-prompted');
    storage?.removeItem('pwa-install-accepted');
    storage?.removeItem('pwa-installed');
    this.canInstall.set(false);
    this.isInstalled.set(false);
    this.installPromptSubject.next(false);
  }

  getInstallInstructions(): InstallInstructions {
    const userAgent = this.windowRef?.navigator?.userAgent?.toLowerCase() ?? '';

    if (userAgent.includes('iphone') || userAgent.includes('ipad')) {
      return {
        platform: 'iOS Safari',
        instructions: [
          'Toca el botón de compartir en Safari',
          'Desliza hacia abajo y selecciona "Añadir a pantalla de inicio"',
          'Confirma tocando "Añadir"'
        ]
      };
    }

    if (userAgent.includes('android')) {
      if (userAgent.includes('chrome')) {
        return {
          platform: 'Android Chrome',
          instructions: [
            'Toca el menú de tres puntos en Chrome',
            'Selecciona "Añadir a pantalla de inicio"',
            'Confirma tocando "Añadir"'
          ]
        };
      }

      return {
        platform: 'Android',
        instructions: [
          'Busca la opción "Añadir a pantalla de inicio" en tu navegador',
          'Confirma la instalación'
        ]
      };
    }

    if (userAgent.includes('chrome')) {
      return {
        platform: 'Chrome Desktop',
        instructions: [
          'Busca el ícono de instalación en la barra de direcciones',
          'Haz clic en "Instalar Conductores PWA"',
          'Confirma la instalación'
        ]
      };
    }

    return {
      platform: 'Browser',
      instructions: [
        'Busca la opción de instalación en tu navegador',
        'Añade la aplicación a tu pantalla de inicio'
      ]
    };
  }

  getPWASupport(): PwaSupportSnapshot {
    return this.computeSupportSnapshot();
  }

  getInstallMetrics(): {
    canInstall: boolean;
    isInstalled: boolean;
    isStandalone: boolean;
    hasBeenPrompted: boolean;
    previouslyAccepted: boolean;
    platform: string;
    support: PwaSupportSnapshot;
  } {
    const support = this.getPWASupport();
    const platform = this.windowRef?.navigator?.platform ?? 'unknown';

    return {
      canInstall: this.canInstall(),
      isInstalled: this.isInstalled(),
      isStandalone: this.isStandalone(),
      hasBeenPrompted: this.hasBeenPromptedBefore(),
      previouslyAccepted: this.previouslyAcceptedInstall(),
      platform,
      support
    };
  }

  private computeSupportSnapshot(): PwaSupportSnapshot {
    const windowRef = this.windowRef;
    const navigatorRef = windowRef?.navigator;

    if (!windowRef || !navigatorRef) {
      return {
        serviceWorker: false,
        manifest: false,
        installPrompt: false,
        notifications: false,
        backgroundSync: false
      };
    }

    const manifestLinkExists = !!this.documentRef?.querySelector?.('link[rel="manifest"]');
    const serviceWorkerSupported = 'serviceWorker' in navigatorRef;
    const registrationProto = (windowRef as any).ServiceWorkerRegistration?.prototype;
    const backgroundSyncSupported = serviceWorkerSupported && !!registrationProto && 'sync' in registrationProto;

    return {
      serviceWorker: serviceWorkerSupported,
      manifest: manifestLinkExists,
      installPrompt: 'BeforeInstallPromptEvent' in windowRef || 'onbeforeinstallprompt' in windowRef,
      notifications: 'Notification' in windowRef,
      backgroundSync: backgroundSyncSupported
    };
  }

  private getLocalStorage(): Storage | null {
    if (!this.windowRef) {
      return null;
    }

    try {
      return this.windowRef.localStorage;
    } catch {
      return null;
    }
  }
}
