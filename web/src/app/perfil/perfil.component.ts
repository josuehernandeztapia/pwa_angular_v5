import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { AuthService, User } from '@core-services/auth.service';
import { FlowContextService } from '@core-services/flow-context.service';
import { UserPreferencesService } from '@core-services/user-preferences.service';
import { ThemeService } from '@core-services/theme.service';
import { AnalyticsService } from '@core-services/analytics.service';
import { IconComponent } from '@shared/icon/icon.component';

@Component({
  selector: 'app-perfil',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './perfil.component.html',
  styleUrls: ['./perfil.component.scss']
})
export class PerfilComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly flowContext = inject(FlowContextService);
  private readonly preferences = inject(UserPreferencesService);
  private readonly theme = inject(ThemeService);
  private readonly analytics = inject(AnalyticsService);
  private readonly destroyRef = inject(DestroyRef);

  readonly user = signal<User | null>(null);
  readonly fontScale = this.preferences.fontScale;
  readonly isHighContrast = this.preferences.isHighContrast;
  readonly isDarkMode = this.theme.isDarkMode;

  readonly initials = computed(() => {
    const current = this.user();
    if (!current?.name) {
      return 'UX';
    }
    return current.name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part.charAt(0).toUpperCase())
      .join('');
  });

  readonly availableFontScales: ReadonlyArray<{ id: 'sm' | 'base' | 'lg'; label: string; description: string }> = [
    { id: 'sm', label: 'Compacto', description: 'Mayor densidad para monitores grandes.' },
    { id: 'base', label: 'Equilibrado', description: 'Recomendado para uso diario.' },
    { id: 'lg', label: 'Accesible', description: 'Lectura rápida en field devices.' }
  ];

  ngOnInit(): void {
    this.flowContext.setBreadcrumbs(['Configuración', 'Perfil']);

    this.auth.currentUser$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(user => this.user.set(user));

    this.analytics.track('profile_settings_viewed');
  }

  setFontScale(scale: 'sm' | 'base' | 'lg'): void {
    this.preferences.setFontScale(scale);
    this.analytics.track('profile_font_scale_updated', { scale });
  }

  toggleHighContrast(): void {
    const next = !this.isHighContrast();
    this.preferences.setHighContrast(next);
    this.analytics.track('profile_high_contrast_toggled', { enabled: next });
  }

  toggleDarkMode(): void {
    this.theme.toggle();
    this.analytics.track('profile_dark_mode_toggled', { enabled: this.isDarkMode() });
  }
}
