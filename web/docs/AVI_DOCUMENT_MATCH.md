# Verificación automática OCR ↔ AVI

## Panorama general

- **Objetivo:** comparar los datos clave extraídos por OCR con las respuestas de la entrevista AVI para detectar discrepancias sin intervención manual.
- **Cobertura:** nombre completo, CURP y domicilio.
- **Estados posibles:** `match`, `mismatch` y `insufficient` (cuando falta información para comparar).

## Flujo

1. Document Upload reconstruye un `AviDocumentMatchSnapshot` cada vez que hay nuevos datos de OCR o AVI.
2. El `OnboardingRequirementsService` agrega el snapshot al requisito "Entrevista AVI" y ajusta el estado:
   - `match`: el requisito se completa automáticamente.
   - `mismatch`: el requisito se bloquea y se muestra el detalle de los campos en conflicto.
   - `insufficient`: el requisito queda pendiente.
3. El snapshot y su `matchScore` se persisten en `FlowContextService` para soportar refresh/undo.
4. Se emite el evento de analítica `avi_document_match` con `origin` (`documents` u `onboarding`), `status`, `score`, campos en `mismatch` y si existe una anulación manual.

## Control manual

- El checklist ahora muestra un bloque contextual cuando el requisito AVI está en `mismatch`.
- El asesor debe dejar un comentario (mín. 10 caracteres) y puede elegir:
  - **Marcar como aceptado:** registra la discrepancia como revisada.
  - **Forzar aprobación:** completa el requisito aun con mismatch.
- El estado manual queda guardado como `documentMatchOverride` y persiste en sesión.
- Al revertir la decisión se emite `avi_document_override_cleared`.

## Seeds demo

- Escenario `avi-perfecto`: por defecto `match` (opciones: match/mismatch/insufficient).
- Escenario `errores-documentos`: por defecto `mismatch` (misma paleta de opciones).
- En ambos flujos se puede alternar el estado desde Document Upload y Onboarding.

## Telemetría

| Evento | Origen | Datos |
| --- | --- | --- |
| `avi_document_match` | `documents`, `onboarding` | `status`, `score`, `mismatches`, `hasOverride`, `overrideDecision`, `market`, `saleType`, `clientType`, `businessFlow`, `clientId` |
| `avi_document_override` | `documents`, `onboarding` | `decision`, `commentLength` |
| `avi_document_override_cleared` | `documents`, `onboarding` | — |

## QA sugerida

- Simular `match`, `mismatch` e `insufficient` en demo (`Documentos` y `Onboarding`).
- Forzar aprobación con comentario y verificar que el requisito pase a `completed`.
- Refrescar la sesión para validar persistencia de `documentMatch` y del override.
- Confirmar que los eventos se registren en el panel de analytics/demolog.
