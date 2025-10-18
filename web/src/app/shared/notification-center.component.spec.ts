import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { Router } from '@angular/router';
import { PLATFORM_ID } from '@angular/core';

import { NotificationCenterComponent } from './notification-center.component';
import { PushNotificationService } from '@core-services/push-notification.service';
import { FocusTrapService } from '@core-services/focus-trap.service';
import { NotificationHistory } from '@interfaces/notification';

class PushNotificationServiceStub {
  private notificationsSubject = new BehaviorSubject<NotificationHistory[]>([]);
  private unreadCountSubject = new BehaviorSubject<number>(0);
  private permissionSubject = new BehaviorSubject<NotificationPermission>('default');

  readonly permission = this.permissionSubject.asObservable();
  readonly notificationHistory = this.notificationsSubject.asObservable();
  readonly unreadCount$ = this.unreadCountSubject.asObservable();
  readonly pushSupported: boolean = true;

  setNotifications(notifications: NotificationHistory[]): void {
    this.notificationsSubject.next(notifications);
  }

  setUnreadCount(count: number): void {
    this.unreadCountSubject.next(count);
  }

  getUnreadCount(): BehaviorSubject<number> {
    return this.unreadCountSubject;
  }

  requestPermission(): Promise<NotificationPermission> {
    this.permissionSubject.next('granted');
    return Promise.resolve('granted');
  }

  initializeNotifications(): Promise<void> {
    return Promise.resolve();
  }

  sendTestNotification(): Promise<void> {
    return Promise.resolve();
  }

  markAsRead(id: string): void {
    // Mock implementation
  }

  clearAll(): void {
    this.notificationsSubject.next([]);
    this.unreadCountSubject.next(0);
  }
}

class RouterStub {
  navigate = jasmine.createSpy('navigate');
}

class FocusTrapServiceStub {
  trap = jasmine.createSpy('trap').and.returnValue(() => {});
  release = jasmine.createSpy('release');
  remember = jasmine.createSpy('remember');
  restore = jasmine.createSpy('restore');
}

describe('NotificationCenterComponent', () => {
  let component: NotificationCenterComponent;
  let fixture: ComponentFixture<NotificationCenterComponent>;
  let pushNotificationService: PushNotificationServiceStub;

  beforeEach(async () => {
    pushNotificationService = new PushNotificationServiceStub();

    await TestBed.configureTestingModule({
      imports: [NotificationCenterComponent],
      providers: [
        { provide: PushNotificationService, useValue: pushNotificationService },
        { provide: Router, useClass: RouterStub },
        { provide: FocusTrapService, useClass: FocusTrapServiceStub },
        { provide: PLATFORM_ID, useValue: 'browser' }
      ]
    }).compileComponents();

    TestBed.runInInjectionContext(() => {
      fixture = TestBed.createComponent(NotificationCenterComponent);
    });
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with closed state', () => {
    expect(component.isOpen()).toBeFalse();
  });

  it('should toggle panel visibility', () => {
    expect(component.isOpen()).toBeFalse();

    component.toggle();
    expect(component.isOpen()).toBeTrue();

    component.toggle();
    expect(component.isOpen()).toBeFalse();
  });

  it('should handle notification permission requests', async () => {
    spyOn(pushNotificationService, 'requestPermission').and.callThrough();

    await component.requestPermission();
    fixture.detectChanges();

    expect(pushNotificationService.requestPermission).toHaveBeenCalled();
    expect(component.permissionGranted()).toBeTrue();
    expect(component.showPermissionBanner()).toBeFalse();
  });
});
