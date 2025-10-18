import { test, expect, Page } from '@playwright/test';

const shouldRun = process.env.E2E_CONFLICT_UI === 'true';
const describeFn = shouldRun ? test.describe : test.describe.skip;

const DEMO_USER = {
  email: 'demo@conductores.com',
  password: 'demo123'
};

describeFn('Client conflict resolution (UI)', () => {
  test.beforeEach(async ({ page }) => {
    await setupConflictInterceptors(page);
    await login(page);
  });

  test('merges local changes after 409 conflict', async ({ page }) => {
    const clientId = '1';
    const newName = `Cliente Merge ${Date.now()}`;
    const newPhone = '558001122';

    await page.goto(`/clientes/${clientId}/editar`);

    await page.fill('#name', newName);
    await page.fill('#phone', newPhone);

    await page.click('[data-cy="save-client"]');

    await expect(page.getByText('Cliente actualizado exitosamente')).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(new RegExp(`/clientes/${clientId}$`));
    await expect(page.getByRole('heading', { name: newName })).toBeVisible();
  });
});

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('[data-cy="login-email"]', DEMO_USER.email);
  await page.fill('[data-cy="login-password"]', DEMO_USER.password);
  await page.click('[data-cy="login-submit"]');
  await page.waitForURL('**/dashboard', { timeout: 20000 });
}

async function setupConflictInterceptors(page: Page): Promise<void> {
  const conflictStates = new Map<string, 'initial' | 'conflict' | 'resolved'>();

  await page.route('**/clients/**', async route => {
    const request = route.request();
    const method = request.method();
    const match = /\/clients\/([^\/?]+)/.exec(request.url());
    const clientId = match?.[1];

    if (!clientId || clientId.includes('bulk-export')) {
      return route.continue();
    }

    const state = conflictStates.get(clientId) ?? 'initial';

    if (method === 'PUT' && state === 'initial') {
      conflictStates.set(clientId, 'conflict');
      return route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Conflict' })
      });
    }

    if (method === 'GET' && state === 'conflict') {
      conflictStates.set(clientId, 'resolved');
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: clientId,
          name: 'Remote Snapshot',
          phone: '9999999999'
        })
      });
    }

    if (method === 'PUT' && state === 'resolved') {
      const payload = request.postDataJSON?.() ?? {};
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...payload,
          id: clientId
        })
      });
    }

    return route.continue();
  });
}
