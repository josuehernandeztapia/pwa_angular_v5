# Feature Flags Operations Guide

This runbook explains how to configure and validate feature flags for the Angular PWA in each environment (local, QA, staging, production). Use it together with `SSR_FEATURE_FLAGS_SETUP.md` for implementation details.

## 1. Runtime Sources

Feature flags can be supplied from three sources:

| Priority | Source | Usage |
|----------|--------|-------|
| 1 | Build-time validation (`npm run validate:runtime-config`) | Fails CI/CD if required flags are missing or malformed |
| 2 | Runtime globals (`globalThis.__FLAG__`) | Used by `resolveFeatureFlag` and SSR server bootstrap |
| 3 | Angular environment files (`environment.*.ts`) | Default values shipped in the bundle |

> **Tip**: Always prefer environment variables in QA/production and reserve environment files for defaults only.

## 2. Mandatory Flags by Environment

| Environment | Required | Optional |
|-------------|----------|----------|
| Development | - | `ENABLE_MOCK_DATA`, `DEBUG_MODE`, `EXPERIMENTAL_VOICE` |
| QA / Staging | `BFF_BASE_URL` | `ENABLE_POSTVENTA`, `ENABLE_CLAIMS_BFF`, `ENABLE_LABS` |
| Production | `BFF_BASE_URL` (HTTPS, non-localhost) | `ENABLE_POSTVENTA`, `ENABLE_ADMIN_BFF`, `ENABLE_USAGE_MODULE` |

Boolean flags must be the literal strings `"true"` or `"false"`.

## 3. Validation Workflow

1. Export flags in your CI pipeline (example for QA):
   ```bash
   export RUNTIME_ENV=qa
   export BFF_BASE_URL=https://qa-api.conductores.com
   export ENABLE_POSTVENTA=true
   export ENABLE_MOCK_DATA=false
   ```
2. Run the validator before building:
   ```bash
   npm run validate:runtime-config
   ```
3. If any flag is missing or malformed, the command exits with code `1` and lists the offending variables.
4. On success the script prints `✅ Runtime configuration validated`.

## 4. SSR Server Bootstrap

In the Node SSR server (e.g. `server.ts`) set globals before rendering:

```ts
globalThis.__BFF_BASE_URL__ = process.env.BFF_BASE_URL;
globalThis.__ENABLE_POSTVENTA__ = process.env.ENABLE_POSTVENTA === 'true';
globalThis.__ENABLE_MOCK_DATA__ = process.env.ENABLE_MOCK_DATA === 'true';
```

On the browser, the same values can be injected via an inline script or by embedding them in `index.html` during deployment.

## 5. Quick Diagnostics

Run the helper in a browser console or SSR shell:

```ts
import { resolveFeatureFlag } from '@services/utils/ssr/feature-flags.util';
import { resolveBffBaseUrl } from '@services/utils/resolve-bff-base-url.util';

console.table({
  mockData: resolveFeatureFlag('ENABLE_MOCK_DATA'),
  postventa: resolveFeatureFlag('ENABLE_POSTVENTA'),
  bffUrl: resolveBffBaseUrl()
});
```

For automated diagnostics use:

```bash
NODE_ENV=production node scripts/validate-runtime-config.mjs
```

## 6. Deployment Checklist

- [ ] `npm run validate:runtime-config`
- [ ] `npm run lint`
- [ ] `npm run test:unit`
- [ ] `npm run build:prod`
- [ ] `npm run smoke:pwa`

Store the output of the validation command with the release artifacts for audit purposes.

## 7. Troubleshooting

| Symptom | Root Cause | Resolution |
|---------|------------|-----------|
| Runtime console logs `resolveFeatureFlag` returning fallback | Global flag not defined | Set `globalThis.__FLAG__` in SSR bootstrap or deploy script |
| API calls hitting localhost in QA/Prod | Missing `BFF_BASE_URL` | Export the variable and rerun validator |
| Validator fails with boolean flags | Values not `true`/`false` | Normalize boolean flags in CI (e.g. `export ENABLE_POSTVENTA=true`) |

Refer to `SSR_FEATURE_FLAGS_SETUP.md` for low level implementation notes.
