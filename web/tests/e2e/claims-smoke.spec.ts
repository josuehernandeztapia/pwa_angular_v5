import { test, expect, Page } from '@playwright/test';

const ADMIN_BYPASS = {
  token: 'e2e-admin-token',
  refreshToken: 'e2e-admin-refresh',
  user: {
    id: 'e2e-admin-user',
    name: 'E2E Admin',
    email: 'admin+e2e@conductores.com',
    role: 'admin' as const,
    permissions: [
      'dashboard:view',
      'clients:view',
      'quotes:create',
      'quotes:approve',
      'postventa:manage',
      'claims:manage'
    ]
  }
};

async function authenticateAsAdmin(page: Page): Promise<void> {
  await page.goto('/login');
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(({ auth }) => {
    localStorage.setItem('auth_token', auth.token);
    localStorage.setItem('refresh_token', auth.refreshToken);
    localStorage.setItem('current_user', JSON.stringify(auth.user));
    localStorage.setItem('rememberLogin', 'true');
    localStorage.setItem('rememberMe', 'true');
  }, { auth: ADMIN_BYPASS });
}

test.describe('Claims smoke route', () => {
  test('renders claims dashboard with seeded data', async ({ page }) => {
    await authenticateAsAdmin(page);

    await page.route('**/api/claims', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'CLM-E2E-01',
            folio: 'F-500',
            clientName: 'Cliente E2E',
            vehicleVin: 'VIN-E2E-500',
            market: 'aguascalientes',
            type: 'service',
            status: 'open',
            amount: 7800,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            assignedTo: 'E2E Agent'
          }
        ])
      });
    });

    await page.goto('/claims');
    await page.waitForURL('**/claims', { waitUntil: 'networkidle' });

    await expect(page.getByRole('heading', { name: 'Claims & Service' })).toBeVisible();
    await expect(page.locator('.claims__summary-card').first()).toBeVisible();
    await expect(page.locator('.claims__row').first()).toBeVisible();
  });
});
