import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, Inject, OnInit, Optional, PLATFORM_ID, ViewChild } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { Observable, fromEvent } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PushNotificationService } from '@core-services/push-notification.service';
import { UserPreferencesService } from '@core-services/user-preferences.service';
import { FlowContextService } from '@core-services/flow-context.service';
import { NavigationService, ShellNavigationItem } from '@core-services/navigation.service';
import { NotificationCenterComponent } from '@shared/notification-center.component';
import { IconComponent } from '@shared/icon/icon.component';
import { IconName } from '@shared/icon/icon-definitions';
import { DemoModeService } from '@core-services/demo-mode.service';
import { DemoAnalyticsService } from '@services/demo/demo-analytics.service';
import { DemoScenarioId } from '@services/demo/demo-scenarios';

interface NavigationItem {
  label: string;
  route: string;
  iconType: IconName;
  badge?: number;
  dataCy?: string;
  queryParams?: Record<string, any>;
  children?: NavigationItem[];
  demoScenario?: DemoScenarioId;
  tooltip?: string;
}

@Component({
  selector: 'app-navigation',
  standalone: true,
  imports: [CommonModule, RouterModule, NotificationCenterComponent, IconComponent],
  templateUrl: './navigation.component.html',
  styleUrls: ['./navigation.component.scss']
})
export class NavigationComponent implements OnInit {
  @ViewChild('notificationCenter') notificationCenter!: NotificationCenterComponent;
  
  isCollapsed = false;
  showMobileMenu = false;
  isMobileView = false;
  showUserProfileDropdown = false;

  userName = 'Ana Domínguez';
  userRole = 'Asesor Financiero';
  userInitials = 'AD';

  unreadCount$: Observable<number>;
  private readonly isBrowser: boolean;
  private readonly windowRef: (Window & typeof globalThis) | null;

  navigationItems: NavigationItem[] = [];
  demoShortcuts: NavigationItem[] = [];
  private baseNavigationItems: ShellNavigationItem[] = [];
  private offlinePendingCount = 0;
  private documentsPendingCount = 0;

  constructor(
    private router: Router,
    private notificationService: PushNotificationService,
    private userPrefs: UserPreferencesService,
    private navigationService: NavigationService,
    private readonly destroyRef: DestroyRef,
    @Inject(DOCUMENT) documentRef: Document,
    @Inject(PLATFORM_ID) platformId: Object,
    @Optional() private readonly flowContext: FlowContextService | null,
    private readonly demoMode: DemoModeService,
    private readonly demoAnalytics: DemoAnalyticsService
  ) {
    this.unreadCount$ = this.notificationService.getUnreadCount();
    this.baseNavigationItems = this.navigationService.getShellNavigationItems();
    this.updateNavigationItems();
    this.isBrowser = isPlatformBrowser(platformId);
    this.windowRef = this.isBrowser ? (documentRef.defaultView as any) : null;
  }

  getNavStateClasses(): Record<string, boolean> {
    return {
      'app-nav--collapsed': this.isCollapsed,
      'app-nav--mobile-open': this.showMobileMenu,
    };
  }

  getNavItemClasses(item: NavigationItem): Record<string, boolean> {
    return {
      'app-nav__item-group--has-children': !!item.children?.length,
    };
  }

  ngOnInit() {
    this.checkMobileView();
    if (this.windowRef) {
      fromEvent(this.windowRef, 'resize')
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => this.checkMobileView());
    }
    
    // Initialize notifications
    this.initializeNotifications();

    // Load user prefs
    this.fontScale = this.userPrefs.getFontScale();
    this.highContrast = this.userPrefs.getHighContrast();

    this.demoMode.isDemoMode$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.updateNavigationItems());

    if (this.flowContext) {
      this.flowContext.contexts$
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(entries => {
          const offlineEntry = entries.find(entry => entry.key === 'offlineQueue');
          const offlinePending = typeof offlineEntry?.data?.pending === 'number' ? offlineEntry.data.pending : 0;
          const documentsEntry = entries.find(entry => entry.key === 'documents-progress');
          const documentsPending = typeof documentsEntry?.data?.pending === 'number' ? documentsEntry.data.pending : 0;

          let shouldUpdate = false;

          if (offlinePending !== this.offlinePendingCount) {
            this.offlinePendingCount = offlinePending;
            shouldUpdate = true;
          }

          if (documentsPending !== this.documentsPendingCount) {
            this.documentsPendingCount = documentsPending;
            shouldUpdate = true;
          }

          if (shouldUpdate) {
            this.updateNavigationItems();
          }
        });
    } else {
      this.updateNavigationItems();
    }
  }

  async initializeNotifications() {
    try {
      await this.notificationService.initializeNotifications();
    } catch (error) {
    }
  }

  checkMobileView() {
    if (!this.windowRef) {
      this.isMobileView = false;
      return;
    }

    this.isMobileView = this.windowRef.innerWidth <= 768;
    if (!this.isMobileView) {
      this.showMobileMenu = false;
    }
  }

  toggleCollapse() {
    this.isCollapsed = !this.isCollapsed;
  }

  toggleMobileMenu() {
    this.showMobileMenu = !this.showMobileMenu;
  }

  closeMobileMenu() {
    this.showMobileMenu = false;
  }

  private updateNavigationItems(): void {
    this.navigationItems = this.baseNavigationItems.map(item => this.decorateNavigationItem(item));
    this.demoShortcuts = this.demoMode.isDemoMode() ? this.buildDemoShortcuts() : [];
  }

  private decorateNavigationItem(item: ShellNavigationItem): NavigationItem {
    let badge = item.badge;

    if (item.route === '/documentos') {
      const combined = Math.max(this.documentsPendingCount, this.offlinePendingCount);
      badge = combined > 0 ? combined : undefined;
    }

    return {
      label: item.label,
      route: item.route,
      iconType: item.iconType,
      dataCy: item.dataCy,
      badge,
      queryParams: item.queryParams,
      children: item.children ? item.children.map(child => this.decorateNavigationItem(child)) : undefined,
      tooltip: item.tooltip
    };
  }

  private buildDemoShortcuts(): NavigationItem[] {
    return [
      {
        label: 'AVI Test',
        route: '/demo/avi-test',
        iconType: 'microphone',
        dataCy: 'nav-demo-avi-test',
        tooltip: 'Simula y prueba el flujo demo de AVI en un solo click',
        queryParams: { enableDemo: 'true', source: 'avi-test' },
        demoScenario: 'avi-perfecto'
      },
      {
        label: 'KYC Test',
        route: '/demo/kyc-test',
        iconType: 'shield-check',
        dataCy: 'nav-demo-kyc-test',
        tooltip: 'Simula y prueba el flujo demo de KYC en un solo click',
        queryParams: { enableDemo: 'true', source: 'kyc-test' },
        demoScenario: 'kyc-demo'
      }
    ];
  }

  toggleNotifications() {
    this.notificationCenter.toggle();
  }

  createNewOpportunity() {
    this.router.navigate(['/nueva-oportunidad']);
    if (this.isMobileView) {
      this.closeMobileMenu();
    }
  }

  navigate(item: NavigationItem) {
    if (item.children) {
      // Navigate to parent route to activate and reveal submenu
      this.router.navigate([item.route]);
      return;
    }

    if (item.demoScenario) {
      this.demoMode.enableDemoMode();
      this.demoMode.setScenario(item.demoScenario);
      const eventName = item.demoScenario === 'avi-perfecto' ? 'avi_test_shortcut' : 'kyc_test_shortcut';
      this.demoAnalytics.track(eventName, {
        scenario: item.demoScenario,
        route: item.route,
        source: 'sidebar'
      });
    }

    const extras = item.queryParams ? { queryParams: item.queryParams } : undefined;
    this.router.navigate([item.route], extras);
    
    if (this.isMobileView) {
      this.closeMobileMenu();
    }
  }

  getNavTestId(route: string, queryParams?: Record<string, any>): string {
    if (!route) {
      return 'nav-item-root';
    }
    const trimmed = route.startsWith('/') ? route.slice(1) : route;
    const normalized = trimmed.split('/').filter(Boolean).join('-') || 'root';
    if (!queryParams || Object.keys(queryParams).length === 0) {
      return `nav-item-${normalized}`;
    }

    const querySuffix = Object.entries(queryParams)
      .map(([key, value]) => `${key}-${String(value)}`)
      .join('-')
      .replace(/[^a-zA-Z0-9-]/g, '');

    return `nav-item-${normalized}-${querySuffix}`;
  }

  isActive(route: string, queryParams?: Record<string, any>): boolean {
    const currentUrl = this.router.url;
    if (!currentUrl) {
      return false;
    }

    const [currentPath, queryString] = currentUrl.split('?');

    if (queryParams && Object.keys(queryParams).length > 0) {
      if (currentPath !== route) {
        return false;
      }

      const params = new URLSearchParams(queryString ?? '');
      return Object.entries(queryParams).every(([key, value]) => params.get(key) === String(value));
    }

    return currentPath === route || currentUrl.startsWith(route + '/') || currentUrl.startsWith(route + '?');
  }

  showHelp() {
    // Implement help functionality
    this.showUserProfileDropdown = false;
  }

  navigateToProfile() {
    this.router.navigate(['/perfil']);
    this.showUserProfileDropdown = false;
  }

  navigateToSettings() {
    this.router.navigate(['/configuracion']);
    this.showUserProfileDropdown = false;
  }

  showSettings() {
    // Navigate to settings or show modal
  }

  logout() {
    const storage = this.windowRef?.localStorage;
    if (storage) {
      try {
        storage.removeItem('isAuthenticated');
        storage.removeItem('rememberMe');
      } catch {
        /* ignore storage errors */
      }
    }
    this.showUserProfileDropdown = false;
    this.router.navigate(['/login']);
  }

  // Accessibility state & handlers
  fontScale: 'base' | 'sm' | 'lg' = 'base';
  highContrast = false;

  setFontScale(scale: 'base' | 'sm' | 'lg') {
    this.fontScale = scale;
    this.userPrefs.setFontScale(scale);
  }

  toggleHighContrast() {
    this.highContrast = !this.highContrast;
    this.userPrefs.setHighContrast(this.highContrast);
  }
}
