# 03 — Cómo funciona PandaDoc y qué copiar

Verificado contra la documentación pública de su API
([developers.pandadoc.com](https://developers.pandadoc.com/docs/create-document-from-template),
[content placeholders](https://developers.pandadoc.com/docs/create-with-content-placeholders-from-template),
[smart content](https://support.pandadoc.com/en/articles/9714634-smart-content-block-conditional-content)).

---

## 1. El modelo de datos de PandaDoc

Un documento **no es HTML**. Es un objeto con partes tipadas:

```jsonc
{
  "name": "Propuesta Acme",
  "template_uuid": "ustHNnVaPCD6MzuoNBbZ8L",
  "recipients": [
    { "email": "jane@acme.com", "first_name": "Jane", "role": "Signer" }
  ],
  "tokens":         [ { "name": "cliente.nombre", "value": "Acme S.A." } ],
  "fields":         { "firma_cliente": { "value": "", "role": "Signer" } },
  "pricing_tables": [ { "name": "Tarifas", "sections": [ { "rows": [...] } ] } ],
  "content_placeholders": [ { "block_id": "...", "content_library_items": [...] } ],
  "metadata":       { "crm_deal_id": "12345" }
}
```

Las cinco piezas que hay que entender:

| Pieza | Qué es | Equivalente actual en MaxiDocs |
|---|---|---|
| **Template** | Estructura de bloques con huecos | ✅ Existe (pero es HTML plano) |
| **Tokens** | Variables de merge (`cliente.nombre`) | ✅ Existe (`{{name}}`) |
| **Fields** | Campos que **rellena o firma el destinatario** | ❌ No existe |
| **Pricing tables** | Tabla de precios como **datos** (sections → rows → taxes/fees/discounts) | ⚠️ Existe pero como base64 dentro de HTML |
| **Content placeholders** | Huecos donde se inyectan bloques de la biblioteca al crear | ⚠️ Hay biblioteca, no hay placeholders |
| **Recipients + roles** | Quién ve, quién edita, quién firma | ⚠️ Solo "firmantes", sin roles |

**La diferencia clave:** en PandaDoc, `pricing_tables` es una estructura de datos
que el motor sabe sumar. En MaxiDocs es un `<pricing-table data-items-b64="...">`
que hay que **parsear con regex desde el backend** para saber cuánto vale.

---

## 2. Las capacidades de PandaDoc, y dónde está MaxiDocs en cada una

| Capacidad | PandaDoc | MaxiDocs hoy | Distancia |
|---|---|---|---|
| Editor de bloques drag & drop | ✅ | ⚠️ TipTap sobre HTML | Media |
| Plantillas + variables | ✅ | ✅ | **Ya está** |
| Tabla de precios / cotizador | ✅ datos, con descuentos, impuestos, cargos, líneas opcionales y "elige uno" | ⚠️ base64 en HTML, IVA fijo 16% | Media |
| Biblioteca de contenido | ✅ | ✅ existe | **Ya está** |
| Contenido condicional (smart content) | ✅ | ❌ | Alta |
| Campos rellenables por el cliente | ✅ | ❌ | Alta |
| Firma electrónica + certificado | ✅ | ⚠️ código completo, **desconectado de la UI** | Baja (reconectar) |
| Orden de firma secuencial | ✅ | ✅ implementado | **Ya está** |
| Roles de destinatario | ✅ | ❌ | Media |
| Aprobaciones internas | ✅ | ⚠️ backend sin UI | Baja |
| CPQ / reglas de descuento | ✅ | ⚠️ backend sin UI | Baja |
| Analítica (tiempo por página) | ✅ | ⚠️ `time_spent_seconds` roto | Baja |
| Pagos en el documento | ✅ Stripe | ⚠️ backend sin UI | Media |
| Export DOCX | ✅ | ❌ | Alta |
| Versionado del documento | ✅ | ❌ | Alta |
| API pública + webhooks | ✅ | ⚠️ existe, sin scopes | Media |
| Espacios de trabajo | ✅ | ⚠️ a medias | Baja |

**Conclusión honesta: MaxiDocs ya tiene ~40% de PandaDoc construido.** No falta
tanto código como parece. Lo que falta es el **modelo de datos correcto**, y sin
él las tres capacidades marcadas como "Alta" son imposibles de construir bien.

---

## 3. El cambio que desbloquea todo lo demás

### De esto:

```
documents.content_html  TEXT   "<div class='mr'><pricing-table data-items-b64='W3si...'/>...</div>"
```

### A esto:

```jsonc
// documents.content  JSONB
{
  "version": 3,
  "blocks": [
    { "id": "b1", "type": "image",   "src": "…/header.png", "fullBleed": true },
    { "id": "b2", "type": "text",    "html": "<p>Presentamos…</p>" },
    { "id": "b3", "type": "pricing", "title": "TARIFAS",
      "sections": [{
        "rows": [{
          "sku": "HINO-3.5",
          "name": "Hino 3.5 caja seca",
          "qty": 2,
          "unitPrice": 1200,          // renta diaria
          "billingPeriodDays": 30,
          "extras": { "delivery": 5000, "retrieval": 5000 },
          "deductiblePct": 10,
          "editableByClient": ["qty"],   // ← el cliente puede cambiar cantidad
          "optional": false
        }],
        "discounts": [{ "type": "percent", "value": 5 }],
        "taxes":     [{ "name": "IVA", "rate": 16 }]
      }]
    },
    { "id": "b4", "type": "field", "fieldType": "signature", "role": "cliente" },
    { "id": "b5", "type": "pagebreak" }
  ],
  "roles":  [{ "id": "cliente", "label": "Cliente" }],
  "tokens": { "razon_social": "Acme S.A.", "ejecutivo": "Juan Carrazco" },
  "theme":  { "primary": "#1B3055", "accent": "#F5A000", "font": "Arial" }
}
```

Y de ahí salen **todas** las salidas:

```
Documento JSON ──┬──► HTML   (editor + preview + correo)
                 ├──► PDF    (Chromium → el HTML renderizado)
                 ├──► DOCX   (librería `docx`, recorriendo los mismos bloques)
                 └──► Totales (una función pura sobre `sections`, con tests)
```

Lo que se gana el día uno:
- Se borran `extractPricingTotal`, `extractQuoteValues`, `parseAllTables`, `mergePtItems` y la mitad de `processPricingTableNodes`. **Ya no hay regex sobre HTML.**
- Desaparecen los dos modos del editor ("solo tablas" / "edición libre"): siempre se edita el mismo modelo.
- El cálculo de la cotización se puede probar con un test unitario en 5 líneas.
- Versionar es guardar el JSON anterior.
- El cliente puede editar una cantidad porque `qty` es un número, no un `<td>`.

**Coste de la migración:** las plantillas actuales son HTML. Se escribe un
importador `html → blocks` una sola vez (el HTML de MAXIRent es regular:
`.mr-page`, `<pricing-table>`, `<h3>`, `<ul>`, `<img>`), se corre sobre las
plantillas existentes y se revisa a mano. Es 1-2 días, no semanas.

---

## 4. Lo que NO hay que copiar de PandaDoc

- **Su editor completo.** Tienen años y un equipo entero. TipTap sobre un modelo
  de bloques cubre el 90% del uso real de MAXIRent.
- **Su modelo de precios genérico.** MAXIRent renta flota: `renta diaria × 30 ×
  unidades + entrega + recolección`, con deducible y adecuaciones. Un cotizador
  específico y correcto vale más que uno genérico y confuso.
- **Multi-idioma, multi-moneda, plantillas de marca por cliente.** Todavía no.
- **Su modelo de precios comercial** (API solo en planes Business+). Ese es
  justamente el hueco de mercado.

---

## 5. La ventaja que MaxiDocs tiene sobre PandaDoc

Vale la pena decirlo: PandaDoc **no** vive dentro de Monday con los datos del lead
ya cargados. MaxiDocs sí: abre el editor desde el item, autocompleta cliente,
correo, ejecutivo, plazo y unidades, y al guardar crea la oportunidad con 12
columnas mapeadas y el PDF adjunto.

Eso es un flujo que PandaDoc no da sin integración adicional, y es lo que hay que
proteger mientras se moderniza el motor por debajo.
