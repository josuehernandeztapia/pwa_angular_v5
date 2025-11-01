import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AviPrerequisitesComponent } from './avi-prerequisites.component';
import { AviReadinessSnapshot } from '@feature-services/avi/avi-eligibility.service';

const buildSnapshot = (overrides: Partial<AviReadinessSnapshot> = {}): AviReadinessSnapshot => ({
  isAviRequired: true,
  isEligible: false,
  completionRatio: 0.5,
  completedCount: 1,
  totalCount: 2,
  pendingCount: 1,
  requirements: [
    { id: 'status', label: 'Cliente listo en expediente', completed: true, required: true },
    { id: 'doc-ine', label: 'INE Vigente validado', completed: false, required: true, helpText: 'Aprueba el documento "INE Vigente".' }
  ],
  blockingReason: 'Aprueba el documento "INE Vigente".',
  ...overrides
});

describe('AviPrerequisitesComponent', () => {
  let fixture: ComponentFixture<AviPrerequisitesComponent>;
  let component: AviPrerequisitesComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AviPrerequisitesComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(AviPrerequisitesComponent);
    component = fixture.componentInstance;
  });

  it('renders pending requirements with helper text', () => {
    component.snapshot = buildSnapshot();
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    const items = Array.from(element.querySelectorAll('.avi-prerequisites__item'));
    expect(items.length).toBe(2);
    expect(items[1].textContent).toContain('INE Vigente validado');
    expect(items[1].textContent).toContain('Aprueba el documento "INE Vigente".');
  });

  it('shows completion state when all requirements are met', () => {
    component.snapshot = buildSnapshot({
      isEligible: true,
      completionRatio: 1,
      completedCount: 2,
      pendingCount: 0,
      requirements: [
        { id: 'status', label: 'Cliente listo en expediente', completed: true, required: true },
        { id: 'doc-ine', label: 'INE Vigente validado', completed: true, required: true }
      ],
      blockingReason: undefined
    });
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('.avi-prerequisites__subtitle')?.textContent).toContain('Todo listo');
    expect(element.querySelector('.avi-prerequisites__hint')).toBeNull();
  });
});
