import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OnboardingChecklistComponent } from './onboarding-checklist.component';
import { OnboardingRequirementsSnapshot, OnboardingRequirement, AviDocumentMatchSnapshot } from '@feature-services/onboarding/onboarding-requirements.models';

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

  it('shows manual override form when AVI requirement has mismatches', () => {
    const snapshot = buildSnapshot();
    const match: AviDocumentMatchSnapshot = {
      status: 'mismatch',
      score: 0.42,
      evaluatedAt: Date.now(),
      fields: []
    };
    snapshot.aviRequirement = {
      ...buildRequirement('avi-interview', 'blocked', 'avi'),
      metadata: {
        documentMatch: match
      }
    };

    component.snapshot = snapshot;
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.onboarding-checklist__avi-form')).toBeTruthy();
  });

  it('shows override summary when AVI requirement was forced', () => {
    const snapshot = buildSnapshot();
    const match: AviDocumentMatchSnapshot = {
      status: 'mismatch',
      score: 0.42,
      evaluatedAt: Date.now(),
      fields: []
    };
    snapshot.aviRequirement = {
      ...buildRequirement('avi-interview', 'completed', 'avi'),
      metadata: {
        documentMatch: match,
        documentMatchOverride: {
          decision: 'forced',
          comment: 'Validado manualmente',
          forcedAt: Date.now()
        }
      }
    };

    component.snapshot = snapshot;
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.onboarding-checklist__avi-override')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.onboarding-checklist__avi-form')).toBeFalsy();
  });
});
