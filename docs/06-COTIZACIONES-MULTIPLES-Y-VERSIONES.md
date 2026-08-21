# 06 — Varias cotizaciones por cliente, y versionado

Respuesta a las dos dudas concretas. Todo lo de aquí está **verificado en el
laboratorio**, no supuesto: se generaron documentos reales y se revisó la base.

---

# Duda 1 — «El vendedor a veces ocupa mandar más de una cotización»

## Lo que YA funciona hoy

Más de lo que parece. Prueba real en el lab, dos cotizaciones para el mismo lead:

```
MR-2026-0002 | Transportes Ejemplo — Opción A - 5 unidades | lead: 999888777
MR-2026-0003 | Transportes Ejemplo — Opción B - 3 unidades | lead: 999888777

GET /api/documents?monday_item_id=999888777  →  total: 2
```

Es decir:
- Cada cotización es un documento independiente con **su propio folio**.
- Las dos quedan **colgadas del mismo lead** y la app las lista juntas.
- Cada una guarda su propio PDF y sus propios datos.
- Cada una se puede enviar por separado a destinatarios distintos.

**El vendedor ya puede mandar tres cotizaciones hoy.** Solo tiene que generar el
documento tres veces y ponerle un nombre distinto a cada una.

## Lo que se rompe

Un problema real, en [documents.js:582](../maxi-docs-backend/src/routes/documents.js):

```js
const mondayDocItemId = await createMondayDocItem({ ... });   // ← sin ninguna comprobación
```

Cada vez que se genera un documento se crea un **item nuevo** en el board
Oportunidades. Tres cotizaciones para el mismo cliente = **tres oportunidades
duplicadas** en Monday, cada una con su valor, contando tres veces en el pipeline.

Lo curioso: en `signatures.js` sí está resuelto —
`crearOportunidadEnMonday` comprueba `if (document.monday_doc_item_id)` y no
duplica. La comprobación existe, simplemente falta en el otro camino.

Otros dos huecos menores:
- No hay campo para decir «esta es la opción B» ni «esta es la revisión 2». Solo
  el nombre libre del documento, que cada vendedor escribe como quiere.
- No hay estado «descartada». Las cotizaciones perdidas se quedan en `draft` o
  `sent` para siempre y ensucian el dashboard y la tasa de firma.

## Cómo resolverlo — tres niveles

### Nivel 1 — Hoy, sin tocar código

Convención de nombres al generar:
`Transportes Ejemplo — Opción A (5 unidades)`. Funciona ya, cuesta cero, y la
lista del lead las muestra juntas. El único daño es la duplicación en Monday.

### Nivel 2 — Medio día de trabajo

Tres cambios pequeños:

1. **Dedup en Monday.** Antes de crear la oportunidad, buscar si el lead ya tiene
   un documento con `monday_doc_item_id`. Si lo tiene, actualizar ese item con los
   valores de la cotización más reciente en vez de crear otro. Es copiar la
   comprobación que ya está en `signatures.js`.
2. **Campos `opcion` y `revision`** en `documents`, con un selector en el editor.
   El folio pasa a `MR-2026-0002-B` en vez de depender del nombre.
3. **Estado `descartada`**, para sacar del pipeline lo que ya no va.

Con esto el vendedor manda las cotizaciones que quiera y Monday sigue teniendo
**una oportunidad por cliente**, que es lo que ventas necesita para no contar
dos veces el mismo negocio.

### Nivel 3 — La forma en que lo hace PandaDoc (Fase 2-3)

Aquí está la idea que cambia el flujo: **en lugar de mandar tres cotizaciones,
mandar una con tres opciones dentro.**

```jsonc
{ "type": "pricing", "title": "TARIFAS",
  "selectionMode": "elige-una",          // el cliente marca una
  "sections": [
    { "label": "Opción A — 5 unidades", "rows": [...], "selected": true  },
    { "label": "Opción B — 3 unidades", "rows": [...], "selected": false },
    { "label": "Opción C — 3 + adecuaciones", "rows": [...] }
  ]
}
```

El cliente abre **un** enlace, compara las tres lado a lado, marca la que quiere y
el total se recalcula solo. Y tú te enteras de cuál eligió, que es información que
hoy se pierde en un correo.

Ventajas sobre mandar tres PDFs: un solo folio, una sola oportunidad en Monday, un
solo enlace que seguir, y sabes exactamente qué escogió el cliente y cuándo.

Esto **necesita el modelo de bloques de la Fase 1** — con HTML plano no se puede
hacer, porque «la opción B está seleccionada» no es algo que se pueda guardar en
un `<td>`.

---

# Duda 2 — «Versionar: quién modificó y si envió o solo generó»

## Buena noticia: la mitad ya se está guardando

La tabla `document_events` existe y funciona. Verificado en el lab:

```
      action      | actor_id | actor_name | actor_email | pdf_hash
------------------+----------+------------+-------------+----------
 document.created | dev      |            |             |
```

Y el código ya sabe registrar **once tipos de evento distintos**:

| Evento | Qué significa |
|---|---|
| `document.created` | **Se generó** el PDF |
| `document.regenerated` | Se editó y se volvió a generar |
| `document.sent` | **Se envió** al cliente |
| `document.viewed` | El cliente lo abrió |
| `document.signed` | El cliente firmó |
| `document.completed` | Firmaron todos |
| `document.approval_requested` / `_approved` / `_rejected` | Flujo de aprobación |
| `document.payment_initiated` / `document.paid` | Pagos |

**La distinción que pediste — «si envió el documento o solo lo generó» — ya se
está registrando ahora mismo**, en `document.created` frente a `document.sent`.

## Los tres huecos

### Hueco 1 — Se guarda el ID, no la persona

`actor_name` y `actor_email` van vacíos: solo se manda `actor: { id: userId }`.
En el historial ves `12345678`, no «Juan Carrazco».

**Arreglo: una hora.** El editor ya llama a `/api/monday/me` y tiene el nombre y el
correo del vendedor a mano — solo hay que pasarlos a `logEvent`.

### Hueco 2 — No se guarda el contenido anterior

`PUT /:id/regenerate` hace esto ([documents.js:657](../maxi-docs-backend/src/routes/documents.js)):

```sql
UPDATE documents SET content_html = $1, pdf_content = $2, ...
```

Sobrescribe. Sabes **que** alguien modificó y cuándo, pero no **qué** cambió, y no
puedes volver a la versión anterior ni recuperar el PDF que el cliente ya vio.

**Arreglo: un día.** Una tabla nueva, sin tocar nada de lo existente:

```sql
CREATE TABLE document_versions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version      INT  NOT NULL,
  content_html TEXT,           -- después de la Fase 1: content JSONB
  pdf_hash     VARCHAR(64),
  total_snapshot NUMERIC(14,2),-- cuánto valía la cotización en ese momento
  actor_id     VARCHAR(100),
  actor_name   VARCHAR(255),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (document_id, version)
);
```

Antes de cada `regenerate`, se guarda la versión que había. Se acabó.

> Ojo con un detalle que sí importa: hoy `regenerate` también hace
> `signed_pdf_content = NULL`. Si alguien edita un documento **ya firmado**, la
> firma del cliente desaparece sin dejar rastro. Con `document_versions` eso queda
> registrado; sin ella, no.

### Hueco 3 — No se muestra en ningún lado

El endpoint `GET /api/signatures/:documentId/events` existe y responde bien.
Busqué en todo el frontend quién lo llama: **nadie**. El historial se escribe
religiosamente y jamás se ve.

**Arreglo: un día.** Un panel de línea de tiempo en el detalle del documento:

```
  ●  Generado           Juan Carrazco      20 ago, 17:58
  ●  Editado (v2)       Juan Carrazco      20 ago, 18:14   $184,500 → $172,300
  ●  Enviado            Juan Carrazco      20 ago, 18:20   → ana@transportes.mx
  ●  Abierto            Ana Ruiz           20 ago, 19:02   2 min 14 s
  ●  Firmado            Ana Ruiz           21 ago, 09:31   IP 189.203.x.x
```

## Resumen de la duda 2

| Lo que pediste | Estado | Falta |
|---|---|---|
| Saber **quién** modificó | ⚠️ Se guarda el ID | Pasar nombre y correo a `logEvent` — 1 h |
| Saber si **envió o solo generó** | ✅ Ya se guarda | Solo mostrarlo — es parte del panel |
| Ver el **historial** | ⚠️ Se guarda, no se ve | Panel de línea de tiempo — 1 día |
| Recuperar una **versión anterior** | ❌ Se sobrescribe | Tabla `document_versions` — 1 día |

**Total: 2-3 días** para tener versionado y trazabilidad completos, porque la
mitad del trabajo ya estaba hecha y nadie lo estaba aprovechando.

Y después de la Fase 1 esto mejora solo: cuando el documento es JSON, una versión
es el JSON anterior, y comparar dos versiones es comparar dos objetos — se puede
mostrar «cambió la cantidad de 5 a 3 unidades» en vez de un diff de HTML ilegible.

---

## Detalle relacionado: el folio es global

`doc_number_seq` es una secuencia única para toda la instalación, no por cuenta.
Con un solo cliente (MAXIRent) no pasa nada, pero si algún día hay una segunda
cuenta, los folios se van a intercalar entre las dos empresas. Conviene tenerlo
presente antes de vender la app a un tercero.
