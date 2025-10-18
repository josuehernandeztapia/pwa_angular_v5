import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';

import { PerfilComponent } from './perfil.component';
import { AuthService, User } from '@core-services/auth.service';
import { FlowContextService } from '@core-services/flow-context.service';
import { UserPreferencesService } from '@core-services/user-preferences.service';
import { ThemeService } from '@core-services/theme.service';
import { AnalyticsService } from '@core-services/analytics.service';

class AuthServiceStub {
  private readonly mockUser: User = {
    id: 'mock-user',
    name: 'Test User',
    email: 'test@conductores.com',
    role: 'asesor',
    permissions: ['clients:view']
  };

  currentUser$ = of(this.mockUser);
}

class FlowContextServiceStub {
  setBreadcrumbs = jasmine.createSpy('setBreadcrumbs');
}

class UserPreferencesServiceStub {
  fontScale = signal<'sm' | 'base' | 'lg'>('base');
  isHighContrast = signal(false);
  setFontScale = jasmine.createSpy('setFontScale');
  setHighContrast = jasmine.createSpy('setHighContrast');
}

class ThemeServiceStub {
  isDarkMode = signal(false);
  toggle = jasmine.createSpy('toggle');
}

class AnalyticsServiceStub {
  track = jasmine.createSpy('track');
}

describe('PerfilComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PerfilComponent],
      providers: [
        { provide: AuthService, useClass: AuthServiceStub },
        { provide: FlowContextService, useClass: FlowContextServiceStub },
        { provide: UserPreferencesService, useClass: UserPreferencesServiceStub },
        { provide: ThemeService, useClass: ThemeServiceStub },
        { provide: AnalyticsService, useClass: AnalyticsServiceStub }
      ]
    }).compileComponents();
  });

  it('should bootstrap profile data and expose initials', () => {
    const fixture = TestBed.createComponent(PerfilComponent);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
    expect(component.initials()).toBe('TU');
  });
});
