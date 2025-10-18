# Legacy Services Migration Map

The original Angular workspace (`/src/app/services`) shipped monolithic utilities such as
`ApiService`, `DataService`, `MockApiService`, `ProtectionStateService`, and `VoiceTestService`.
All production features now live under the `/web` tree and consume the modular data-access layer.
Use the mapping below whenever you encounter a legacy dependency:

| Legacy service | Modern replacement |
| --- | --- |
| `src/app/services/api.service.ts` | `@data-access/clients/clients-api.service` (plus feature stores) |
| `src/app/services/data.service.ts` | Split responsibilities into the dedicated `@data-access/*` services and stores |
| `src/app/services/mock-api.service.ts` | `@internal-services/mock-adapters/*` (per domain) |
| `src/app/services/protection-state.service.ts` | `@feature-services/risk/protection-workflow.service` + stores |
| `src/app/services/voice-test.ts` | `@feature-services/avi/speech.service` & `@internal-services/mock-adapters` |

> **Note**
> The legacy services are no longer bundled by the `/web` build. New features must depend on the modular
> services listed above. When migrating code, refactor the feature to the new module and delete the old
> dependency rather than adding shims.


## Mock adapters actualizados

Los endpoints legacy servidos por `MockApiService` ahora se encuentran documentados en [`web/docs/MOCK_ADAPTERS.md`](./MOCK_ADAPTERS.md).
- `ClientsMockAdapter` expone métodos para ecosistemas, grupos colectivos y jerarquías (`getEcosystems`, `getCollectiveGroups`, `getEcosystemHierarchy`).
- `DashboardMockAdapter`, `ProtectionMockAdapter` y demás siguen el mismo patrón; cada uno delega en el `data service` de su dominio y replica latencias para pruebas manuales y automatizadas.

