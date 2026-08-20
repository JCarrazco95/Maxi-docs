# 01 — Bugs y riesgos encontrados

Ordenado por severidad. Cada hallazgo lleva archivo:línea para poder verificarlo.
Todo esto es sobre `main` (lo que está en producción hoy).

---

## 🔴 P0 — Seguridad. Arreglar antes que cualquier feature nueva

### 1. La autenticación es falsificable con un `curl`

`src/middleware/mondayAuth.js:31-41` lee la identidad de headers de texto plano:

```js
req.mondayContext = {
  accountId: req.headers['x-monday-account-id'] || 'dev',
  isAdmin:   req.headers['x-monday-is-admin'] === 'true',
  ...
}
```

Y el frontend simplemente los inyecta (`panda-monday/src/api/client.js:24-29`).
No hay ninguna firma, ningún token, ninguna verificación. Cualquiera que conozca
la URL de Railway puede hacer:

```bash
curl https://<backend>/api/documents -H "x-monday-account-id: <cualquiera>" -H "x-monday-is-admin: true"
```

y leer, modificar o borrar documentos, plantillas, catálogo y configuración de
**cualquier cuenta**. El aislamiento multi-tenant por `monday_account_id` es
decorativo mientras el `accountId` lo elija el cliente.

`MONDAY_SIGNING_SECRET` está en el `.env` y existe la función
`validateMondayWebhook`, pero **ningún endpoint la usa**. Lo correcto es que el
frontend pida `monday.get('sessionToken')` (un JWT firmado por Monday) y el
backend lo verifique con ese secreto.

> Este es el hallazgo número uno. Todo lo demás es secundario.

### 2. Inyección SQL en `/api/documents/stats`

`src/routes/documents.js:314-317`:

```js
const itemCond = monday_item_id ? ` AND monday_item_id = '${monday_item_id}'` : '';
```

`monday_item_id` viene del query string y se concatena directo en 6 consultas.
`?monday_item_id=' OR '1'='1` ya devuelve datos de otras cuentas; con un `;` se
puede llegar más lejos. Es el único punto del proyecto donde se rompe la regla
de usar `$1, $2` — el resto del código está bien.

### 3. El PDF de cualquier documento es público

`src/routes/documents.js:456` — `GET /api/documents/:id/pdf` no comprueba cuenta,
usuario ni token. Con el UUID basta. Los UUID son difíciles de adivinar, pero van
en correos, en logs, en la URL del portal y en el `pdf_url` que devuelven varios
endpoints. Es seguridad por oscuridad sobre documentos con precios y datos fiscales.

### 4. Cualquiera puede marcar un documento como pagado

`src/routes/payments.js:57-77` — `POST /api/payments/confirm` no valida cuenta y,
si no mandas `payment_intent_id`, **se salta la verificación con Stripe** y hace
`UPDATE documents SET status = 'paid'`.

### 5. `requireAdmin` está escrito pero nunca aplicado

Se importa en `settings.js:3` y `approvals.js:3` y no se usa en ninguna ruta.
Consecuencias concretas:
- `PUT /api/settings` — cualquiera cambia la configuración de la cuenta.
- `POST /api/integrations/keys` — cualquiera crea una API key permanente con todos los scopes.
- `POST /api/settings/webhooks` — cualquiera registra un webhook saliente al que se le mandarán los eventos de documentos.

### 6. Las API keys no respetan sus propios scopes

`src/routes/integrations.js:165-180` — `apiKeyAuth` valida el hash y ya. La
columna `scopes` se guarda pero **nunca se lee**. Toda key es full-access.

### 7. Secretos con fallback inseguro

- `src/routes/integrations.js:24` — `JWT_SECRET || 'change-in-production'`. En `auth.js:16` y `embed.js:9` sí se lanza error si falta; aquí no. Si la variable no está, los tokens de OAuth de Gmail se firman con un secreto público.
- `src/services/gmailService.js:19` — la clave de cifrado AES cae a `'change-in-production-very-long-key'`. Los `refresh_token` de Gmail de los vendedores quedarían cifrados con una clave que está en GitHub.

### 8. El proxy de Monday expone cualquier board

`src/routes/monday.js` usa un `MONDAY_API_TOKEN` global de la cuenta. `GET
/api/monday/board/:boardId/columns` acepta cualquier `boardId` sin comprobar que
el usuario tenga acceso. Cualquiera que llegue al backend puede leer cualquier
board al que ese token tenga permiso.

### 9. IDOR varios

| Endpoint | Archivo | Problema |
|---|---|---|
| `GET /api/signatures/:documentId` | `signatures.js:393` | Sin filtro de cuenta: lista nombres y correos de firmantes de cualquier documento |
| `POST /api/workspaces/:id/move-document` | `workspaces.js:95` | No valida que el documento sea de tu cuenta |
| `POST /api/embed/revoke` | `embed.js:76` | Sin auth: invalidar tokens de firma ajenos |
| `POST /api/approvals/:approvalId/resolve` | `approvals.js:69` | Cualquiera de la cuenta aprueba, no solo el aprobador designado |

---

## 🟠 P1 — Funcionalidad rota o incorrecta

### 10. `npm run migrate` falla en una base de datos nueva

`src/db/schema.sql:323-324` hace `ALTER TABLE catalog_categories ...` **antes** de
crear esa tabla en la línea 341. `ADD COLUMN IF NOT EXISTS` no protege contra que
la *tabla* no exista. Como `migrate.js:115` ejecuta el archivo entero en una sola
llamada (transacción implícita), el error aborta **toda** la migración: en una BD
limpia no se crea nada.

Que hoy funcione en producción es porque la BD ya tiene las tablas de antes.
El día que haya que levantar un entorno nuevo, no arranca.

### 11. El schema tampoco es idempotente

`schema.sql:349-352` atrapa `duplicate_table` al añadir un constraint, pero
Postgres levanta `duplicate_object` (42710) para constraints repetidos. La segunda
ejecución de `migrate` revienta ahí. Curiosamente `server.js:92` sí lo hace bien,
consultando `pg_constraint` — hay que copiar ese patrón al schema.

### 12. `/api/ai/summarize` siempre da 500

`src/routes/ai.js:33` y `:99` leen y escriben en `document_summaries`. Esa tabla
**no existe en `schema.sql`**. El endpoint no puede funcionar nunca.

### 13. `uploadPdf()` con los argumentos invertidos (2 sitios)

La firma es `uploadPdf(key, buffer)` (`storageService.js:37`), pero:
- `src/routes/signatures.js:620` — `uploadPdf(pdfBuffer, '...bulk...pdf')`
- `src/routes/integrations.js:257` — `uploadPdf(pdfBuffer, '...pdf')`

Con R2 configurado, esto intenta usar un Buffer como nombre de archivo. `bulk-send`
y la generación vía API de Zapier/Make están rotos.

### 14. El tiempo de lectura nunca se acumula

`src/routes/signatures.js:585` — `SET time_spent_seconds = time_spent_seconds + $1`.
La columna arranca en `NULL`, y `NULL + 5` es `NULL`. Siempre queda vacía.
Falta `COALESCE(time_spent_seconds, 0)`.

### 15. El link público de Deal Room nunca funciona

`src/routes/dealRooms.js` define `GET /:id` en la línea 39 y `GET /public/:token`
en la 132. Express resuelve en orden: `/api/rooms/public/abc` entra por `/:id`
con `id = 'public'`, la consulta casta `'public'` a UUID y truena con 500.
(En `signatures.js` sí lo resolvieron poniendo `/portal/:id` antes — falta hacer lo mismo aquí.)

### 16. `pdf_hash` siempre se guarda en `null`

`documents.js:620` llama `hashPdfFile(apiPdfUrl)` donde `apiPdfUrl` es
`/api/documents/<uuid>/pdf`. `hashPdfFile` (`auditService.js:14`) hace
`.split('/').pop()` → obtiene la cadena `"pdf"` → intenta leer
`uploads/documents/pdf` → falla → devuelve `null`. La cadena de auditoría del
documento original queda sin hash. Hay que pasarle el `pdfBuffer`, que ya está en memoria (`hashBuffer`).

### 17. Se sube el PDF a R2 y se tira la URL

`documents.js:563` guarda el resultado en `pdfUrl` y nunca lo usa: en la línea 610
se inserta `apiPdfUrl`. Si R2 está configurado, se paga el almacenamiento y el
tráfico de una subida que nadie va a leer. O se usa R2 de verdad, o se quita.

### 18. `PUBLIC_URL` significa dos cosas distintas

- En `signatures.js`, `auth.js`, `embed.js`, `integrations.js` = URL del **frontend** (para `/sign/:id`).
- En `auth.js:29` = URL del **backend** (para el callback de Google `/api/auth/google/callback`).

No pueden ser la misma. Hay un comentario en `pdfService.js:305` explicando el
enredo. Se necesitan dos variables separadas: `FRONTEND_PUBLIC_URL` y `BACKEND_PUBLIC_URL`.

### 19. Dos fórmulas distintas para el mismo total

- `extractPricingTotal` (`documents.js:75`) aplica el deducible: `mensual * (1 + deduc)`.
- `extractQuoteValues` (`documents.js:~135`) **no** lo aplica.
- `processPricingTableNodes` (`pdfService.js:104`) tampoco lo aplica y deja un comentario diciendo que el deducible "es solo informativo".

Es decir: el número que se manda a Monday puede no coincidir con el que sale
impreso en el PDF. Esto es un bug de negocio, no de código, y es el más caro de todos.

### 20. `ensureColumns()` corre sin `await` y se traga todos los errores

`server.js:111-115` — un `for` con `try { await query(sql) } catch {}` y la función
se invoca sin esperar (`ensureColumns()` en la 115). El servidor empieza a atender
peticiones mientras las columnas todavía se están creando, y si alguna falla nadie
se entera. Además duplica lo que ya hace `schema.sql`: dos fuentes de verdad para el esquema.

### 21. El IVA está clavado al 16% ignorando el dato guardado

`pdfService.js:86` — `const ivaRate = 16`, con un comentario explicando que se
ignora `data-iva-rate` a propósito. Funciona para México hoy, pero el atributo
sigue guardándose en cada plantilla y documento, lo que hace creer que es
configurable. O se respeta, o se elimina el atributo.

### 22. `deleteFile()` no borra los PDFs de documentos

`storageService.js:76` — en modo local solo quita el prefijo `attachments/`. Con
una key `documents/uuid.pdf` construye una ruta que no existe y no borra nada.

---

## 🟡 P2 — Calidad y mantenimiento

### 23. 61 errores de ESLint
Ejecutado sobre `panda-monday/`: **61 errores, 5 warnings**.

| Regla | Nº |
|---|---|
| `no-unused-vars` | 20 |
| `no-empty` (catch vacío) | 18 |
| `react-hooks/static-components` | 14 |
| `react-hooks/exhaustive-deps` | 5 |
| `react-refresh/only-export-components` | 5 |
| `react-hooks/set-state-in-effect` | 4 |

Los 14 de `static-components` están **todos en `DesignPanel.jsx`**: hay componentes
definidos dentro del componente padre, así que React los desmonta y remonta en
cada render. Ese es exactamente el patrón que produce los bugs de "se pierde el
foco al escribir" / "se borra la tabla al teclear" que aparecen varias veces en el
historial de commits (`49099c7`, `ee01550`). Se van a seguir repitiendo hasta que
se saquen esos componentes fuera.

### 24. Cero pruebas y cero CI
No hay `*.test.*`, ni vitest, ni jest, ni GitHub Actions. Con lógica de dinero
(IVA, deducibles, prorrateos) esto es lo más caro a largo plazo. Un solo archivo
de tests sobre `extractQuoteValues` habría cazado el bug #19.

### 25. IDs de Monday hardcodeados y duplicados
`documents.js:25-43` y `signatures.js:47-59` declaran **las mismas** constantes
(`8311006777`, `text_mkvxs7sb`, `deal_value`…) por separado. Si Monday cambia una
columna hay que tocar dos archivos y nadie lo va a recordar. Deben ser configuración.

### 26. Una ruta importa de otra ruta
`signatures.js:8` — `import { extractQuoteValues } from './documents.js'`. La
lógica de negocio vive en la capa HTTP. Debería estar en `services/quoteService.js`.

### 27. Una plantilla HTML de 120 líneas dentro de un handler
`templates.js:118-236`. Y otra copia distinta en `db/migrate.js:14-103`, y otra en
`plantilla_maxirent.html`, y otras en `seed_maxirent_v2/v3/v4.mjs`. **Seis versiones
de la misma plantilla** en el repo, ninguna es la fuente de verdad.

### 28. Un navegador entero por PDF
`pdfService.js:229` — `puppeteer.launch()` en cada llamada, y otro más en
`generateThumbnail()`. Son 2-4 segundos y ~150 MB de RAM por documento. Generar un
documento arranca Chrome **dos veces**. Con un pool de navegador o una cola, esto
baja a ~400 ms.

### 29. Los PDFs viven en columnas `BYTEA` de Postgres
`documents.pdf_content` y `signed_pdf_content`. Funciona, pero cada backup de la
base arrastra todos los PDFs, las queries `SELECT *` (que las hay:
`signatures.js:243`) traen megabytes que nadie usa, y la BD crece sin techo.

### 30. Logs con datos de clientes
`documents.js` tiene 18 `console.log`, varios imprimiendo correos, nombres y
montos (`[Monday] Enviando mutation — item: ... | cliente: ... | email: ...`).
Eso queda en los logs de Railway indefinidamente.

### 31. Los correos interpolan HTML sin escapar
`emailService.js` mete `signerName`, `documentName`, `senderNote` directo en el
template. Un nombre con `<` rompe el correo; con `<img src=x onerror=...>` es peor.

### 32. Estilos en tres sitios
`App.css` de 3380 líneas + objetos `style={{}}` inline en 10+ archivos + `<style>`
dentro de las plantillas. No hay design system: los mismos colores (`#1B3055`,
`#F5A000`, `#0073ea`) están escritos a mano decenas de veces.

### 33. `CLAUDE.md` está desactualizado
Dice que faltan 12 tablas del schema. Hoy solo falta `document_summaries`. Un doc
que miente es peor que no tenerlo.

---

## Resumen ejecutivo

| | Cantidad |
|---|---|
| 🔴 Seguridad crítica | 9 |
| 🟠 Funcionalidad rota | 13 |
| 🟡 Calidad | 11 |

**Lo mínimo antes de seguir construyendo:** #1 (auth real), #2 (SQL injection),
#3 (PDF público) y #19 (las dos fórmulas de total). Con esos cuatro el sistema
pasa de "funciona porque nadie lo ha buscado" a defendible.
