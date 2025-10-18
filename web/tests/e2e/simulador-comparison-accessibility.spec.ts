import { test, expect, Page } from '@playwright/test';

const DEMO_USER = {
  email: 'demo@conductores.com',
  password: 'demo123'
};

const STORED_SIMULATIONS = [
  {
    key: 'edomexScenario-qa-draft',
    value: {
      clientName: 'Ana Demo',
      market: 'edomex',
      clientType: 'individual',
      timestamp: 1700000005000,
      type: 'EDOMEX_INDIVIDUAL',
      scenario: {
        targetAmount: 180000,
        monthlyContribution: 6000,
        monthsToTarget: 24
      }
    }
  },
  {
    key: 'agsScenario-qa-draft',
    value: {
      clientName: 'Luis Cliente',
      market: 'aguascalientes',
      clientType: 'individual',
      timestamp: 1700000004000,
      scenario: {
        targetAmount: 220000,
        monthlyContribution: 7200,
        monthsToTarget: 30
      }
    }
  },
  {
    key: 'tandaScenario-qa-draft',
    value: {
      clientName: 'Colectivo Norte',
      market: 'edomex',
      clientType: 'colectivo',
      timestamp: 1700000003000,
      scenario: {
        targetAmount: 300000,
        monthlyContribution: 9500,
        monthsToTarget: 18
      }
    }
  }
] as const;

test.describe('Simulador comparison accessibility', () => {
  test.use({
    video: 'retain-on-failure',
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 720 }
  });

  test('comparison modal traps focus and restores previous control', async ({ page }) => {
    await ensureAuthenticated(page);
    await seedSavedSimulations(page);

    await page.goto('/simulador');
    await page.waitForLoadState('networkidle');

    await page.waitForSelector('[data-cy="comparison-controls"]', { timeout: 10000 });

    await page.getByRole('button', { name: /Comparar Escenarios/i }).click();

    // Select two simulations for comparison
    await page.waitForSelector('#compare-edomexScenario-qa-draft', { state: 'visible' });
    await page.waitForSelector('#compare-agsScenario-qa-draft', { state: 'visible' });
    await page.check('#compare-edomexScenario-qa-draft');
    await page.check('#compare-agsScenario-qa-draft');

    await expect(page.locator('.comparison-controls__count')).toContainText('2/3 seleccionados');

    await expect(page.locator('[data-cy="open-comparison"]')).toBeEnabled();

    // Open comparison modal using keyboard to capture focus origin
    await page.focus('[data-cy="open-comparison"]');
    await page.keyboard.press('Enter');

    const dialog = page.locator('.comparison-modal__dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('role', 'dialog');
    await expect(dialog).toHaveAttribute('aria-modal', 'true');

    // Initial focus should land on the dialog container for the focus trap
    const focusedOnDialog = await page.evaluate(() => document.activeElement?.classList?.contains('comparison-modal__dialog'));
    expect(focusedOnDialog).toBeTruthy();

    // Tabbing should move focus to the close button inside the modal
    await page.keyboard.press('Tab');
    const closeButtonAria = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    expect(closeButtonAria).toBe('Cerrar');

    // Reverse tab keeps focus within the modal container
    await page.keyboard.press('Shift+Tab');
    const focusReturnedToDialog = await page.evaluate(() => document.activeElement?.classList?.contains('comparison-modal__dialog'));
    expect(focusReturnedToDialog).toBeTruthy();

    // Validate that business metrics render for both simulations
    await expect(page.locator('.comparison-modal__table-header')).toHaveCount(3);
    await expect(page.locator('.comparison-modal__table-header').filter({ hasText: 'Ana Demo' })).toBeVisible();
    await expect(page.locator('.comparison-modal__table-header').filter({ hasText: 'Luis Cliente' })).toBeVisible();
    await expect(page.locator('.comparison-modal__table-cell').filter({ hasText: '$180,000' })).toBeVisible();
    await expect(page.locator('.comparison-modal__table-cell').filter({ hasText: '$220,000' })).toBeVisible();

    // Escape closes the modal and returns focus to the trigger button
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-cy="comparison-modal"]')).toBeHidden();

    const restoredFocusCy = await page.evaluate(() => document.activeElement?.getAttribute('data-cy'));
    expect(restoredFocusCy).toBe('open-comparison');
  });
});

async function ensureAuthenticated(page: Page): Promise<void> {
  await page.goto('/login');
  const emailInput = page.locator('[data-cy="login-email"]');
  const loginVisible = await emailInput.isVisible({ timeout: 3000 }).catch(() => false);

  if (loginVisible) {
    await emailInput.fill(DEMO_USER.email);
    await page.fill('[data-cy="login-password"]', DEMO_USER.password);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle' }),
      page.getByTestId('login-submit').click()
    ]);
  } else {
    await page.waitForLoadState('networkidle');
  }
}

async function seedSavedSimulations(page: Page): Promise<void> {
  await page.evaluate(entries => {
    entries.forEach(entry => {
      window.localStorage.setItem(entry.key, JSON.stringify(entry.value));
    });
  }, STORED_SIMULATIONS);
}
