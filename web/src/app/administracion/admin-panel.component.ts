import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { environment } from '@environments/environment';
import { FlowContextService } from '@core-services/flow-context.service';
import { FlowCompletionService } from '@core-services/flow-completion.service';
import { DemoModeService } from '@core-services/demo-mode.service';
import { GlobalSearchService } from '@core-services/global-search.service';
import { NavigationService } from '@core-services/navigation.service';
import { IconComponent } from '@shared/icon/icon.component';

interface AdminFeatureFlag {
  key: string;
  enabled: boolean;
  category: 'PWA' | 'BFF' | 'Experimentos';
  description: string;
}

@Component({
  selector: 'app-admin-panel',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './admin-panel.component.html',
  styleUrls: ['./admin-panel.component.scss']
})
export class AdminPanelComponent implements OnInit {
  private readonly flowContext = inject(FlowContextService);
  private readonly flowCompletion = inject(FlowCompletionService);
  private readonly demoMode = inject(DemoModeService);
  private readonly globalSearch = inject(GlobalSearchService);
  private readonly navigation = inject(NavigationService);

  readonly search = signal('');
  readonly flags = signal<AdminFeatureFlag[]>(this.mapFlags());

  readonly filteredFlags = computed(() => {
    const term = this.search().toLowerCase();
    if (!term) {
      return this.flags();
    }
    return this.flags().filter(flag => flag.key.toLowerCase().includes(term) || flag.description.toLowerCase().includes(term));
  });

  ngOnInit(): void {
    this.flowContext.setBreadcrumbs(['Dashboard', 'Administración']);
  }

  setSearch(value: string): void {
    this.search.set(value);
  }

  async toggleFlag(flag: AdminFeatureFlag): Promise<void> {
    const newValue = !flag.enabled;

    // Update environment temporarily (in real app this would call an API)
    (environment.features as any)[flag.key] = newValue;

    // Update local state
    const updatedFlags = this.flags().map(f =>
      f.key === flag.key ? { ...f, enabled: newValue } : f
    );
    this.flags.set(updatedFlags);

    // Special handling for enableMockData flag
    if (flag.key === 'enableMockData') {
      if (newValue) {
        this.demoMode.enableDemoMode();
        await this.handleDemoDataActivation();
      } else {
        this.demoMode.enableRealData();
        this.showRealDataConfirmation();
      }
    }
  }

  private async handleDemoDataActivation(): Promise<void> {
    // Simulate demo data generation
    await new Promise(resolve => setTimeout(resolve, 1000));

    this.flowCompletion.open({
      title: 'Datos demo activados',
      description: 'Se han generado datos de prueba para facilitar el testing de la aplicación.',
      metrics: [
        { label: 'Clientes generados', value: '50', badge: 'success' },
        { label: 'Oportunidades', value: '25', badge: 'success' },
        { label: 'Cotizaciones', value: '15', badge: 'success' },
        { label: 'Documentos', value: '75', badge: 'success' }
      ],
      nextSteps: [
        'Los datos están disponibles en todos los módulos',
        'Úsalos para probar flujos completos',
        'Desactiva el flag cuando termine el testing'
      ],
      actions: [
        {
          id: 'view-clients',
          label: 'Ver clientes',
          kind: 'primary',
          execute: () => {
            // Navigate to clients list
            window.location.href = '/clientes';
          }
        },
        {
          id: 'view-opportunities',
          label: 'Ver oportunidades',
          kind: 'secondary',
          execute: () => {
            window.location.href = '/oportunidades';
          }
        },
        {
          id: 'continue-admin',
          label: 'Continuar en admin',
          kind: 'ghost',
          execute: () => {
            // Just close the overlay
          }
        }
      ],
      breadcrumbs: ['Dashboard', 'Administración', 'Demo Data'],
      dismissible: true,
      onComplete: () => {
        this.globalSearch.refreshIndex();
        this.navigation.refreshQuickActions();
      }
    });
  }

  private showRealDataConfirmation(): void {
    this.flowCompletion.open({
      title: 'Datos demo deshabilitados',
      description: 'La aplicación volverá a operar con información real. Actualizamos búsqueda y acciones rápidas automáticamente.',
      metrics: [
        { label: 'Fuente de datos', value: 'Real', badge: 'success' },
        { label: 'Mock data', value: 'Desactivado' }
      ],
      actions: [
        {
          id: 'go-dashboard',
          label: 'Ir al dashboard',
          kind: 'primary',
          execute: () => window.location.assign('/dashboard')
        },
        {
          id: 'back-admin',
          label: 'Seguir en administración',
          kind: 'ghost',
          execute: () => undefined
        }
      ],
      breadcrumbs: ['Dashboard', 'Administración', 'Demo Data'],
      onComplete: () => {
        this.globalSearch.refreshIndex();
        this.navigation.refreshQuickActions();
      }
    });
  }

  private mapFlags(): AdminFeatureFlag[] {
    const entries = Object.entries(environment.features ?? {});
    return entries.map(([key, value]) => ({
      key,
      enabled: value !== false,
      category: this.resolveCategory(key),
      description: this.describeFlag(key)
    }));
  }

  private resolveCategory(key: string): AdminFeatureFlag['category'] {
    if (key.toLowerCase().includes('bff')) {
      return 'BFF';
    }
    if (key.startsWith('enablePost') || key.startsWith('enableQa')) {
      return 'Experimentos';
    }
    return 'PWA';
  }

  private describeFlag(key: string): string {
    const dictionary: Record<string, string> = {
      enableMockData: 'Inyecta datos mock en tiempo de ejecución para flujos demo.',
      enableOfflineMode: 'Activa estrategias offline-first para colas y sincronización.',
      enablePostSalesWizard: 'Desbloquea wizard postventa de captura fotográfica.',
      enableGnvBff: 'Habilita integración con endpoints GNV en el BFF.',
      enableAdminConfig: 'Muestra módulo de administración desde el shell.',
      enableQaTools: 'Expone herramientas QA en entornos de desarrollo.'
    };
    return dictionary[key] ?? 'Sin descripción registrada aún.';
  }
}
