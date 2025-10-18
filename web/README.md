# Conductores PWA – Workspace

Toda la documentación principal vive en el README de la raíz del repositorio.

Consulta [`../README.md`](../README.md) para instrucciones de instalación, despliegue y guías de contribución.

- Si todavía ves dependencias a servicios legacy (por ejemplo `src/app/services/api.service.ts`), revisa
  [`docs/LEGACY_SERVICES.md`](docs/LEGACY_SERVICES.md) para conocer el reemplazo moderno en `/web`.
- Los experimentos del laboratorio (AVI, Tanda Lab, etc.) se mantienen fuera de `main`. Consulta
  [`docs/LAB_STATUS.md`](docs/LAB_STATUS.md) si necesitas trabajar con ellos.
- Para rutas legacy pendientes (por ejemplo `/quotation`), consulta
  [`docs/LEGACY_ROUTES.md`](docs/LEGACY_ROUTES.md).

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

### Test Execution ✅
Run all store tests with:
```bash
KARMA_PORT=9878 npm run test -- --watch=false --browsers=ChromeHeadless --include src/app/cotizador/cotizador.store.spec.ts,src/app/simulador/simulador.store.spec.ts
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
