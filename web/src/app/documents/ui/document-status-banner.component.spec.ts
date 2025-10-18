import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DocumentStatusBannerComponent } from './document-status-banner.component';

function textContent(fixture: ComponentFixture<any>): string {
  return fixture.nativeElement.textContent.replace(/\s+/g, ' ').trim();
}

describe('DocumentStatusBannerComponent', () => {
  let fixture: ComponentFixture<DocumentStatusBannerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DocumentStatusBannerComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(DocumentStatusBannerComponent);
  });

  it('renders queued message with pending count', () => {
    const component = fixture.componentInstance;
    component.type = 'queued';
    component.pendingOfflineDocs = 3;
    fixture.detectChanges();

    expect(textContent(fixture)).toContain('3 documento(s) pendientes');
  });

  it('does not render when type is null', () => {
    const component = fixture.componentInstance;
    component.type = null;
    fixture.detectChanges();

    expect(textContent(fixture)).toBe('');
  });
});
