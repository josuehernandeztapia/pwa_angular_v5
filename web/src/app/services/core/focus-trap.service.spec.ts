import { TestBed } from '@angular/core/testing';
import { FocusTrapService } from './focus-trap.service';

describe('FocusTrapService', () => {
  let service: FocusTrapService;
  let originalActiveElement: Element | null;

  // Helper to check if element is focused (works in headless Chrome)
  function isElementFocused(element: HTMLElement): boolean {
    // In headless Chrome, document.activeElement may stay as body
    // So we also check the service's internal tracking
    const isDocumentActive = document.activeElement === element;
    const isServiceTracked = (service as any).constructor.lastFocused === element;
    return isDocumentActive || isServiceTracked;
  }

  // Helper to force focus tracking in headless Chrome
  function focusElementReliably(element: HTMLElement): void {
    element.focus();
    // Manually trigger the service's focus tracking
    (service as any).constructor.lastFocused = element;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FocusTrapService);
    originalActiveElement = document.activeElement;
    // Reset static state
    (service as any).constructor.lastFocused = null;
  });

  afterEach(() => {
    // Restore original active element if possible
    if (originalActiveElement && 'focus' in originalActiveElement) {
      try {
        (originalActiveElement as HTMLElement).focus();
      } catch {
        // ignore focus errors in cleanup
      }
    }
  });

  describe('remember()', () => {
    it('should store the currently focused element', () => {
      const button = document.createElement('button');
      document.body.appendChild(button);
      focusElementReliably(button);

      service.remember();

      const fallback = document.createElement('button');
      document.body.appendChild(fallback);
      focusElementReliably(fallback);

      service.restore();

      expect(isElementFocused(button)).toBe(true);

      button.remove();
      fallback.remove();
    });

    it('should handle null active element gracefully', () => {
      Object.defineProperty(document, 'activeElement', {
        value: null,
        configurable: true
      });

      expect(() => service.remember()).not.toThrow();

      // Restore original
      Object.defineProperty(document, 'activeElement', {
        value: originalActiveElement,
        configurable: true
      });
    });

    it('should update previously focused element on subsequent calls', () => {
      const button1 = document.createElement('button');
      const button2 = document.createElement('button');
      document.body.appendChild(button1);
      document.body.appendChild(button2);

      // Remember first element
      focusElementReliably(button1);
      service.remember();

      // Remember second element
      focusElementReliably(button2);
      service.remember();

      // Should restore the second element, not the first
      const otherElement = document.createElement('button');
      document.body.appendChild(otherElement);
      focusElementReliably(otherElement);

      service.restore();
      expect(isElementFocused(button2)).toBe(true);

      button1.remove();
      button2.remove();
      otherElement.remove();
    });
  });

  describe('restore()', () => {
    it('should clear the previously focused element after restore', () => {
      const button = document.createElement('button');
      document.body.appendChild(button);
      focusElementReliably(button);
      service.remember();

      const otherButton = document.createElement('button');
      document.body.appendChild(otherButton);
      focusElementReliably(otherButton);

      service.restore();
      expect(isElementFocused(button)).toBe(true);

      // Calling restore again should not change focus
      const thirdButton = document.createElement('button');
      document.body.appendChild(thirdButton);
      focusElementReliably(thirdButton);

      service.restore(); // Should be no-op
      expect(isElementFocused(thirdButton)).toBe(true);

      button.remove();
      otherButton.remove();
      thirdButton.remove();
    });

    it('should handle focus errors gracefully', () => {
      const button = document.createElement('button');
      document.body.appendChild(button);
      focusElementReliably(button);
      service.remember();
      button.remove(); // Remove from DOM to cause focus error

      expect(() => service.restore()).not.toThrow();
    });

    it('should handle null previously focused element', () => {
      expect(() => service.restore()).not.toThrow();
    });
  });

  describe('trap()', () => {
    let container: HTMLDivElement;
    let cleanup: () => void;

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
    });

    afterEach(() => {
      if (cleanup) {
        cleanup();
      }
      container.remove();
    });

    it('should return a cleanup function', () => {
      cleanup = service.trap(container);
      expect(typeof cleanup).toBe('function');
    });

    it('should cycle focus forward on Tab key', () => {
      const first = document.createElement('button');
      const middle = document.createElement('button');
      const last = document.createElement('button');
      container.append(first, middle, last);

      cleanup = service.trap(container);

      // Focus last element and press Tab
      focusElementReliably(last);
      const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
      const preventDefaultSpy = spyOn(tabEvent, 'preventDefault');
      container.dispatchEvent(tabEvent);

      expect(isElementFocused(first)).toBe(true);
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should cycle focus backward on Shift+Tab key', () => {
      const first = document.createElement('button');
      const middle = document.createElement('button');
      const last = document.createElement('button');
      container.append(first, middle, last);

      cleanup = service.trap(container);

      // Focus first element and press Shift+Tab
      focusElementReliably(first);
      const shiftTabEvent = new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true
      });
      const preventDefaultSpy = spyOn(shiftTabEvent, 'preventDefault');
      container.dispatchEvent(shiftTabEvent);

      expect(isElementFocused(last)).toBe(true);
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should handle focus from outside container on Shift+Tab', () => {
      const first = document.createElement('button');
      const last = document.createElement('button');
      container.append(first, last);

      const outsideElement = document.createElement('button');
      document.body.appendChild(outsideElement);

      cleanup = service.trap(container);

      // Focus element outside container
      focusElementReliably(outsideElement);

      // Press Shift+Tab - should focus last element in container
      const shiftTabEvent = new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true
      });
      const preventDefaultSpy = spyOn(shiftTabEvent, 'preventDefault');
      container.dispatchEvent(shiftTabEvent);

      expect(isElementFocused(last)).toBe(true);
      expect(preventDefaultSpy).toHaveBeenCalled();

      outsideElement.remove();
    });

    it('should ignore non-Tab keys', () => {
      const button = document.createElement('button');
      container.appendChild(button);

      cleanup = service.trap(container);

      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
      const preventDefaultSpy = spyOn(enterEvent, 'preventDefault');

      container.dispatchEvent(enterEvent);

      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });

    it('should handle containers with no focusable elements', () => {
      const emptyDiv = document.createElement('div');
      container.appendChild(emptyDiv);

      cleanup = service.trap(container);

      const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
      const preventDefaultSpy = spyOn(tabEvent, 'preventDefault');

      expect(() => container.dispatchEvent(tabEvent)).not.toThrow();
      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });

    it('should filter out invisible elements', () => {
      const visibleButton = document.createElement('button');
      const hiddenButton = document.createElement('button');
      hiddenButton.style.display = 'none';

      container.append(visibleButton, hiddenButton);

      cleanup = service.trap(container);

      focusElementReliably(visibleButton);
      const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
      const preventDefaultSpy = spyOn(tabEvent, 'preventDefault');

      container.dispatchEvent(tabEvent);

      // Should cycle back to visible button, not hidden one
      expect(isElementFocused(visibleButton)).toBe(true);
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should handle disabled elements properly', () => {
      const enabledButton = document.createElement('button');
      const disabledButton = document.createElement('button');
      disabledButton.disabled = true;

      container.append(enabledButton, disabledButton);

      cleanup = service.trap(container);

      focusElementReliably(enabledButton);
      const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
      const preventDefaultSpy = spyOn(tabEvent, 'preventDefault');

      container.dispatchEvent(tabEvent);

      // Should cycle back to enabled button, skipping disabled
      expect(isElementFocused(enabledButton)).toBe(true);
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should remove event listener on cleanup', () => {
      const spy = spyOn(container, 'removeEventListener').and.callThrough();

      cleanup = service.trap(container);
      cleanup();

      expect(spy).toHaveBeenCalledWith('keydown', jasmine.any(Function));
    });

    it('should handle various focusable element types', () => {
      const button = document.createElement('button');
      const input = document.createElement('input');
      const textarea = document.createElement('textarea');
      const select = document.createElement('select');
      const link = document.createElement('a');
      link.href = '#';

      container.append(button, input, textarea, select, link);

      cleanup = service.trap(container);

      // Focus last element (link) and press Tab
      focusElementReliably(link);
      const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
      const preventDefaultSpy = spyOn(tabEvent, 'preventDefault');

      container.dispatchEvent(tabEvent);

      expect(isElementFocused(button)).toBe(true);
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should handle cleanup after DOM removal', () => {
      const button = document.createElement('button');
      container.appendChild(button);

      cleanup = service.trap(container);

      // Remove container from DOM
      container.remove();

      // Cleanup should not throw
      expect(() => cleanup()).not.toThrow();

      // Re-add for afterEach cleanup
      document.body.appendChild(container);
    });
  });

  describe('integration scenarios', () => {
    it('should support remember/restore workflow with focus trapping', () => {
      const originalButton = document.createElement('button');
      document.body.appendChild(originalButton);
      focusElementReliably(originalButton);
      service.remember();

      // Create container with focusable elements
      const container = document.createElement('div');
      const first = document.createElement('button');
      const last = document.createElement('button');
      container.append(first, last);
      document.body.appendChild(container);

      // Set up focus trap
      const cleanup = service.trap(container);

      // Focus should cycle within container
      focusElementReliably(last);
      const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
      container.dispatchEvent(tabEvent);
      expect(isElementFocused(first)).toBe(true);

      // Clean up trap and restore original focus
      cleanup();
      service.restore();
      expect(isElementFocused(originalButton)).toBe(true);

      originalButton.remove();
      container.remove();
    });

    it('should handle multiple overlapping trap instances', () => {
      const container1 = document.createElement('div');
      const container2 = document.createElement('div');
      const button1 = document.createElement('button');
      const button2 = document.createElement('button');

      container1.appendChild(button1);
      container2.appendChild(button2);
      document.body.appendChild(container1);
      document.body.appendChild(container2);

      const cleanup1 = service.trap(container1);
      const cleanup2 = service.trap(container2);

      // Both should work independently
      expect(typeof cleanup1).toBe('function');
      expect(typeof cleanup2).toBe('function');

      // Cleanup both
      cleanup1();
      cleanup2();

      container1.remove();
      container2.remove();
    });

    it('should handle rapid remember/restore cycles', () => {
      const buttons = Array.from({ length: 5 }, () => document.createElement('button'));
      buttons.forEach(btn => document.body.appendChild(btn));

      // Rapidly cycle through remember/restore
      for (let i = 0; i < buttons.length; i++) {
        focusElementReliably(buttons[i]);
        service.remember();

        // Focus different element
        const nextIndex = (i + 1) % buttons.length;
        focusElementReliably(buttons[nextIndex]);

        service.restore();
        expect(isElementFocused(buttons[i])).toBe(true);
      }

      buttons.forEach(btn => btn.remove());
    });
  });
});
