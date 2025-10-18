import { Component, Inject } from '@angular/core';
import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { PLATFORM_ID } from '@angular/core';
import { IconComponent } from '@shared/icon/icon.component';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [CommonModule, RouterModule, IconComponent],
  templateUrl: './not-found.component.html',
  styleUrls: ['./not-found.component.scss']
})
export class NotFoundComponent {
  private readonly isBrowser: boolean;
  private readonly windowRef: (Window & typeof globalThis) | null;

  constructor(
    private router: Router,
    @Inject(DOCUMENT) documentRef: Document,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
    this.windowRef = this.isBrowser ? (documentRef.defaultView as any) : null;
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

  openHelp(): void {
    // Open help documentation or modal
    // This would typically open a help modal or navigate to help section
  }

  contactSupport(): void {
    // Open support contact form or redirect to support
    // This would typically open a support chat or contact form
    this.windowRef?.open?.('mailto:soporte@conductores.com?subject=Ayuda con navegación', '_blank');
  }
}
