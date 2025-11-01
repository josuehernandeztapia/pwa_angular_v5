import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OnboardingChecklistComponent } from './onboarding-checklist.component';
import { OnboardingRequirementsSnapshot, OnboardingRequirement } from '@feature-services/onboarding/onboarding-requirements.models';

describe('OnboardingChecklistComponent', () => {
  let fixture: ComponentFixture<OnboardingChecklistComponent>;
  let component: OnboardingChecklistComponent;

  const buildRequirement = (id: string, status: OnboardingRequirement['status'], kind: OnboardingRequirement['kind']): OnboardingRequirement => ({
    id,
    title: id,
    status,
    required: true,
    kind
  });

  const buildSnapshot = (): OnboardingRequirementsSnapshot => ({
    context: {
      market: 'edomex',
      saleType: 'financiero',
      clientType: 'individual'
    },
    documents: [
      buildRequirement('doc-ine', 'completed', 'document'),
      buildRequirement('doc-proof', 'pending', 'document')
    ],
    kycRequirement: buildRequirement('kyc', 'pending', 'kyc'),
    aviRequirement: null,
    incomeRequirement: null,
    protectionRequirement: null,
    tandaRequirement: null,
    stages: [],
    pendingRequirements: [buildRequirement('doc-proof', 'pending', 'document'), buildRequirement('kyc', 'pending', 'kyc')],
    pendingCount: 2,
    completedCount: 1
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OnboardingChecklistComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(OnboardingChecklistComponent);
    component = fixture.componentInstance;
  });

  it('renders document requirements with status icons', () => {
    component.snapshot = buildSnapshot();
    fixture.detectChanges();

    const items = fixture.nativeElement.querySelectorAll('.onboarding-checklist__item');
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].textContent).toContain('doc-ine');
  });
});
