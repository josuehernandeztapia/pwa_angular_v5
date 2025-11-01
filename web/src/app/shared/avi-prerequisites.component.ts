import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import { AviReadinessSnapshot } from '@feature-services/avi/avi-eligibility.service';
import { IconComponent } from '@shared/icon/icon.component';

@Component({
  selector: 'app-avi-prerequisites',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './avi-prerequisites.component.html',
  styleUrls: ['./avi-prerequisites.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AviPrerequisitesComponent {
  @Input() title = 'Requisitos para Entrevista AVI';
  @Input() snapshot: AviReadinessSnapshot | null = null;

  get isEmpty(): boolean {
    return !this.snapshot || this.snapshot.requirements.length === 0;
  }

  get completionPercentage(): number {
    if (!this.snapshot || this.snapshot.totalCount === 0) {
      return 0;
    }
    return Math.round(this.snapshot.completionRatio * 100);
  }

  getPendingLabel(): string | null {
    if (!this.snapshot || this.snapshot.pendingCount === 0) {
      return null;
    }
    return `${this.snapshot.pendingCount} requisito${this.snapshot.pendingCount === 1 ? '' : 's'} pendiente${this.snapshot.pendingCount === 1 ? '' : 's'}`;
  }
}
