import { Component, Inject } from '@angular/core';
import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { PLATFORM_ID } from '@angular/core';
import { AuthService } from '@core-services/auth.service';
import { IconComponent } from '@shared/icon/icon.component';

@Component({
  selector: 'app-unauthorized',
  standalone: true,
  imports: [CommonModule, RouterModule, IconComponent],
  templateUrl: './unauthorized.component.html',
  styleUrls: ['./unauthorized.component.scss']
})
export class UnauthorizedComponent {
  currentUser$ = this.authService.currentUser$;
  currentUser = this.authService.getCurrentUser();
  readonly moduleMessage: string;

  private readonly isBrowser: boolean;
  private readonly windowRef: (Window & typeof globalThis) | null;

  constructor(
    private router: Router,
    private authService: AuthService,
    private route: ActivatedRoute,
    @Inject(DOCUMENT) documentRef: Document,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
    this.windowRef = this.isBrowser ? (documentRef.defaultView as any) : null;
    this.moduleMessage = this.resolveModuleMessage();
  }

  goHome(): void {
    this.router.navigate(['/dashboard']);
  }

  goBack(): void {
    const history = this.windowRef?.history;
    if (history && history.length > 1) {
      history.back();
    } else {
      this.goHome();
    }
  }

  getUserInitials(): string {
    if (!this.currentUser) return '??';
    
    const names = this.currentUser.name.split(' ');
    if (names.length >= 2) {
      return `${names[0][0]}${names[1][0]}`.toUpperCase();
    }
    return this.currentUser.name.substring(0, 2).toUpperCase();
  }

  getRoleLabel(role: string): string {
    const roleLabels: Record<string, string> = {
      'asesor': 'Asesor Financiero',
      'supervisor': 'Supervisor',
      'admin': 'Administrador'
    };
    return roleLabels[role] || role;
  }

  getPermissionLabel(permission: string): string {
    const permissionLabels: Record<string, string> = {
      'read:clients': 'Ver Clientes',
      'write:quotes': 'Crear Cotizaciones',
      'read:reports': 'Ver Reportes',
      'approve:quotes': 'Aprobar Cotizaciones',
      'manage:team': 'Gestionar Equipo'
    };
    return permissionLabels[permission] || permission;
  }

  contactSupervisor(): void {
    // This would typically open a contact form or send an email
    this.windowRef?.open?.('mailto:supervisor@conductores.com?subject=Solicitud de Permisos', '_blank');
  }

  viewPermissions(): void {
    // This would show a modal with detailed permissions
    const message = 'Tus permisos actuales:\n' + (this.currentUser?.permissions.join('\n') ?? 'Sin permisos registrados');
    if (this.windowRef?.alert) {
      this.windowRef.alert(message);
    } else {
      console.info(message);
    }
  }

  requestAccess(): void {
    // This would open a form to request additional access
    this.router.navigate(['/solicitar-acceso']);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  private resolveModuleMessage(): string {
    const module = this.route.snapshot.queryParamMap.get('module');
    switch (module) {
      case 'entregas':
        return 'Activa un contrato con entregas para acceder a este módulo.';
      case 'proteccion':
        return 'Completa la evaluación de protección antes de ingresar.';
      default:
        return 'No tienes los permisos necesarios para acceder a esta sección. Si crees que esto es un error, contacta a tu supervisor.';
    }
  }
}
