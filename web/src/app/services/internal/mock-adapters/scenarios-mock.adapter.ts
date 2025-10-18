import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { BusinessFlow, CompleteBusinessScenario, Market } from '@interfaces/types';
import { MockUtilityAdapter } from './utility-mock.adapter';

@Injectable({ providedIn: 'root' })
export class ScenariosMockAdapter {
  constructor(private readonly utils: MockUtilityAdapter) {}

  createCotizacionScenario(payload: {
    clientName: string;
    flow: string;
    market: string;
  }): Observable<CompleteBusinessScenario> {
    const scenario: CompleteBusinessScenario = {
      id: `scenario-${Date.now()}`,
      clientName: payload.clientName,
      flow: payload.flow as BusinessFlow,
      market: (payload.market || 'all') as Market,
      stage: 'COTIZACION',
      seniorSummary: {
        title: `Cotización para ${payload.clientName}`,
        description: [
          'Cotización generada exitosamente',
          'Revisa los términos y condiciones',
          'Envía por WhatsApp al cliente'
        ],
        keyMetrics: [
          { label: 'Precio Total', value: '$850,000', icon: 'currency-dollar' },
          { label: 'Enganche', value: '$170,000', icon: 'bank' },
          { label: 'Mensualidad', value: '$18,500', icon: 'calendar' }
        ],
        timeline: [
          { month: 0, event: 'Firma de Contrato', icon: 'document-text' },
          { month: 1, event: 'Primer Pago', icon: 'currency-dollar' }
        ],
        whatsAppMessage: 'Tu cotización está lista'
      }
    };

    return this.utils.mockApi(scenario, this.utils.networkSimulation.slow);
  }

  createSimulacionScenario(payload: {
    clientName: string;
    flow: string;
    market: string;
  }): Observable<CompleteBusinessScenario> {
    const scenario: CompleteBusinessScenario = {
      id: `scenario-${Date.now()}`,
      clientName: payload.clientName,
      flow: payload.flow as BusinessFlow,
      market: (payload.market || 'all') as Market,
      stage: 'SIMULACION',
      seniorSummary: {
        title: `Simulación para ${payload.clientName}`,
        description: [
          'Plan de ahorro simulado',
          'Proyección de 24 meses',
          'Meta alcanzable identificada'
        ],
        keyMetrics: [
          { label: 'Meta Ahorro', value: '$200,000', icon: 'target' },
          { label: 'Tiempo', value: '18 meses', icon: 'clock' },
          { label: 'Aportación', value: '$12,000/mes', icon: 'currency-dollar' }
        ],
        timeline: [
          { month: 6, event: '30% de Meta', icon: 'chart' },
          { month: 18, event: 'Meta Completa', icon: 'check-circle' }
        ],
        whatsAppMessage: 'Tu plan de ahorro está listo '
      }
    };

    return this.utils.mockApi(scenario, this.utils.networkSimulation.slow);
  }
}
