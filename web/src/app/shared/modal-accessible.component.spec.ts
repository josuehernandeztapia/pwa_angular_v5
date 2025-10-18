import { Component } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { ModalAccessibleComponent } from './modal-accessible.component';
import { FocusTrapService } from '@core-services/focus-trap.service';

class FocusTrapServiceStub {
  remember = jasmine.createSpy('remember');
  release = jasmine.createSpy('release');
  restore = jasmine.createSpy('restore');
  trap = jasmine.createSpy('trap').and.callFake(() => this.release);
}

@Component({
  standalone: true,
  imports: [ModalAccessibleComponent],
  template: `
    <app-modal-accessible
      [open]="isOpen"
      (closed)="handleClosed()"
      title="Demo"
    >
      <div modal-body>Body</div>
    </app-modal-accessible>
  `
})
class ModalHostComponent {
  isOpen = false;

  handleClosed(): void {
    this.isOpen = false;
  }
}

describe('ModalAccessibleComponent', () => {
  let fixture: ComponentFixture<ModalHostComponent>;
  let host: ModalHostComponent;
  let focusTrap: FocusTrapServiceStub;

  beforeEach(async () => {
    focusTrap = new FocusTrapServiceStub();

    await TestBed.configureTestingModule({
      imports: [ModalHostComponent],
      providers: [{ provide: FocusTrapService, useValue: focusTrap }]
    }).compileComponents();

    fixture = TestBed.createComponent(ModalHostComponent);
    host = fixture.componentInstance;
  });

  function modalComponent(): ModalAccessibleComponent {
    return fixture.debugElement.query(By.directive(ModalAccessibleComponent)).componentInstance as ModalAccessibleComponent;
  }

  it('traps focus when opened', fakeAsync(() => {
    host.isOpen = true;
    fixture.detectChanges();
    flushMicrotasks();

    expect(focusTrap.remember).toHaveBeenCalled();
    expect(focusTrap.trap).toHaveBeenCalled();
  }));

  it('restores focus and emits close on Escape key', fakeAsync(() => {
    const closedSpy = jasmine.createSpy('closed');
    modalComponent().closed.subscribe(closedSpy);

    host.isOpen = true;
    fixture.detectChanges();
    flushMicrotasks();

    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    document.dispatchEvent(event);
    fixture.detectChanges(); // Trigger change detection to propagate the [open] input change
    flushMicrotasks();

    expect(closedSpy).toHaveBeenCalled();

    // Close the modal to trigger teardown and restore
    host.isOpen = false;
    fixture.detectChanges();
    flushMicrotasks();

    expect(focusTrap.restore).toHaveBeenCalled();
  }));
});
