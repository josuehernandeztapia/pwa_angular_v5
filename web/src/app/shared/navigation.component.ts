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

interface NavigationItem {
  label: string;
  route: string;
  iconType: IconName;
  badge?: number;
  dataCy?: string;
  children?: NavigationItem[];
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
  private baseNavigationItems: ShellNavigationItem[] = [];
  private offlinePendingCount = 0;

  constructor(
    private router: Router,
    private notificationService: PushNotificationService,
    private userPrefs: UserPreferencesService,
    private navigationService: NavigationService,
    private readonly destroyRef: DestroyRef,
    @Inject(DOCUMENT) documentRef: Document,
    @Inject(PLATFORM_ID) platformId: Object,
    @Optional() private readonly flowContext: FlowContextService | null
  ) {
    this.unreadCount$ = this.notificationService.getUnreadCount();
    this.baseNavigationItems = this.navigationService.getShellNavigationItems();
    this.updateNavigationItems(0);
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
      'is-active': this.isActive(item.route),
      'app-nav__item--has-children': !!item.children?.length,
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

    if (this.flowContext) {
      this.flowContext.contexts$
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(entries => {
          const offlineEntry = entries.find(entry => entry.key === 'offlineQueue');
          const pending = typeof offlineEntry?.data?.pending === 'number' ? offlineEntry.data.pending : 0;
          if (pending !== this.offlinePendingCount) {
            this.offlinePendingCount = pending;
            this.updateNavigationItems(pending);
          }
        });
    } else {
      this.updateNavigationItems(this.offlinePendingCount);
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

  private updateNavigationItems(pending: number): void {
    this.navigationItems = this.baseNavigationItems.map(item => this.decorateNavigationItem(item, pending));
  }

  private decorateNavigationItem(item: ShellNavigationItem, pending: number): NavigationItem {
    const badge = item.route === '/documentos' && pending > 0 ? pending : item.badge;
    return {
      label: item.label,
      route: item.route,
      iconType: item.iconType,
      dataCy: item.dataCy,
      badge,
      children: item.children ? item.children.map(child => this.decorateNavigationItem(child, pending)) : undefined
    };
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
    
    this.router.navigate([item.route]);
    
    if (this.isMobileView) {
      this.closeMobileMenu();
    }
  }

  getNavTestId(route: string): string {
    if (!route) {
      return 'nav-item-root';
    }
    const trimmed = route.startsWith('/') ? route.slice(1) : route;
    const normalized = trimmed.split('/').filter(Boolean).join('-') || 'root';
    return `nav-item-${normalized}`;
  }

  isActive(route: string): boolean {
    return this.router.url === route || this.router.url.startsWith(route + '/');
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
