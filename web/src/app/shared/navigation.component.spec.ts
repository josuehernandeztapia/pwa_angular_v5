import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NavigationComponent } from './navigation.component';
import { PushNotificationService } from '@core-services/push-notification.service';
import { UserPreferencesService } from '@core-services/user-preferences.service';
import { NavigationService, ShellNavigationItem } from '@core-services/navigation.service';
import { FlowContextService } from '@core-services/flow-context.service';
import { DemoModeService } from '@core-services/demo-mode.service';
import { DemoAnalyticsService } from '@services/demo/demo-analytics.service';
import { BehaviorSubject, of } from 'rxjs';
import { RouterTestingModule } from '@angular/router/testing';
import { signal } from '@angular/core';
import { DemoScenarioId } from '@services/demo/demo-scenarios';

class PushNotificationStub {
  readonly notificationHistory = of([]);
  readonly permission = new BehaviorSubject<NotificationPermission>('default');
  readonly pushSupported = true;

  getUnreadCount() {
    return of(0);
  }

  initializeNotifications() {
    return Promise.resolve();
  }

  requestPermission(): Promise<NotificationPermission> {
    const next = 'granted' as NotificationPermission;
    this.permission.next(next);
    return Promise.resolve(next);
  }
}

class UserPreferencesStub {
  private scale: 'base' | 'sm' | 'lg' = 'base';
  private contrast = false;

  getFontScale() {
    return this.scale;
  }

  setFontScale(scale: 'base' | 'sm' | 'lg') {
    this.scale = scale;
  }

  getHighContrast() {
    return this.contrast;
  }

  setHighContrast(value: boolean) {
    this.contrast = value;
  }
}

class NavigationServiceStub {
  getShellNavigationItems(): ShellNavigationItem[] {
    return [
      { label: 'Dashboard', route: '/dashboard', iconType: 'home' },
      { label: 'Simulador', route: '/simulador', iconType: 'target' },
      { label: 'Documentos', route: '/documentos', iconType: 'document' }
    ];
  }
}

class DemoModeStub {
  private readonly demoSignal = signal(false);
  private readonly demoSubject = new BehaviorSubject<boolean>(this.demoSignal());
  readonly isDemoMode = this.demoSignal.asReadonly();
  readonly isDemoMode$ = this.demoSubject.asObservable();
  activeScenario: DemoScenarioId | null = null;

  enableDemoMode(): void {
    this.demoSignal.set(true);
    this.demoSubject.next(true);
  }

  enableRealData(): void {
    this.demoSignal.set(false);
    this.demoSubject.next(false);
  }

  setScenario(id: DemoScenarioId | null): void {
    this.activeScenario = id;
  }
}

class DemoAnalyticsStub {
  track = jasmine.createSpy('track');
  trackFlowStart = jasmine.createSpy('trackFlowStart');
}

describe('NavigationComponent (demo shortcuts)', () => {
  let component: NavigationComponent;
  let fixture: ComponentFixture<NavigationComponent>;
  let demoMode: DemoModeStub;
  let analytics: DemoAnalyticsStub;

  beforeEach(async () => {
    demoMode = new DemoModeStub();
    analytics = new DemoAnalyticsStub();

    await TestBed.configureTestingModule({
      imports: [NavigationComponent, RouterTestingModule],
      providers: [
        { provide: PushNotificationService, useClass: PushNotificationStub },
        { provide: UserPreferencesService, useClass: UserPreferencesStub },
        { provide: NavigationService, useClass: NavigationServiceStub },
        { provide: FlowContextService, useValue: null },
        { provide: DemoModeService, useValue: demoMode },
        { provide: DemoAnalyticsService, useValue: analytics }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(NavigationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('adds demo shortcuts when demo mode is enabled', () => {
    expect(component.demoShortcuts.length).toBe(0);

    demoMode.enableDemoMode();
    fixture.detectChanges();

    const aviShortcut = component.demoShortcuts.find(item => item.dataCy === 'nav-demo-avi-test');
    const kycShortcut = component.demoShortcuts.find(item => item.dataCy === 'nav-demo-kyc-test');

    expect(aviShortcut).toBeDefined();
    expect(kycShortcut).toBeDefined();
    expect(aviShortcut?.tooltip).toContain('flujo demo de AVI');
    expect(kycShortcut?.tooltip).toContain('flujo demo de KYC');
  });

  it('navigating demo shortcut sets scenario and emits analytics', () => {
    demoMode.enableDemoMode();
    fixture.detectChanges();

    const aviItem = component.demoShortcuts.find(item => item.dataCy === 'nav-demo-avi-test');
    expect(aviItem).toBeDefined();

    component.navigate(aviItem!);

    expect(demoMode.activeScenario).toBe('avi-perfecto');
    expect(analytics.track).toHaveBeenCalledWith('avi_test_shortcut', jasmine.objectContaining({
      scenario: 'avi-perfecto',
      route: '/demo/avi-test',
      source: 'sidebar'
    }));
  });
});
