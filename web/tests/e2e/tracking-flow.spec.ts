/**
 * PWA Conductores - Tracking Client Flow E2E
 */

import { test, expect, Page } from '@playwright/test';

const DEMO_USER = {
  token: 'tracking-e2e-token',
  refreshToken: 'tracking-e2e-refresh',
  user: {
    id: 'advisor-tracking',
    name: 'Advisor Tracking',
    email: 'advisor+tracking@conductores.com',
    role: 'asesor' as const,
    permissions: ['clients:view', 'deliveries:view']
  }
};

const TRACKING_FIXTURE = [
  {
    id: 'DEL-001',
    status: 'READY_FOR_HANDOVER',
    eta: '2025-02-15T00:00:00.000Z'
  },
  {
    id: 'DEL-002',
    status: 'IN_CUSTOMS',
    eta: '2025-03-05T00:00:00.000Z'
  }
];

async function authenticate(page: Page): Promise<void> {
  await page.goto('/login');
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(auth => {
    localStorage.setItem('auth_token', auth.token);
    localStorage.setItem('refresh_token', auth.refreshToken);
    localStorage.setItem('current_user', JSON.stringify(auth.user));
    localStorage.setItem('rememberLogin', 'true');
    localStorage.setItem('rememberMe', 'true');
  }, DEMO_USER);
}

test.describe('Client Tracking – BFF mode', () => {
  test.beforeEach(async ({ page }) => {
    await authenticate(page);

    await page.route('**/api/v1/deliveries/client/C-101', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(TRACKING_FIXTURE)
      });
    });
  });

  test('renders tracking cards with agenda state', async ({ page }) => {
    await page.goto('/tracking/client/C-101');
    await page.waitForSelector('h1:has-text("Tracking de Cliente")');

    const cards = page.locator('.client-tracking__order');
    await expect(cards).toHaveCount(2);

    await expect(cards.nth(0).locator('.client-tracking__flag--handover')).toContainText('Agenda disponible');
    await expect(cards.nth(1).locator('.client-tracking__flag--handover')).toContainText('Agenda pendiente');

    await expect(cards.nth(0).locator('.client-tracking__order-details')).toContainText('Fecha estimada');
  });
});
