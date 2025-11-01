import { Injectable, computed, signal } from '@angular/core';

import { DemoScenarioId, DemoScenarioMetadata, DEMO_SCENARIOS } from './demo-scenarios';

export type DemoScenarioState = DemoScenarioMetadata;

@Injectable({ providedIn: 'root' })
export class DemoSeedService {
  private readonly scenarioState = signal<Record<DemoScenarioId, DemoScenarioState>>(this.cloneAll());

  readonly scenarios = computed(() => this.scenarioState());
  readonly scenarioList = computed(() => Object.values(this.scenarioState()));

  getAviPerfectoSeed(): DemoScenarioState {
    return this.cloneScenario('avi-perfecto');
  }

  getErrorDocsSeed(): DemoScenarioState {
    return this.cloneScenario('errores-documentos');
  }

  getKycDemoSeed(): DemoScenarioState {
    return this.cloneScenario('kyc-demo');
  }

  getProteccionDemoSeed(): DemoScenarioState {
    return this.cloneScenario('proteccion-reestructura');
  }

  getTandaDemoSeed(): DemoScenarioState {
    return this.cloneScenario('tanda-colectiva');
  }

  getPostventaDemoSeed(): DemoScenarioState {
    return this.cloneScenario('postventa-entrega');
  }

  getFinanzasWhatIfSeed(): DemoScenarioState {
    return this.cloneScenario('finanzas-whatif');
  }

  getOnboardingMultiSeed(): DemoScenarioState {
    return this.cloneScenario('onboarding-multi');
  }

  getFavoritosExportSeed(): DemoScenarioState {
    return this.cloneScenario('favoritos-export');
  }

  getTelemetriaFullSeed(): DemoScenarioState {
    return this.cloneScenario('telemetria-full');
  }

  resetAviPerfectoSeed(): void {
    this.resetScenario('avi-perfecto');
  }

  resetErrorDocsSeed(): void {
    this.resetScenario('errores-documentos');
  }

  resetKycDemoSeed(): void {
    this.resetScenario('kyc-demo');
  }

  resetProteccionDemoSeed(): void {
    this.resetScenario('proteccion-reestructura');
  }

  resetTandaDemoSeed(): void {
    this.resetScenario('tanda-colectiva');
  }

  resetPostventaDemoSeed(): void {
    this.resetScenario('postventa-entrega');
  }

  resetFinanzasWhatIfSeed(): void {
    this.resetScenario('finanzas-whatif');
  }

  resetOnboardingMultiSeed(): void {
    this.resetScenario('onboarding-multi');
  }

  resetFavoritosExportSeed(): void {
    this.resetScenario('favoritos-export');
  }

  resetTelemetriaFullSeed(): void {
    this.resetScenario('telemetria-full');
  }

  getScenario(id: DemoScenarioId): DemoScenarioState {
    const current = this.scenarioState()[id];
    if (!current) {
      throw new Error(`[DemoSeedService] Scenario "${id}" is not registered`);
    }
    return current;
  }

  scenarioSignal(id: DemoScenarioId) {
    return computed(() => this.scenarioState()[id]);
  }

  scenarioSnapshot(id: DemoScenarioId): DemoScenarioState | null {
    const state = this.scenarioState();
    return state[id] ?? null;
  }

  resetScenario(id: DemoScenarioId): void {
    const seed = DEMO_SCENARIOS[id];
    if (!seed) {
      return;
    }
    this.scenarioState.update(current => ({
      ...current,
      [id]: this.clone(seed)
    }));
  }

  resetAll(): void {
    this.scenarioState.set(this.cloneAll());
  }

  updateScenario(id: DemoScenarioId, updater: (scenario: DemoScenarioState) => DemoScenarioState): void {
    const current = this.getScenario(id);
    const next = updater(this.clone(current));
    this.scenarioState.update(state => ({
      ...state,
      [id]: next
    }));
  }

  registeredScenarioIds(): DemoScenarioId[] {
    return Object.keys(DEMO_SCENARIOS) as DemoScenarioId[];
  }

  private cloneScenario(id: DemoScenarioId): DemoScenarioState {
    return this.clone(this.getScenario(id));
  }

  private cloneAll(): Record<DemoScenarioId, DemoScenarioState> {
    const entries = Object.entries(DEMO_SCENARIOS).map(([id, seed]) => [id, this.clone(seed)] as const);
    return Object.fromEntries(entries) as Record<DemoScenarioId, DemoScenarioState>;
  }

  private clone<T>(value: T): T {
    if (typeof structuredClone === 'function') {
      return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
