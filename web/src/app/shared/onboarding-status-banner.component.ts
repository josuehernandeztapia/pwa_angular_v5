import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import { IconComponent } from '@shared/icon/icon.component';
import { IconName } from '@shared/icon/icon-definitions';
import {
  OnboardingRequirement,
  OnboardingRequirementsSnapshot
} from '@feature-services/onboarding/onboarding-requirements.models';

@Component({
  selector: 'app-onboarding-status-banner',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './onboarding-status-banner.component.html',
  styleUrls: ['./onboarding-status-banner.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OnboardingStatusBannerComponent {
  @Input() snapshot: OnboardingRequirementsSnapshot | null = null;

  private readonly marketLabelMap: Record<string, string> = {
    edomex: 'Edo. de México',
    aguascalientes: 'Aguascalientes',
    otros: 'Otros mercados'
  };

  private readonly clientTypeLabelMap: Record<string, string> = {
    individual: 'Cliente individual',
    colectivo: 'Cliente colectivo'
  };

  private readonly saleTypeLabelMap: Record<string, string> = {
    contado: 'Venta de contado',
    financiero: 'Financiamiento'
  };

  get bannerClasses(): Record<string, boolean> {
    return {
      'onboarding-status-banner--success': this.isComplete,
      'onboarding-status-banner--warning': this.hasBlockedRequirement,
      'onboarding-status-banner--info': !this.isComplete && !this.hasBlockedRequirement
    };
  }

  get statusIcon(): IconName {
    if (this.isComplete) {
      return 'check-circle';
    }
    if (this.hasBlockedRequirement) {
      return 'alert-triangle';
    }
    return 'clock';
  }

  get headline(): string {
    if (!this.snapshot) {
      return 'Checklist no disponible';
    }
    if (this.isComplete) {
      return 'Checklist completo';
    }
    if (this.hasBlockedRequirement) {
      return 'Revisa bloqueos para continuar';
    }
    return 'Checklist en progreso';
  }

  get description(): string {
    if (!this.snapshot) {
      return 'Sin información reciente. Actualiza el contexto para ver los requisitos.';
    }

    if (this.isComplete) {
      return 'Todo listo. Puedes avanzar a contratos o formalizar la oportunidad.';
    }

    const requirement = this.nextRequirement;
    if (!requirement) {
      return 'Hay requisitos pendientes. Revisa la lista para continuar.';
    }

    if (requirement.status === 'blocked') {
      return `No puedes avanzar hasta resolver: ${requirement.title}.`;
    }

    return `Siguiente paso sugerido: ${requirement.title}.`;
  }

  get helperText(): string | null {
    const requirement = this.nextRequirement;
    if (!requirement) {
      return null;
    }
    return requirement.helpText ?? null;
  }

  get helperLink(): { label: string; url: string } | null {
    const requirement = this.nextRequirement;
    if (!requirement || !requirement.helpLink) {
      return null;
    }
    return requirement.helpLink;
  }

  get contextChips(): string[] {
    if (!this.snapshot) {
      return [];
    }

    const chips: string[] = [];
    const { market, clientType, saleType, businessFlow } = this.snapshot.context;

    if (market) {
      chips.push(this.marketLabelMap[market] ?? market);
    }
    if (clientType) {
      chips.push(this.clientTypeLabelMap[clientType] ?? clientType);
    }
    if (saleType) {
      chips.push(this.saleTypeLabelMap[saleType] ?? saleType);
    }
    if (businessFlow) {
      chips.push(`Flujo: ${businessFlow}`);
    }

    return chips;
  }

  get isComplete(): boolean {
    return !!this.snapshot && this.snapshot.pendingCount === 0;
  }

  get nextRequirement(): OnboardingRequirement | null {
    if (!this.snapshot || this.snapshot.pendingRequirements.length === 0) {
      return null;
    }
    return this.snapshot.pendingRequirements[0];
  }

  private get hasBlockedRequirement(): boolean {
    return !!this.snapshot && this.snapshot.pendingRequirements.some(req => req.status === 'blocked');
  }
}
