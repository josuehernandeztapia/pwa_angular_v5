import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DocumentIncomeBannerComponent } from './document-income-banner.component';

describe('DocumentIncomeBannerComponent', () => {
  let fixture: ComponentFixture<DocumentIncomeBannerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DocumentIncomeBannerComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(DocumentIncomeBannerComponent);
  });

  it('displays message when visible', () => {
    const component = fixture.componentInstance;
    component.visible = true;
    component.message = 'Revisa ingresos';
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Revisa ingresos');
  });

  it('emits dismiss event', () => {
    const component = fixture.componentInstance;
    component.visible = true;
    fixture.detectChanges();

    spyOn(component.dismiss, 'emit');
    fixture.nativeElement.querySelector('button').click();
    expect(component.dismiss.emit).toHaveBeenCalled();
  });
});
