# 00 — Qué hace MaxiDocs hoy (inventario funcional)

> Levantado leyendo el código de `main` (152 commits, último 2026-08-10).
> Todo lo que está aquí es lo que **existe en el repo**, no lo que se planeó.

---

## Resumen en una línea

MaxiDocs es una app embebida en Monday.com que toma una **plantilla HTML con
`{{variables}}`**, la llena con datos de un item de Monday, la renderiza a PDF con
Puppeteer, la guarda en Postgres y la manda por correo (Gmail del vendedor o
Resend/SMTP), además de crear/actualizar un item de "Oportunidades" en Monday.

Hay mucho más código del que está realmente en uso. Ver §5.

---

## 1. Las dos aplicaciones

| | Ruta | Stack | Puerto | Deploy |
|---|---|---|---|---|
| Backend | `maxi-docs-backend/` | Node 20, Express 5, ESM, `pg` crudo | 3001 | Railway (Docker) |
| Frontend | `panda-monday/` | React 19, Vite 8, TipTap 3, Axios | 8301 | Vercel |

El frontend no tiene `baseURL`: pega a `/api/*` del mismo origen. En dev lo
resuelve el proxy de Vite; en prod lo resuelve un `rewrite` de `vercel.json`
hacia `https://maxi-docs-production.up.railway.app`.

---

## 2. Backend — mapa de endpoints

### `templates.js` — plantillas HTML
- `GET /api/templates` — lista por cuenta.
- `GET /api/templates/:id` — detalle. Busca por ID **sin** filtrar cuenta y valida después.
- `POST /api/templates` — crea. Extrae `{{vars}}` con regex y genera miniatura en background.
- `PUT /api/templates/:id` — actualiza (COALESCE, así que campos ausentes no borran).
- `POST /api/templates/seed` — reinstala la plantilla oficial MAXIRent. **El HTML está hardcodeado dentro del handler (≈120 líneas).**
- `POST /api/templates/migrate-dev` — copia plantillas de la cuenta `'dev'` a la cuenta real.
- `DELETE /api/templates/:id`.

### `documents.js` — el corazón (768 líneas)
- `POST /api/documents/preview` — expande `<pricing-table>` + envuelve en CSS, devuelve HTML para un iframe.
- `GET /api/documents/stats` — KPIs del dashboard (6 queries en paralelo).
- `GET /api/documents/export` — CSV con BOM para Excel.
- `GET /api/documents` — lista; admin ve todo, vendedor solo lo suyo.
- `GET /api/documents/:id/pdf` — sirve el PDF desde la columna `BYTEA`.
- `GET /api/documents/:id` — detalle + firmas agregadas con `json_agg`.
- `POST /api/documents/generate` — **el flujo principal**:
  1. Si viene `monday_item_id`, lee la columna "Duración del Proyecto" del lead.
  2. `applyVariables()` → HTML para guardar (conserva `<pricing-table>` = re-editable).
  3. `fillTemplate()` → HTML para PDF (expande las tablas a `<table>`).
  4. `wrapDocumentHtml()` → envuelve en `<html>` con CSS de impresión.
  5. `generatePdf()` → Puppeteer, A4, `printBackground: true`.
  6. Folio `MR-{año}-{NNNN}` desde una secuencia de Postgres.
  7. Crea item en el board "Oportunidades Maxirent" (`8311006777`) con ~12 columnas mapeadas.
  8. Guarda documento + PDF en Postgres, sube el PDF al item de Monday en background.
- `PUT /api/documents/:id/regenerate` — regenera manteniendo folio; borra el PDF firmado.
- `DELETE /api/documents/:id`.
- `GET/POST/DELETE /api/documents/:id/attachments` — adjuntos base64, máx 15 MB, MIME en allowlist.

**Funciones de cálculo** (las más importantes del negocio, viven aquí):
- `extractPricingTotal(html)` — total con IVA. Suma renta mensual (`dailyRate × 30 × qty`), aplica deducible como multiplicador, más entrega/recolección.
- `extractQuoteValues(html)` — devuelve `{rentaMensual, entregaRecoleccion, subtotalTarifas, subtotalAdecuaciones, totalSinIVA, totalConIVA, ivaMonto, unidades[], unidadesCount, primeraUnidad}`. **Ojo: no aplica el deducible, `extractPricingTotal` sí.** Dos fórmulas distintas para lo mismo.

### `signatures.js` — firma electrónica (666 líneas)
- `POST /api/signatures/send` — crea filas de firma, guarda `fieldConfig` en la columna `opensign_document_id` (nombre legado), manda correo solo al firmante de orden 1.
- `GET /api/signatures/portal/:signatureId` — **público**. Marca `viewed_at`, notifica al vendedor.
- `GET /api/signatures/:documentId` — estado de firmas.
- `POST /api/signatures/:signatureId/sign` — rate limit 10/15min por IP, valida orden secuencial, embebe la firma con `pdf-lib`, agrega página de certificado, dispara el siguiente firmante.
- `POST /api/signatures/:signatureId/time-spent` — analítica de lectura.
- `POST /api/signatures/bulk-send` — envío masivo desde una plantilla.
- `GET /api/signatures/:documentId/events` — auditoría.

### Resto de rutas
| Ruta | Qué hace | Estado real |
|---|---|---|
| `catalog.js` | Catálogo de productos, sync con board de Monday | En uso |
| `monday.js` | Proxy GraphQL: boards, columnas, valores de item, `/me` | En uso |
| `integrations.js` | OAuth Gmail por vendedor + API keys para Zapier/Make | Gmail en uso; API keys no |
| `settings.js` | Config por cuenta, webhooks salientes, test de email | Parcial |
| `ai.js` | Resumen y redacción con Claude Haiku | **Roto** (tabla faltante) |
| `approvals.js` | Flujo de aprobación interna | Sin UI conectada |
| `cpq.js` | Motor de reglas de descuento | Sin UI conectada |
| `dealRooms.js` | Salas de colaboración con cliente | Sin UI real + ruta rota |
| `workspaces.js` | Multi-workspace | Solo el switcher del header |
| `contentLibrary.js` | Bloques reutilizables | Conectado al editor |
| `payments.js` | Stripe PaymentIntent | Sin UI |
| `embed.js` | JWT para firma embebida | Sin UI |
| `auth.js` | Google SSO | Sin UI |

---

## 3. Servicios

- **`pdfService.js`** — `applyVariables`, `fillTemplate`, `extractVariables`, `processPricingTableNodes` (expande `<pricing-table>` con base64 JSON a HTML), `generatePdf` (Puppeteer), `generateThumbnail` (PNG de la primera página), `wrapDocumentHtml`, `embedLocalImages` (imágenes locales → data URI).
- **`selfSignService.js`** — `embedSignaturesInPdf` con `pdf-lib`: convierte coordenadas en % a puntos PDF (invirtiendo el eje Y) y añade una página de certificado.
- **`emailService.js`** — detecta proveedor (Resend REST o SMTP Nodemailer). Plantillas HTML de marca MAXIRent. Si no hay proveedor, no truena: hace log y sigue.
- **`gmailService.js`** — OAuth Google por vendedor, cifra el `refresh_token` con AES-256-GCM, arma el MIME RFC 5322 a mano (con wrap base64 a 76 chars por Outlook).
- **`storageService.js`** — R2 (S3-compatible) si hay credenciales, si no filesystem local.
- **`catalogService.js`** — sync con board de Monday + `buildPricingTableHtml`.
- **`auditService.js`** — `logEvent` que nunca lanza, hash SHA-256 del PDF.
- **`signService.js`** — integración DocuSeal. **Código muerto: nadie lo importa.**

---

## 4. Frontend

`main.jsx` define 4 rutas: `/sign/:signatureId` (portal público), `/room/:token`,
`/editor` (pestaña nueva) y `/*` (app embebida en Monday).

- **`App.jsx`** — 6 tabs: Dashboard, Plantillas, Documentos, Pipeline, Catálogo, Config.
- **`EditorPage.jsx` (1173 líneas)** — el editor estilo PandaDoc. Recibe todo por query params (`docId`, `tpl`, `item`, `board`, `account`, `user`, `admin`, `fv` en base64). Dos modos:
  - *Solo tablas* (`generatorMode`): conserva el HTML de la plantilla y solo sustituye las `<pricing-table>` editadas (`mergePtItems`).
  - *Edición libre*: usa el HTML del editor tal cual, reinyectando el `<style>` que TipTap descarta (`ensureTemplateStyle`).
- **`WysiwygEditor.jsx`** — TipTap con extensiones custom: `GenericDiv` (para que los `<div class="mr-page">` sobrevivan), `Image` extendido (conserva class/style), `PricingTable`, `VariableHighlight`, `SignatureField`, drag handle global.
- **`PricingTableView.jsx` (755 líneas)** — la tabla de precios interactiva.
- **`PortalPage.jsx`** — hoy **solo revisión**: renderiza el PDF con pdf.js y ofrece descarga. La captura de firma se quitó (commit `56b880f`).

---

## 5. Lo que existe pero no se usa

Esto es importante para entender el tamaño real del proyecto:

| Cosa | Líneas aprox. | Por qué está muerta |
|---|---|---|
| `signService.js` (DocuSeal) | 162 | Reemplazado por `selfSignService`, nadie lo importa |
| Backend de firma completo | ~800 | El portal ya no captura firmas |
| `PdfSignatureEditor.jsx` | 500 | Colocación de campos de firma sobre el PDF |
| `payments.js` + Stripe | 89 | Sin UI |
| `embed.js` | 82 | Sin UI |
| `auth.js` (Google SSO) | 121 | Sin UI |
| `cpq.js` | 105 | Sin UI |
| `approvals.js` | 135 | `ApprovalPanel.jsx` existe pero no está montado en el flujo |
| Deal Rooms | 152 + 363 | Ruta pública rota, sin uso |

**~2500 líneas de código muerto o semi-muerto**, con sus dependencias
(`stripe`, `google-auth-library`, `jsonwebtoken`) instaladas en producción.
