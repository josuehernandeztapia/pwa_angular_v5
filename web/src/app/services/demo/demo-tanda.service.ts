import { Injectable } from '@angular/core';

import { TandaDeliverySchedule, TandaMemberDelivery } from '@interfaces/tanda';

import { DemoScenarioId } from './demo-scenarios';
import { DemoSeedService } from './demo-seed.service';
import { DemoAnalyticsService } from './demo-analytics.service';

export interface DemoSorteoResult {
  winnerId: string;
  scheduledDate: Date;
}

@Injectable({ providedIn: 'root' })
export class DemoTandaService {
  private readonly tandaScenario: DemoScenarioId = 'tanda-colectiva';

  constructor(
    private readonly seeds: DemoSeedService,
    private readonly analytics: DemoAnalyticsService
  ) {}

  getMembers(): TandaMemberDelivery[] {
    return this.seeds.getScenario(this.tandaScenario).tandaGroup?.members ?? [];
  }

  getSchedule(): TandaDeliverySchedule[] {
    return this.seeds.getScenario(this.tandaScenario).tandaSchedule ?? [];
  }

  async simulateSorteo(): Promise<DemoSorteoResult | null> {
    const scenario = this.seeds.getScenario(this.tandaScenario);
    const members = scenario.tandaGroup?.members ?? [];
    if (!members.length) {
      return null;
    }

    const pendingMembers = members.filter(member => member.deliveryStatus !== 'delivered');
    const winner = pendingMembers[Math.floor(Math.random() * pendingMembers.length)] ?? members[0];
    const scheduledDate = new Date();
    scheduledDate.setMonth(scheduledDate.getMonth() + 1);

    await this.simulateLatency();

    this.seeds.updateScenario(this.tandaScenario, current => {
      if (!current.tandaSchedule) {
        return current;
      }
      const nextSchedule: TandaDeliverySchedule[] = [
        ...current.tandaSchedule,
        {
          month: current.tandaSchedule.length + 1,
          memberId: winner.id,
          memberName: winner.name,
          memberPosition: winner.position ?? current.tandaSchedule.length + 1,
          scheduledDate,
          deliveryStatus: 'scheduled',
          requiredAmount: 84000,
          contributedAmount: 0,
          remainingAmount: 84000,
          deliveryNotes: 'Sorteo demo generado automáticamente.'
        }
      ];

      const nextMembers = current.tandaGroup?.members.map(member =>
        member.id === winner.id
          ? ({
              ...member,
              deliveryStatus: 'scheduled'
            } as TandaMemberDelivery)
          : member
      );

      return {
        ...current,
        tandaGroup: current.tandaGroup
          ? {
              ...current.tandaGroup,
              members: nextMembers ?? current.tandaGroup.members,
              currentMonth: (current.tandaGroup.currentMonth ?? 0) + 1
            }
          : current.tandaGroup,
        tandaSchedule: nextSchedule,
        protectionNotes: [
          ...(current.protectionNotes ?? []),
          `Sorteo demo ejecutado. Ganador: ${winner.name}`
        ]
      };
    });

    this.analytics.trackTandaEvent({
      scenario: this.tandaScenario,
      event: 'sorteo',
      memberId: winner.id
    });

    return {
      winnerId: winner.id,
      scheduledDate
    };
  }

  async markPaymentMissed(memberId: string): Promise<void> {
    await this.simulateLatency(250);

    this.seeds.updateScenario(this.tandaScenario, current => {
      if (!current.tandaGroup) {
        return current;
      }

      const members = current.tandaGroup.members.map(member =>
        member.id === memberId
          ? ({
              ...member,
              status: 'active',
              deliveryStatus: 'delayed',
              lastPayment: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10)
            } as TandaMemberDelivery)
          : member
      );

      return {
        ...current,
        tandaGroup: {
          ...current.tandaGroup,
          members,
          currentMonth: current.tandaGroup.currentMonth ?? 1
        },
        protectionNotes: [
          ...(current.protectionNotes ?? []),
          `Se simuló un pago faltante para ${memberId}.`
        ]
      };
    });

    this.analytics.trackTandaEvent({
      scenario: this.tandaScenario,
      event: 'penalizacion',
      memberId
    });
  }

  private simulateLatency(ms = 300): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
