# Navigation Contract – Angular 17 Shell

> Actualizado tras auditoría full-stack (oct-2025)

| Ruta | Componente | Guards | Breadcrumbs |
| ---- | ---------- | ------ | ----------- |
| `/dashboard` | `DashboardComponent` | `AuthGuard` | Dashboard |
| `/nueva-oportunidad` | `NuevaOportunidadComponent` | `AuthGuard` | Dashboard → Nueva oportunidad |
| `/documentos` | `DocumentUploadShellComponent` | `AuthGuard`, `AviCompletedGuard`, `PlazoGuard`, `TandaValidGuard`, `ProtectionRequiredGuard` | Dashboard → Documentos |
| `/kyc-verification` | `KycVerificationComponent` | `AuthGuard` | Dashboard → Documentos → KYC |
| `/cotizador` | `CotizadorMainComponent` | `AuthGuard` | Dashboard → Cotizador |
| `/cotizador?preset=ags-individual` | `CotizadorMainComponent` | `AuthGuard` | Dashboard → Cotizador → AGS Individual |
| `/cotizador?preset=edomex-colectivo` | `CotizadorMainComponent` | `AuthGuard` | Dashboard → Cotizador → EdoMex Colectivo |
| `/quotation` | `QuotationFlowComponent` | `AuthGuard` | Dashboard → Cotizador → Resumen |
| `/quotation/create` | `CotizadorMainComponent` | `AuthGuard` | Dashboard → Cotizador → Crear |
| `/quotation/new` | Redirect → `/quotation/create` | `AuthGuard` | Dashboard → Cotizador → Crear |
| `/quotation/:quoteId` | `QuotationFlowComponent` | `AuthGuard` | Dashboard → Cotizador → Cotización #:id |
| `/simulador` | `SimuladorMainComponent` | `AuthGuard` | Dashboard → Simulador |
| `/simulador/ags-ahorro` | `AgsAhorroComponent` | `AuthGuard` | Dashboard → Simulador → AGS Ahorro |
| `/simulador/edomex-individual` | `EdomexIndividualComponent` | `AuthGuard` | Dashboard → Simulador → EdoMex Individual |
| `/simulador/tanda-colectiva` | `TandaColectivaComponent` | `AuthGuard` | Dashboard → Simulador → Tanda Colectiva |
| `/clientes` | `ClientesListComponent` | `AuthGuard` | Dashboard → Clientes |
| `/claims` | `ClaimsPageComponent` | `AuthGuard`, `RoleGuard`, `FeatureFlagGuard` (`enableClaimsModule`) | Dashboard → Claims |
| `/entregas` | `EntregasComponent` | `AuthGuard`, `DeliveryGuard` | Dashboard → Entregas |
| `/gnv` | `GnvComponent` | `AuthGuard` | Dashboard → GNV |
| `/proteccion` | `ProteccionComponent` | `AuthGuard` | Dashboard → Protección |
| `/productos` | `ProductosCatalogComponent` | `AuthGuard` | Dashboard → Productos |
| `/postventa/wizard` | `PostventaWizardComponent` | `AuthGuard`, `FeatureFlagGuard` (`enablePostventa`) | Dashboard → Postventa |
| `/configuracion` | `ConfiguracionComponent` | `AuthGuard` | Dashboard → Configuración |
| `/configuracion/politicas` | `MarketPolicyAdminComponent` | `AuthGuard` | Dashboard → Configuración → Políticas |
| `/configuracion/flow-builder` | `FlowBuilderComponent` | `AuthGuard` | Dashboard → Configuración → Flow Builder |
| `/integraciones` | `IntegrationComponent` | `AuthGuard`, `FeatureFlagGuard` (`enableIntegrationsConfig`) | Dashboard → Configuración → Integraciones |
| `/integraciones/:clientId` | `IntegrationComponent` | `AuthGuard`, `FeatureFlagGuard` (`enableIntegrationsConfig`) | Dashboard → Configuración → Integraciones |
| `/perfil` | `PerfilComponent` | `AuthGuard`, `FeatureFlagGuard` (`enablePerfil`) | Dashboard → Configuración → Perfil |
| `/tracking/client/:clientId` | `ClientTrackingComponent` | `AuthGuard` | Dashboard → Tracking |
| `/lab/tanda-enhanced` | `TandaEnhancedPanelComponent` | `AuthGuard`, `RoleGuard`, `FeatureFlagGuard` (`enableLabs`) | Requiere flag de laboratorio |
| `/lab/tanda-consensus` | `TandaConsensusPanelComponent` | `AuthGuard`, `RoleGuard`, `FeatureFlagGuard` (`enableLabs`) | Requiere flag de laboratorio |
| `/labs/document-upload` | `DocumentUploadFlowComponent` | `AuthGuard`, `FeatureFlagGuard` (`enableLabs`) | Nuevo lab (documentos) |
| `/labs/integration-demo` | `IntegrationDemoComponent` | `AuthGuard`, `FeatureFlagGuard` (`enableLabs`) | Demo de integraciones |
| `/labs/protection-demo` | `ProtectionDemoSimulatorComponent` | `AuthGuard`, `FeatureFlagGuard` (`enableLabs`) | Simulador de protección |
| `/administracion` | `AdminPanelComponent` | `AuthGuard`, `RoleGuard` (`admin`), `FeatureFlagGuard` (`enableAdminConfig`) | Dashboard → Administración |
| `/offline` | `OfflineComponent` | — | — |
| `/unauthorized` | `UnauthorizedComponent` | — | — |

## Quick Actions & Shell Items
- La CTA "Nueva Oportunidad" abre `/nueva-oportunidad` con guard `AuthGuard`.
- La navegación lateral muestra Entregas, GNV y Protección; la disponibilidad depende de los feature flags descritos en `NavigationService`.
- El bottom nav activa Postventa únicamente si `environment.features.enablePostSalesWizard === true`.

## Validación BFF en entorno real
- `ENABLE_MOCK_DATA=false npx playwright test tests/e2e/claims-smoke.spec.ts`
- `ENABLE_MOCK_DATA=false npx playwright test tests/e2e/tracking-flow.spec.ts`
- `npx playwright test tests/visual/all-modules.spec.ts` (stub de BFF inyectado por spec)

## CI/CD hooks
- Workflows ejecutan `npm` desde `/web` (`monorepo-ci.yml`, `prebuild-qa-gates.yml`).
- El `Dockerfile` raíz utiliza `WORKSPACE_DIR=web` y los scripts (`staging-deploy.sh`, `scripts/deploy-prod.sh`) incluyen `cd web` antes de instalar o construir.
