import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, Optional, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IconComponent } from '@shared/icon/icon.component';
import { AuthResponse, AuthService } from '@core-services/auth.service';
import { FlowContextService } from '@core-services/flow-context.service';

interface DemoUser {
  email: string;
  role: string;
  name: string;
}

type LoginFormValue = {
  email: string;
  password: string;
  rememberMe: boolean;
};

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IconComponent],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  readonly showPassword = signal(false);
  readonly isLoading = signal(false);
  readonly errorMessage = signal('');
  readonly demoUsers = signal<DemoUser[]>([]);

  private readonly fallbackDemoUsers: DemoUser[] = [
    { email: 'asesor@conductores.com', role: 'asesor', name: 'Ana Torres' },
    { email: 'supervisor@conductores.com', role: 'supervisor', name: 'Carlos Mendez' },
    { email: 'admin@conductores.com', role: 'admin', name: 'Maria Rodriguez' }
  ];

  readonly loginForm: FormGroup;

  constructor(
    private readonly fb: FormBuilder,
    private readonly router: Router,
    private readonly authService: AuthService,
    @Optional() private readonly flowContext?: FlowContextService
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      rememberMe: [false]
    });

    this.demoUsers.set([...this.fallbackDemoUsers]);
  }

  ngOnInit(): void {
    this.flowContext?.setBreadcrumbs(['Login']);
    this.loadDemoUsers();
  }

  togglePassword(): void {
    this.showPassword.update(current => !current);
  }

  onPasswordPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const pastedData = event.clipboardData?.getData('text') || '';
    this.loginForm.get('password')?.setValue(pastedData);
    this.errorMessage.set('');
  }

  onEmailPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const pastedData = event.clipboardData?.getData('text') || '';
    this.loginForm.get('email')?.setValue(pastedData);
    this.errorMessage.set('');
  }

  isFieldInvalid(field: string): boolean {
    const control = this.loginForm.get(field);
    return !!(control && control.invalid && (control.dirty || control.touched));
  }

  onSubmit(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');

    const { email, password, rememberMe } = this.loginForm.getRawValue() as LoginFormValue;

    this.authService.login({ email, password, rememberMe })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response: AuthResponse) => {
          this.isLoading.set(false);
          if (response && response.user && response.token) {
            if (rememberMe) {
              localStorage.setItem('rememberLogin', 'true');
            }
            this.flowContext?.clearContext('login-error', false);
            this.router.navigate(['/dashboard']);
            return;
          }
          this.errorMessage.set('Error en la respuesta del servidor. Intente nuevamente.');
        },
        error: (error: unknown) => {
          this.isLoading.set(false);
          const message = error instanceof Error ? error.message?.trim() : '';
          const friendly = message ? message : 'Credenciales incorrectas. Verifique su email y contraseña.';
          this.errorMessage.set(friendly);
          this.flowContext?.saveContext('login-error', { message: friendly }, { persist: false });
        }
      });
  }

  private loadDemoUsers(): void {
    this.authService.getDemoUsers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response: { users?: DemoUser[] } | null) => {
          const users = response?.users?.length ? response.users : this.fallbackDemoUsers;
          this.demoUsers.set([...users]);
        },
        error: (error: unknown) => {
          console.warn('Failed to load demo users:', error);
          this.demoUsers.set([...this.fallbackDemoUsers]);
        }
      });
  }

  selectDemoUser(user: DemoUser): void {
    this.loginForm.patchValue({
      email: user.email,
      password: this.getDemoPassword(user.role),
      rememberMe: false
    });
    this.errorMessage.set('');
  }

  private getDemoPassword(role: DemoUser['role'] | string): string {
    switch (role) {
      case 'asesor':
        return 'demo123';
      case 'supervisor':
        return 'super123';
      case 'admin':
        return 'admin123';
      default:
        return 'demo123';
    }
  }

  performLogin(credentials: { email: string; password: string }): void {
    this.loginForm.patchValue({
      email: credentials.email,
      password: credentials.password,
      rememberMe: false
    });
    this.errorMessage.set('');
    this.onSubmit();
  }
}
