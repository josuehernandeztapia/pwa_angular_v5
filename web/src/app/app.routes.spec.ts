import { routes } from './app.routes';
import { environment } from '@environments/environment';

describe('App Routes configuration', () => {
  it('exposes onboarding route by default', () => {
    const onboardingRoute = routes.find(route => route.path === 'onboarding');
    expect(onboardingRoute).toBeDefined();
    expect(onboardingRoute?.loadComponent).toBeTruthy();
  });

  it('guards integrations route behind feature flag', () => {
    const integrationRoute = routes.find(route => route.path === 'integraciones');
    if (environment.features.enableIntegrationsConfig) {
      expect(integrationRoute).toBeDefined();
      expect(integrationRoute?.data?.['featureFlag']).toBe('enableIntegrationsConfig');
    } else {
      expect(integrationRoute).toBeUndefined();
    }
  });

  it('keeps legacy client edit path compatible via redirect', () => {
    const redirectRoute = routes.find(route => route.path === 'clientes/:id/edit');
    expect(redirectRoute).toBeDefined();
    expect(redirectRoute?.redirectTo).toBe('clientes/:id/editar');
    expect(redirectRoute?.pathMatch).toBe('full');
  });

  it('exposes quotation compatibility routes', () => {
    const quotationRoute = routes.find(route => route.path === 'quotation');
    expect(quotationRoute).toBeDefined();
    expect(quotationRoute?.children?.some(child => child.path === '')).toBeTrue();
    const createChild = quotationRoute?.children?.find(child => child.path === 'create');
    expect(createChild?.loadComponent).toBeTruthy();

    const legacyRedirect = routes.find(route => route.path === 'quotation/new');
    expect(legacyRedirect?.redirectTo).toBe('/quotation/create');
  });
});
