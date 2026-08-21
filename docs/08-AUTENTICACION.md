# 08 — Autenticación (hallazgo #1)

El hallazgo número uno del análisis. Lo que sigue explica qué cambió y, sobre
todo, **qué hay que configurar el día que esto vaya a producción** — porque si
falta una variable, la app deja de funcionar.

---

## Antes

```js
// mondayAuth.js
req.mondayContext = {
  accountId: req.headers['x-monday-account-id'] || 'dev',
  isAdmin:   req.headers['x-monday-is-admin'] === 'true',
}
```

Headers de texto plano, sin firma. El ataque completo era:

```bash
curl https://<backend>/api/documents \
  -H "x-monday-account-id: <la cuenta que sea>" \
  -H "x-monday-is-admin: true"
```

Y además el `|| 'dev'`: una petición **sin ningún header** se trataba como la
cuenta `dev`, que es un inquilino real con documentos dentro.

## Ahora

El frontend pide `monday.get('sessionToken')` —un JWT que Monday firma con el
signing secret de la app— y lo manda en `Authorization: Bearer`. El backend
verifica la firma. La identidad ya no la elige el cliente.

```
┌─ app dentro del iframe de Monday ─┐
│  monday.get('sessionToken')       │
│         │                         │
│         ▼                         │
│  Authorization: Bearer <JWT>      │──▶  backend: jwt.verify(token, SIGNING_SECRET)
└───────────────────────────────────┘         │
                                              ▼
                                    { dat: { account_id, user_id, user_kind } }
```

## Comprobado

Con el modo estricto activado, contra el laboratorio:

| Intento | Resultado |
|---|---|
| Sin credenciales | **401** |
| Headers `x-monday-*` falsificados (el ataque original) | **401** |
| Token firmado con otro secreto | **401** |
| Token caducado | **401** |
| Token con el payload manipulado y la firma original | **401** |
| Token legítimo | **200** |

Y el aislamiento entre empresas, con tokens reales de dos cuentas:

| Intento | Resultado |
|---|---|
| Empresa A lista documentos | Solo los suyos |
| Empresa B lista documentos | Solo los suyos |
| B se baja el PDF de A | **403** |
| Un `member` crea una API key | **403 — se requieren permisos de administrador** |
| Un `admin` crea una API key | **201** |

---

## El editor en pestaña nueva

`monday.get('sessionToken')` solo funciona **dentro** del iframe de Monday,
porque el SDK habla con la ventana padre. El editor se abre con `window.open`,
donde no hay padre — y por eso la identidad viajaba en la URL:

```
/editor?tpl=…&account=12345678&user=99&admin=1     ← falsificable, y queda en el historial
```

Ahora la pestaña del editor le **pide el token a la ventana que la abrió**, que
sí está dentro de Monday, por `postMessage` con el origen comprobado en ambos
sentidos:

```
editor  ──{ mxd-need-token }──▶  app en Monday
editor  ◀──{ mxd-token, … }───   app (llama a monday.get y responde)
```

El token no toca la URL. Y como la app responde cada vez que se le pide, el
editor puede renovarlo durante una sesión larga sin que el usuario note nada.

La URL del editor ahora solo lleva navegación: qué plantilla abrir y de qué item
de Monday viene.

---

## ⚠️ Qué configurar antes de desplegar

**Esto rompe producción si falta.** Anotado aquí para que no se olvide.

### 1. `MONDAY_SIGNING_SECRET` en el backend

El **Signing Secret** de la app, en monday.com → Developers → tu app →
Basic Information. Sin él, el servidor **no arranca**:

```
Error: MONDAY_SIGNING_SECRET no está definido. Sin él no se puede verificar
la identidad de las peticiones.
```

Es deliberado: mejor no arrancar que arrancar aceptando cualquier cosa.

### 2. `ALLOW_HEADER_AUTH` **fuera**, o en `false`

Es el modo compatibilidad para desarrollo local: acepta los headers sin firmar.
Es exactamente el agujero que este cambio cierra. El valor por defecto es
apagado, así que basta con no ponerlo — pero conviene comprobarlo.

Cuando está encendido, el servidor lo avisa al arrancar:

```
⚠️  ALLOW_HEADER_AUTH=true — la identidad se acepta por headers SIN FIRMAR.
    Esto es solo para desarrollo local. NUNCA en producción.
```

### 3. `MONDAY_API_TOKEN` para resolver los administradores

El `sessionToken` no siempre trae `user_kind`. Cuando falta, el backend le
pregunta a Monday si el usuario es administrador (y lo cachea 10 minutos). Sin
ese token, **nadie será administrador** — se falla del lado seguro, pero el
panel de configuración quedaría vacío para todos.

### 4. En el frontend, nada

No hay variable nueva. `VITE_ALLOW_HEADER_AUTH` es solo para desarrollo local y
en producción se deja fuera.

---

## Rutas que siguen siendo públicas

No pueden exigir sesión de Monday porque las abre alguien que no está dentro de
Monday. Cada una se protege con su propio secreto:

| Ruta | Qué la protege |
|---|---|
| `GET /api/signatures/portal/:id` | El UUID de la firma, que viaja en el correo del cliente |
| `POST /api/signatures/:id/sign` | El mismo UUID, más un límite de 10 intentos cada 15 min |
| `POST /api/signatures/:id/time-spent` | Ídem |
| `GET /api/documents/:id/pdf` | Cuenta dueña **o** `?sig=` del firmante |
| `GET /api/rooms/public/:token` | Token opaco de 32 caracteres |
| `POST /api/rooms/:id/messages` | El id de la sala |
| `GET /api/integrations/gmail/callback` | El `state` firmado del OAuth |
| `GET /api/embed/verify/:token` | El JWT que verifica |
| `GET /api/integrations/schema` | Público a propósito, para Zapier |

La lista está escrita explícitamente en `server.js`: **una ruta nueva queda
protegida por omisión**, no abierta. Es la parte más importante del diseño.

---

## Lo que aún falta

- **#6** Las API keys no comprueban sus scopes: la columna se guarda y no se lee.
- **#8** El proxy de Monday sirve cualquier `boardId` con un token global.
- **#9** `GET /api/signatures/:documentId` y `move-document` siguen sin filtrar por cuenta.
