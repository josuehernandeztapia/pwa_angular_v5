import { createEnvironment } from './environment.base';

export const environment = createEnvironment({
  production: true,
  apiUrl: 'https://api.conductores-pwa.com/v1',
  appName: 'Conductores PWA',
  version: '1.0.0',
  features: {
    enableMockData: false,
    enableAnalytics: true,
    enablePushNotifications: true,
    enableOfflineMode: true,
    enableDocumentValidationMock: false,
    forceOfflineQueueMock: false,
    enablePostSalesWizard: true,
    enableDevKpi: false,
    enablePostSalesAddToQuote: false,
    enableOdooQuoteBff: true,
    enableGnvBff: true,
    enableTandaLab: false,
    enableRemoteConfig: true,
    enableConfigShadowMode: false,
    enablePerfConfig: true,
    enableUiMessages: true,
    enableValidationConfig: true,
    enableFinancialRates: true,
    enableCatalogConfig: true,
    enableLocalizationConfig: true,
    enableIntegrationsConfig: true,
    enableSecurityConfig: true,
    enableKycBff: true,
    enablePaymentsBff: true,
    enableContractsBff: true,
    enableAutomationBff: true,
    enableAviMicroLocalBff: true,
    enableLabs: false,
    enablePostventa: true,
    enableClaimsModule: true,
    enableFlowBuilder: true,
    enablePostSaleBff: true,
    enableClaimsBff: true,
    enableAdminBff: true,
    enablePerfil: true,
    enableQaTools: false,
    enableUsageModule: true,
    enableGlobalSearch: true
  },
  config: {
    assetsBasePath: '/assets/config',
    remoteBaseUrl: ''
  },
  integrations: {
    odoo: { baseUrl: '' },
    gnv: { baseUrl: '' },
    kyc: { baseUrl: '' },
    payments: { baseUrl: '' },
    contracts: { baseUrl: '' },
    automation: { baseUrl: '' }
  },
  analytics: {
    eventsEndpoint: 'analytics/events',
    metricsEndpoint: 'analytics/metrics',
    flushIntervalMs: 10000
  },
  monitoring: {
    eventsEndpoint: 'monitoring/events',
    datadogEndpoint: 'monitoring/datadog',
    slackWebhook: ''
  },
  services: {
    metamap: {
      clientId: '',
      flowId: '',
      baseUrl: 'https://api.metamap.com'
    },
    conekta: {
      publicKey: '',
      baseUrl: 'https://api.conekta.io'
    },
    mifiel: {
      appId: '',
      baseUrl: 'https://api.mifiel.com/api/v1'
    }
  },
  timeouts: {
    api: 30000,
    fileUpload: 120000,
    auth: 15000
  },
  finance: {
    irrToleranceBps: 50,
    minPaymentRatio: 0.5,
    irrTargets: {
      bySku: {},
      byEcosystem: {},
      byCollective: {}
    },
    riskPremiums: {
      byEcosystem: {}
    },
    tandaCaps: {
      rescueCapPerMonth: 1.0,
      freezeMaxPct: 0.2,
      freezeMaxMonths: 2,
      activeThreshold: 0.8
    }
  }
});
