import { CommonModule, DOCUMENT } from '@angular/common';
import { Component, Inject, OnDestroy, OnInit, ViewChild, Optional, Renderer2 } from '@angular/core';
import { NavigationEnd, Router, RouterModule, RouterOutlet } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { BottomNavBarComponent } from './shared/bottom-nav-bar.component';
import { UpdateBannerComponent } from './shared/update-banner.component';
import { OfflineIndicatorComponent } from './shared/offline-indicator.component';
import { PwaInstallPromptComponent } from './shared/pwa-install-prompt.component';
import { MediaPermissionsService } from '@core-services/media-permissions.service';
import { SwUpdateService } from '@core-services/sw-update.service';
import { IconComponent } from '@shared/icon/icon.component';
import { GlobalSearchComponent } from './shared/global-search.component';
import { FlowContextService } from '@core-services/flow-context.service';
import { KeyboardShortcutsModalComponent } from './shared/keyboard-shortcuts-modal.component';
import { KeyboardShortcutsService } from '@core-services/keyboard-shortcuts.service';
import { Observable, Subscription, combineLatest, of } from 'rxjs';
import { filter, map, distinctUntilChanged } from 'rxjs/operators';
import { OfflineService } from '@core-services/offline.service';
import { environment } from '@environments/environment';
import { NavigationService, QuickAction } from '@core-services/navigation.service';
import { NavigationComponent } from './shared/navigation.component';
import { FlowCompletionOverlayComponent } from './shared/flow-completion-overlay.component';
import { DemoBadgeComponent } from './shared/demo-badge.component';
import { ThemeService } from '@core-services/theme.service';
import { DemoModeService } from '@core-services/demo-mode.service';
import { FlowCompletionService } from '@core-services/flow-completion.service';
import { GlobalSearchService } from '@core-services/global-search.service';
import { DemoExportService } from '@services/demo/demo-export.service';
import { DemoAnalyticsService } from '@services/demo/demo-analytics.service';

interface OfflineShellState {
  isOffline: boolean;
  pending: number;
  endpoints: string[];
  lastUpdated: number | null;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    RouterOutlet,
    BottomNavBarComponent,
    UpdateBannerComponent,
    OfflineIndicatorComponent,
    PwaInstallPromptComponent,
    LucideAngularModule,
    IconComponent,
    GlobalSearchComponent,
    KeyboardShortcutsModalComponent,
    NavigationComponent,
    FlowCompletionOverlayComponent,
    DemoBadgeComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly authRoutes = new Set(['/login', 'login', '/register', 'register', '/verify-email', 'verify-email', '/avi-interview', 'avi-interview']);
  showShell = true;
  @ViewChild(GlobalSearchComponent) globalSearch?: GlobalSearchComponent;

  title = 'conductores-pwa';

  // Dark mode state
  readonly isDarkMode = this.theme.isDarkMode;
  breadcrumbs$: Observable<string[]>;
  readonly isGlobalSearchEnabled = environment.features.enableGlobalSearch ?? false;
  readonly quickActions$ = this.navigation.getQuickActions();
  readonly offlineState$ = this.createOfflineStateStream();
  readonly isDemoMode = this.demoMode.isDemoMode;
  private demoModeSubscription?: Subscription;

  constructor(
    private mediaPermissions: MediaPermissionsService,
    _sw: SwUpdateService,
    @Inject(DOCUMENT) private readonly documentRef: Document,
    private readonly flowContext: FlowContextService,
    private readonly router: Router,
    private readonly shortcuts: KeyboardShortcutsService,
    private readonly navigation: NavigationService,
    private readonly theme: ThemeService,
    private readonly renderer: Renderer2,
    private readonly demoMode: DemoModeService,
    private readonly flowCompletion: FlowCompletionService,
    private readonly globalSearchService: GlobalSearchService,
    @Optional() private readonly offlineService: OfflineService | null,
    private readonly demoExport: DemoExportService,
    private readonly demoAnalytics: DemoAnalyticsService
  ) {
    this.breadcrumbs$ = this.flowContext.breadcrumbs$;
    this.exposeTestingHelpers();
    this.updateShellVisibility(this.router.url);
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(event => this.updateShellVisibility(event.urlAfterRedirects));
  }

  private removeGlobalShortcutListener?: () => void;

  async ngOnInit() {
    // Media permissions will be requested just-in-time when needed (voice/camera flows)

    this.ensureDocumentLang();

    if (typeof window !== 'undefined') {
      this.handleResize();
      window.addEventListener('resize', this.handleResize, { passive: true });
      this.removeGlobalShortcutListener = this.renderer.listen('window', 'keydown', event =>
        this.handleGlobalShortcuts(event)
      );
    }

    this.demoModeSubscription = this.demoMode.isDemoMode$.subscribe(isDemo => {
      this.globalSearchService.setDemoMode(isDemo);
      this.navigation.refreshQuickActions();
    });
  }

  ngOnDestroy(): void {
    this.demoModeSubscription?.unsubscribe();

    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.handleResize);
      this.removeGlobalShortcutListener?.();
      this.removeGlobalShortcutListener = undefined;
      if (!environment.production) {
        const w = window as any;
        if (w.__offlineService === this.offlineService) {
          delete w.__offlineService;
        }
        if (w.__flowContextService === this.flowContext) {
          delete w.__flowContextService;
        }
      }
    }
  }

  private exposeTestingHelpers(): void {
    if (environment.production || typeof window === 'undefined') {
      return;
    }
    const w = window as any;
    if (this.offlineService) {
      w.__offlineService = this.offlineService;
    }
    w.__flowContextService = this.flowContext;
  }

  private ensureDocumentLang(): void {
    const html = this.documentRef?.documentElement;
    if (!html) {
      return;
    }
    html.setAttribute('lang', 'es-MX');
  }

  /**
   * Dark mode management
   */
  onQuickAction(action: QuickAction): void {
    this.navigation.executeQuickAction(action.id);
  }

  trackQuickAction(_: number, action: QuickAction): string {
    return action.id;
  }

  trackBreadcrumb(index: number, crumb: string): string {
    return `${index}-${crumb}`;
  }

  toggleDarkMode(): void {
    this.theme.toggle();
  }

  async handleExport(): Promise<void> {
    if (this.isDemoMode()) {
      const scenario = this.demoMode.activeScenario();
      try {
        const blob = await this.demoExport.exportReport(scenario ?? 'demo');
        const url = URL.createObjectURL(blob);
        const anchor = this.documentRef.createElement('a');
        anchor.href = url;
        anchor.download = `demo-export-${Date.now()}.txt`;
        anchor.rel = 'noopener';
        anchor.click();
        URL.revokeObjectURL(url);
        this.demoAnalytics.trackExportSuccess({ scenario, format: 'txt' });
      } catch (error) {
        console.warn('[DemoExport] Failed to generate demo export', error);
      }
      return;
    }

    this.navigation.executeQuickAction('export-dashboard');
  }

  goToDemoAnalytics(): void {
    if (!this.isDemoMode()) {
      this.demoMode.enableDemoMode();
    }
    void this.router.navigate(['/demo-analytics'], { queryParamsHandling: 'preserve' });
  }

  openDemoGuide(): void {
    this.flowCompletion.open({
      title: 'Guía rápida de modo demo',
      description: 'Activa escenarios con ?demo=<escenario> o desde los botones de cada módulo. Usa “Reiniciar demo” para restaurar seeds y consulta la telemetría en tiempo real.',
      metrics: [
        { label: 'Escenarios disponibles', value: 'AVI, Documentos, Tanda, Protección, Postventa, Favoritos' },
        { label: 'Telemetría', value: '/demo-analytics' },
        { label: 'Exportaciones', value: 'Solo demo (sin datos reales)' }
      ],
      actions: [
        {
          id: 'open-demo-analytics',
          label: 'Abrir telemetría demo',
          kind: 'primary',
          execute: () => this.goToDemoAnalytics()
        },
        {
          id: 'close-demo-guide',
          label: 'Entendido',
          kind: 'ghost',
          execute: () => undefined
        }
      ]
    });
  }

  switchToRealData(): void {
    this.demoMode.enableRealData();
    this.showDemoToggleFlowCompletion();
  }

  switchToDemoData(): void {
    this.demoMode.enableDemoMode();
  }

  async flushOfflineQueue(): Promise<void> {
    if (!this.offlineService) {
      return;
    }

    await this.offlineService.flushQueueNow();
  }


  private updateShellVisibility(url: string): void {
    const cleanUrl = url.split('?')[0];
    this.showShell = !Array.from(this.authRoutes).some(route => cleanUrl.startsWith(route));
  }

  private handleResize = () => {
    if (typeof window === 'undefined') {
      return;
    }

    this.documentRef?.body?.style.setProperty('--viewport-height', `${window.innerHeight}px`);
  };

  private handleGlobalShortcuts(event: KeyboardEvent): void {
    const isCtrlOrMeta = event.ctrlKey || event.metaKey;

    if (!isCtrlOrMeta && this.isTypingContext(event)) {
      return;
    }

    if (isCtrlOrMeta) {
      const key = event.key.toLowerCase();
      switch (key) {
        case 'k':
          event.preventDefault();
          this.globalSearch?.focusInput();
          return;
        case 'n':
          event.preventDefault();
          this.router.navigate(['/cotizador'], { queryParams: { source: 'shortcut', view: 'new-quote' } });
          return;
        case 'c':
          event.preventDefault();
          this.router.navigate(['/clientes', 'nuevo'], { queryParams: { source: 'shortcut' } });
          return;
        case 'd':
          event.preventDefault();
          this.router.navigate(['/documentos'], { queryParams: { source: 'shortcut' } });
          return;
        default:
          return;
      }
    }

    if (event.key === '?' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      this.shortcuts.open();
      return;
    }
  }

  private showDemoToggleFlowCompletion(): void {
    this.flowCompletion.open({
      title: 'Modo demostración desactivado',
      description: 'Estamos listos para operar con datos reales. Ajustamos buscador y acciones rápidas automáticamente.',
      metrics: [
        { label: 'Fuente de datos', value: 'Reales' },
        { label: 'Mock data', value: 'Deshabilitado' },
        { label: 'Actualización', value: new Date().toLocaleTimeString('es-MX') }
      ],
      actions: [
        {
          id: 'register-real-client',
          label: 'Registrar cliente real',
          kind: 'primary',
          execute: () => this.router.navigate(['/clientes', 'nuevo'], { queryParams: { source: 'demo-mode', mode: 'real' } })
        },
        {
          id: 'go-dashboard',
          label: 'Ir al dashboard',
          kind: 'secondary',
          execute: () => this.router.navigate(['/dashboard'])
        },
        {
          id: 'keep-demo',
          label: 'Seguir en modo demo',
          kind: 'ghost',
          execute: () => this.switchToDemoData()
        }
      ],
      onComplete: () => {
        this.globalSearchService.refreshIndex();
        this.navigation.refreshQuickActions();
      }
    });
  }

  private isTypingContext(event: KeyboardEvent): boolean {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return false;
    }

    const tagName = target.tagName;
    return tagName === 'INPUT' || tagName === 'TEXTAREA' || target.isContentEditable;
  }

  private createOfflineStateStream(): Observable<OfflineShellState> {
    if (!this.offlineService) {
      return of({ isOffline: false, pending: 0, endpoints: [], lastUpdated: null });
    }

    const offlineQueue$ = this.flowContext.contexts$.pipe(
      map(entries =>
        entries.find(entry => entry.key === 'offlineQueue')?.data as
          | { pending?: number; endpoints?: string[]; lastUpdated?: number }
          | undefined
      )
    );

    return combineLatest([
      this.offlineService.online$.pipe(map(isOnline => !isOnline)),
      offlineQueue$
    ]).pipe(
      map(([isOffline, queue]) => ({
        isOffline,
        pending: queue?.pending ?? 0,
        endpoints: queue?.endpoints ?? [],
        lastUpdated: queue?.lastUpdated ?? null
      })),
      distinctUntilChanged((prev, curr) =>
        prev.isOffline === curr.isOffline &&
        prev.pending === curr.pending &&
        prev.lastUpdated === curr.lastUpdated
      )
    );
  }
}
