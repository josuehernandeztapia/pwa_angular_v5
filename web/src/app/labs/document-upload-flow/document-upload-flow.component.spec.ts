import { CUSTOM_ELEMENTS_SCHEMA, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { DocumentUploadFlowComponent } from './document-upload-flow.component';
import { FlowContextService } from '@core-services/flow-context.service';
import { DocumentUploadShellComponent } from '@app/documents/ui/document-upload-shell.component';

@Component({
  selector: 'app-document-upload-shell',
  standalone: true,
  template: '<p>stub shell</p>'
})
class DocumentUploadShellStubComponent {}

class RouterStub {
  navigate = jasmine.createSpy('navigate').and.returnValue(Promise.resolve(true));
}

class FlowContextStub {
  setBreadcrumbs = jasmine.createSpy('setBreadcrumbs');
}

describe('DocumentUploadFlowComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DocumentUploadFlowComponent],
      providers: [
        { provide: Router, useClass: RouterStub },
        { provide: FlowContextService, useClass: FlowContextStub }
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA]
    });

    TestBed.overrideComponent(DocumentUploadFlowComponent, {
      remove: { imports: [DocumentUploadShellComponent] },
      add: { imports: [DocumentUploadShellStubComponent] }
    });
  });

  it('renders lab shell header', () => {
    const fixture = TestBed.createComponent(DocumentUploadFlowComponent);
    fixture.detectChanges();
    const title = fixture.nativeElement.querySelector('h1');
    expect(title.textContent).toContain('Document Upload Lab');
  });

  it('navigates back to documentos on exit', () => {
    const fixture = TestBed.createComponent(DocumentUploadFlowComponent);
    const router = TestBed.inject(Router) as unknown as RouterStub;
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button');
    button.click();

    expect(router.navigate).toHaveBeenCalledWith(['/documentos']);
  });
});
