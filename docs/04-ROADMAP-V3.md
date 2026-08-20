# 04 — Roadmap v3

Regla de oro: **producción no se toca.** Todo esto vive en `lab/v3` con su propia
base de datos y su propio deploy. Ver `05-ENTORNO-LAB.md`.

---

## Fase 0 — Blindar lo que ya está en producción (1-2 días)

Estos sí se aplican a `main` en PRs pequeñas e independientes, porque son riesgos
activos. No son features, son cerrar puertas.

| # | Qué | Dónde | Esfuerzo |
|---|---|---|---|
| 1 | Verificar el `sessionToken` de Monday con `MONDAY_SIGNING_SECRET` | `mondayAuth.js` + `client.js` | 4 h |
| 2 | Parametrizar `monday_item_id` en `/stats` | `documents.js:314` | 10 min |
| 3 | Proteger `GET /:id/pdf` (cuenta o token de firma) | `documents.js:456` | 1 h |
| 4 | Aplicar `requireAdmin` a settings, webhooks y API keys | 3 archivos | 30 min |
| 5 | Quitar los fallbacks de `JWT_SECRET` y `APP_ENCRYPTION_KEY` | `integrations.js`, `gmailService.js` | 15 min |
| 6 | Unificar la fórmula del total (decidir si el deducible suma) | `documents.js` | 2 h + validar con ventas |
| 7 | Borrar el código muerto y sus dependencias | varios | 2 h |

> El #6 requiere una decisión de negocio, no técnica: **¿el deducible se cobra?**
> Hoy el PDF dice que no y Monday dice que sí. Hay que preguntarle a ventas.

---

## Fase 1 — El modelo de documento (2-3 semanas)

El corazón del cambio. Ver `03-COMO-FUNCIONA-PANDADOC.md` §3.

1. **Definir el esquema de bloques** con Zod (`packages/doc-model/`).
   Tipos: `text`, `heading`, `list`, `image`, `table`, `pricing`, `field`,
   `pagebreak`, `spacer`, `container`.
2. **`services/quote.js`** — una sola función pura `calculateQuote(sections) →
   { lines, subtotal, discounts, taxes, total }`. **Con tests desde el minuto uno.**
   Aquí vive todo el negocio: renta diaria × 30, entrega, recolección, deducible,
   adecuaciones, IVA.
3. **Renderizador `blocks → HTML`** (compartido por editor, preview, PDF y correo).
4. **Importador `HTML → blocks`** para migrar las plantillas actuales.
5. **Migración de BD**: `content JSONB` conviviendo con `content_html` hasta que
   todo esté migrado. Sin big bang.

**Entregable:** el mismo PDF de hoy, generado desde JSON, comparado píxel a píxel
con el actual.

---

## Fase 2 — Editor sobre bloques (2-3 semanas)

1. TipTap deja de ser la fuente de verdad: pasa a ser el editor **de un bloque de
   texto**. El documento es una lista de bloques con drag & drop (`@dnd-kit`, que
   ya está instalado).
2. Se elimina la dualidad "solo tablas / edición libre".
3. Panel de propiedades por bloque (estilo Notion/PandaDoc).
4. La tabla de precios edita `rows` directamente; los totales se calculan con la
   **misma** `calculateQuote` del backend (compartida por `packages/`).

---

## Fase 3 — Documentos editables (2 semanas)

Esto es lo que pediste, y son dos cosas distintas. Ambas salen del modelo JSON:

### 3a. El cliente edita el documento
- Bloques `field`: texto, fecha, checkbox, dropdown, firma — asignados a un rol.
- Líneas de precio con `editableByClient: ["qty"]` y `optional: true`
  (el cliente elige cantidad o descarta una unidad, y el total se recalcula solo).
- Portal público donde el cliente rellena y acepta.
- Cada cambio queda en `document_events` como evidencia.

### 3b. Exportar a formato editable
- **DOCX** con la librería `docx`, recorriendo los mismos bloques. Se pueden
  exportar los bloques `pricing` como tablas nativas de Word.
- Import de DOCX es mucho más caro y de valor dudoso aquí — no lo recomiendo.

---

## Fase 4 — Motor de PDF serio (1 semana)

1. **Pool de navegador**: un Chromium vivo, un `BrowserContext` por trabajo.
   De 2-4 s a ~400 ms por documento.
2. **Cola de jobs** (BullMQ + Redis, o `pg-boss` si no quieres otro servicio):
   `generate` responde al instante con el documento en estado `generating`;
   el PDF, la miniatura y el push a Monday corren como jobs con reintentos.
3. Encabezados/pies nativos de Puppeteer (`headerTemplate`/`footerTemplate`) con
   numeración `X de Y`, en lugar de imágenes full-bleed por página.
4. Los binarios a R2, no a `BYTEA`.

---

## Fase 5 — Reconectar lo que ya está construido (1 semana)

Todo esto ya tiene backend; solo falta UI y limpieza:
- Firma electrónica en el portal (existe `selfSignService` + `PdfSignatureEditor`).
- Aprobaciones (existe `ApprovalPanel`).
- CPQ (reglas de descuento que exigen aprobación).
- Analítica de lectura (arreglando el `COALESCE`).
- Pagos con Stripe dentro del documento.

---

## Fase 6 — Plataforma (continuo)

- Tests: Vitest para dominio, Playwright para el flujo "generar → enviar → firmar".
- CI en GitHub Actions: lint + tests en cada PR.
- Los IDs de Monday a configuración por cuenta, no constantes en el código.
- El adaptador de Monday detrás de eventos de dominio.
- Design tokens: un solo sitio para `#1B3055` y `#F5A000`.

---

## Orden recomendado

```
Fase 0  ██                      ← empezar HOY, va a main
Fase 1    ████████              ← el cambio que importa
Fase 2            ████████
Fase 3                    █████
Fase 4                         ███
Fase 5                            ███
Fase 6  ─────────────────────────────  (continuo)
```

**Fase 0 y Fase 1 son el 80% del valor.** Si solo se hace eso, el proyecto pasa de
frágil a sólido y queda listo para crecer. Las fases 2-5 son features encima de
una base que ya aguanta.

---

## Lo que NO recomiendo hacer

- **Reescribir desde cero.** Hay 152 commits de conocimiento del negocio
  (el formato exacto de la propuesta, el mapeo de columnas de Monday, los bugs de
  Outlook con base64, los flags de Chromium en Railway). Eso no se recupera.
- **Migrar a TypeScript ahora.** Suena tentador; te va a costar dos semanas y no
  arregla ninguno de los P0. Después de la Fase 1, con Zod ya en el modelo, es
  casi gratis.
- **Meter Socket.io / colaboración en tiempo real** (está en las skills del repo).
  Nadie lo ha pedido y multiplica la complejidad.
