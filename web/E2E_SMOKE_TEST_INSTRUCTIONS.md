# Smoke Test Validation Instructions

## Real Backend E2E Tests

Para ejecutar las validaciones de smoke test contra el BFF real, sigue estos pasos:

### 1. Configuración de Variables de Entorno

```bash
export E2E_USE_REAL_BFF=true
export E2E_REAL_BASE_URL="https://qa.conductores-pwa.com"  # Reemplazar con URL QA real
export E2E_REAL_USER_EMAIL="usuario.qa@conductores.com"    # Usuario de QA válido
export E2E_REAL_USER_PASSWORD="password_qa_seguro"         # Password de QA válido
```

### 2. Validaciones Locales Completadas

✅ **Linting**: `npm run lint` - All files pass linting
✅ **Production Build**: `npm run build:prod` - Bundle generation complete (790KB → 187KB)
✅ **QA Build**: `npm run build:qa` - Successfully generates QA artifacts
✅ **Route Tests**: Legacy quotation route compatibility verified

### 3. Smoke Test Execution

Una vez configuradas las variables de entorno, ejecutar:

```bash
# Ejecutar smoke tests específico
npx playwright test tests/e2e/real-backend-smoke.spec.ts --project=chromium

# O ejecutar todos los E2E tests
npm run test:e2e
```

### 4. Test Coverage

Los smoke tests validarán:
- **Login Flow**: Autenticación real contra BFF
- **Opportunities Pipeline**: Carga de datos reales del pipeline de oportunidades
- **Usage Reports**: Métricas de revenue desde el backend real
- **Navigation**: Rutas principales funcionando con datos reales

### 5. Issues Pendientes para Test Coverage

⚠️ **Unit Tests**: 43 tests failing debido a Angular injection context issues:
- `takeUntilDestroyed()` usado fuera de contexto de inyección
- Tests de componentes necesitan TestBed.runInInjectionContext()
- Requiere refactoring de tests para Angular 17 patterns

### 6. Status de Validaciones

| Validación | Status | Notas |
|------------|--------|--------|
| Linting | ✅ Completado | All files pass linting |
| Production Build | ✅ Completado | 790KB bundle, optimized |
| Legacy Routes | ✅ Completado | Redirects working |
| Unit Tests | ⚠️ Pendiente | 43 failures - injection context |
| **Real BFF E2E** | 🔄 **Ready to Execute** | **Necesita credenciales** |
| Offline Sync | ⏳ Pendiente | Siguiente fase |

### 7. Comando de Validación Completa

Para ejecutar todas las validaciones disponibles (exceptuando las que necesitan credenciales):

```bash
# Validaciones locales
npm run lint && \\
npm run build:prod && \\
npm test -- --include="**/app.routes.spec.ts" --browsers=ChromeHeadless --watch=false

# Smoke tests reales (requiere credenciales)
E2E_USE_REAL_BFF=true \\
E2E_REAL_BASE_URL="https://qa.conductores-pwa.com" \\
E2E_REAL_USER_EMAIL="qa@conductores.com" \\
E2E_REAL_USER_PASSWORD="qa_password" \\
npx playwright test tests/e2e/real-backend-smoke.spec.ts
```

### 8. Next Steps

1. **Inmediato**: Configurar credenciales QA y ejecutar smoke tests
2. **Corto plazo**: Fix Angular injection context issues en unit tests
3. **Medio plazo**: Validación de sincronización offline/online
4. **Roadmap**: Ampliar cobertura de tests para módulos restantes