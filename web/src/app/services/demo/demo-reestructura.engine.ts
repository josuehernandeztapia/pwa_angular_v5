import { Injectable, computed } from '@angular/core';

import { DemoScenarioId, DemoFinanceEvent, DemoFinanceEventKind } from './demo-scenarios';
import { DemoSeedService, DemoScenarioState } from './demo-seed.service';
import { DemoAnalyticsService } from './demo-analytics.service';
import { ProtectionScenario } from '@interfaces/protection';

interface ApplyScenarioOptions {
  scenarioId?: DemoScenarioId;
  track?: boolean;
}

@Injectable({ providedIn: 'root' })
export class DemoReestructuraEngine {
  private readonly defaultScenario: DemoScenarioId = 'proteccion-reestructura';
  private readonly whatIfScenario: DemoScenarioId = 'finanzas-whatif';
  private readonly defaultScenarioSignal = this.seeds.scenarioSignal(this.defaultScenario);
  readonly protectionScenarios = computed(() =>
    (this.defaultScenarioSignal()?.protectionScenarios ?? []).map(item => ({ ...item }))
  );
  readonly financeScenarioSet = computed(() => {
    const set = this.defaultScenarioSignal()?.financeScenarios;
    return set
      ? {
          ...set,
          scenarios: set.scenarios.map(option => ({ ...option }))
        }
      : null;
  });

  constructor(
    private readonly seeds: DemoSeedService,
    private readonly analytics: DemoAnalyticsService
  ) {}

  async applyScenario(optionId: string, options: ApplyScenarioOptions = {}): Promise<void> {
    const scenarioId = options.scenarioId ?? this.defaultScenario;
    const snapshot = this.seeds.getScenario(scenarioId);
    const finance = snapshot.financeScenarios;
    if (!finance) {
      return;
    }

    const target = finance.scenarios.find(option => option.id === optionId);
    const fallbackId = finance.baseScenarioId ?? finance.scenarios[0]?.id ?? null;
    const effectiveId = target?.id ?? fallbackId;
    if (!effectiveId) {
      return;
    }

    await this.simulateLatency();

    this.seeds.updateScenario(scenarioId, current => {
      if (!current.financeScenarios) {
        return current;
      }

      const selected = current.financeScenarios.scenarios.find(option => option.id === effectiveId) ?? null;
      const nextNotes = selected
        ? [
            ...new Set([
              ...(current.protectionNotes ?? []),
              `Escenario demo aplicado: ${selected.title || selected.id}`
            ])
          ]
        : current.protectionNotes;

      const nextClient = selected && current.client?.paymentPlan
        ? {
            ...current.client,
            paymentPlan: {
              ...current.client.paymentPlan,
              monthlyPayment: selected.pagoMensual ?? current.client.paymentPlan.monthlyPayment,
              monthlyGoal: selected.pagoMensual ?? current.client.paymentPlan.monthlyGoal,
              term: current.client.paymentPlan.term
            }
          }
        : current.client ?? null;

      return {
        ...current,
        client: nextClient ?? current.client,
        financeScenarios: {
          ...current.financeScenarios,
          baseScenarioId: effectiveId
        },
        protectionNotes: nextNotes,
        financeEvents: this.appendFinanceEvent(current, {
          id: `scenario-${effectiveId}-${Date.now()}`,
          kind: 'scenario-applied',
          title: `Escenario aplicado: ${selected?.title ?? effectiveId}`,
          description: 'Reestructura demo aplicada desde simulador.',
          amountDelta: selected?.pagoMensual ?? null,
          createdAt: Date.now()
        })
      };
    });

    if (options.track !== false) {
      this.analytics.trackFinanceScenarioApplied({
        scenario: scenarioId,
        optionId: effectiveId
      });
    }
  }

  async applyWhatIf(optionId: string): Promise<void> {
    await this.applyScenario(optionId, { scenarioId: this.whatIfScenario });
  }

  async simulateLatePayment(options: ApplyScenarioOptions = {}): Promise<void> {
    const scenarioId = options.scenarioId ?? this.defaultScenario;
    await this.simulateLatency(220);
    this.recordFinanceEvent(scenarioId, 'late-payment', {
      title: 'Pago registrado con atraso',
      description: 'Se simula un pago atrasado para explicar penalizaciones demo.',
      amountDelta: -450
    });
    this.analytics.track('finance_event', {
      scenario: scenarioId,
      event: 'late-payment'
    });
  }

  async simulateExtraPayment(options: ApplyScenarioOptions = {}): Promise<void> {
    const scenarioId = options.scenarioId ?? this.defaultScenario;
    await this.simulateLatency(180);
    this.recordFinanceEvent(scenarioId, 'extra-payment', {
      title: 'Pago extra aplicado',
      description: 'Se acredita un pago extra demo para mostrar beneficios.',
      amountDelta: 600
    });
    this.analytics.track('finance_event', {
      scenario: scenarioId,
      event: 'extra-payment'
    });
  }

  async resetFinanceScenario(scenarioId: DemoScenarioId = this.defaultScenario): Promise<void> {
    const snapshot = this.seeds.getScenario(scenarioId);
    const finance = snapshot.financeScenarios;
    if (!finance) {
      return;
    }

    const baseId = finance.baseScenarioId ?? finance.scenarios[0]?.id ?? null;
    if (!baseId) {
      return;
    }

    await this.simulateLatency(200);
    this.seeds.updateScenario(scenarioId, current => {
      if (!current.financeScenarios) {
        return current;
      }
      return {
        ...current,
        financeScenarios: {
          ...current.financeScenarios,
          baseScenarioId: baseId
        },
        financeEvents: []
      };
    });

    this.analytics.track('finance_scenario_reset', {
      scenario: scenarioId,
      optionId: baseId
    });
  }

  getProtectionScenarios(scenarioId: DemoScenarioId = this.defaultScenario): ProtectionScenario[] {
    if (scenarioId === this.defaultScenario) {
      const snapshot = this.defaultScenarioSignal();
      return snapshot?.protectionScenarios?.map(scenario => ({ ...scenario })) ?? [];
    }
    const snapshot = this.seeds.getScenario(scenarioId);
    return snapshot.protectionScenarios?.map(scenario => ({ ...scenario })) ?? [];
  }

  getActiveOptionId(scenarioId: DemoScenarioId = this.defaultScenario): string | null {
    if (scenarioId === this.defaultScenario) {
      return this.financeScenarioSet()?.baseScenarioId ?? null;
    }
    return this.seeds.getScenario(scenarioId).financeScenarios?.baseScenarioId ?? null;
  }

  private simulateLatency(ms = 280): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private appendFinanceEvent(current: DemoScenarioState, event: DemoFinanceEvent): DemoFinanceEvent[] {
    const existing = current.financeEvents ?? [];
    return [event, ...existing].slice(0, 12);
  }

  private recordFinanceEvent(
    scenarioId: DemoScenarioId,
    kind: DemoFinanceEventKind,
    details: { title: string; description: string; amountDelta?: number | null }
  ): void {
    const event: DemoFinanceEvent = {
      id: `${kind}-${Date.now()}`,
      kind,
      title: details.title,
      description: details.description,
      amountDelta: details.amountDelta ?? null,
      createdAt: Date.now()
    };

    this.seeds.updateScenario(scenarioId, current => ({
      ...current,
      financeEvents: this.appendFinanceEvent(current, event)
    }));
  }
}
