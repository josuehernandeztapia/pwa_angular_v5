# Legacy Routes Status

| Route | Status | Notes |
| ----- | ------ | ----- |
| `/quotation` | ✅ Migrated | `web/src/app/quotation/quotation-flow.component` |
| `/quotation/create` | ✅ Migrated | Alias a `CotizadorMainComponent` (standalone) |
| `/quotation/new` | 🔁 Redirect | Enrutado a `/quotation/create` para compatibilidad legacy |
| `/quotation/:quoteId` | ✅ Migrated | Resumen dinámico con `QuotationFlowComponent` + BFF |
| `/quotation/:quoteId/review` | ✅ Migrated | Reusa resumen moderno para revisión |
| `/lab/tanda-*` | Disponible (flag) | Requiere `enableLabs` |
