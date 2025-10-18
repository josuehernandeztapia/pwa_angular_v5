import { BusinessFlow, Client, Document, DocumentStatus, EventLog, Actor, EventType } from '@interfaces/types';
import { Quote } from '@interfaces/business';
import { RiskEvaluation } from '@interfaces/risk-evaluation';

const demoDocuments: Document[] = [
  {
    id: 'ine',
    name: 'Identificación oficial',
    status: DocumentStatus.Aprobado,
    completedAt: new Date('2024-05-10T10:00:00Z')
  },
  {
    id: 'comprobante-domicilio',
    name: 'Comprobante de domicilio',
    status: DocumentStatus.Pendiente
  }
];

const demoEvents: EventLog[] = [
  {
    id: 'evt-001',
    timestamp: new Date('2024-05-10T10:05:00Z'),
    message: 'Cliente registrado en la plataforma',
    actor: Actor.Asesor,
    type: EventType.StatusChange
  },
  {
    id: 'evt-002',
    timestamp: new Date('2024-05-15T12:30:00Z'),
    message: 'Se validó identificación oficial',
    actor: Actor.Sistema,
    type: EventType.DocumentReview,
    details: {
      documentName: 'Identificación oficial',
      status: 'Aprobado'
    }
  }
];

export function getDemoClients(): Client[] {
  return [
    {
      id: 'demo-client-1',
      name: 'María Hernández',
      flow: BusinessFlow.VentaPlazo,
      status: 'Activa',
      documents: demoDocuments,
      events: demoEvents,
      email: 'maria.hernandez@example.com',
      phone: '+52 55 1234 5678',
      market: 'aguascalientes',
      monthlyIncome: 28000,
      createdAt: new Date('2024-05-10T10:00:00Z'),
      updatedAt: new Date('2024-06-01T09:30:00Z'),
      currentSavings: 35000,
      savingsGoal: 120000,
      savingsPlan: {
        progress: 35,
        goal: 120000,
        currency: 'MXN',
        totalValue: 320000,
        methods: {
          collection: true,
          voluntary: true
        }
      },
      paymentPlan: {
        monthlyGoal: 8200,
        currentMonthProgress: 4100,
        currency: 'MXN',
        methods: {
          collection: true,
          voluntary: false
        }
      }
    },
    {
      id: 'demo-client-2',
      name: 'Luis Ortega',
      flow: BusinessFlow.CreditoColectivo,
      status: 'En seguimiento',
      documents: demoDocuments,
      events: demoEvents,
      email: 'luis.ortega@example.com',
      phone: '+52 81 9876 5432',
      market: 'edomex',
      monthlyIncome: 19000,
      createdAt: new Date('2024-05-02T14:20:00Z'),
      updatedAt: new Date('2024-05-28T11:15:00Z'),
      collectiveGroupName: 'Ruta Atlacomulco',
      currentSavings: 18000,
      savingsGoal: 90000,
      paymentPlan: {
        monthlyGoal: 5600,
        currentMonthProgress: 2800,
        currency: 'MXN',
        methods: {
          collection: true,
          voluntary: true
        }
      }
    }
  ];
}

export function getDemoQuotes(): Quote[] {
  return [
    {
      id: 'quote-demo-1',
      clientId: 'demo-client-1',
      flow: BusinessFlow.VentaPlazo,
      totalPrice: 320000,
      downPayment: 96000,
      amountToFinance: 224000,
      term: 36,
      monthlyPayment: 7890,
      market: 'aguascalientes',
      clientType: 'individual',
      interestRate: 14.5,
      createdAt: new Date('2024-05-12T09:00:00Z'),
      status: 'PENDING'
    },
    {
      id: 'quote-demo-2',
      clientId: 'demo-client-2',
      flow: BusinessFlow.CreditoColectivo,
      totalPrice: 280000,
      downPayment: 70000,
      amountToFinance: 210000,
      term: 48,
      monthlyPayment: 6200,
      market: 'edomex',
      clientType: 'colectivo',
      interestRate: 16.2,
      createdAt: new Date('2024-05-18T13:45:00Z'),
      status: 'PENDING'
    }
  ];
}

export function getDemoRiskEvaluations(): Array<{ clientId: string; evaluation: RiskEvaluation }> {
  const now = new Date('2024-05-20T12:00:00Z');

  const baseEvaluation: RiskEvaluation = {
    evaluationId: 'risk-demo-1',
    processedAt: now,
    processingTimeMs: 850,
    algorithmVersion: 'KIBAN-HASE-v2.1.0',
    decision: 'GO',
    riskCategory: 'MEDIO',
    confidenceLevel: 82,
    scoreBreakdown: {
      creditScore: 72,
      financialStability: 68,
      behaviorHistory: 74,
      paymentCapacity: 80,
      geographicRisk: 65,
      vehicleProfile: 70,
      finalScore: 76
    },
    businessFlow: BusinessFlow.VentaPlazo,
    kiban: {
      status: 'OK',
      scoreRaw: 680,
      reasons: [
        { code: 'UTIL_75', desc: 'Uso de crédito estable en los últimos 12 meses' }
      ]
    },
    hase: {
      category: 'MEDIUM',
      riskScore01: 0.62,
      explain: []
    },
    riskFactors: [
      {
        factorId: 'UTIL_75',
        factorName: 'Uso Elevado de Crédito',
        description: 'El solicitante utiliza más del 75% de su línea crediticia disponible.',
        severity: 'MEDIA',
        scoreImpact: -10,
        mitigationRecommendations: ['Aumentar enganche', 'Revisión de historial en 3 meses']
      }
    ],
    financialRecommendations: {
      suggestedDownPayment: 95000,
      recommendedTerm: 36
    },
    mitigationPlan: {
      followUpInDays: 30,
      actions: ['Monitorear pagos puntuales']
    },
    decisionReasons: ['Historial crediticio estable', 'Capacidad de pago comprobada'],
    nextSteps: ['Completar documentación pendiente', 'Agendar visita a agencia']
  };

  return [
    {
      clientId: 'demo-client-1',
      evaluation: baseEvaluation
    },
    {
      clientId: 'demo-client-2',
      evaluation: {
        ...baseEvaluation,
        evaluationId: 'risk-demo-2',
        decision: 'REVIEW',
        riskCategory: 'ALTO',
        confidenceLevel: 68,
        businessFlow: BusinessFlow.CreditoColectivo,
        scoreBreakdown: {
          creditScore: 60,
          financialStability: 55,
          behaviorHistory: 58,
          paymentCapacity: 62,
          geographicRisk: 70,
          vehicleProfile: 64,
          finalScore: 61
        },
        riskFactors: [
          {
            factorId: 'MORA_30',
            factorName: 'Mora Reciente',
            description: 'Registro de mora menor a 30 días hace seis meses.',
            severity: 'ALTA',
            scoreImpact: -20,
            mitigationRecommendations: ['Solicitar aval solidario', 'Reforzar seguimiento mensual']
          }
        ],
        decisionReasons: ['Mora reciente detectada'],
        nextSteps: ['Solicitar referencias adicionales', 'Actualizar expediente colectivo']
      }
    }
  ];
}
