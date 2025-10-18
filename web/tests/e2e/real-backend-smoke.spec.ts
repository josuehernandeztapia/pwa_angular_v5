/**
 * Real BFF smoke tests for Opportunities & Usage dashboards.
 *
 * These tests require a live backend and will be skipped unless
 * `E2E_USE_REAL_BFF=true` and the following environment variables are defined:
 *   - E2E_REAL_BASE_URL
 *   - E2E_REAL_USER_EMAIL
 *   - E2E_REAL_USER_PASSWORD
 */

import { test, expect, Page } from '@playwright/test';

const shouldRun = process.env.E2E_USE_REAL_BFF === 'true';
const baseUrl = process.env.E2E_REAL_BASE_URL ?? '';
const realUserEmail = process.env.E2E_REAL_USER_EMAIL ?? '';
const realUserPassword = process.env.E2E_REAL_USER_PASSWORD ?? '';
const missingEnvVars = [
  ['E2E_REAL_BASE_URL', baseUrl],
  ['E2E_REAL_USER_EMAIL', realUserEmail],
  ['E2E_REAL_USER_PASSWORD', realUserPassword]
].filter(([, value]) => !value);

const describeFn = shouldRun && missingEnvVars.length === 0 ? test.describe : test.describe.skip;

if (shouldRun && missingEnvVars.length > 0) {
  console.warn(`Skipping real-backend-smoke.spec.ts: missing env vars ${missingEnvVars.map(([key]) => key).join(', ')}`);
}

const targetBaseUrl = baseUrl.replace(/\/$/, '');

describeFn('Real BFF smoke validation', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithRealCredentials(page);
  });

  test('Opportunities pipeline loads stages from BFF', async ({ page }) => {
    await page.goto(`${targetBaseUrl}/oportunidades`);

    await expect(page.getByRole('heading', { name: 'Pipeline de Oportunidades' })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Total de oportunidades activas', { exact: false })).toBeVisible();
  });

  test('Usage reports surface revenue metrics', async ({ page }) => {
    await page.goto(`${targetBaseUrl}/usage`);

    await expect(page.getByRole('heading', { name: 'Uso del Sistema' })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Ingresos Mensuales')).toBeVisible();
  });

  async function loginWithRealCredentials(page: Page): Promise<void> {
    await page.goto(`${targetBaseUrl}/login`);

    await page.waitForSelector('[data-cy="login-email"]', { state: 'visible', timeout: 20000 });
    await page.fill('[data-cy="login-email"]', realUserEmail);
    await page.fill('[data-cy="login-password"]', realUserPassword);
    await page.click('[data-cy="login-submit"]');

    await page.waitForURL('**/dashboard**', { timeout: 30000 });
  }
});
