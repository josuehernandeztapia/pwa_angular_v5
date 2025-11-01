import { Injectable } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivate,
  CanActivateChild,
  GuardResult,
  MaybeAsync,
  Router,
  RouterStateSnapshot,
  UrlTree
} from '@angular/router';

import { DemoModeService } from '@core-services/demo-mode.service';
import { DemoScenarioId, isDemoScenarioId } from '@services/demo/demo-scenarios';

@Injectable({ providedIn: 'root' })
export class DemoRouterGuard implements CanActivate, CanActivateChild {
  constructor(
    private readonly demoMode: DemoModeService,
    private readonly router: Router
  ) {}

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): MaybeAsync<GuardResult> {
    return this.handleDemoScenario(route, state);
  }

  canActivateChild(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): MaybeAsync<GuardResult> {
    return this.handleDemoScenario(route, state);
  }

  private handleDemoScenario(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): GuardResult | UrlTree {
    this.syncDemoToggle(route.queryParamMap.get('enableDemo'));

    const queryScenario = route.queryParamMap.get('demo');
    if (!isDemoScenarioId(queryScenario)) {
      return true;
    }

    if (!this.demoMode.isScenarioRegistered(queryScenario)) {
      console.warn(`[DemoRouterGuard] Scenario "${queryScenario}" not registered. Falling back to defaults.`);
      return true;
    }

    this.demoMode.enableDemoMode();
    this.demoMode.setScenario(queryScenario);

    const redirectTarget = this.demoMode.resolveScenarioRedirect(state.url, queryScenario);
    if (!redirectTarget) {
      return true;
    }

    const mergedParams = {
      ...route.queryParams,
      demo: queryScenario
    };

    const segments = redirectTarget.split('/').filter(Boolean);

    return this.router.createUrlTree(['/', ...segments], {
      queryParams: mergedParams
    });
  }

  private syncDemoToggle(toggleValue: string | null): void {
    if (toggleValue == null) {
      return;
    }

    const normalized = toggleValue.toLowerCase();
    const enable = normalized === 'true' || normalized === '1' || normalized === 'yes';
    if (enable) {
      this.demoMode.enableDemoMode();
    } else {
      this.demoMode.enableRealData();
    }
  }
}
