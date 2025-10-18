# SSR Feature Flags Configuration Guide

## Overview

This guide covers the configuration of runtime feature flags for Server-Side Rendering (SSR) and different deployment environments in the Angular PWA. For day-to-day operational procedures (CI/CD, runtime validation, deployment checklist) refer to [`OPERATIONS_FEATURE_FLAGS.md`](./OPERATIONS_FEATURE_FLAGS.md).

## Architecture

The PWA uses two main utilities for SSR-compatible feature detection:

- `resolveFeatureFlag(flag, fallback)` - Runtime feature flags via global scope injection
- `resolveBffBaseUrl(fallback)` - Dynamic BFF URL resolution for different environments

## Feature Flags Setup

### 1. Development Environment

For local development, set feature flags via browser globals:

```javascript
// In browser console or inject via build process
window.__ENABLE_MOCK_DATA__ = true;
window.__DEBUG_MODE__ = true;
window.__EXPERIMENTAL_VOICE__ = false;
```

### 2. SSR Environment (Node.js)

Configure feature flags in your SSR server before rendering:

```javascript
// server.ts or equivalent
globalThis.__ENABLE_MOCK_DATA__ = process.env['MOCK_DATA'] === 'true';
globalThis.__DEBUG_MODE__ = process.env['NODE_ENV'] === 'development';
globalThis.__BFF_BASE_URL__ = process.env['BFF_BASE_URL'] || 'https://api.conductores.com';
```

### 3. QA/Staging Environment

Use environment variables to control flags:

```bash
# Environment variables
MOCK_DATA=false
BFF_BASE_URL=https://qa-api.conductores.com
DEBUG_MODE=false
EXPERIMENTAL_VOICE=true
```

### 4. Production Environment

```bash
# Production environment variables
MOCK_DATA=false
BFF_BASE_URL=https://api.conductores.com
DEBUG_MODE=false
EXPERIMENTAL_VOICE=false
```

## Usage in Components/Services

### Basic Feature Flag Check

```typescript
import { resolveFeatureFlag } from '@services/utils/ssr/feature-flags.util';

@Component({})
export class MyComponent {
  private readonly enableMockData = resolveFeatureFlag('ENABLE_MOCK_DATA', false);
  private readonly debugMode = resolveFeatureFlag('DEBUG_MODE', false);

  ngOnInit() {
    if (this.enableMockData) {
      // Use mock data
    }
  }
}
```

### Dynamic BFF URL Resolution

```typescript
import { resolveBffBaseUrl } from '@services/utils/resolve-bff-base-url.util';

@Injectable()
export class ApiService {
  private readonly baseUrl = resolveBffBaseUrl('http://localhost:3000');

  getData() {
    return this.http.get(`${this.baseUrl}/api/data`);
  }
}
```

## Available Feature Flags

| Flag | Description | Default | Environments |
|------|-------------|---------|-------------|
| `ENABLE_MOCK_DATA` | Enable mock adapters instead of real API calls | `false` | Dev, Testing |
| `DEBUG_MODE` | Enable debug logging and developer tools | `false` | Dev only |
| `EXPERIMENTAL_VOICE` | Enable voice recognition features | `false` | QA, Prod |
| `BFF_BASE_URL` | Base URL for Backend-for-Frontend API | `localhost:3000` | All |

## Testing Configuration

### Unit Tests (Karma/Jasmine)

```typescript
// In test setup
beforeEach(() => {
  (globalThis as any).__ENABLE_MOCK_DATA__ = true;
  (globalThis as any).__DEBUG_MODE__ = true;
});

afterEach(() => {
  delete (globalThis as any).__ENABLE_MOCK_DATA__;
  delete (globalThis as any).__DEBUG_MODE__;
});
```

### E2E Tests (Playwright)

```typescript
// playwright.config.ts
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__ENABLE_MOCK_DATA__ = true;
    window.__BFF_BASE_URL__ = 'http://localhost:3001';
  });
});
```

## Environment-Specific Build

### Angular Environment Files

```typescript
// environment.prod.ts
export const environment = {
  production: true,
  featureFlags: {
    enableMockData: false,
    debugMode: false,
    experimentalVoice: false
  },
  bffBaseUrl: 'https://api.conductores.com'
};
```

### Webpack DefinePlugin (Optional)

```javascript
// webpack.config.js
new webpack.DefinePlugin({
  '__ENABLE_MOCK_DATA__': JSON.stringify(process.env.MOCK_DATA === 'true'),
  '__BFF_BASE_URL__': JSON.stringify(process.env.BFF_BASE_URL || 'http://localhost:3000')
})
```

## Troubleshooting

### Common Issues

1. **Feature flags not working in SSR**: Ensure `globalThis` is set before app initialization
2. **Window undefined errors**: Use the utilities instead of direct `window` access
3. **Different behavior between dev/prod**: Check environment variable injection

### Debug Commands

```bash
# Check current feature flags in browser console
console.log('Mock Data:', resolveFeatureFlag('ENABLE_MOCK_DATA'));
console.log('BFF URL:', resolveBffBaseUrl('default'));

# Server-side debugging
node -e "console.log('Server flags:', globalThis.__ENABLE_MOCK_DATA__)"
```

## Migration from Legacy

### Old Pattern (Deprecated)
```typescript
// ❌ Don't use - not SSR compatible
if (window.enableMockData) {
  // legacy code
}
```

### New Pattern (Recommended)
```typescript
// ✅ SSR compatible
if (resolveFeatureFlag('ENABLE_MOCK_DATA')) {
  // modern code
}
```

## Security Considerations

- Never expose sensitive configuration via feature flags
- Use environment variables for secrets, not global scope injection
- Feature flags should only control UI/UX behavior, not security logic
- Always provide sensible fallbacks for production environments

## Next Steps

1. Configure your deployment pipeline to inject appropriate flags per environment
2. Update monitoring to track feature flag usage
3. Document new feature flags in this guide when adding them
4. Test SSR compatibility when introducing new flags
