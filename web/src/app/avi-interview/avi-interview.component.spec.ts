import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { AVIInterviewComponent } from './avi-interview.component';
import { InterviewCheckpointService } from '@feature-services/avi/interview-checkpoint.service';
import { VoiceValidationService } from '@feature-services/avi/voice-validation.service';
import { EntitySyncService } from '@core-services/entity-sync.service';

class MockInterviewCheckpointService {
  getCheckpoint() {
    return null;
  }

  getCheckpoints() {
    return of({});
  }

  getQuestionTemplate() {
    return [];
  }
}

class MockVoiceValidationService {
  getRequiredQuestions() {
    return [];
  }
}

class MockEntitySyncService {
  recordAviStatus() {}
}

describe('AVIInterviewComponent', () => {
  let fixture: ComponentFixture<AVIInterviewComponent>;
  let component: AVIInterviewComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AVIInterviewComponent],
      providers: [
        { provide: InterviewCheckpointService, useClass: MockInterviewCheckpointService },
        { provide: VoiceValidationService, useClass: MockVoiceValidationService },
        { provide: EntitySyncService, useClass: MockEntitySyncService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AVIInterviewComponent);
    component = fixture.componentInstance;
    component.clientId = 'CL-001';
    component.advisorId = 'ADV-001';
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('emits when interview starts and completes', () => {
    const startedSpy = spyOn(component.interviewStarted, 'emit');
    const completedSpy = spyOn(component.interviewCompleted, 'emit');

    component.startInterview();
    expect(startedSpy).toHaveBeenCalled();

    component.markAllAnswered();
    component.completeInterview();

    expect(completedSpy).toHaveBeenCalled();
  });
});
