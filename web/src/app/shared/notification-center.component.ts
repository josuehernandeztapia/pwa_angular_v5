import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, ElementRef, ViewChild, PLATFORM_ID, Renderer2, RendererFactory2, effect, inject, signal } from '@angular/core';
import { IconComponent } from '@shared/icon/icon.component';
import { IconName } from '@shared/icon/icon-definitions';
import { Observable } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PushNotificationService } from '@core-services/push-notification.service';
import { NotificationHistory } from '@interfaces/notification';
import { Router } from '@angular/router';
import { FocusTrapService } from '@core-services/focus-trap.service';

//  Using SSOT NotificationHistory from models/notification.ts

@Component({
  selector: 'app-notification-center',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './notification-center.component.html',
  styleUrls: ['./notification-center.component.scss'],
})
export class NotificationCenterComponent {
  @ViewChild('panel') panelElement?: ElementRef<HTMLDivElement>;
  readonly isOpen = signal(false);
  readonly permissionGranted = signal(false);
  readonly showPermissionBanner = signal(true);

  notifications$: Observable<NotificationHistory[]>;
  unreadCount$: Observable<number>;

  private readonly destroyRef = inject(DestroyRef);
  private readonly focusTrap = inject(FocusTrapService);
  private readonly renderer: Renderer2 = inject(RendererFactory2).createRenderer(null, null);
  private readonly documentRef = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly windowRef: (Window & typeof globalThis) | null = this.isBrowser
    ? (this.documentRef.defaultView as any)
    : null;

  private releaseFocusTrap?: () => void;
  private removeEscapeListener?: () => void;
  private readonly storageKey = 'notification_permission_dismissed';

  getPanelClasses(): Record<string, boolean> {
    return {
      'notification-center--open': this.isOpen(),
    };
  }

  getNotificationItemClasses(notification: NotificationHistory): Record<string, boolean> {
    return {
      'notification-center__item--unread': !notification.clicked,
    };
  }

  constructor(
    private notificationService: PushNotificationService,
    private router: Router
  ) {
    this.notifications$ = this.notificationService.notificationHistory;
    this.unreadCount$ = this.notificationService.getUnreadCount();
    this.restoreDismissedPreference();
    this.setupFocusManagement();
    this.initializePermissionWatcher();
    this.initializeNotifications();
  }

  private setupFocusManagement(): void {
    effect(() => {
      if (!this.isBrowser) {
        return;
      }

      if (!this.isOpen()) {
        this.removeEscapeListener?.();
        this.removeEscapeListener = undefined;

        try {
          this.releaseFocusTrap?.();
        } catch {
          /* ignore trap cleanup issues */
        }
        this.releaseFocusTrap = undefined;
        this.focusTrap.restore();
        return;
      }

      const panel = this.panelElement?.nativeElement;
      if (!panel) {
        queueMicrotask(() => this.setupFocusManagement());
        return;
      }

      this.focusTrap.remember();
      this.releaseFocusTrap = this.focusTrap.trap(panel);

      queueMicrotask(() => {
        try {
          panel.focus({ preventScroll: true });
        } catch {
          /* ignore focus issues */
        }
      });

      if (!this.removeEscapeListener) {
        this.removeEscapeListener = this.renderer.listen(this.documentRef, 'keydown', (event: KeyboardEvent) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            this.close();
          }
        });
      }
    });

    this.destroyRef.onDestroy(() => {
      this.removeEscapeListener?.();
      this.removeEscapeListener = undefined;
      try {
        this.releaseFocusTrap?.();
      } catch {
        /* ignore cleanup issues */
      }
      this.releaseFocusTrap = undefined;
      this.focusTrap.restore();
    });
  }

  private initializePermissionWatcher(): void {
    this.notificationService.permission
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(permission => {
        const granted = permission === 'granted';
        this.permissionGranted.set(granted);
        if (granted) {
          this.showPermissionBanner.set(false);
        }
      });
  }

  private initializeNotifications(): void {
    if (!this.notificationService.pushSupported) {
      return;
    }

    this.notificationService.initializeNotifications().catch(() => {
      /* ignore initialization errors */
    });
  }

  private restoreDismissedPreference(): void {
    if (!this.isBrowser) {
      return;
    }

    try {
      const dismissed = this.windowRef?.localStorage?.getItem(this.storageKey);
      if (dismissed === 'true') {
        this.showPermissionBanner.set(false);
      }
    } catch {
      /* ignore storage read */
    }
  }

  open(): void {
    if (this.isOpen()) {
      return;
    }
    this.isOpen.set(true);
  }

  close(): void {
    if (!this.isOpen()) {
      return;
    }
    this.isOpen.set(false);
  }

  toggle(): void {
    this.isOpen.update(value => !value);
  }

  async requestPermission(): Promise<void> {
    try {
      const permission = await this.notificationService.requestPermission();
      if (permission === 'granted') {
        this.showPermissionBanner.set(false);
      }
    } catch (error) {
    }
  }

  dismissPermissionBanner(): void {
    this.showPermissionBanner.set(false);
    if (!this.isBrowser) {
      return;
    }
    try {
      this.windowRef?.localStorage?.setItem(this.storageKey, 'true');
    } catch {
      /* ignore storage write */
    }
  }

  async sendTestNotification(): Promise<void> {
    try {
      await this.notificationService.sendTestNotification();
    } catch (error) {
    }
  }

  markAllAsRead(): void {
    this.notificationService.markAllAsRead();
  }

  clearAll(): void {
    this.notificationService.clearNotificationHistory();
  }

  handleNotificationClick(notification: NotificationHistory): void {
    // Mark as read if not already
    if (!notification.clicked) {
      // This would be handled by the service
    }

    // Handle notification action based on type
    if (notification.data) {
      this.executeAction(notification);
    }
  }

  executeAction(notification: NotificationHistory): void {
    const data = notification.data;
    
    switch (notification.type) {
      case 'payment_due':
      case 'gnv_overage':
        if (data?.payment_link) {
          this.windowRef?.open?.(data.payment_link, '_blank', 'noopener');
        }
        break;

      case 'document_pending':
        if (data?.client_id) {
          this.router.navigate(['/clientes', data.client_id], { fragment: 'documentos' });
        }
        break;
        
      case 'contract_approved':
        if (data?.client_id) {
          this.router.navigate(['/clientes', data.client_id]);
        }
        break;
        
      default:
        if (data?.action_url) {
          const actionUrl = data.action_url;
          if (/^https?:\/\//i.test(actionUrl)) {
            this.windowRef?.open?.(actionUrl, '_blank', 'noopener');
          } else {
            this.router.navigateByUrl(actionUrl);
          }
        }
    }
  }

  hasAction(notification: NotificationHistory): boolean {
    const data = notification.data;
    return !!(data?.payment_link || data?.action_url || data?.client_id);
  }

  getActionLabel(notification: NotificationHistory): string {
    switch (notification.type) {
      case 'payment_due':
      case 'gnv_overage':
        return 'Pagar';
      case 'document_pending':
        return 'Ver docs';
      case 'contract_approved':
        return 'Ver contrato';
      default:
        return 'Ver';
    }
  }

  getNotificationIcon(type: string): IconName {
    switch (type) {
      case 'payment_due':
      case 'gnv_overage':
        return 'currency-dollar';
      case 'document_pending':
        return 'document-text';
      case 'contract_approved':
        return 'check-circle';
      case 'general':
        return 'information-circle';
      default:
        return 'bell';
    }
  }

  getTypeLabel(type: string): string {
    switch (type) {
      case 'payment_due':
        return 'Pago';
      case 'gnv_overage':
        return 'GNV';
      case 'document_pending':
        return 'Docs';
      case 'contract_approved':
        return 'Contrato';
      case 'general':
        return 'General';
      default:
        return type.toUpperCase();
    }
  }

  getTimeString(notification: NotificationHistory): string {
    // Try sent_at first (legacy field), then timestamp (new field)
    const timeValue = notification.sent_at || notification.timestamp;
    if (timeValue instanceof Date) {
      return timeValue.toISOString();
    }
    return String(timeValue || new Date().toISOString());
  }

  formatTime(timestamp: string): string {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now.getTime() - time.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Ahora';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    
    return time.toLocaleDateString('es-MX', { 
      month: 'short', 
      day: 'numeric' 
    });
  }

  trackByNotificationId(index: number, notification: NotificationHistory): string {
    return notification.id;
  }
}
