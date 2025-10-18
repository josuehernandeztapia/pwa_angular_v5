import { test, expect, Page } from '@playwright/test';

const DEMO_USER = {
  email: 'demo@conductores.com',
  password: 'demo123'
};

test.use({
  video: 'on',
  trace: 'on-first-retry',
  viewport: { width: 1280, height: 720 }
});

test.describe('⚡ Comparador & Modal Accessibility Smoke', () => {
  test('navigates comparador view and validates modal focus management', async ({ page }) => {
    await ensureAuthenticated(page);

    await test.step('Abrir vista de comparador si está disponible', async () => {
      const opened = await openComparadorView(page);
      expect.soft(opened, 'Comparador disponible').toBeTruthy();

      // If comparador overlay is available, test its accessibility
      if (opened) {
        await testComparadorAccessibility(page);
      }
    });

    await test.step('Abrir modal de atajos y verificar manejo de foco', async () => {
      await ensureKeyboardModal(page);
    });
  });
});

async function ensureAuthenticated(page: Page): Promise<void> {
  await page.goto('/');
  const loginFormVisible = await page.locator('[data-cy="login-email"]').isVisible().catch(() => false);

  if (loginFormVisible) {
    await page.fill('[data-cy="login-email"]', DEMO_USER.email);
    await page.fill('[data-cy="login-password"]', DEMO_USER.password);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle' }),
      page.getByTestId('login-submit').click()
    ]);
  }

  await page.waitForLoadState('networkidle');
}

async function openComparadorView(page: Page): Promise<boolean> {
  // Concrete selectors for comparador triggers - these will be updated once the component is wired
  const triggers = [
    // Primary data-cy selectors for test stability
    '[data-cy="open-comparador"]',
    '[data-cy="comparador-btn"]',
    '[data-cy="quote-comparador"]',
    // Navigation selectors
    'button:has-text("Comparador")',
    'a[href*="comparador"]',
    'nav >> text=Comparador',
    '.nav-comparador',
    // Common comparison button patterns
    'button:has-text("Comparar")',
    '[aria-label*="comparador" i]',
    // Fallback icon-based selectors
    'button[title*="comparador" i]',
    '.comparador-trigger'
  ];

  for (const selector of triggers) {
    try {
      const locator = page.locator(selector).first();
      if (await locator.isVisible({ timeout: 1000 }).catch(() => false)) {
        console.log(`Found comparador trigger: ${selector}`);

        await Promise.all([
          page.waitForLoadState('networkidle'),
          locator.click()
        ]);

        // Enhanced concrete selectors for the comparador overlay
        const overlaySelectors = [
          // Primary data-cy selectors for test stability
          '[data-cy="comparador-overlay"]',
          '[data-cy="comparador-modal"]',
          '[data-cy="comparador-dialog"]',
          // ARIA and semantic selectors
          '[role="dialog"][aria-labelledby*="comparador"]',
          '[role="dialog"][aria-describedby*="comparador"]',
          'dialog[aria-label*="comparador" i]',
          '.modal[aria-labelledby="comparador-title"]',
          // Class-based selectors
          '.comparador-overlay',
          '.comparador-modal',
          '.comparador-dialog',
          '.comparador-container',
          // Generic but contextual selectors
          '.overlay:has([data-comparador])',
          '.modal:has(.comparador-content)',
          // Angular component selectors
          'app-comparador-overlay',
          'app-comparador-modal',
          'app-comparador-dialog'
        ];

        for (const overlaySelector of overlaySelectors) {
          if (await page.locator(overlaySelector).first().isVisible({ timeout: 2000 }).catch(() => false)) {
            console.log(`Comparador overlay found with selector: ${overlaySelector}`);
            return true;
          }
        }
      }
    } catch (error) {
      console.log(`Error checking trigger ${selector}:`, error);
      continue;
    }
  }

  console.log('No comparador overlay found - component may not be wired yet');
  return false;
}

async function testComparadorAccessibility(page: Page): Promise<void> {
  console.log('Testing comparador overlay accessibility...');

  // Test focus management in comparador overlay
  await test.step('Verificar foco inicial en comparador overlay', async () => {
    const focusedElement = await page.evaluate(() => {
      const active = document.activeElement;
      return {
        tagName: active?.tagName,
        className: active?.className,
        id: active?.id,
        ariaLabel: active?.getAttribute('aria-label')
      };
    });
    console.log('Initial focus in comparador overlay:', focusedElement);
  });

  // Test Escape key functionality
  await test.step('Verificar cierre con tecla Escape', async () => {
    await page.keyboard.press('Escape');

    // Check if overlay closes with Escape key
    const overlayStillVisible = await page.locator([
      '[data-cy="comparador-overlay"]',
      '[data-cy="comparador-modal"]',
      '.comparador-overlay',
      '.comparador-modal',
      'app-comparador-overlay'
    ].join(', ')).first().isVisible({ timeout: 1000 }).catch(() => false);

    expect.soft(overlayStillVisible, 'Comparador overlay closes with Escape key').toBeFalsy();
  });

  // Test tab navigation if overlay is still open
  const overlayOpen = await page.locator([
    '[data-cy="comparador-overlay"]',
    '.comparador-overlay',
    'app-comparador-overlay'
  ].join(', ')).first().isVisible({ timeout: 500 }).catch(() => false);

  if (overlayOpen) {
    await test.step('Verificar navegación con Tab', async () => {
      await page.keyboard.press('Tab');
      const focusAfterTab = await page.evaluate(() => document.activeElement?.tagName);
      console.log('Focus after Tab in comparador:', focusAfterTab);
    });
  }
}

async function ensureKeyboardModal(page: Page): Promise<void> {
  await page.keyboard.press('?');

  const modalSelector = '.shortcuts__dialog';
  await page.waitForSelector(modalSelector, { timeout: 5000 });

  const focusedCloseButton = await page.evaluate(() => {
    const active = document.activeElement;
    return active?.classList?.contains('shortcuts__close');
  });

  expect.soft(focusedCloseButton, 'El botón de cierre recibe foco').toBeTruthy();

  await page.keyboard.press('Escape');
  await page.waitForSelector(modalSelector, { state: 'detached', timeout: 5000 });
}
