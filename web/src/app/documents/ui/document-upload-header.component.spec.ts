import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DocumentUploadHeaderComponent } from './document-upload-header.component';
import { DocumentCompletionStatus } from '../types/document-upload.models';

describe('DocumentUploadHeaderComponent', () => {
  let component: DocumentUploadHeaderComponent;
  let fixture: ComponentFixture<DocumentUploadHeaderComponent>;

  const completion: DocumentCompletionStatus = {
    totalDocs: 4,
    completedDocs: 3,
    pendingDocs: 1,
    completionPercentage: 75,
    allComplete: false
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DocumentUploadHeaderComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(DocumentUploadHeaderComponent);
    component = fixture.componentInstance;
    component.completionStatus = completion;
    component.pendingOfflineDocs = 2;
    fixture.detectChanges();
  });

  it('should render progress counters and queued docs', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-cy="documents-progress"]')?.textContent).toContain('3/4');
    expect(compiled.querySelector('[data-cy="doc-queued-count"]')?.textContent).toContain('2');
  });

  it('should show demo/real badge', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.document-upload__data-badge')?.textContent).toContain('REAL');

    fixture.componentRef.setInput('isDemo', true);
    fixture.detectChanges();
    expect(compiled.querySelector('.document-upload__data-badge')?.textContent).toContain('DEMO');
  });

  it('should hide queued indicator when there are no offline docs', () => {
    fixture.componentRef.setInput('pendingOfflineDocs', 0);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-cy="doc-queued-count"]')).toBeNull();
  });
});
