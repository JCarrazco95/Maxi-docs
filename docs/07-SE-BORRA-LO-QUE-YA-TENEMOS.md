# 07 — «Al actualizar, ¿se borra lo que ya tenemos?»

**No. Nada se borra.** Ni los documentos, ni los PDFs firmados, ni las plantillas,
ni el catálogo, ni el historial. Y no es una promesa: es una consecuencia de cómo
está planteada la migración.

---

## Por qué no se borra

### 1. La base de datos no se reemplaza, se le añaden columnas

La migración de v3 **no crea una base nueva**. Corre sobre la misma base de
producción y solo agrega cosas:

```sql
ALTER TABLE documents ADD COLUMN IF NOT EXISTS content JSONB;   -- nueva
-- content_html se queda EXACTAMENTE como está
```

Los 3 mil documentos que tengas seguirán ahí, con su `content_html`, su
`pdf_content`, su folio y su historial. La columna nueva empieza vacía.

Todo el `schema.sql` del proyecto ya está escrito así (`CREATE TABLE IF NOT
EXISTS`, `ADD COLUMN IF NOT EXISTS`): es aditivo por diseño. Ninguna migración
lleva un `DROP` ni un `DELETE`.

### 2. Los dos formatos conviven

Durante la transición, un documento puede estar en cualquiera de los dos
formatos y el sistema sabe leer ambos:

```js
const doc = await cargarDocumento(id);
const bloques = doc.content ?? importarDesdeHtml(doc.content_html);
```

Los documentos viejos siguen abriéndose, editándose y regenerándose. Los nuevos
nacen en JSON. No hay un día en que «todo cambia»: el cambio es gradual y
reversible documento a documento.

### 3. Los PDFs ya emitidos no se tocan nunca

Un PDF firmado es un documento con valor legal. La regla es simple:
**los binarios existentes son de solo lectura**. La v3 no los regenera, no los
convierte, no los mueve. Se quedan en `pdf_content` y `signed_pdf_content` tal
cual están hoy.

### 4. Antes de cualquier cosa, un respaldo

El día del despliegue, primero esto:

```bash
pg_dump "$DATABASE_URL_PRODUCCION" -Fc -f respaldo-antes-de-v3.dump
```

Railway además tiene copias automáticas. Con ese archivo, el peor escenario
imaginable se revierte en minutos.

---

## Cómo sería el despliegue, paso a paso

```
1. Respaldo completo de la base de producción            ← red de seguridad
2. Desplegar v3 en un servicio NUEVO de Railway,
   apuntando a una COPIA de la base de producción        ← ensayo con datos reales
3. Comprobar con documentos reales: abrir, editar,
   regenerar, comparar el PDF viejo contra el nuevo
4. Solo si todo cuadra: migración aditiva sobre la
   base de producción (solo ALTER ... ADD COLUMN)
5. Cambiar la URL del backend en la app de Monday        ← el "encendido"
6. Vigilar un par de días
```

El paso 2 es el importante: **v3 se prueba contra una copia de tus datos reales
antes de tocar nada.** Si un documento del año pasado no se abre bien, te enteras
ahí, no con un vendedor delante del cliente.

## Y si algo sale mal

El paso 5 es cambiar una URL. Volver atrás es **cambiar esa misma URL de vuelta**:

- El backend viejo sigue levantado y funcionando.
- La base tiene columnas de más, que el código viejo simplemente ignora.
- Los documentos viejos nunca dejaron de estar en `content_html`.

No hay «migración de datos» que deshacer, porque no hay migración destructiva.

---

## Lo único que sí desaparece

Para ser exactos, en la v3 sí se quita algo — pero nada que estés usando:

| Qué se quita | Por qué es seguro |
|---|---|
| `signService.js` (DocuSeal) | 162 líneas que ningún archivo importa |
| Endpoints de Stripe, SSO, embed | Sin interfaz, nadie los ha llamado nunca |
| `parseAllTables`, `extractPricingTotal` duplicados | Ya reemplazados por `quoteService`, con pruebas |

Es código, no datos. Y todo sigue en el historial de git por si acaso.

---

## Resumen

| Pregunta | Respuesta |
|---|---|
| ¿Se borran los documentos? | No. Se conservan con su HTML original. |
| ¿Se pierden los PDFs firmados? | No. Los binarios no se tocan. |
| ¿Hay que rehacer las plantillas? | No. Se importan automáticamente a bloques y se revisan a mano. |
| ¿Se pierde el catálogo o el historial? | No. Esas tablas no cambian. |
| ¿Hay un momento de «apagar y volver a encender»? | Solo cambiar una URL. Con vuelta atrás inmediata. |
| ¿Y si algo falla? | Se revierte la URL. El backend viejo sigue vivo, y hay respaldo. |

**La v3 se construye al lado de lo que ya funciona, no encima.**
