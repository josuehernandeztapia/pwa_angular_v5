import { TestBed } from '@angular/core/testing';
import { DocumentTandaBannerComponent } from './document-tanda-banner.component';

describe('DocumentTandaBannerComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DocumentTandaBannerComponent]
    });
  });

  it('maps processing status to an in-progress label', () => {
    const fixture = TestBed.createComponent(DocumentTandaBannerComponent);
    fixture.componentInstance.visible = true;
    fixture.componentInstance.status = 'processing';
    fixture.detectChanges();

    const label = fixture.componentInstance.statusLabel;
    expect(label).toBe('En proceso');
  });
});
