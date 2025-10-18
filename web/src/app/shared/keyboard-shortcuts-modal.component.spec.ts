import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { signal } from '@angular/core';

import { KeyboardShortcutsModalComponent } from './keyboard-shortcuts-modal.component';
import { KeyboardShortcutsService, KeyboardShortcut } from '@core-services/keyboard-shortcuts.service';
import { FocusTrapService } from '@core-services/focus-trap.service';

class KeyboardShortcutsServiceStub {
  readonly isOpenSignal = signal(false);
  readonly shortcuts = signal<KeyboardShortcut[]>([
    { combo: 'Ctrl + K', description: 'Buscar', context: 'App' }
  ]);
  close = jasmine.createSpy('close');
  open = jasmine.createSpy('open');
}

class FocusTrapServiceStub {
  remember = jasmine.createSpy('remember');
  release = jasmine.createSpy('release');
  restore = jasmine.createSpy('restore');
  trap = jasmine.createSpy('trap').and.callFake(() => this.release);
}

describe('KeyboardShortcutsModalComponent', () => {
  let fixture: ComponentFixture<KeyboardShortcutsModalComponent>;
  let component: KeyboardShortcutsModalComponent;
  let shortcutsService: KeyboardShortcutsServiceStub;
  let focusTrap: FocusTrapServiceStub;

  beforeEach(async () => {
    shortcutsService = new KeyboardShortcutsServiceStub();
    focusTrap = new FocusTrapServiceStub();

    await TestBed.configureTestingModule({
      imports: [KeyboardShortcutsModalComponent],
      providers: [
        { provide: KeyboardShortcutsService, useValue: shortcutsService },
        { provide: FocusTrapService, useValue: focusTrap },
        { provide: PLATFORM_ID, useValue: 'browser' }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(KeyboardShortcutsModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('activates focus trap when modal opens', fakeAsync(() => {
    shortcutsService.isOpenSignal.set(true);
    fixture.detectChanges();
    flushMicrotasks();

    expect(focusTrap.remember).toHaveBeenCalled();
    expect(focusTrap.trap).toHaveBeenCalled();
  }));

  it('restores focus and calls close on Escape', fakeAsync(() => {
    shortcutsService.isOpenSignal.set(true);
    fixture.detectChanges();
    flushMicrotasks();

    const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
    document.dispatchEvent(escapeEvent);
    flushMicrotasks();

    expect(shortcutsService.close).toHaveBeenCalled();
    expect(focusTrap.restore).toHaveBeenCalled();
  }));

  it('closes when close button is triggered', () => {
    component.close();
    expect(shortcutsService.close).toHaveBeenCalled();
  });
});
