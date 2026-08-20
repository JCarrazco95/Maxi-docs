# 05 — Entorno de laboratorio (cómo trabajar sin tocar producción)

---

## Las tres reglas

1. **Nunca trabajar en `main`.** `main` es lo que corre en Railway + Vercel.
2. **Nunca poner credenciales de producción en el `.env` del lab.** Ni la
   `DATABASE_URL` de Railway, ni el `MONDAY_API_TOKEN` real, ni la key de Resend.
3. **Nada llega a producción sin pasar por una PR.**

---

## Cómo está aislado

| Capa | Producción | Laboratorio |
|---|---|---|
| Rama | `main` | `lab/v3` |
| Base de datos | Postgres en Railway | Postgres en Docker, puerto **5433** |
| Backend | `maxi-docs-production.up.railway.app` | `localhost:3001` |
| Frontend | `maxi-docs.vercel.app` | `localhost:8301` |
| Monday | Boards reales de MAXIRent | Sin token (o board de pruebas) |
| Correo | Gmail del vendedor / Resend | Sin proveedor → solo log |
| Archivos | Cloudflare R2 | `maxi-docs-backend/uploads/` |

Los cuatro puntos de contacto con el mundo real (BD, Monday, correo, R2) están
apagados por defecto en `.env.lab.example`. Para que el lab toque producción hay
que **escribir a mano** una credencial de producción — no puede pasar por accidente.

---

## Estado: ✅ funcionando

Verificado de punta a punta el 20/08/2026 en esta máquina:
20 tablas creadas, backend en el 3001, frontend en el 8301, y un PDF real de
2 páginas generado con folio `MR-2026-0001`.

---

## Arranque desde cero

### Opción A — Postgres que ya tienes instalado (es lo que se usó aquí)

Esta máquina ya tiene **PostgreSQL 17 corriendo en el puerto 5433**, así que no
hizo falta Docker. La base del lab se creó ahí:

```bash
PSQL="/c/Program Files/PostgreSQL/17/bin/psql.exe"
"$PSQL" -h 127.0.0.1 -p 5433 -U postgres -d postgres \
  -c "CREATE ROLE maxidocs LOGIN PASSWORD 'lab-local-no-secreta';"
"$PSQL" -h 127.0.0.1 -p 5433 -U postgres -d postgres \
  -c "CREATE DATABASE maxi_docs_lab OWNER maxidocs;"
```

### Opción B — Docker

```bash
docker compose -f docker-compose.lab.yml up -d
```

Mismo puerto (5433), mismo usuario y misma base, así que la `DATABASE_URL` del
`.env.lab.example` sirve para las dos opciones sin cambiarla.

### Backend y frontend

```bash
# Backend
cd maxi-docs-backend
cp .env.lab.example .env
node -e "const c=require('crypto');console.log('JWT_SECRET='+c.randomBytes(32).toString('hex'))"
# pega ese valor y otro igual para APP_ENCRYPTION_KEY en el .env
npm install          # ~25 s, descarga Chromium para Puppeteer
npm run migrate
npm run dev

# Frontend (otra terminal)
cd panda-monday
npm install
npm run dev          # http://localhost:8301
```

---

## Cómo comprobar que funciona

```bash
curl http://localhost:3001/health
curl http://localhost:3001/api/templates -H "x-monday-account-id: dev" -H "x-monday-user-id: dev"
```

Y para el flujo completo (genera un PDF de verdad, tarda ~5 s):

```bash
curl -X POST http://localhost:3001/api/documents/generate \
  -H "Content-Type: application/json" \
  -H "x-monday-account-id: dev" -H "x-monday-user-id: dev" \
  -d '{"template_id":"<id de la plantilla>","name":"Prueba","filled_data":{"razon_social":"Ejemplo SA","name":"Ana Ruiz"}}'
```

---

## Lo que se aprendió al levantarlo

**El bug #10 era real y se confirmó con una prueba de control.** El schema de
`main` sobre una base limpia:

```
ERROR: no existe la relación «catalog_categories»   (línea 323)
tablas creadas: 0
```

El schema corregido, ejecutado dos veces seguidas: `exit 0`, **20 tablas**.
Ya está arreglado en esta rama (commit siguiente al de la documentación).

**Dos hallazgos más confirmados en vivo, no solo leyendo el código:**

- **#16** — el documento generado quedó con `pdf_hash: null`, tal como se
  predijo. La cadena de auditoría del PDF original está vacía.
- **#03** — el PDF se descargó con `curl` **sin un solo header de Monday**.
  Cualquiera con el UUID lo tiene.
- **#28** — generar un documento tardó **5,0 segundos**, casi todo arrancando
  Chrome dos veces (PDF + miniatura).

---

## Nota sobre esta máquina

El `pg_hba.conf` del Postgres local está en modo `trust` para `127.0.0.1`: se
conecta sin contraseña. Para un entorno de laboratorio está bien y de hecho
simplifica el arranque, pero conviene saberlo — cualquier proceso en tu equipo
puede conectarse a esa base.

---

## Ramas

```
main              ← producción. Solo merges de PR revisadas.
 └─ lab/v3        ← rama larga del rediseño. Aquí vive todo lo de docs/04.
     ├─ lab/v3-doc-model
     ├─ lab/v3-editor-bloques
     └─ …          ramas cortas que se mergean a lab/v3
 └─ fix/…         ← hotfixes de producción, directo desde main a main
```

`lab/v3` hace `rebase` periódico sobre `main` para no divergir. Los arreglos de la
**Fase 0** van directo a `main` en PRs pequeñas, no esperan a v3.

---

## Cuando llegue el momento de desplegar v3

Servicios **nuevos**, sin tocar los actuales:

- Railway: un service `maxi-docs-lab` apuntando a la rama `lab/v3`, con su propia base Postgres.
- Vercel: los preview deployments de la rama ya te dan una URL por commit — con eso basta al principio.
- Monday: una **segunda app** en modo desarrollo apuntando a la URL del lab, para que
  los vendedores sigan usando la app de producción sin enterarse.

El día del cambio: se apunta la app de producción a la nueva URL, y si algo sale
mal se revierte cambiando una variable. Sin migración de datos de golpe.
