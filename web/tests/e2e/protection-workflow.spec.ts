import { test, expect, Page } from '@playwright/test';

const CONTRACT_ID = 'CT-1277';

const PLAN_RESPONSE = {
  contractId: CONTRACT_ID,
  clientId: 'CL-001',
  state: 'IDLE',
  scenarios: [],
  policy: {
    difMax: 3,
    extendMax: 4,
    stepDownMaxPct: 0.25,
    irrMin: 0.15,
    mMin: 4500
  },
  used: {
    defer: 0,
    stepdown: 0,
    recalendar: 0,
    collective: 0
  },
  audit: {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  eligibilityReason: 'Sin simulaciones realizadas'
};

const SCENARIO_RESPONSE = {
  scenarios: [
    {
      id: 'scenario-defer',
      type: 'DEFER' as const,
      params: { deferMonths: 2 },
      description: 'Diferimiento de pagos por 2 meses',
      score: 82,
      impact: {
        paymentChange: -900,
        termChange: 1,
        totalCostChange: 2100
      }
    }
  ],
  eligibilityCheck: {
    isEligible: true,
    reason: 'Cliente elegible para diferimiento',
    usageRemaining: {
      defer: 1,
      stepdown: 2,
      recalendar: 1,
      collective: 1
    }
  }
};

async function mockProtectionApi(page: Page): Promise<void> {
  await page.route('**/api/v1/protection/plan/**', async route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PLAN_RESPONSE) });
  });

  await page.route('**/api/v1/protection/simulate', async route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SCENARIO_RESPONSE) });
  });

  await page.route('**/api/v1/protection/select', async route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, newState: 'PENDING_APPROVAL' }) });
  });

  await page.route('**/api/v1/protection/approve', async route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, newState: 'READY_TO_SIGN' }) });
  });

  await page.route('**/api/v1/protection/sign', async route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, newState: 'SIGNED' }) });
  });

  await page.route('**/api/v1/protection/apply', async route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, newSchedule: [] }) });
  });
}

test.describe('Protection workflow UI', () => {
  test('simulates and selects a protection scenario', async ({ page }) => {
    await mockProtectionApi(page);

    await page.goto('/proteccion');
    await expect(page.getByRole('heading', { name: 'Orquestación de protección' })).toBeVisible();

    const cards = page.locator('.protection__card');
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText('Diferimiento de pagos');

    const waitForSelect = page.waitForRequest('**/api/v1/protection/select');
    await cards.first().click();
    await waitForSelect;

    await expect(cards.first()).toHaveClass(/protection__card--active/);
    await expect(page.locator('text=Escenario seleccionado, esperando aprobación')).toBeVisible();
  });
});
