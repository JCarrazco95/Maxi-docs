# Maxi-Docs — Guía de instalación y despliegue

## ¿Qué es este proyecto?

**Maxi-Docs** es una aplicación integrada en **Monday.com** para gestión de documentos.
Permite crear plantillas HTML con variables `{{campo}}`, generar PDFs automáticamente, y enviar documentos a firma electrónica vía DocuSeal.

Arquitectura:
```
Monday.com (iframe)
    └── Frontend React/Vite (panda-monday/)    ← lo que ve el usuario
            │  /api/*  (proxy en Vite o HTTPS directo en prod)
            └── Backend Node/Express (maxi-docs-backend/)
                    ├── PostgreSQL            ← templates, documents, signatures
                    ├── Puppeteer (Chromium)  ← generación de PDFs
                    ├── Cloudflare R2         ← almacenamiento PDFs (prod)
                    └── DocuSeal API          ← firma electrónica
```

---

## Requisitos previos (locales y producción)

| Herramienta | Versión mínima | Notas |
|---|---|---|
| Node.js | 20 LTS | `node --version` |
| npm | 10+ | incluido con Node |
| PostgreSQL | 14+ | local o servicio cloud |
| Git | cualquiera | |
| Cuenta Monday.com | developer plan | para crear la app |
| ngrok (solo local) | gratuito | para exponer localhost a Monday |

---

## Instalación local (paso a paso)

### 1. Clonar el repositorio

```bash
git clone https://github.com/jcarrazco95/maxi-docs.git
cd maxi-docs
```

### 2. Instalar dependencias

```bash
# Backend
cd maxi-docs-backend
npm install

# Frontend
cd ../panda-monday
npm install
```

> `npm install` en el backend descarga Chromium (~170 MB) para Puppeteer. Es normal que tarde.

### 3. Configurar variables de entorno del backend

```bash
cd maxi-docs-backend
cp .env.example .env
```

Edita `.env` con los valores reales:

```env
# Base de datos PostgreSQL local
DATABASE_URL=postgresql://postgres:TU_PASSWORD@localhost:5432/maxi_docs

PORT=3001
NODE_ENV=development

# Monday.com — obtener en developers.monday.com → tu app → General
MONDAY_SIGNING_SECRET=tu_signing_secret

# DocuSeal — obtener en app.docuseal.com → API Keys
DOCUSEAL_API_URL=https://api.docuseal.com
DOCUSEAL_API_KEY=tu_api_key_de_docuseal

# R2 — dejar vacío en desarrollo (los PDFs se guardan en /uploads local)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=

# CORS — URL del frontend (puerto de Vite)
FRONTEND_URL=http://localhost:8301
```

> **DocuSeal es opcional en desarrollo.** La generación de PDFs y los documentos funcionan sin él; la firma electrónica lanzará un error 503 si no está configurado.

### 4. Crear la base de datos

```bash
# Crear la base de datos (si no existe)
psql -U postgres -c "CREATE DATABASE maxi_docs;"

# Ejecutar el schema
cd maxi-docs-backend
npm run migrate
```

### 5. Arrancar el backend

```bash
cd maxi-docs-backend
npm run dev      # con hot-reload
# o
npm start        # sin hot-reload
```

Verificar que funciona:
```bash
curl http://localhost:3001/health
# Respuesta: {"status":"ok","service":"maxi-docs-backend",...}
```

### 6. Exponer el backend con ngrok

Monday.com necesita una URL HTTPS pública para cargar la app.

```bash
# Instalar ngrok: https://ngrok.com/download
# Autenticarse: ngrok config add-authtoken TU_TOKEN

# Exponer el puerto del FRONTEND (Vite hace proxy al backend internamente)
ngrok http 8301
# Anota la URL: https://xxxx-xxxx.ngrok-free.app
```

> **Importante:** ngrok en plan gratuito genera una URL diferente cada vez que lo reinicias. Deberás actualizar la URL en la app de Monday.com cada vez.

### 7. Configurar el frontend

Edita `panda-monday/vite.config.js` y añade tu dominio ngrok a `allowedHosts`:

```js
server: {
  port: 8301,
  allowedHosts: ['xxxx-xxxx.ngrok-free.app'],  // ← tu URL de ngrok
  proxy: { ... }
}
```

### 8. Arrancar el frontend

```bash
cd panda-monday
npm run dev
```

### 9. Configurar la app en Monday.com

1. Ir a [developers.monday.com](https://developers.monday.com)
2. Crear una nueva app (o usar la existente)
3. En **Features → Board View** y **Item View**, poner la URL:
   ```
   https://xxxx-xxxx.ngrok-free.app
   ```
4. En **General**, copiar el **Signing Secret** y pegarlo en `.env` como `MONDAY_SIGNING_SECRET`
5. Instalar la app en tu workspace desde **Install → Install to Account**
6. Abrir cualquier board → Agregar vista → buscar "Maxi-Docs"

### 10. (Opcional) Cargar plantilla de ejemplo

```bash
cd maxi-docs  # raíz del proyecto
node seed_template.mjs
```

---

## Flujo completo de la aplicación

```
1. Usuario abre el Board en Monday → se carga el iframe con Maxi-Docs
2. monday-sdk-js pasa el contexto (accountId, userId, boardId, itemId)
3. Pestaña "Plantillas" → crear/editar plantillas HTML con variables {{campo}}
4. Pestaña "Documentos" → seleccionar plantilla, rellenar variables, generar PDF
5. El backend usa Puppeteer para renderizar HTML → PDF
6. PDF se guarda en /uploads (local) o Cloudflare R2 (producción)
7. Desde el documento se puede enviar a firma → DocuSeal crea el envío y manda emails
```

---

## Requisitos para usar en producción (no local)

### Servicios necesarios

| Servicio | Propósito | Coste aprox. |
|---|---|---|
| **Servidor backend** (Railway / Render / VPS) | Correr Node.js + Puppeteer | $5–20/mes |
| **PostgreSQL cloud** (Railway, Supabase, Neon) | Base de datos | $0–5/mes |
| **Cloudflare R2** | Almacenamiento de PDFs | $0 (5 GB gratis) |
| **DocuSeal** (app.docuseal.com) | Firma electrónica | $0 plan gratis / $30+ |
| **Monday.com Developer Plan** | Publicar la app | Incluido con cuenta |
| **Dominio propio** (opcional) | URL estable para Monday | $10–15/año |

### Pasos para desplegar en producción

#### A. Backend en Railway (recomendado por soporte a Puppeteer)

1. Crear cuenta en [railway.app](https://railway.app)
2. Nuevo proyecto → **Deploy from GitHub repo** → seleccionar `maxi-docs`
3. Configurar el **Root Directory** como `maxi-docs-backend`
4. Añadir las variables de entorno (todas las del `.env.example` con valores reales):
   - `DATABASE_URL` ← Railway puede proveer PostgreSQL automáticamente
   - `MONDAY_SIGNING_SECRET`
   - `DOCUSEAL_API_KEY`
   - `R2_*` (todas las variables de Cloudflare R2)
   - `FRONTEND_URL` ← URL del frontend desplegado
   - `NODE_ENV=production`
5. Railway detecta `package.json` y usa `npm start` automáticamente
6. Anotar la URL que Railway asigna, ej: `https://maxi-docs-backend.up.railway.app`

> **Nota sobre Puppeteer:** Railway soporta Chromium sin configuración extra. En otros proveedores como Render puede necesitarse configurar `PUPPETEER_EXECUTABLE_PATH` o instalar dependencias del sistema.

#### B. Base de datos PostgreSQL en Railway

Dentro del mismo proyecto de Railway:
1. **New Service → Database → PostgreSQL**
2. Railway inyecta `DATABASE_URL` automáticamente en el servicio del backend

Luego ejecutar las migraciones una vez:
```bash
# Desde tu máquina local, con DATABASE_URL de producción
DATABASE_URL=postgresql://... npm run migrate
```

#### C. Cloudflare R2 (almacenamiento de PDFs)

1. Cuenta en [cloudflare.com](https://cloudflare.com) (gratis)
2. R2 → Crear bucket `maxi-docs-pdfs`
3. Configurar acceso público al bucket (o usar URLs presignadas)
4. Manage R2 API Tokens → crear token con permisos de lectura/escritura
5. Copiar en las variables de entorno del backend:
   - `R2_ACCOUNT_ID` — en la página principal de R2
   - `R2_ACCESS_KEY_ID` y `R2_SECRET_ACCESS_KEY` — del token creado
   - `R2_BUCKET_NAME=maxi-docs-pdfs`
   - `R2_PUBLIC_URL=https://pub-xxxx.r2.dev` (URL pública del bucket)

#### D. Frontend en producción

El frontend es un sitio estático una vez compilado:

```bash
cd panda-monday
npm run build
# Genera la carpeta dist/
```

Opciones de hosting (gratuito):
- **Vercel**: conectar repo de GitHub, root directory `panda-monday`
- **Netlify**: igual
- **Cloudflare Pages**: igual

Configurar la variable de entorno en el hosting:
```
VITE_API_URL=https://maxi-docs-backend.up.railway.app
```

Y actualizar `vite.config.js` para que en producción el cliente apunte directamente al backend (sin proxy, ya que el proxy solo funciona en desarrollo).

#### E. Actualizar Monday.com con las URLs de producción

1. [developers.monday.com](https://developers.monday.com) → tu app
2. Features → Board View y Item View → cambiar URL a `https://tu-frontend.vercel.app`
3. Actualizar `FRONTEND_URL` en el backend con la URL del frontend de producción
4. Actualizar `MONDAY_SIGNING_SECRET` si cambiaste la app

### Variables de entorno de producción (backend)

```env
DATABASE_URL=postgresql://user:pass@host:5432/maxi_docs
PORT=3001
NODE_ENV=production
MONDAY_SIGNING_SECRET=signing_secret_real_de_monday
DOCUSEAL_API_URL=https://api.docuseal.com
DOCUSEAL_API_KEY=api_key_real_de_docuseal
R2_ACCOUNT_ID=abc123
R2_ACCESS_KEY_ID=key_id
R2_SECRET_ACCESS_KEY=secret_key
R2_BUCKET_NAME=maxi-docs-pdfs
R2_PUBLIC_URL=https://pub-xxxx.r2.dev
FRONTEND_URL=https://tu-frontend.vercel.app
```

### Variables de entorno de producción (frontend)

```env
VITE_API_URL=https://maxi-docs-backend.up.railway.app
```

---

## Estructura de carpetas

```
maxi-docs/
├── maxi-docs-backend/         # API Node.js/Express
│   ├── server.js              # Punto de entrada
│   ├── .env.example           # Plantilla de variables de entorno
│   └── src/
│       ├── db/
│       │   ├── schema.sql     # Tablas: templates, documents, signatures
│       │   ├── migrate.js     # Ejecuta schema.sql contra la DB
│       │   └── connection.js  # Pool de conexiones PostgreSQL
│       ├── middleware/
│       │   └── mondayAuth.js  # Extrae contexto Monday de headers
│       ├── routes/
│       │   ├── templates.js   # CRUD de plantillas
│       │   ├── documents.js   # Generación de PDFs y documentos
│       │   └── signatures.js  # Envío a firma vía DocuSeal
│       └── services/
│           ├── pdfService.js  # Puppeteer: generar PDF desde HTML
│           ├── storageService.js  # Subida a R2 o almacenamiento local
│           └── signService.js # Integración con DocuSeal API
├── panda-monday/              # App React (se carga en iframe de Monday)
│   ├── src/
│   │   ├── App.jsx            # Shell: tabs + contexto Monday
│   │   ├── api/client.js      # axios con headers Monday inyectados
│   │   └── pages/
│   │       ├── TemplatesPage.jsx  # Gestión de plantillas
│   │       └── DocumentsPage.jsx  # Generación de documentos
│   └── vite.config.js         # Proxy /api → backend (solo desarrollo)
├── plantilla_maxirent.html    # Plantilla de ejemplo
└── seed_template.mjs          # Script para cargar la plantilla de ejemplo
```

---

## Solución de problemas comunes

**`npm install` falla en puppeteer**
```bash
# En Linux puede necesitar dependencias del sistema:
sudo apt-get install -y libgbm-dev libatk1.0-0 libc6 libcairo2 libcups2 \
  libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 \
  libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 libpangocairo-1.0-0 \
  libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 \
  libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6
```

**Monday.com no carga la app (iframe en blanco)**
- Verificar que ngrok está corriendo y la URL coincide con la configurada en Monday
- En `vite.config.js`, el dominio ngrok debe estar en `allowedHosts`
- La URL en Monday debe ser HTTPS

**Error de CORS**
- Revisar `FRONTEND_URL` en el backend: debe coincidir exactamente con el origen del frontend
- Múltiples URLs separadas por coma: `http://localhost:8301,https://mi-frontend.vercel.app`

**Error al generar PDF (`Failed to launch browser`)**
- En producción añadir `--no-sandbox` ya está configurado en `pdfService.js`
- En Railway/Docker funciona sin configuración extra
- En Render puede necesitar el buildpack de Puppeteer

**DocuSeal devuelve 503**
- Configurar `DOCUSEAL_API_KEY` en `.env` con una clave válida de app.docuseal.com
- Verificar que la cuenta DocuSeal tiene saldo/plan activo
