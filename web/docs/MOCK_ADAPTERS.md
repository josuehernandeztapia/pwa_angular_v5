# Mock Adapters Reference

Los adaptadores bajo `@internal-services/mock-adapters` reemplazan al antiguo `MockApiService` legacy y emulan los endpoints BFF para desarrollo y pruebas.

## ClientsMockAdapter

| Método | BFF equivalente | Descripción |
| --- | --- | --- |
| `getClients()` | `GET /api/v1/clients` | Lista completa de clientes mock (seed igual al legacy React). |
| `getClientById(id)` | `GET /api/v1/clients/:id` | Recupera un cliente con documentos y eventos. |
| `createClient(payload)` | `POST /api/v1/clients` | Alta de cliente; añade eventos iniciales. |
| `updateClient(id, updates)` | `PUT /api/v1/clients/:id` | Actualiza datos principales del cliente. |
| `updateDocumentStatus(...)` | `PATCH /api/v1/clients/:id/documents/:docId` | Cambia el estado del documento y emite evento. |
| `getEcosystems()` | `GET /api/v1/ecosystems` | Catálogo de rutas/ecosistemas disponible en mock. |
| `getCollectiveGroups(ecosystemId?)` | `GET /api/v1/collective-groups` | Devuelve grupos colectivos y filtra por ecosistema utilizando la relación cliente ↔ ecosistema. |
| `getCollectiveMembers(groupId)` | `GET /api/v1/collective-groups/:id/members` | Lista de miembros (clientes) del grupo. |
| `getEcosystemHierarchy()` | `GET /api/v1/ecosystems/hierarchy` | Construye árbol Ecosistema → Grupos → Miembros con datos mock. |

> ⚙️ `CollectiveGroupDataService.initializeCollectiveGroups` se ejecuta durante bootstrap (o en tests) para poblar los grupos colectivos antes de usar el adapter.

## Otros adaptadores

- `DashboardMockAdapter`: datos para dashboards y KPIs administrativos.
- `ProtectionMockAdapter`: responde a endpoints de protección en modo offline.
- `PostSalesMockAdapter`: fixtures para wizard post-venta.
- `ScenariosMockAdapter`: escenarios de simulador y cotizador.
- `SearchMockAdapter`: resultados de búsqueda global.
- `UtilityMockAdapter`: helpers compartidos (feature flags, health checks).

Cada adapter replica latencias realistas (`delay`) y depende de las `feature-services`/`data-service` correspondientes. Para extenderlos:

1. Añade la data semilla en el `data service` de dominio.
2. Expone el método en el adapter apuntando al `data service`.
3. Agrega pruebas unitarias que validen estructura, filtros y jerarquías (ver `clients-mock.adapter.spec.ts`).
4. Documenta el endpoint en esta guía y en los contratos BFF si aplica.

