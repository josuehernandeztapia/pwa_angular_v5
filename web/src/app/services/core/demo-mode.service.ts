import { Injectable, computed, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { environment } from '@environments/environment';

import { DemoScenarioId, isDemoScenarioId } from '@services/demo/demo-scenarios';
import { DemoSeedService, DemoScenarioState } from '@services/demo/demo-seed.service';
import { Client, Document } from '@interfaces/types';
import { FlowContext } from '@app/documents/types/document-upload.models';

@Injectable({ providedIn: 'root' })
export class DemoModeService {
  private readonly seeds = inject(DemoSeedService);
  private readonly demoSignal = signal<boolean>(this.resolveInitialState());
  private readonly scenarioSignal = signal<DemoScenarioId | null>(null);
  readonly isDemoMode = this.demoSignal.asReadonly();
  readonly isDemoMode$ = toObservable(this.demoSignal);
  readonly isRealData = computed(() => !this.demoSignal());
  readonly activeScenario = this.scenarioSignal.asReadonly();
  readonly activeScenario$ = toObservable(this.scenarioSignal);
  readonly activeScenarioState = computed(() => {
    const scenario = this.scenarioSignal();
    if (!scenario) {
      return null;
    }
    return this.seeds.scenarioSnapshot(scenario);
  });
  readonly activeScenarioClient = computed(() => this.activeScenarioState()?.client ?? null);

  private resolveInitialState(): boolean {
    if (typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.has('demo')) {
          return true;
        }
        const enableParam = params.get('enableDemo');
        if (enableParam != null) {
          return enableParam === 'true' || enableParam === '1';
        }
      } catch (error) {
        console.warn('[DemoModeService] Unable to read query params to determine demo mode', error);
      }
    }
    return environment.features.enableMockData !== false;
  }

  enableDemoMode(): void {
    this.setDemoMode(true);
  }

  enableRealData(): void {
    this.setDemoMode(false);
  }

  toggle(): void {
    this.setDemoMode(!this.demoSignal());
  }

  setScenario(scenario: DemoScenarioId | null): void {
    if (scenario) {
      this.enableDemoMode();
    }
    if (this.scenarioSignal() === scenario) {
      return;
    }
    this.scenarioSignal.set(scenario);
  }

  syncScenarioFromQuery(queryValue: string | null | undefined): void {
    if (isDemoScenarioId(queryValue)) {
      this.setScenario(queryValue);
    }
  }

  clearScenario(): void {
    this.setScenario(null);
  }

  resetScenario(id: DemoScenarioId): void {
    this.seeds.resetScenario(id);
  }

  resetActiveScenario(): void {
    const scenario = this.scenarioSignal();
    if (scenario) {
      this.resetScenario(scenario);
    }
  }

  resetAllScenarios(): void {
    this.seeds.resetAll();
  }

  getScenarioSnapshot(id: DemoScenarioId): DemoScenarioState | null {
    const snapshot = this.seeds.scenarioSnapshot(id);
    return snapshot ? this.clone(snapshot) : null;
  }

  getClientByScenario(id: DemoScenarioId): Client | null {
    const scenario = this.seeds.scenarioSnapshot(id);
    if (!scenario?.client) {
      return null;
    }
    return this.clone(scenario.client);
  }

  getDocumentsByScenario(id: DemoScenarioId): Document[] {
    const scenario = this.seeds.scenarioSnapshot(id);
    if (!scenario?.documents?.length) {
      return [];
    }
    return this.clone(scenario.documents);
  }

  getFlowContextByScenario(id: DemoScenarioId): FlowContext | null {
    const scenario = this.seeds.scenarioSnapshot(id);
    if (!scenario?.flowContext) {
      return null;
    }
    return this.clone(scenario.flowContext);
  }

  getScenarioDefaultRoute(id: DemoScenarioId): string | null {
    const scenario = this.seeds.scenarioSnapshot(id);
    return scenario?.defaultRoute ?? null;
  }

  registeredScenarioIds(): DemoScenarioId[] {
    return this.seeds.registeredScenarioIds();
  }

  isScenarioRegistered(id: DemoScenarioId): boolean {
    return this.seeds.scenarioSnapshot(id) != null;
  }

  resolveScenarioRedirect(currentUrl: string, scenario: DemoScenarioId): string | null {
    const defaultRoute = this.getScenarioDefaultRoute(scenario);
    if (!defaultRoute) {
      return null;
    }

    const [path] = currentUrl.split('?');
    if (path === defaultRoute || path.startsWith(`${defaultRoute}/`)) {
      return null;
    }

    return defaultRoute;
  }

  private setDemoMode(isDemo: boolean): void {
    if (this.demoSignal() === isDemo) {
      return;
    }

    environment.features.enableMockData = isDemo;
    this.demoSignal.set(isDemo);
    if (!isDemo) {
      this.scenarioSignal.set(null);
    }
  }

  private clone<T>(value: T): T {
    if (typeof structuredClone === 'function') {
      return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
