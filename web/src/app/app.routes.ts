import { Routes } from '@angular/router';

import { environment } from '@environments/environment';
import { AuthGuard } from './guards/auth.guard';
import { AviCompletedGuard } from './guards/avi-completed.guard';
import { ContractReadyGuard } from './guards/contract-ready.guard';
import { ContractValidGuard } from './guards/contract-valid.guard';
import { DeliveryGuard } from './guards/delivery.guard';
import { FeatureFlagGuard } from './guards/feature-flag.guard';
import { PlazoGuard } from './guards/plazo.guard';
import { ProtectionRequiredGuard } from './guards/protection-required.guard';
import { RoleGuard } from './guards/role.guard';
import { TandaValidGuard } from './guards/tanda-valid.guard';
import { DemoRouterGuard } from './guards/demo-router.guard';

const baseRoutes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () => import('./login/login.component').then(m => m.LoginComponent),
    title: 'Iniciar Sesión - Conductores PWA'
  },
  {
    path: 'register',
    loadComponent: () => import('./register/register.component').then(m => m.RegisterComponent),
    title: 'Registro de Asesor - Conductores PWA'
  },
  {
    path: 'avi-interview',
    loadComponent: () => import('./avi-interview/avi-interview.component').then(m => m.AVIInterviewComponent),
    title: 'AVI Voice Interview - Conductores PWA'
  },
  {
    path: 'verify-email',
    loadComponent: () => import('./verify-email/verify-email.component').then(m => m.VerifyEmailComponent),
    title: 'Verificar Email - Conductores PWA'
  },
  {
    path: 'dashboard',
    canActivate: [AuthGuard, DemoRouterGuard],
    loadComponent: () => import('./dashboard/dashboard.component').then(m => m.DashboardComponent),
    title: 'Dashboard - Conductores PWA'
  },
  {
    path: 'demo-analytics',
    canActivate: [AuthGuard, DemoRouterGuard],
    loadComponent: () => import('./demo/demo-analytics.component').then(m => m.DemoAnalyticsComponent),
    title: 'Demo Analytics - Conductores PWA'
  },
  {
    path: 'demo/avi-test',
    canActivate: [AuthGuard, DemoRouterGuard],
    loadComponent: () => import('./demo/demo-avi-test.component').then(m => m.DemoAviTestComponent),
    title: 'Test AVI Demo - Conductores PWA'
  },
  {
    path: 'demo/kyc-test',
    canActivate: [AuthGuard, DemoRouterGuard],
    loadComponent: () => import('./demo/demo-kyc-test.component').then(m => m.DemoKycTestComponent),
    title: 'Test KYC Demo - Conductores PWA'
  },
  {
    path: 'onboarding',
    canActivate: [AuthGuard, DemoRouterGuard, FeatureFlagGuard],
    data: { featureFlag: 'enableOnboardingDashboard' },
    loadComponent: () => import('./onboarding/onboarding-main.component').then(m => m.OnboardingMainComponent),
    title: 'Onboarding - Conductores PWA'
  },
  {
    path: 'nueva-oportunidad',
    canActivate: [AuthGuard, DemoRouterGuard],
    loadComponent: () => import('./nueva-oportunidad/nueva-oportunidad.component').then(m => m.NuevaOportunidadComponent),
    title: 'Nueva Oportunidad - Conductores PWA'
  },
  {
    path: 'documentos',
    canActivate: [AuthGuard, DemoRouterGuard, AviCompletedGuard, PlazoGuard, TandaValidGuard, ProtectionRequiredGuard],
    loadComponent: () => import('./documents/ui/document-upload-shell.component').then(m => m.DocumentUploadShellComponent),
    title: 'Documentos - Conductores PWA'
  },
  { path: 'document-upload', redirectTo: '/documentos', pathMatch: 'full' },
  {
    path: 'kyc-verification',
    canActivate: [AuthGuard, DemoRouterGuard],
    loadComponent: () => import('./kyc/kyc-verification.component').then(m => m.KycVerificationComponent),
    title: 'Verificación biométrica - Conductores PWA'
  },
  {
    path: 'cotizador',
    canActivate: [AuthGuard, DemoRouterGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./cotizador/cotizador-main.component').then(m => m.CotizadorMainComponent),
        title: 'Cotizador - Conductores PWA'
      },
      {
        path: 'ags-individual',
        loadComponent: () => import('./cotizador/cotizador-main.component').then(m => m.CotizadorMainComponent),
        title: 'Cotizador AGS Individual - Conductores PWA',
        data: {
          presetMarket: 'aguascalientes',
          presetClientType: 'individual',
          autoAdvance: true
        }
      },
      {
        path: 'edomex-colectivo',
        loadComponent: () => import('./cotizador/cotizador-main.component').then(m => m.CotizadorMainComponent),
        title: 'Cotizador EdoMex Colectivo - Conductores PWA',
        data: {
          presetMarket: 'edomex',
          presetClientType: 'colectivo',
          autoAdvance: true
        }
      }
    ]
  },
  {
    path: 'quotation',
    canActivate: [AuthGuard, DemoRouterGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./quotation/quotation-flow.component').then(m => m.QuotationFlowComponent),
        title: 'Resumen de Cotización - Conductores PWA'
      },
      {
        path: 'create',
        loadComponent: () => import('./cotizador/cotizador-main.component').then(m => m.CotizadorMainComponent),
        title: 'Crear Cotización - Conductores PWA'
      },
      {
        path: ':quoteId',
        loadComponent: () => import('./quotation/quotation-flow.component').then(m => m.QuotationFlowComponent),
        title: 'Cotización - Conductores PWA'
      },
      {
        path: ':quoteId/review',
        loadComponent: () => import('./quotation/quotation-flow.component').then(m => m.QuotationFlowComponent),
        title: 'Revisión de Cotización - Conductores PWA'
      }
    ]
  },
  { path: 'cotizadores', redirectTo: '/cotizador', pathMatch: 'full' },
  { path: 'quotation/new', redirectTo: '/quotation/create', pathMatch: 'full' },
  {
    path: 'preview/cotizador',
    loadComponent: () => import('./cotizador/cotizador-main.component').then(m => m.CotizadorMainComponent),
    title: 'Cotizador (Preview) - Conductores PWA'
  },
  {
    path: 'simulador',
    canActivate: [AuthGuard, DemoRouterGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./simulador/simulador-main.component').then(m => m.SimuladorMainComponent),
        title: 'Simulador - Conductores PWA'
      },
      {
        path: 'ags-ahorro',
        loadComponent: () => import('./simulador/ags-ahorro/ags-ahorro.component').then(m => m.AgsAhorroComponent),
        title: 'Simulador AGS Ahorro - Conductores PWA'
      },
      {
        path: 'edomex-individual',
        loadComponent: () => import('./simulador/edomex-individual/edomex-individual.component').then(m => m.EdomexIndividualComponent),
        title: 'Simulador EdoMex Individual - Conductores PWA'
      },
      {
        path: 'tanda-colectiva',
        loadComponent: () => import('./simulador/tanda-colectiva/tanda-colectiva.component').then(m => m.TandaColectivaComponent),
        title: 'Simulador Tanda Colectiva - Conductores PWA'
      }
    ]
  },
  { path: 'simuladores', redirectTo: '/simulador', pathMatch: 'full' },
  {
    path: 'preview/simulador',
    loadComponent: () => import('./simulador/simulador-main.component').then(m => m.SimuladorMainComponent),
    title: 'Simulador (Preview) - Conductores PWA'
  },
  {
    path: 'preview/proteccion',
    loadComponent: () => import('./proteccion/proteccion.component').then(m => m.ProteccionComponent),
    title: 'Protección (Preview) - Conductores PWA'
  },
  {
    path: 'clientes',
    canActivate: [AuthGuard, DemoRouterGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./clientes/clientes-list.component').then(m => m.ClientesListComponent),
        title: 'Clientes - Conductores PWA'
      },
      {
        path: 'nuevo',
        loadComponent: () => import('./clientes/cliente-form.component').then(m => m.ClienteFormComponent),
        title: 'Alta de Cliente - Conductores PWA'
      },
      {
        path: ':id',
        loadComponent: () => import('./clientes/cliente-detail.component').then(m => m.ClienteDetailComponent),
        title: 'Detalle de Cliente - Conductores PWA'
      },
      {
        path: ':id/editar',
        loadComponent: () => import('./clientes/cliente-form.component').then(m => m.ClienteFormComponent),
        title: 'Editar Cliente - Conductores PWA'
      }
    ]
  },
  // Legacy client route redirects for compatibility
  { path: 'clientes/:id/edit', redirectTo: 'clientes/:id/editar', pathMatch: 'full' },
  {
    path: 'tracking',
    canActivate: [AuthGuard],
    children: [
      {
        path: 'client/:clientId',
        loadComponent: () => import('./tracking/client-tracking.component').then(m => m.ClientTrackingComponent),
        title: 'Tracking de Entrega - Conductores PWA'
      }
    ]
  },
  {
    path: 'client/:clientId',
    canActivate: [AuthGuard],
    loadComponent: () => import('./tracking/client-tracking.component').then(m => m.ClientTrackingComponent),
    title: 'Tracking de Entrega - Conductores PWA'
  },
  {
    path: 'expedientes',
    canActivate: [AuthGuard],
    loadComponent: () => import('./expedientes/expedientes.component').then(m => m.ExpedientesComponent),
    title: 'Expedientes Digitales - Conductores PWA'
  },
  {
    path: 'oportunidades',
    canActivate: [AuthGuard],
    loadComponent: () => import('./opportunities/opportunities-pipeline.component').then(m => m.OpportunitiesPipelineComponent),
    title: 'Pipeline de Oportunidades - Conductores PWA'
  },
  {
    path: 'proteccion',
    canActivate: [AuthGuard],
    loadComponent: () => import('./proteccion/proteccion.component').then(m => m.ProteccionComponent),
    title: 'Protección - Conductores PWA'
  },
  {
    path: 'entregas',
    canActivate: [AuthGuard, DeliveryGuard],
    loadComponent: () => import('./entregas/entregas.component').then(m => m.EntregasComponent),
    title: 'Entregas - Conductores PWA'
  },
  {
    path: 'entregas/:id',
    canActivate: [AuthGuard, DeliveryGuard],
    loadComponent: () => import('./ops/delivery-detail.component').then(m => m.DeliveryDetailComponent),
    title: 'Detalle de Entrega - Conductores PWA'
  },
  {
    path: 'gnv',
    canActivate: [AuthGuard],
    loadComponent: () => import('./gnv/gnv.component').then(m => m.GnvComponent),
    title: 'GNV - Salud de Estaciones'
  },
  {
    path: 'reportes',
    canActivate: [AuthGuard],
    loadComponent: () => import('./reportes/reportes.component').then(m => m.ReportesComponent),
    title: 'Reportes - Conductores PWA'
  },
  {
    path: 'productos',
    canActivate: [AuthGuard],
    loadComponent: () => import('./productos/productos-catalog.component').then(m => m.ProductosCatalogComponent),
    title: 'Catálogo de Productos - Conductores PWA'
  },
  {
    path: 'configuracion',
    canActivate: [AuthGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./configuracion/configuracion.component').then(m => m.ConfiguracionComponent),
        title: 'Configuración - Conductores PWA'
      },
      {
        path: 'politicas',
        loadComponent: () => import('./configuracion/market-policy-admin.component').then(m => m.MarketPolicyAdminComponent),
        title: 'Políticas de Mercado - Conductores PWA'
      },
      {
        path: 'flow-builder',
        canActivate: [FeatureFlagGuard],
        data: { featureFlag: 'enableFlowBuilder' },
        loadComponent: () => import('./configuracion/flow-builder/flow-builder.component').then(m => m.FlowBuilderComponent),
        title: 'Flow Builder - Conductores PWA'
      }
    ]
  },
  {
    path: 'flow-builder',
    canActivate: [AuthGuard, FeatureFlagGuard],
    data: { featureFlag: 'enableFlowBuilder' },
    loadComponent: () => import('./configuracion/flow-builder/flow-builder.component').then(m => m.FlowBuilderComponent),
    title: 'Flow Builder - Conductores PWA'
  }
];

const postSalesRoutes: Routes = [
  {
    path: 'postventa/wizard',
    canActivate: [AuthGuard, ContractValidGuard, FeatureFlagGuard],
    data: { featureFlag: 'enablePostventa' },
    loadComponent: () => import('./postventa/postventa-wizard.component').then(m => m.PostventaWizardComponent),
    title: 'Postventa – Wizard de 4 Fotos'
  }
];

const usageRoutes: Routes = [
  {
    path: 'usage',
    canActivate: [AuthGuard, FeatureFlagGuard],
    data: { featureFlag: 'enableUsageModule' },
    loadComponent: () => import('./usage/usage-reports.component').then(m => m.UsageReportsComponent),
    title: 'Usage & Reports (Beta)'
  }
];

const perfilRoutes: Routes = [
  {
    path: 'perfil',
    canActivate: [AuthGuard, FeatureFlagGuard],
    data: { featureFlag: 'enablePerfil' },
    loadComponent: () => import('./perfil/perfil.component').then(m => m.PerfilComponent),
    title: 'Mi Perfil - Conductores PWA'
  }
];

const labRoutes: Routes = [
  {
    path: 'lab/tanda-enhanced',
    canActivate: [AuthGuard, RoleGuard, FeatureFlagGuard],
    data: { featureFlag: 'enableLabs', roles: ['admin', 'supervisor'] },
    loadComponent: () => import('./lab/tanda-enhanced-panel.component').then(m => m.TandaEnhancedPanelComponent),
    title: 'LAB – Tanda Enhanced Panel'
  },
  {
    path: 'lab/tanda-consensus',
    canActivate: [AuthGuard, RoleGuard, FeatureFlagGuard],
    data: { featureFlag: 'enableLabs', roles: ['admin', 'supervisor'] },
    loadComponent: () => import('./lab/tanda-consensus-panel.component').then(m => m.TandaConsensusPanelComponent),
    title: 'LAB – Tanda Consensus Panel'
  },
  {
    path: 'labs/document-upload',
    canActivate: [AuthGuard, FeatureFlagGuard],
    data: { featureFlag: 'enableLabs' },
    loadComponent: () => import('./labs/document-upload-flow/document-upload-flow.component').then(m => m.DocumentUploadFlowComponent),
    title: 'LAB – Document Upload'
  },
  {
    path: 'labs/integration-demo',
    canActivate: [AuthGuard, FeatureFlagGuard],
    data: { featureFlag: 'enableLabs' },
    loadComponent: () => import('./labs/integration-demo/integration-demo.component').then(m => m.IntegrationDemoComponent),
    title: 'LAB – Integrations Demo'
  },
  {
    path: 'labs/protection-demo',
    canActivate: [AuthGuard, FeatureFlagGuard],
    data: { featureFlag: 'enableLabs' },
    loadComponent: () => import('./labs/protection-demo-simulator/protection-demo-simulator.component').then(m => m.ProtectionDemoSimulatorComponent),
    title: 'LAB – Protection Simulator'
  }
];

const claimsRoutes: Routes = [
  {
    path: 'claims',
    canActivate: [AuthGuard, RoleGuard, FeatureFlagGuard],
    data: {
      roles: ['admin', 'claims_manager'],
      featureFlag: 'enableClaimsModule'
    },
    loadComponent: () => import('./claims/claims-page.component').then(m => m.ClaimsPageComponent),
    title: 'Claims & Service - Conductores PWA'
  }
];

const qaRoutes: Routes = [
  {
    path: 'qa/monitoring',
    canActivate: [AuthGuard, RoleGuard, FeatureFlagGuard],
    data: {
      roles: ['admin'],
      featureFlag: 'enableQaTools'
    },
    loadComponent: () => import('./qa/monitoring-panel.component').then(m => m.MonitoringPanelComponent),
    title: 'QA – Monitoring Events'
  }
];

const adminRoutes: Routes = [
  {
    path: 'administracion',
    canActivate: [AuthGuard, RoleGuard, FeatureFlagGuard],
    data: {
      roles: ['admin'],
      featureFlag: 'enableAdminConfig'
    },
    loadComponent: () => import('./administracion/admin-panel.component').then(m => m.AdminPanelComponent),
    title: 'Panel de Administración'
  }
];

const integrationsRoutes: Routes = [
  {
    path: 'integraciones',
    canActivate: [AuthGuard, FeatureFlagGuard],
    data: { featureFlag: 'enableIntegrationsConfig' },
    loadComponent: () => import('./integration/integration.component').then(m => m.IntegrationComponent),
    title: 'Integraciones Externas - Conductores PWA'
  },
  {
    path: 'integraciones/:clientId',
    canActivate: [AuthGuard, FeatureFlagGuard],
    data: { featureFlag: 'enableIntegrationsConfig' },
    loadComponent: () => import('./integration/integration.component').then(m => m.IntegrationComponent),
    title: 'Integraciones Externas - Conductores PWA'
  }
];

const operationsRoutes: Routes = [
  {
    path: 'ops',
    canActivate: [AuthGuard],
    children: [
      { path: '', redirectTo: 'deliveries', pathMatch: 'full' },
      {
        path: 'deliveries',
        loadComponent: () => import('./ops/ops-deliveries.component').then(m => m.OpsDeliveriesComponent),
        title: 'Centro de Operaciones - Entregas'
      },
      {
        path: 'deliveries/:id',
        canActivate: [DeliveryGuard],
        loadComponent: () => import('./ops/delivery-detail.component').then(m => m.DeliveryDetailComponent),
        title: 'Detalle de Entrega - Operaciones'
      },
      {
        path: 'import-tracker',
        loadComponent: () => import('./ops/ops-import-tracker.component').then(m => m.OpsImportTrackerComponent),
        title: 'Import Tracker - Operaciones'
      },
      {
        path: 'gnv-health',
        loadComponent: () => import('./gnv/gnv.component').then(m => m.GnvComponent),
        title: 'GNV Health - Operaciones'
      },
      {
        path: 'triggers',
        loadComponent: () => import('./ops/triggers-monitor.component').then(m => m.TriggersMonitorComponent),
        title: 'Monitor de Triggers Automáticos'
      }
    ]
  }
];

const contractsRoutes: Routes = [
  {
    path: 'contratos/generacion',
    canActivate: [AuthGuard, ContractReadyGuard],
    loadComponent: () => import('./contracts/contract-generation.component').then(m => m.ContractGenerationComponent),
    title: 'Generación de Contratos - Conductores PWA'
  }
];

const fallbackRoutes: Routes = [
  {
    path: 'offline',
    loadComponent: () => import('./shared/offline.component').then(m => m.OfflineComponent),
    title: 'Sin conexión - Conductores PWA'
  },
  {
    path: 'unauthorized',
    loadComponent: () => import('./shared/unauthorized.component').then(m => m.UnauthorizedComponent),
    title: 'No autorizado - Conductores PWA'
  },
  {
    path: '404',
    loadComponent: () => import('./shared/not-found.component').then(m => m.NotFoundComponent),
    title: 'Página no encontrada - Conductores PWA'
  },
  { path: '**', redirectTo: '/404' }
];

export const routes: Routes = [
  ...baseRoutes,
  ...(environment.features.enablePostventa ? postSalesRoutes : []),
  ...(environment.features.enableLabs ? labRoutes : []),
  ...operationsRoutes,
  ...contractsRoutes,
  ...(environment.features.enableUsageModule ? usageRoutes : []),
  ...(environment.features.enablePerfil ? perfilRoutes : []),
  ...(environment.features.enableClaimsModule ? claimsRoutes : []),
  ...(environment.features.enableQaTools ? qaRoutes : []),
  ...(environment.features.enableAdminConfig ? adminRoutes : []),
  ...(environment.features.enableIntegrationsConfig ? integrationsRoutes : []),
  ...fallbackRoutes
];
