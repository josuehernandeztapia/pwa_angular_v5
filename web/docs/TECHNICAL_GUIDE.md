# Conductores PWA – Technical Guide

> Última actualización: reubicación del proyecto Angular a `web/` (oct-2025).

## 1. Estructura Física

```
raiz/
  # snapshot legacy congelado (no ejecutar builds/test aquí)
web/
  angular.json
  package*.json
  tsconfig*.json
  src/
    app/        # Features, shared, services, guards
    assets/     # Configuración estática y multimedia
    environments/
    styles/     # Diseño global (tokens, helpers)
  scripts/
  tests/        # E2E + visual
  reports/      # Salida de pipelines (qa, cobertura, videos)
```

Recomendación: crear aliases con `@app`, `@services`, `@shared`, etc. (ya configurados en `tsconfig.json`). Todas las rutas relativas antiguas quedan obsoletas.

## 2. Comandos Base

Ejecutar siempre desde `web/`:

```bash
# instalar dependencias
npm ci --legacy-peer-deps

# servidor local (mocks)
npm start

# servidor local contra BFF
default: npm run start:real  # consume http://localhost:3000

# build producción
default: npm run build:prod
```

## 3. Aliases y Módulos

- `@app/*` → `src/app/*`
- `@shared/*` → `src/app/shared/*`
- `@services/*` → `src/app/services/*`
- `@interfaces/*` → `src/app/interfaces/*`
- `@utils/*` → `src/app/utils/*`
- `@demo/*` → `src/app/demo/*`
- `@styles/*` → `src/app/styles/*`
- `@environments/*` → `src/environments/*`

## 4. Consideraciones Técnicas

- Revisa el contrato de navegación actualizado en [`docs/NAVIGATION_CONTRACT.md`](./NAVIGATION_CONTRACT.md) para conocer rutas ↔ componentes ↔ guards.

- **Build**: Angular 17 con `@angular-devkit` y modo standalone; lazy loading obligatorio para rutas > dashboard.
- **PWA**: `manifest.webmanifest` y `ngsw-config.json` viven en `src/`; el build genera la versión final en `dist/conductores-pwa/browser/`.
- **Service Worker**: revisa cambios en `src/ngsw-config.json` tras agregar assets; el pipeline `pwa-validation.yml` valida schema.
- **Diseño**: tokens centralizados en `src/styles/tokens` y `src/app/styles/design-tokens.ts`; evita estilos en línea.
- **Scripts**: todos los scripts auxiliares siguen en `web/scripts`; se invocan desde `package.json` y desde CI.
- **BFF/AVI**: los scripts y package.json del BFF siguen ubicados en `web/bff/` (si se reactiva el subproyecto).

## 5. Integración Continua

Los workflows consumen comandos desde `web/`. Antes de subir changes, verifica localmente:

```bash
npm run lint
npm run test:services
npm run build:prod
```

Para QA extendido consulta `npm run prebuild:qa:full` (ejecuta tests, mutación y reports). Los artefactos se generan en `web/reports/`.

## 6. Migraciones Post-Reubicación

1. Actualiza cualquier script o tooling local que apuntaba a la raíz antigua (`src/`).
2. Verifica `import` relativos en features legacy: deben usar los aliases anteriores.
3. Si trabajas con Docker, usa el `Dockerfile` raíz (acepta `WORKSPACE_DIR=web`) o ejecuta `docker build`/`docker compose` directamente desde `web/`.
4. Pipelines personalizados (Jenkins/GitLab) deben ejecutar `cd web` antes de `npm ...`; los scripts heredados ya lo aplican, pero valida tus jobs internos.

---

Ante dudas, inicia conversaciones en el canal `#conductores-pwa` indicando commits y workflow afectados.
