# Conductores PWA – QA Guide

> Referencia rápida tras mover el proyecto Angular a `web/`.

## 1. Preparación Local

```bash
cd web
npm ci --legacy-peer-deps
```

### Comandos Clave

| Objetivo                  | Comando                          |
|---------------------------|----------------------------------|
| Lint                      | `npm run lint`                   |
| Unit tests (karma)        | `npm run test:unit`              |
| Servicios (headless)      | `npm run test:services`          |
| Mutación rápida           | `npm run test:mutation:quick`    |
| Visual (Playwright)       | `npm run test:qa-visual`         |
| Accesibilidad (Playwright)| `npm run test:accessibility`     |
| E2E Chrome                | `npm run test:e2e:chrome`        |
| Build prod                | `npm run build:prod`             |

## 2. Suites Obligatorias por PR

1. `npm run lint`
2. `npm run test:services`
3. `npm run build:prod`

Los pipelines `monorepo-ci` y `prebuild-qa-gates` ejecutan estas tareas automáticamente desde `web/`.

## 3. Artefactos y Reportes

- `web/reports/quality/` → badges, resúmenes, coverage consolidado.
- `web/reports/videos/` → demos automáticas (Playwright + ffmpeg).
- `web/test-results/` → traces, screenshots y JSON de Playwright.

Al subir a CI, los workflows suben estos directorios como artefactos. Descárgalos para investigar fallos.

## 4. Enfoque de Revisión

- **Coverage**: meta ≥ 80% services/components (ver `web/reports/quality/coverage-dashboard.html`).
- **Lighthouse**: pipeline `pwa-validation.yml` ejecuta auditoría móvil. Apunta a `dist/conductores-pwa/browser`.
- **Accesibilidad**: `npm run test:accessibility` usa Playwright + axe-core sobre build local (`npm run build:prod`).

## 5. Troubleshooting

| Problema                                | Solución sugerida |
|-----------------------------------------|-------------------|
| Falla `npm run serve:test` en CI        | Revisa puertos ocupados; el workflow espera `4200` y `3000`. |
| Tests visuales con difs constantes      | Limpia `web/test-results/visual` localmente y regenera snapshots si procede. |
| Timeout en `npm run test:e2e`           | Usa `npm run serve:test` manual, valida `wait-on` y logs de Playwright (`web/playwright-report`). |
| Mutación muy lenta                      | Ejecuta `npm run test:mutation:quick`; para full suite usa CI (`prebuild-qa: full`). |

## 6. Matriz de Pipelines

| Workflow                     | Qué valida                                      |
|------------------------------|-------------------------------------------------|
| `monorepo-ci.yml`            | Lint, unit/services, build stats, QA gates      |
| `prebuild-qa-gates.yml`      | Lint + tests + E2E (+ full suite opcional)      |
| `qa-visual.yml`              | Visual (3 browsers), accesibilidad, mobile      |
| `pwa-validation.yml`         | Build prod + SW + manifest + Lighthouse         |
| `e2e-demo.yml`/`e2e-video-demo.yml` | Demos grabadas para stakeholders              |

Todos hacen `cd web` antes de instalar/ejecutar.

## 7. Checklist para Releases

1. `npm run prebuild:qa:full`
2. `npm run build:prod`
3. Revisar `web/reports/quality/report.md`
4. Confirmar que `web/dist/` cumple budgets (`npm run size:guard`)

---

Cualquier hallazgo o nuevo script debe documentarse aquí manteniendo el foco en el workspace `web/`.
