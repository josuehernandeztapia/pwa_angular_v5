# Conductores PWA – Workspace

Toda la documentación principal vive en el README de la raíz del repositorio.

Consulta [`../README.md`](../README.md) para instrucciones de instalación, despliegue y guías de contribución.

- Si todavía ves dependencias a servicios legacy (por ejemplo `src/app/services/api.service.ts`), revisa
  [`docs/LEGACY_SERVICES.md`](docs/LEGACY_SERVICES.md) para conocer el reemplazo moderno en `/web`.
- Los experimentos del laboratorio (AVI, Tanda Lab, etc.) se mantienen fuera de `main`. Consulta
  [`docs/LAB_STATUS.md`](docs/LAB_STATUS.md) si necesitas trabajar con ellos.
- Para rutas legacy pendientes (por ejemplo `/quotation`), consulta
  [`docs/LEGACY_ROUTES.md`](docs/LEGACY_ROUTES.md).
- La comparación automática OCR ↔ AVI y el override manual se describen en
  [`docs/AVI_DOCUMENT_MATCH.md`](docs/AVI_DOCUMENT_MATCH.md).

## QA Checklist - Top Tier Angular

### Comprehensive Test Suites ✅
- [x] **CotizadorStore**: Complete test coverage with 150+ test cases
  - FlowContext snapshots and restoration
  - Insurance product toggles and validation
  - Collection unit CRUD operations
  - Step gating and navigation logic
  - Client data initialization and validation
  - Tanda limits and financial calculations
  - Signal reactivity and state management

- [x] **SimulatorStore**: Comprehensive test suite with 100+ test cases (1109 lines)
  - State management and persistence
  - Scenario filtering and smart context detection
  - Chart caching and performance optimization
  - Saved simulations CRUD operations
  - Comparison workflow and business logic
  - Signal-based reactive patterns

- [x] **FocusTrapService**: Complete accessibility testing
  - Focus memory and restoration functionality
  - Keyboard navigation and Tab cycling
  - Container-based focus trapping
  - Error handling and edge cases
  - Integration scenarios and cleanup

## Escenarios Demo Secuenciales

### Activación rápida
- Usa `?enableDemo=true` o el switch de la barra superior para entrar en modo demo. Cualquier URL con `?demo=<scenario>` activa automáticamente el guard `DemoRouterGuard`, fuerza el escenario correspondiente y redirige a su ruta preferida.
- El servicio `DemoModeService` ahora expone `getScenarioSnapshot`, `getClientByScenario`, `resetActiveScenario` y `resolveScenarioRedirect` para orquestar flujos demo desde componentes o pruebas.
- Seeds disponibles desde `DemoSeedService`: `getAviPerfectoSeed()`, `getKycDemoSeed()`, `getErrorDocsSeed()`, `getProteccionDemoSeed()`, `getTandaDemoSeed()`, `getPostventaDemoSeed()`, `getFinanzasWhatIfSeed()`, `getOnboardingMultiSeed()`, `getFavoritosExportSeed()` y `getTelemetriaFullSeed()`. Todas mantienen estado mutable (signals) y se pueden reiniciar con los métodos `reset*` equivalentes.
- En modo demo, usa los accesos directos del sidebar “AVI Test” y “KYC Test” para abrir los flujos mock instantáneos, reiniciar seeds y registrar telemetría `demo_avi_*` / `demo_kyc_*` sin navegar onboarding manual.

### Cómo usar “AVI Test” / “KYC Test” desde el sidebar
1. Activa modo demo (`?enableDemo=true`) o usa el banner superior.
2. Haz click en “AVI Test” o “KYC Test” justo debajo de “Simulador”. Cada acceso abre una vista dedicada (`/demo/avi-test` o `/demo/kyc-test`) con banner “Modo DEMO” y los seeds precargados (`getAviPerfectoSeed()` / `getKycDemoSeed()`).
3. Ejecuta el flujo completo:
   - **AVI Test**: sigue el stepper (briefing → entrevista → resultados), dispara la entrevista demo, observa los logs `demo_avi_*` y usa “Autocorregir” si aparecen banderas.
   - **KYC Test**: prepara documentos, simula la biometría (éxito o alerta) y revisa el log de eventos `demo_kyc_*`. El banner de alertas permite “Autocorregir” para completar la sesión.
4. Usa “Reiniciar Test AVI/KYC” para restaurar el seed y comenzar otra demostración sin arrastrar estado.
5. Consulta `/demo-analytics` para ver tiempos, resultados y eventos emitidos por ambos flujos.

### Flujos cubiertos
- **Documentos** (`/documentos?demo=...`): `DemoErrorBannerComponent` resalta documentos pendientes con acción “Autocorregir pendientes”. Cada tarjeta incluye botones “Simular incidencia”, “Autocorregir” y el conmutador AVI (GO/REVIEW/NO_GO) que delega en `DemoWorkflowService` (`fixDocument`, `rejectDocument`, `simulateAviDecision`).
- **Simulador** (`/simulador?demo=finanzas-whatif` o `proteccion-reestructura`): los escenarios financieros pasan por `DemoReestructuraEngine`, aplican cálculos falsos y registran telemetría. El módulo de tanda demo usa `DemoTandaService` (`simulateSorteo`, `markPaymentMissed`) con latencia simulada.
  - `AGS Ahorro` y `EdoMex Individual` cargan automáticamente la configuración del escenario What-If, repintan formularios y disparan la simulación inicial (`demo_finanzas_autosimulated`). Los botones “Reiniciar demo”, la selección de presets y las acciones rápidas (“Pago extra”, “Atraso”) se enlazan con `DemoReestructuraEngine`, actualizando KPIs y telemetría en tiempo real.
- **Cotizador** (`/cotizador?demo=finanzas-whatif` o `proteccion-reestructura`): la sección demo refleja el preset financiero activo, aplica configuración al store (`downPayment`, `voluntaryContribution`, unidades de consumo) y muestra la PMT resultante. Cualquier cambio manual dispara `demo_finanzas_autoupdate`; los botones de eventos financieros utilizan `simulateLatePayment`/`simulateExtraPayment` para generar nuevos logs en `DemoReestructuraEngine`.
- **Protección** (`/proteccion?demo=proteccion-reestructura`): las tarjetas de Stepdown/Diferimiento/Recalendarización consumen el mismo motor demo, muestran la PMT actualizada y exponen controles para registrar pagos extra o atrasados mientras se registran notas y telemetría.
- **Onboarding** (`/onboarding?demo=avi-perfecto`): checklist y tracker consumen seeds con `OnboardingRequirementsService.update`, conservan botones de reinicio y toggles de estado para entrenamiento.
- **Export / Favoritos** (`/dashboard?demo=favoritos-export`): `DemoExportService` genera blobs falsos y `DemoFavoritesStore` persiste favoritos en `sessionStorage` mediante signals.

### Telemetría y dashboard QA
- Todos los eventos pasan por `DemoAnalyticsService`, que prefija `demo_*`, guarda un log in-memory (`events`) y emite helpers como `trackFlowStart`, `trackDocumentFix`, `trackFinanceScenarioApplied`, `trackTandaEvent` y `trackExportSuccess`.
- Eventos clave para los flujos recientes:
  - `demo_finanzas_autosimulated`, `demo_finanzas_autoupdate`, `demo_finance_scenario_applied` (motor y simuladores).
  - `demo_finance_event` (pagos extra/atrasos desde simulador, cotizador y protección).
  - `demo_protection_option_applied`, `demo_protection_simulate_triggered` (acciones directas en protección).
  - `demo_avi_decision_simulated`, `demo_documents_autofix`, `demo_document_fix` (controles de documentos/onboarding).
- Página dedicada `/demo-analytics` (solo autenticado + demo) muestra la bitácora viva de eventos demo y permite limpiar el log. Usa el mismo servicio, por lo que cualquier acción en modo demo se refleja ahí.

### Sugerencias de QA / capacitación

#### Accesos directos AVI/KYC
1. Activa el modo demo (toggle superior o `?enableDemo=true`).
2. Usa el sidebar y selecciona **AVI Test** o **KYC Test**.
3. Confirma el banner “Modo DEMO” y utiliza los controles integrados (reiniciar test, simular decisión, autocorregir, etc.).
4. Sigue el flujo completo y verifica el mensaje final (“Test AVI/KYC demo completado”).
5. Revisa `/demo-analytics` para validar eventos `demo_avi_*` / `demo_kyc_*`, tiempos y métricas registradas.

1. Activa un escenario vía `?demo=` y reproduce los pasos secuenciales (AVI perfecto → errores docs → tanda → reestructura → postventa).
2. Observa los eventos emitidos en `/demo-analytics` mientras ejecutas las acciones guiadas (autocorrección, sorteo, penalizaciones, export falso).
3. Reinicia el escenario con `resetScenario` o la UI (“Reiniciar demo”) antes de cada demostración para garantizar repetibilidad.
4. Para pruebas automatizadas, utiliza las APIs de `DemoModeService` + `DemoSeedService` para hidratar el estado demo sin depender de datos reales.

### Test Execution ✅
Run all store tests with:
```bash
KARMA_PORT=9878 npm run test -- --watch=false --browsers=ChromeHeadless --include src/app/cotizador/cotizador.store.spec.ts,src/app/simulador/simulador.store.spec.ts
# Nuevos flujos demo (servicios + protección):
KARMA_PORT=9878 npm run test -- --watch=false --browsers=ChromeHeadless --include src/app/services/demo/demo-workflow.service.spec.ts,src/app/services/demo/demo-reestructura.engine.spec.ts,src/app/proteccion/proteccion.component.spec.ts
```

### Testing Infrastructure ✅
- [x] **ChartHarness**: Testing utilities for Chart.js integration
  - Chart rendering validation (`isChartRendered()`)
  - Accessibility compliance checking (`hasAccessibilityAttributes()`)
  - Canvas dimension verification (`getCanvasDimensions()`)
  - Component harness patterns for reliable testing

### Code Quality Standards ✅
- [x] **TypeScript strict mode** compliance
- [x] **Angular 17+ standalone architecture**
- [x] **Signal-based reactive patterns**
- [x] **Comprehensive error handling**
- [x] **Accessibility (a11y) compliance**
- [x] **Clean code architecture with proper separation of concerns**

### Performance & Architecture ✅
- [x] **Chart.js integration** with caching mechanisms
- [x] **localStorage persistence** for simulation state
- [x] **PWA compliance** with service worker integration
- [x] **Responsive design** and mobile optimization
- [x] **Memory management** and cleanup patterns

---

## Quality Checklist - Production Ready 🚀

### Development Environment Setup
**IMPORTANT**: This is the active codebase in `/web` directory. Legacy code remains in `/raiz` for reference only.

```bash
cd web  # Always work in web/ directory
npm install
npm start  # Development server on port 4200
```

### CI/CD Pipeline Commands

#### Linting & Code Quality
```bash
cd web
npm run ci:lint          # ESLint + Prettier validation
npm run lint             # Standard linting
npm run format           # Code formatting
```

#### Unit Testing - Store Validation
```bash
cd web
npm run ci:test:stores   # Core business logic tests
# OR manually:
KARMA_PORT=9878 npm run test -- --watch=false --browsers=ChromeHeadless --include src/app/cotizador/cotizador.store.spec.ts,src/app/simulador/simulador.store.spec.ts
```

#### End-to-End Testing
```bash
cd web
npm run ci:playwright    # E2E smoke tests
# OR manually:
npx playwright test tests/e2e/comparador-modals.spec.ts tests/e2e/cotizador-edomex-colectivo.spec.ts
```

#### Complete QA Validation
```bash
cd web
npm run ci:qa           # Full pipeline: lint + unit + e2e
```

### Test Specifications

#### Core Business Logic Tests
- **`src/app/cotizador/cotizador.store.spec.ts`**: FlowContext validation, insurance toggles, collection units CRUD, tanda limits, amortization calculations, PDF generation
- **`src/app/simulador/simulador.store.spec.ts`**: Caching reselect optimization, ordered savings, comparison snapshots, scenario filtering
- **`src/app/simulador/ags-ahorro/ags-ahorro.component.spec.ts`**: Verifica auto simulación y mensajes demo en AGS Ahorro
- **`src/app/simulador/edomex-individual/edomex-individual.component.spec.ts`**: Cubre autoparcheo de formularios y telemetría en EdoMex Individual
- **`src/app/services/core/focus-trap.service.spec.ts`**: Accessibility compliance, remember/restore cycles, Tab/Shift+Tab navigation

#### Integration & E2E Coverage
- **`tests/e2e/comparador-modals.spec.ts`**: Modal interactions and comparison workflows
- **`tests/e2e/cotizador-edomex-colectivo.spec.ts`**: Complete quotation flow validation

### Architecture Standards ✅

#### Modern Angular Patterns
- Angular 17+ standalone components
- Signal-based reactive state management
- Strict TypeScript configuration
- Component harness testing patterns

#### Performance & Accessibility
- Chart.js integration with intelligent caching
- Focus trap service for keyboard navigation
- PWA compliance with service worker
- Responsive design and mobile optimization

#### Code Quality Gates
- ESLint + Prettier enforcement
- Comprehensive unit test coverage (>90%)
- E2E smoke test validation
- Memory leak prevention patterns

---

### Migration Status
- **Active Codebase**: `/web` (Angular 17+ modern architecture)
- **Legacy Reference**: `/raiz` (preserved for rollback, do not modify)
- **CI Target**: All scripts point exclusively to `/web` directory

*Production-ready Angular application with comprehensive QA validation and modern architecture patterns.*


### Navigation Contract
- Consulta [`docs/NAVIGATION_CONTRACT.md`](docs/NAVIGATION_CONTRACT.md) para mapa actualizado de rutas, guards y breadcrumbs.
