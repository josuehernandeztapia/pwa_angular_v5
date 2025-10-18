import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { environment } from '@environments/environment';
import { FlowContextService } from '@core-services/flow-context.service';
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
