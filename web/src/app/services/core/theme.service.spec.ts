import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';

import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let documentMock: Document;
  let htmlElement: HTMLElement;
  let windowMock: Window & typeof globalThis;

  beforeEach(() => {
    htmlElement = document.createElement('html');
    windowMock = {
      matchMedia: jasmine.createSpy('matchMedia').and.returnValue({
        matches: false,
        addEventListener: jasmine.createSpy('addEventListener'),
        removeEventListener: jasmine.createSpy('removeEventListener')
      }),
      localStorage: {
        getItem: jasmine.createSpy('getItem').and.returnValue(null),
        setItem: jasmine.createSpy('setItem')
      }
    } as unknown as Window & typeof globalThis;

    documentMock = {
      documentElement: htmlElement,
      defaultView: windowMock,
      querySelectorAll: jasmine.createSpy('querySelectorAll').and.returnValue([])
    } as unknown as Document;

    TestBed.configureTestingModule({
      providers: [
        ThemeService,
        { provide: DOCUMENT, useValue: documentMock },
        { provide: PLATFORM_ID, useValue: 'browser' }
      ]
    });
  });

  function createService(): ThemeService {
    return TestBed.inject(ThemeService);
  }

  it('uses stored preference when available', () => {
    (windowMock.localStorage.getItem as jasmine.Spy).and.returnValue('true');

    const service = createService();

    expect(service.isDarkMode()).toBeTrue();
    expect(htmlElement.classList.contains('dark')).toBeTrue();
  });

  it('toggles theme and persists preference', () => {
    const service = createService();

    expect(service.isDarkMode()).toBeFalse();

    service.toggle();

    expect(service.isDarkMode()).toBeTrue();
    expect(htmlElement.classList.contains('dark')).toBeTrue();
    expect(windowMock.localStorage.setItem).toHaveBeenCalledWith('darkMode', 'true');
  });
});
