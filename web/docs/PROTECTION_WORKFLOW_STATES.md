# Protection Workflow FSM

La migración 2025 consolidó el módulo de protección en `@feature-services/risk/protection-workflow.service`. Este servicio controla todo el ciclo de vida del plan usando señales Angular 17 y una máquina de estados compatible con producción. A continuación se documentan los estados, eventos y feedback UX asociados.

| Estado | Eventos de entrada | Acción UX | Siguiente transición |
| --- | --- | --- | --- |
| `IDLE` | `loadPlan(contractId)` | Mostrar breadcrumbs "Dashboard > Protección" | `simulateScenarios` → `ELIGIBLE` |
| `ELIGIBLE` | `simulateScenarios` (respuesta exitosa) | Toast ✅ “n opciones de protección disponibles” y tarjetas en UI | `selectScenario` → `PENDING_APPROVAL` |
| `PENDING_APPROVAL` | `selectScenario` (BFF success) | Toast ✅ “Escenario seleccionado, esperando aprobación” | `approveScenario` → `READY_TO_SIGN` / `denyScenario` → `REJECTED` |
| `READY_TO_SIGN` | `approveScenario` | Toast ✅ “Protección aprobada, listo para firmar” y habilita botón de firma | `signDocument` → `SIGNED` |
| `SIGNED` | `signDocument` ❯ `handleMifielCompletion` | Toast ✅ “Documento firmado exitosamente, aplicando cambios” | `applySelectedScenario` → `APPLIED` |
| `APPLIED` | `applySelectedScenario` o `applyProtection()` | Toast ✅ “¡Protección aplicada exitosamente!” + schedule actualizado | --- |
| `REJECTED` | `denyScenario` | Toast ℹ️ “Solicitud de protección denegada” | Opcional: `simulateScenarios` para regresar a `ELIGIBLE` |
| `EXPIRED` | `triggerHealthEvent` con respuesta `expired` / backend | Toast ⚠️ “Protección expirada” | Requiere nueva simulación |

## Señales expuestas

- `currentPlan`: snapshot del plan activo.
- `availableScenarios` / `selectedScenario`: se actualizan tras simulación y selección.
- `currentState`, `validTransitions`, `hasPendingSelection`: utilidades para la UI.
- `loading`, `simulating`, `error`, `lastAction`: permiten spinners o banners de error.

## Eventos soportados

| Método público | Descripción |
| --- | --- |
| `loadPlan(contractId)` | Descarga plan actual y limpia errores previos. |
| `simulateScenarios(contractId, monthK, options)` | Evalúa elegibilidad y escenarios desde el BFF. |
| `selectScenario(contractId, scenario)` | Lanza transición a `PENDING_APPROVAL` y actualiza auditoría. |
| `approveScenario(contractId, approvedBy, notes?)` | Avanza a `READY_TO_SIGN`; registra aprobador. |
| `denyScenario(contractId, deniedBy, reason)` | Marca plan como `REJECTED` con motivo. |
| `signDocument(contractId, scenarioType)` | Crea sesión Mifiel y espera firma; en sandbox simula cierre de ventana. |
| `applySelectedScenario(contractId, effectiveDate?)` | Llama `/v1/protection/apply`, actualiza schedule y estado. |
| `triggerHealthEvent(event)` | Replica lógica de alertas automáticas: cuando el BFF responde con `ELIGIBLE` muestra toast informativo. |
| `reset()` | Limpia todas las señales (útil para testing). |

## Toasts & Telemetría

- **Éxito simulación:** `toast.success("{n} opciones…")`
- **Selección:** `toast.success('Escenario seleccionado, esperando aprobación')`
- **Aprobación:** `toast.success('Protección aprobada, listo para firmar')`
- **Denegación:** `toast.info('Solicitud de protección denegada')`
- **Firma:** `toast.success('Documento firmado exitosamente, aplicando cambios')`
- **Aplicación:** `toast.success('¡Protección aplicada exitosamente!')`
- **Errores:** cada catch setea `errorSignal` y lanza `toast.error` con mensaje amigable.

Todos los errores/timeout se rastrean mediante `MonitoringService.captureWarning` y métricas en `AnalyticsService`.

## Integración con la UI

`proteccion.component.ts` consume el workflow vía señales y dispara `loadPlan` + `simulateScenarios` en `ngOnInit`. Los cards llaman `selectScenario`, y las acciones administrativas (aprobación, firma, aplicación) están disponibles para shells administrativos o pruebas E2E.

Para pruebas, se recomienda mockear los endpoints:

- `GET /api/v1/protection/plan/:contractId`
- `POST /api/v1/protection/simulate`
- `POST /api/v1/protection/select`
- `POST /api/v1/protection/approve`
- `POST /api/v1/protection/sign`
- `POST /api/v1/protection/apply`

