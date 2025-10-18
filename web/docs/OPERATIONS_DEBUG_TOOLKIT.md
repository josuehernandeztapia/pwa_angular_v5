# Operational Debugging Toolkit

This document centralises the tooling available for QA, support and SRE teams when diagnosing the Angular PWA.

## 1. Scripts

| Command | Description |
|---------|-------------|
| `npm run smoke:pwa` | End-to-end smoke for the PWA against the configured BFF |
| `npm run smoke:bff` | Validates BFF health endpoints and contract expectations |
| `node scripts/validate-runtime-config.mjs` | Verifies that runtime feature flags and BFF URL are present |
| `node scripts/voice-evaluation-cli.mjs --help` | CLI helper to replay voice-evaluation scenarios |
| `bash scripts/deployment-validate.sh` | Runs lint, unit tests and runtime validation prior to deployment |
| `node scripts/pwa-checklist.js` | Executes Lighthouse/PWA compliance checks |

## 2. Debugging Playwright Tests

- Launch visual mode: `npx playwright test --ui`
- Re-run failing test with tracing: `npx playwright test path/to/spec.ts --trace on`
- Use `E2E_USE_REAL_BFF=true` to execute against a live backend (see `tests/e2e/real-backend-smoke.spec.ts`).

## 3. SSR Diagnostics

```bash
# Inspect SSR flags
node -e "console.log({ mock: globalThis.__ENABLE_MOCK_DATA__, bff: globalThis.__BFF_BASE_URL__ })"

# Validate before rendering
NODE_ENV=production node scripts/validate-runtime-config.mjs
```

## 4. Browser Tools

- `window.__featureFlags__` – inspect feature flags injected by the deployment pipeline.
- `window.testVoiceEvaluation` – available after running the voice validation CLI in a browser session.
- Enable Angular DevTools for real-time signal inspection.

## 5. Logging Conventions

| Prefix | Source | Notes |
|--------|--------|-------|
| `[HttpClient]` | Core HTTP client with retry/backoff | Includes request IDs and retry attempts |
| `[OfflineQueue]` | OfflineService processing | Emits structured data for queue metrics |
| `[VoiceTest]` | Voice evaluation helpers | CLI + browser console output |

Capture the relevant logs (`console`, `network`, `offline queue snapshots`) and attach them to support tickets.

## 6. Mock adapters y fixtures

- Consulta [`web/docs/MOCK_ADAPTERS.md`](./MOCK_ADAPTERS.md) para conocer qué endpoints mock reproduce cada adapter y cómo activarlos en QA.
- `ClientsMockAdapter` ahora incluye `getEcosystems`, `getCollectiveGroups(ecosystemId)` y `getEcosystemHierarchy()`; úsalo cuando necesites poblar dashboards colectivos sin BFF.
- Para reinicializar los datos locales ejecuta en consola: `window.__USE_MOCK_DATA__ = true` y recarga la aplicación.
- Las pruebas Playwright pueden interceptar `/**/api/v1/protection/*` y `/**/api/v1/collective-groups/**` para simular escenarios en modo offline.

