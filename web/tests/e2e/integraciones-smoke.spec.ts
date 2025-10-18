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
      'postventa:manage',
      'admin:manage'
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

test.describe('Integraciones smoke route', () => {
  test('shows integrations empty state when no client context', async ({ page }) => {
    await authenticateAsAdmin(page);

    await page.goto('/integraciones');
    await page.waitForURL('**/integraciones', { waitUntil: 'networkidle' });

    await expect(page.locator('.integration__subtitle')).toContainText('sin cliente');
    await expect(page.locator('.integration__empty h2')).toHaveText('Sin datos disponibles');
  });
});
