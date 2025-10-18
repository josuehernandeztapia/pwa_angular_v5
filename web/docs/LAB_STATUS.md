# Lab / Experimentos

Los módulos de laboratorio disponibles en `/web` están protegidos por el flag `environment.features.enableLabs`.
Actualmente se incluyen:

- `/lab/tanda-enhanced`
- `/lab/tanda-consensus`
- `/labs/document-upload`
- `/labs/integration-demo`
- `/labs/protection-demo`

Mantén `enableLabs` desactivado en producción. Si necesitas laboratorios adicionales, crea componentes standalone
bajo `src/app/labs/` y añade la ruta al array `labRoutes` en `app.routes.ts`.
