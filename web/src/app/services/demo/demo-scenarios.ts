import { BusinessFlow, Client, Document, DocumentStatus } from '@interfaces/types';
import { FlowContext } from '@app/documents/types/document-upload.models';
import { OnboardingRequirementsUpdate } from '@feature-services/onboarding/onboarding-requirements.models';
import { TandaGroupDelivery, TandaMemberDelivery, TandaDeliverySchedule } from '@interfaces/tanda';
import { ProtectionScenario, ProtectionType } from '@interfaces/protection';

export type DemoScenarioId =
  | 'avi-perfecto'
  | 'errores-documentos'
  | 'kyc-demo'
  | 'proteccion-reestructura'
  | 'tanda-colectiva'
  | 'postventa-entrega'
  | 'finanzas-whatif'
  | 'onboarding-multi'
  | 'favoritos-export'
  | 'telemetria-full';

export type DemoAviDecision = 'GO' | 'NO_GO' | 'REVIEW';
export type DemoFinanceEventKind = 'scenario-applied' | 'late-payment' | 'extra-payment';

export interface DemoFinanceEvent {
  id: string;
  kind: DemoFinanceEventKind;
  title: string;
  description: string;
  amountDelta?: number | null;
  createdAt: number;
}

export type DemoDeliveryKind = 'front' | 'side' | 'interior' | 'detail';

export interface DemoDeliveryEvidence {
  id: string;
  kind: DemoDeliveryKind;
  label: string;
  description?: string;
  dataUrl: string;
  loadedAt?: string | null;
}

export interface DemoDeliveryIncident {
  id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  resolution?: string;
  status?: 'open' | 'resolved';
  lastUpdatedAt?: string | null;
}

export interface DemoScenarioMetadata {
  id: DemoScenarioId;
  label: string;
  description: string;
  defaultRoute?: string;
  tags: Array<'onboarding' | 'documents' | 'avi' | 'kyc' | 'proteccion' | 'tanda' | 'postventa' | 'finanzas' | 'favoritos' | 'telemetria'>;
  client?: Client;
  flowContext?: FlowContext;
  documents?: Document[];
  onboardingUpdate?: OnboardingRequirementsUpdate;
  tandaGroup?: TandaGroupDelivery;
  tandaSchedule?: TandaDeliverySchedule[];
  protectionNotes?: string[];
  deliveryNotes?: string[];
  deliveryEvidence?: DemoDeliveryEvidence[];
  deliveryIncidents?: DemoDeliveryIncident[];
  protectionScenarios?: ProtectionScenario[];
  financeScenarios?: DemoFinanceScenarioSet;
  favoritesSeed?: DemoFavoriteSeed[];
  aviDecision?: DemoAviDecision | null;
  aviDecisionUpdatedAt?: number | null;
  financeEvents?: DemoFinanceEvent[];
}

export interface DemoFinanceScenario {
  id: string;
  title: string;
  tasa: number;
  bonificacion: number;
  pagoMensual: number;
  terminos?: string;
  config?: Record<string, number>;
}

export interface DemoFinanceScenarioSet {
  baseScenarioId: string;
  scenarios: DemoFinanceScenario[];
}

export interface DemoFavoriteSeed {
  id: string;
  label: string;
  route: string;
  category: 'cliente' | 'cotizador' | 'documentos' | 'postventa' | 'reportes';
}

const aviPerfectoDocuments: Document[] = [
  {
    id: 'doc-ine',
    name: 'INE Vigente',
    status: DocumentStatus.Aprobado,
    tooltip: 'Documento validado automáticamente (demo)'
  },
  {
    id: 'doc-comprobante',
    name: 'Comprobante de domicilio',
    status: DocumentStatus.Aprobado,
    tooltip: 'Último recibo cargado y aprobado (demo)'
  },
  {
    id: 'doc-rfc',
    name: 'Constancia de situación fiscal',
    status: DocumentStatus.Aprobado,
    tooltip: 'Documento validado por sistema (demo)'
  },
  {
    id: 'doc-buro',
    name: 'Reporte de buró de crédito',
    status: DocumentStatus.Aprobado,
    tooltip: 'Sin observaciones relevantes'
  }
];

const aviPerfectoClient: Client = {
  id: 'client-demo-avi',
  name: 'Roberto Demo AVI',
  flow: BusinessFlow.VentaPlazo,
  status: 'En Expediente',
  documents: aviPerfectoDocuments,
  events: [],
  market: 'aguascalientes',
  isDemo: true,
  healthScore: 96,
  paymentPlan: {
    monthlyGoal: 6400,
    currentMonthProgress: 6400,
    currency: 'MXN',
    term: 36,
    monthlyPayment: 6400,
    interestRate: 0.18
  }
};

const aviPerfectoContext: FlowContext = {
  source: 'nueva-oportunidad',
  clientId: 'client-demo-avi',
  clientName: aviPerfectoClient.name,
  market: 'aguascalientes',
  businessFlow: BusinessFlow.VentaPlazo,
  clientType: 'individual',
  saleType: 'financiero',
  requiresIncomeProof: true,
  monthlyPayment: 6400,
  policyContext: null,
  protection: {
    required: true,
    coverageOptions: ['Básica', 'Plus', 'Total'],
    defaultCoverage: 'Plus'
  },
  contract: {
    id: null,
    status: 'pending',
    lastUpdated: Date.now()
  }
};

const aviPerfectoOnboarding: OnboardingRequirementsUpdate = {
  context: {
    market: 'aguascalientes',
    saleType: 'financiero',
    clientType: 'individual',
    businessFlow: BusinessFlow.VentaPlazo,
    requiresIncomeProof: true
  },
  documents: aviPerfectoDocuments
};

const errorDocsDocuments: Document[] = [
  {
    id: 'doc-ine-err',
    name: 'INE Vigente',
    status: DocumentStatus.Rechazado,
    tooltip: 'Documento vencido. Carga una versión actualizada.'
  },
  {
    id: 'doc-comprobante-err',
    name: 'Comprobante de domicilio',
    status: DocumentStatus.Pendiente,
    tooltip: 'No se detectó un comprobante válido.'
  },
  {
    id: 'doc-rfc-err',
    name: 'Constancia de situación fiscal',
    status: DocumentStatus.Aprobado
  }
];

const errorDocsClient: Client = {
  id: 'client-demo-error',
  name: 'Erika Demo Errores',
  flow: BusinessFlow.AhorroProgramado,
  status: 'Pendiente de Documentos',
  documents: errorDocsDocuments,
  events: [],
  market: 'edomex',
  isDemo: true,
  paymentPlan: {
    currency: 'MXN',
    monthlyGoal: 3800,
    currentMonthProgress: 1200,
    term: 24,
    monthlyPayment: 3800
  }
};

const errorDocsContext: FlowContext = {
  source: 'cotizador',
  clientId: errorDocsClient.id,
  clientName: errorDocsClient.name,
  market: 'edomex',
  businessFlow: BusinessFlow.AhorroProgramado,
  clientType: 'individual',
  saleType: 'financiero',
  requiresIncomeProof: true,
  policyContext: null,
  protection: {
    required: false,
    coverageOptions: ['Protección ahorro'],
    defaultCoverage: null
  },
  contract: {
    id: null,
    status: 'blocked'
  }
};

const errorDocsOnboarding: OnboardingRequirementsUpdate = {
  context: {
    market: 'edomex',
    saleType: 'financiero',
    clientType: 'individual',
    businessFlow: BusinessFlow.AhorroProgramado,
    requiresIncomeProof: true
  },
  documents: errorDocsDocuments
};

const kycDemoDocuments: Document[] = [
  {
    id: 'doc-ine-kyc',
    name: 'INE Vigente',
    status: DocumentStatus.Aprobado,
    tooltip: 'Documento aprobado automáticamente para demo KYC.'
  },
  {
    id: 'doc-comprobante-kyc',
    name: 'Comprobante de domicilio',
    status: DocumentStatus.Aprobado,
    tooltip: 'Último comprobante aprobado (demo).'
  },
  {
    id: 'doc-selfie-kyc',
    name: 'Selfie biométrica',
    status: DocumentStatus.EnRevision,
    tooltip: 'En revisión biométrica con señales inconsistentes (demo).'
  },
  {
    id: 'doc-kyc',
    name: 'Verificación Biométrica (KYC)',
    status: DocumentStatus.Pendiente,
    tooltip: 'Pendiente completar flujo MetaMap (demo).'
  }
];

const kycDemoClient: Client = {
  id: 'client-demo-kyc',
  name: 'Lucía Demo KYC',
  flow: BusinessFlow.VentaPlazo,
  status: 'Pendiente de KYC',
  documents: kycDemoDocuments,
  events: [],
  market: 'edomex',
  isDemo: true,
  paymentPlan: {
    currency: 'MXN',
    monthlyGoal: 4500,
    currentMonthProgress: 1800,
    term: 24,
    monthlyPayment: 4500
  }
};

const kycDemoContext: FlowContext = {
  source: 'cotizador',
  clientId: kycDemoClient.id,
  clientName: kycDemoClient.name,
  market: 'edomex',
  businessFlow: BusinessFlow.VentaPlazo,
  clientType: 'individual',
  saleType: 'financiero',
  requiresIncomeProof: true,
  monthlyPayment: 4500,
  policyContext: null,
  protection: {
    required: false,
    coverageOptions: ['Protección estándar'],
    defaultCoverage: null
  },
  contract: {
    id: null,
    status: 'blocked'
  }
};

const kycDemoOnboarding: OnboardingRequirementsUpdate = {
  context: {
    market: 'edomex',
    saleType: 'financiero',
    clientType: 'individual',
    businessFlow: BusinessFlow.VentaPlazo,
    requiresIncomeProof: true
  },
  documents: kycDemoDocuments
};

const tandaMembers: TandaMemberDelivery[] = [
  {
    id: 'member-1',
    clientId: 'demo-collective-1',
    name: 'Luis Demo',
    status: 'delivered',
    monthlyContribution: 2800,
    totalContributed: 8400,
    position: 1,
    deliveryStatus: 'delivered',
    joinedAt: new Date('2025-01-10'),
    paymentHistory: []
  },
  {
    id: 'member-2',
    clientId: 'demo-collective-2',
    name: 'Karla Demo',
    status: 'active',
    monthlyContribution: 2800,
    totalContributed: 5600,
    position: 2,
    deliveryStatus: 'scheduled',
    joinedAt: new Date('2025-01-10'),
    paymentHistory: []
  },
  {
    id: 'member-3',
    clientId: 'demo-collective-3',
    name: 'Andrés Demo',
    status: 'active',
    monthlyContribution: 2800,
    totalContributed: 2800,
    position: 3,
    deliveryStatus: 'pending',
    joinedAt: new Date('2025-01-10'),
    paymentHistory: []
  }
];

const tandaSchedule: TandaDeliverySchedule[] = [
  {
    month: 1,
    memberId: 'member-1',
    memberName: 'Luis Demo',
    memberPosition: 1,
    scheduledDate: new Date('2025-02-15'),
    deliveryStatus: 'delivered',
    requiredAmount: 84000,
    contributedAmount: 84000,
    remainingAmount: 0,
    deliveryNotes: 'Entrega completada con éxito (demo)'
  },
  {
    month: 2,
    memberId: 'member-2',
    memberName: 'Karla Demo',
    memberPosition: 2,
    scheduledDate: new Date('2025-03-15'),
    deliveryStatus: 'scheduled',
    requiredAmount: 84000,
    contributedAmount: 70000,
    remainingAmount: 14000,
    deliveryNotes: 'Simula penalización si falta pago'
  }
];

const tandaGroup: TandaGroupDelivery = {
  id: 'tanda-demo',
  name: 'Tanda Demo Colectiva',
  status: 'active',
  capacity: 12,
  totalMembers: 9,
  members: tandaMembers,
  monthlyAmount: 2800,
  totalAmount: 84000,
  totalUnits: 12,
  unitsDelivered: 1,
  monthlyPaymentPerUnit: 2800,
  currentMonth: 2,
  startDate: new Date('2025-01-01'),
  expectedEndDate: new Date('2026-12-31'),
  market: 'edomex',
  packageType: 'Vehículo Demo',
  phase: 'payment',
  deliverySchedule: tandaSchedule,
  transferEvents: [],
  consensusRequests: []
};

const finanzasScenarios: DemoFinanceScenarioSet = {
  baseScenarioId: 'stepdown',
  scenarios: [
    {
      id: 'stepdown',
      title: 'Stepdown 12%',
      tasa: 18,
      bonificacion: 0,
      pagoMensual: 5400,
      terminos: 'Reduce el pago 12% y extiende 4 meses.',
      config: { unitValue: 780000, initialDownPayment: 260000, deliveryMonths: 8, overpricePerLiter: 5.1, targetDownPayment: 180000, currentPlateConsumption: 500, voluntaryMonthly: 1400 }
    },
    {
      id: 'defer',
      title: 'Diferir 2 meses',
      tasa: 18,
      bonificacion: 0,
      pagoMensual: 0,
      terminos: 'Pausa 2 mensualidades y reestructura la tabla posterior.',
      config: { unitValue: 780000, initialDownPayment: 220000, deliveryMonths: 10, overpricePerLiter: 5.4, targetDownPayment: 160000, currentPlateConsumption: 560, voluntaryMonthly: 1100 }
    },
    {
      id: 'recalendar',
      title: 'Recalendarizar 42 meses',
      tasa: 18,
      bonificacion: 0,
      pagoMensual: 5100,
      terminos: 'Extiende a 42 meses manteniendo TIR y cobertura.',
      config: { unitValue: 780000, initialDownPayment: 210000, deliveryMonths: 12, overpricePerLiter: 5.0, targetDownPayment: 150000, currentPlateConsumption: 520, voluntaryMonthly: 1000 }
    }
  ]
};

const favoriteSeeds: DemoFavoriteSeed[] = [
  { id: 'fav-docs', label: 'Documentos Demo', route: '/documentos?demo=avi-perfecto', category: 'documentos' },
  { id: 'fav-cotizador', label: 'Cotizador Demo', route: '/cotizador?demo=finanzas-whatif', category: 'cotizador' },
  { id: 'fav-tanda', label: 'Tanda Colectiva Demo', route: '/simulador?demo=tanda-colectiva', category: 'reportes' }
];

const proteccionFinanceScenarios: DemoFinanceScenarioSet = {
  baseScenarioId: 'stepdown',
  scenarios: [
    {
      id: 'stepdown',
      title: 'Stepdown 15%',
      tasa: 18,
      bonificacion: 0,
      pagoMensual: 5600,
      terminos: 'Reduce el pago 15% y extiende 6 meses.',
      config: { unitValue: 820000, initialDownPayment: 280000, deliveryMonths: 6, overpricePerLiter: 4.8 }
    },
    {
      id: 'defer',
      title: 'Diferir 2 meses',
      tasa: 18,
      bonificacion: 0,
      pagoMensual: 0,
      terminos: 'Pospone 2 mensualidades con recálculo posterior.',
      config: { unitValue: 820000, initialDownPayment: 200000, deliveryMonths: 8, overpricePerLiter: 4.9 }
    },
    {
      id: 'recalendar',
      title: 'Recalendar 42 meses',
      tasa: 18,
      bonificacion: 0,
      pagoMensual: 5200,
      terminos: 'Extiende plazo a 42 meses manteniendo TIR.',
      config: { unitValue: 820000, initialDownPayment: 240000, deliveryMonths: 9, overpricePerLiter: 4.7 }
    }
  ]
};

function createDemoImage(label: string, background: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='200' viewBox='0 0 320 200'>`
    + `<rect width='320' height='200' rx='16' fill='${background}'/>`
    + `<text x='160' y='105' text-anchor='middle' font-family='Arial, sans-serif' font-size='24' fill='white'>${label}</text>`
    + `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const postventaEvidence: DemoDeliveryEvidence[] = [
  {
    id: 'evidence-front',
    kind: 'front',
    label: 'Frente con placa',
    description: 'Foto frontal tomada después de la entrega.',
    dataUrl: createDemoImage('Frente', '#2563eb'),
    loadedAt: null
  },
  {
    id: 'evidence-side',
    kind: 'side',
    label: 'Lateral izquierdo',
    description: 'Vista lateral para validar vestiduras.',
    dataUrl: createDemoImage('Lateral', '#1e3a8a'),
    loadedAt: null
  },
  {
    id: 'evidence-interior',
    kind: 'interior',
    label: 'Interior',
    description: 'Tablero y asientos delanteros.',
    dataUrl: createDemoImage('Interior', '#7c3aed'),
    loadedAt: null
  },
  {
    id: 'evidence-detail',
    kind: 'detail',
    label: 'Detalle de accesorio',
    description: 'Raspón leve detectado en puerta lateral.',
    dataUrl: createDemoImage('Detalle', '#0ea5e9'),
    loadedAt: null
  }
];

const postventaIncidents: DemoDeliveryIncident[] = [
  {
    id: 'incident-scratch',
    title: 'Rasguño lateral',
    description: 'Marca superficial detectada en la puerta trasera izquierda.',
    severity: 'medium',
    resolution: 'Pulido ligero en agencia demo.',
    status: 'resolved',
    lastUpdatedAt: null
  },
  {
    id: 'incident-document',
    title: 'Factura pendiente',
    description: 'Documento de facturación aún no cargado en repositorio demo.',
    severity: 'low',
    resolution: 'Marcar como recibido cuando se cargue la evidencia.',
    status: 'resolved',
    lastUpdatedAt: null
  },
  {
    id: 'incident-accessory',
    title: 'Accesorio faltante',
    description: 'Cliente reporta que no recibió kit de emergencia.',
    severity: 'high',
    resolution: 'Registrar incidencia y generar orden de envío demo.',
    status: 'resolved',
    lastUpdatedAt: null
  }
];

const demoProtectionScenarios: ProtectionScenario[] = [
  {
    id: 'stepdown',
    type: 'STEPDOWN' as ProtectionType,
    title: 'Stepdown 15%',
    description: 'Reduce la mensualidad 15% distribuyendo pagos remanentes en 6 meses adicionales.',
    params: { discount: 0.15 },
    score: 92,
    impact: {
      paymentChange: -850,
      termChange: 6,
      totalCostChange: 4800
    },
    tirOK: true,
    newMonthlyPayment: 5600,
    newTerm: 36,
    details: ['Pago nuevo: $5,600', 'Plazo: +6 meses', 'Cobertura Total se mantiene'],
    eligible: true
  },
  {
    id: 'defer',
    type: 'DEFER' as ProtectionType,
    title: 'Diferimiento 2 meses',
    description: 'Pospone 2 mensualidades con capitalización controlada de intereses.',
    params: { months: 2 },
    score: 88,
    impact: {
      paymentChange: 0,
      termChange: 2,
      totalCostChange: 2200
    },
    tirOK: true,
    details: ['Intereses capitalizados en meses 3 y 4', 'Carta compromiso requerida'],
    eligible: true
  },
  {
    id: 'recalendar',
    type: 'RECALENDAR' as ProtectionType,
    title: 'Recalendar a 42 meses',
    description: 'Reestructura completa a 42 meses con cuota estable y soporte de protección.',
    params: { newTerm: 42 },
    score: 85,
    impact: {
      paymentChange: -1200,
      termChange: 12,
      totalCostChange: 7200
    },
    tirOK: false,
    warnings: ['Requiere aprobación de comité demo'],
    details: ['Pago mensual: $5,200', 'Incluir seguro extendido'],
    eligible: true
  }
];

export const DEMO_SCENARIOS: Record<DemoScenarioId, DemoScenarioMetadata> = {
  'avi-perfecto': {
    id: 'avi-perfecto',
    label: 'Flujo AVI/KYC Perfecto',
    description: 'Cliente demo con expediente completo y AVI listo para ejecutarse.',
    defaultRoute: '/demo/avi-test',
    tags: ['onboarding', 'avi', 'kyc', 'documents'],
    client: aviPerfectoClient,
    flowContext: aviPerfectoContext,
    documents: aviPerfectoDocuments,
    onboardingUpdate: aviPerfectoOnboarding,
    protectionNotes: ['Puedes alternar estado de documentos para mostrar bloqueos demo.', 'AVI se puede simular como éxito o fallo.'],
    aviDecision: 'GO',
    aviDecisionUpdatedAt: null,
    financeEvents: []
  },
  'errores-documentos': {
    id: 'errores-documentos',
    label: 'Demo de errores en documentos',
    description: 'Escenario con documentos rechazados y feedback contextual.',
    defaultRoute: '/documentos',
    tags: ['onboarding', 'documents', 'kyc'],
    client: errorDocsClient,
    flowContext: errorDocsContext,
    documents: errorDocsDocuments,
    onboardingUpdate: errorDocsOnboarding,
    protectionNotes: ['Checklist muestra razones de rechazo.', 'Incluye acciones para corregir y ver telemetría.']
  },
  'kyc-demo': {
    id: 'kyc-demo',
    label: 'Flujo KYC Demo',
    description: 'Cliente demo para simular validaciones biométricas, alertas y reinicios.',
    defaultRoute: '/demo/kyc-test',
    tags: ['documents', 'kyc'],
    client: kycDemoClient,
    flowContext: kycDemoContext,
    documents: kycDemoDocuments,
    onboardingUpdate: kycDemoOnboarding,
    protectionNotes: ['Incluye señales de riesgo demo y alertas automáticas de fraude.']
  },
  'proteccion-reestructura': {
    id: 'proteccion-reestructura',
    label: 'Simulación Protección/Reestructuras',
    description: 'Escenarios de Stepdown, Defer y Recalendar con cálculos demo.',
    defaultRoute: '/simulador',
    tags: ['proteccion', 'finanzas'],
    client: {
      id: 'client-demo-proteccion',
      name: 'María Demo Protección',
      flow: BusinessFlow.VentaPlazo,
      status: 'Activa',
      documents: aviPerfectoDocuments,
      events: [],
      isDemo: true,
      paymentPlan: {
        currency: 'MXN',
        monthlyGoal: 6800,
        currentMonthProgress: 6800,
        term: 30,
        monthlyPayment: 6800,
        interestRate: 0.19
      },
      protectionPlan: {
        type: 'Total',
        restructuresUsed: 1,
        restructuresAvailable: 3,
        annualResets: 1
      }
    },
    protectionNotes: [
      'Incluye historia de pagos variados para explicar Stepdown/Defer.',
      'Botón demo permite simular retraso o pago extra.'
    ],
    financeScenarios: proteccionFinanceScenarios,
    protectionScenarios: demoProtectionScenarios,
    financeEvents: []
  },
  'tanda-colectiva': {
    id: 'tanda-colectiva',
    label: 'Simulador de Tanda Colectiva',
    description: 'Grupo demo con sorteos, penalizaciones y KPIs.',
    defaultRoute: '/simulador/tanda-colectiva',
    tags: ['tanda', 'finanzas'],
    tandaGroup,
    tandaSchedule,
    protectionNotes: ['Simula penalizaciones y empates en sorteo.', 'KPIs del grupo reaccionan en tiempo real.']
  },
  'postventa-entrega': {
    id: 'postventa-entrega',
    label: 'Demo Postventa y Entregas',
    description: 'Cliente listo para entrega con flujo de evidencia e incidencias demo.',
    defaultRoute: '/postventa/wizard',
    tags: ['postventa', 'documents'],
    client: {
      id: 'client-demo-postventa',
      name: 'Marcela Demo Entrega',
      flow: BusinessFlow.VentaPlazo,
      status: 'Listo para entrega',
      documents: aviPerfectoDocuments,
      events: [],
      isDemo: true
    },
    deliveryNotes: [
      'Incluye pasos para subir fotos demo.',
      'Permite reportar incidencia y mostrar feedback en tracker.'
    ],
    deliveryEvidence: postventaEvidence,
    deliveryIncidents: postventaIncidents
  },
  'finanzas-whatif': {
    id: 'finanzas-whatif',
    label: 'Matemática financiera What-If',
    description: 'Escenarios Stepdown, Defer y Recalendar para comparar ajustes demo.',
    defaultRoute: '/simulador',
    tags: ['finanzas'],
    client: {
      id: 'client-demo-finanzas',
      name: 'Carlos Demo Finanzas',
      flow: BusinessFlow.VentaPlazo,
      status: 'En simulación',
      documents: [],
      events: [],
      isDemo: true,
      paymentPlan: {
        currency: 'MXN',
        monthlyGoal: 5400,
        currentMonthProgress: 4200,
        term: 30,
        monthlyPayment: 5400,
        interestRate: 0.18
      }
    },
    financeScenarios: finanzasScenarios,
    financeEvents: []
  },
  'onboarding-multi': {
    id: 'onboarding-multi',
    label: 'Onboarding multi-plaza/producto',
    description: 'Clientes demo para probar cambios de plaza/producto en checklist.',
    defaultRoute: '/onboarding',
    tags: ['onboarding', 'documents'],
    client: aviPerfectoClient,
    flowContext: aviPerfectoContext,
    documents: aviPerfectoDocuments,
    onboardingUpdate: aviPerfectoOnboarding,
    protectionNotes: ['Incluye seeds alternos para AGS, EdoMex y otros mercados.']
  },
  'favoritos-export': {
    id: 'favoritos-export',
    label: 'Export y favoritos demo',
    description: 'Permite probar exportaciones simuladas y favoritos persistentes.',
    defaultRoute: '/dashboard',
    tags: ['favoritos', 'documents', 'finanzas'],
    favoritesSeed: favoriteSeeds
  },
  'telemetria-full': {
    id: 'telemetria-full',
    label: 'Telemetría y analítica demo',
    description: 'Escenario para validar eventos demo y dashboard analítico.',
    defaultRoute: '/demo-analytics',
    tags: ['telemetria', 'onboarding', 'documents'],
    protectionNotes: ['Todos los eventos demo deben registrarse en analytics para QA.']
  }
};

export function isDemoScenarioId(value: string | null | undefined): value is DemoScenarioId {
  if (!value) {
    return false;
  }
  return Object.prototype.hasOwnProperty.call(DEMO_SCENARIOS, value);
}
