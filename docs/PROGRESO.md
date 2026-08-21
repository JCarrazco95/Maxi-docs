# Progreso — rama `lab/v3`

Estado de los 33 hallazgos de [01-BUGS-Y-RIESGOS.md](01-BUGS-Y-RIESGOS.md).

> **Restricción vigente:** nada de esto va a `main` ni a producción hasta que el
> usuario lo autorice. Todo vive en `lab/v3` contra la base local `maxi_docs_lab`.

---

## Arreglado y verificado

| # | Hallazgo | Cómo se comprobó |
|---|---|---|
| 10 | El schema no se podía aplicar a una base nueva | Prueba de control: schema de `main` → `ERROR: no existe la relación catalog_categories`, 0 tablas. Corregido → exit 0 dos veces, 20 tablas |
| 11 | El schema no era idempotente | El `DO $$` del constraint ahora consulta `pg_constraint`; dos pasadas seguidas en verde |
| 12 | `/api/ai/summarize` daba 500 siempre | Añadida la tabla `document_summaries` que faltaba |
| 19 | Dos fórmulas para el mismo total | `quoteService.js` con 50 pruebas. **Deducible = informativo** (decisión del usuario). Prueba de regresión que compara lo que va a Monday contra lo impreso |
| 2 | Inyección SQL en `/stats` | Antes: `' OR '1'='1` devolvía los 3 documentos. Ahora: 0 |
| 3 | El PDF de cualquier documento era público | Anónimo 403 · cuenta ajena 403 · dueño 200 · token de firmante ajeno 403 · su firmante 200 |
| 5 | `requireAdmin` nunca se aplicaba | Aplicado a configuración, webhooks y API keys |
| 7 | Secretos con fallback público | `JWT_SECRET` y la clave AES de Gmail ahora fallan al arrancar si faltan |
| 13 | `uploadPdf()` con argumentos invertidos | Corregido en `bulk-send` y en la API de integraciones |
| 14 | El tiempo de lectura nunca acumulaba | 30 s + 45 s = 75 en la base (antes: `NULL`) |
| 15 | El enlace público de Deal Rooms no funcionaba | `GET /api/rooms/public/<token>` → 200 (antes 500) |
| 16 | `pdf_hash` siempre `null` | Los eventos nuevos traen hash real |
| 17 | Se subía a R2 y se tiraba la URL | Intención documentada; R2 se decide en la Fase 4 |
| 24 | Cero pruebas | 50 pruebas, `npm test`. Verificadas por mutación |

## Siguiente

| # | Hallazgo | Nota |
|---|---|---|
| **1** | **La autenticación es falsificable** | El grande. Verificar el `sessionToken` de Monday con `MONDAY_SIGNING_SECRET`. Toca backend y frontend, y hay que quitar el `'dev'` por defecto de `extractMondayContext` — hoy una petición sin headers se trata como la cuenta `dev` |
| 4 | Cualquiera marca un documento como pagado | Requiere auth (#1) para arreglarse bien |
| 6 | Las API keys ignoran sus scopes | |
| 8 | El proxy de Monday expone cualquier board | |
| 9 | IDOR varios | Depende de #1 |
| 18 | `PUBLIC_URL` significa dos cosas | Separar en `FRONTEND_PUBLIC_URL` y `BACKEND_PUBLIC_URL` |
| 20 | `ensureColumns()` sin `await` | Ahora que el schema funciona, se puede quitar entero |
| 21 | IVA clavado al 16% | Decidir: respetarlo o quitar el atributo |
| 22 | `deleteFile()` no borra PDFs de documentos | |
| 23 | 61 errores de ESLint | Los 14 de `DesignPanel` explican los bugs de «se borra al escribir» |
| 25-33 | Calidad y arquitectura | Fases 1 en adelante |

---

## Pruebas

```bash
cd maxi-docs-backend && npm test
```

```
Test Files  3 passed (3)
     Tests  50 passed (50)
```

- `quoteService.test.js` — la fórmula del dinero, 30 casos
- `pdfService.test.js` — que lo impreso coincide con lo calculado, 12 casos
- `documents.quote.test.js` — regresión del #19: Monday contra el PDF, 8 casos

Verificadas por mutación: reintroduciendo el deducible a propósito caen 8 pruebas
en los tres archivos.
