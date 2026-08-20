# 02 — Arquitectura: qué está bien y qué está mal

---

## Lo que está BIEN (y hay que conservar)

**1. La separación backend / frontend es correcta.**
Dos apps, dos deploys, contrato HTTP claro. Nada de SSR raro ni monolito. Esto
escala y permite meter un segundo cliente (portal público, app móvil, API) sin tocar el core.

**2. SQL crudo con `$1, $2` en lugar de un ORM.**
Decisión buena para este tamaño. El código es legible, las queries hacen lo que
dicen y no hay magia. Se rompe en **un solo lugar** (`/stats`) y eso es arreglable
en 10 minutos. Un ORM aquí habría sido peso muerto.

**3. Degradación elegante de los servicios opcionales.**
`emailService` sin proveedor no truena, hace log y sigue. `storageService` cae a
filesystem si no hay R2. `payments`/`ai` responden 503 con instrucciones en vez de
explotar. Es un patrón maduro y hay que mantenerlo.

**4. `logEvent()` nunca lanza.**
La auditoría no puede tumbar el flujo principal. Correcto.

**5. El truco de `data-items-b64`.**
Serializar los items de la tabla de precios como base64 dentro de un atributo es
feo pero resuelve un problema real: sobrevivir al round-trip por TipTap y por el
encoding de HTML. La solución correcta a futuro es otra (§ modelo de documento),
pero como parche fue inteligente.

**6. Los comentarios explican el *porqué*, no el *qué*.**
Ejemplos: por qué no se usa `--single-process` en Puppeteer, por qué el base64 del
correo se corta a 76 caracteres (Outlook), por qué existe el nodo `GenericDiv`.
Esto es raro de encontrar y vale mucho. Conservarlo.

**7. El historial de commits es limpio.**
`feat(scope): descripción` en español, una PR por cambio, mensajes que explican el
síntoma real ("el correo no cargaba la vista previa porque usaba PUBLIC_URL en vez
de BACKEND_URL"). Se puede reconstruir la historia del proyecto leyendo el log.

---

## Lo que está MAL (por orden de impacto)

### 🥇 1. El documento es un blob de HTML

Este es **el problema estructural del proyecto**. Todo lo demás se deriva de aquí.

```
templates.content_html  TEXT   ← un string de HTML
documents.content_html  TEXT   ← otro string de HTML
```

Consecuencias que ya se están pagando hoy:

- Para saber cuánto vale una cotización hay que **parsear HTML con regex**
  (`extractPricingTotal`, `extractQuoteValues`, `parseAllTables`,
  `processPricingTableNodes`, `mergePtItems`). Cinco funciones distintas
  con cinco expresiones regulares para leer el mismo dato.
- TipTap se come el `<style>` y los `<div>` al parsear → hubo que escribir
  `ensureTemplateStyle()` y el nodo `GenericDiv` para repararlo → y aun así hay
  dos modos ("solo tablas" / "edición libre") porque ninguno funciona siempre.
- No se puede versionar un documento, ni comparar dos versiones, ni saber
  qué bloque cambió, ni renderizar a otro formato que no sea HTML.
- No se puede hacer "el cliente edita la cantidad" porque no hay un dato que
  editar, hay un `<td>`.
- Cada cambio de plantilla es un cambio de string de 120 líneas hardcodeado.

**PandaDoc no hace esto.** Su documento es un árbol JSON de bloques tipados. El
HTML y el PDF son *salidas* del modelo, no el modelo.

### 🥈 2. La identidad no se verifica

Ya está en `01-BUGS`, pero arquitectónicamente el problema es que **no hay una
capa de autenticación**. Hay un middleware que copia headers a un objeto. No hay
sesión, no hay token, no hay usuarios en la BD. Todo el modelo de permisos
(`admin`/`editor`/`viewer`) descansa sobre un header que manda el navegador.

Esto también bloquea features: no se puede tener un portal donde el cliente entre
con su correo, ni firmas con validez legal, ni API keys con scopes reales.

### 🥉 3. La lógica de negocio vive en los route handlers

`documents.js` tiene 768 líneas y hace: HTTP, cálculo de cotizaciones, integración
con Monday GraphQL, generación de PDF, subida de archivos, auditoría y correo.
`signatures.js` tiene 666 y repite la mitad.

Síntomas concretos: `signatures.js` importa de `documents.js`; los IDs de columnas
de Monday están duplicados en ambos archivos; las dos fórmulas de total divergieron
porque están en dos funciones que nadie compara.

**Falta la capa de dominio.** Debería haber:

```
services/quote.js       ← una sola fórmula de cotización, testeable sin HTTP
services/document.js    ← ciclo de vida del documento
integrations/monday/    ← todo lo de Monday, con su mapeo de columnas en config
routes/*.js             ← solo validar entrada, llamar al servicio, formatear salida
```

### 4. Monday.com está cableado al core, no acoplado por un puerto

El nombre del board (`8311006777`), los IDs de columna (`text_mkvxs7sb`,
`deal_value`, `n_meros_mkmfsgxr`…) y la lógica de "crear oportunidad" están
esparcidos dentro del flujo de generación de documentos. MaxiDocs *es* una app de
Monday hoy, y está bien, pero si mañana quieres venderla a alguien que usa HubSpot,
o simplemente usarla fuera de Monday, hay que reescribir `documents.js`.

Debería ser: el core genera documentos y emite eventos; un adaptador de Monday
escucha esos eventos y hace su trabajo.

### 5. Todo es síncrono

`POST /api/documents/generate` hace, en una sola petición HTTP:
lee Monday → renderiza HTML → **lanza Chrome** → genera PDF → crea item en Monday →
sube el PDF a Monday → guarda en BD. Y en background dispara *otro* Chrome para la
miniatura.

Son 5-15 segundos con el usuario mirando un spinner, y si Monday tarda o falla, el
usuario ve un error aunque su PDF esté perfecto. No hay reintentos, no hay cola,
no hay idempotencia: si el usuario da doble clic se crean dos oportunidades en Monday.

### 6. Código muerto con dependencias vivas

~2500 líneas que no se ejecutan (DocuSeal, Stripe, SSO, embed, deal rooms, CPQ,
todo el backend de firma) pero sus paquetes se instalan en producción y su
superficie HTTP sigue expuesta. Los endpoints inseguros del `01-BUGS` son casi
todos de módulos que nadie usa.

### 7. No hay frontera entre "el editor" y "la app"

`EditorPage.jsx` recibe la identidad por **query params en la URL** (`?account=…&user=…&admin=1`),
la mete en el contexto de Axios y desde ahí llama a la API. Además de ser
falsificable, significa que el editor no es un componente reutilizable: es una
página que solo funciona si alguien le arma bien la URL.

### 8. Sin tests, sin CI, sin entornos

Un solo entorno: producción. No hay staging. No hay pruebas. Cada deploy es un
acto de fe. Con 152 commits y lógica financiera dentro, esto es lo que más va a
doler conforme crezca.

---

## Arquitectura objetivo (v3)

```
┌─────────────────────────────────────────────────────────────┐
│  CLIENTES                                                    │
│  App Monday (iframe) · Editor · Portal público · API pública │
└───────────────────────────┬─────────────────────────────────┘
                            │  JWT verificado (Monday sessionToken / portal token)
┌───────────────────────────▼─────────────────────────────────┐
│  API (Express)  — routes = solo I/O, validación con Zod      │
├─────────────────────────────────────────────────────────────┤
│  DOMINIO                                                     │
│  ├ document/   crear, versionar, estados                     │
│  ├ quote/      UNA fórmula: líneas, descuentos, IVA, totales │
│  ├ template/   plantillas y bloques reutilizables            │
│  ├ signing/    firmantes, campos, evidencia                  │
│  └ events/     document.created, .sent, .viewed, .signed     │
├─────────────────────────────────────────────────────────────┤
│  RENDER                                                      │
│  Doc JSON ──┬──► HTML (editor y preview)                     │
│             ├──► PDF   (Chromium con pool, o Gotenberg)      │
│             └──► DOCX  (librería `docx`, desde el mismo JSON)│
├─────────────────────────────────────────────────────────────┤
│  ADAPTADORES (reemplazables, no cableados)                   │
│  Monday · Gmail/Resend · R2/S3 · Stripe · Webhooks           │
├─────────────────────────────────────────────────────────────┤
│  DATOS                                                       │
│  Postgres (documentos, versiones, eventos) + R2 (binarios)   │
│  Cola de jobs para PDF y llamadas externas                   │
└─────────────────────────────────────────────────────────────┘
```

**Los tres cambios que realmente importan:**

1. **Modelo de documento JSON** en lugar de HTML. Desbloquea versiones, DOCX,
   campos editables por el cliente, y elimina las 5 funciones de regex.
2. **Autenticación real** con el `sessionToken` de Monday verificado con
   `MONDAY_SIGNING_SECRET`, y tokens propios para el portal.
3. **Una sola función de cotización**, con pruebas, fuera de las rutas.

Todo lo demás (cola, DOCX, colaboración, analítica) se construye encima de eso
sin dolor. Sin eso, cada feature nueva agrega otra regex y otro modo especial.
