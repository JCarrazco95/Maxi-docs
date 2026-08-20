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

## Arranque desde cero

```bash
# 1. Base de datos local
docker compose -f docker-compose.lab.yml up -d

# 2. Backend
cd maxi-docs-backend
cp .env.lab.example .env
# genera tus secretos:
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
npm install
npm run migrate      # OJO: hoy falla en BD nueva — ver docs/01-BUGS #10
npm run dev

# 3. Frontend (otra terminal)
cd panda-monday
npm install
npm run dev          # http://localhost:8301
```

> ⚠️ **`npm run migrate` no funciona en una base limpia** por el bug #10
> (`ALTER TABLE catalog_*` antes del `CREATE TABLE`). Es lo primero que hay que
> arreglar en la rama, y de paso valida que el entorno de lab sirve para algo:
> ese bug es invisible en producción porque la BD ya existía.

---

## Sin Docker

Si prefieres no usar Docker, crea una base local aparte:

```bash
createdb maxi_docs_lab
# y en el .env:
# DATABASE_URL=postgresql://postgres:TU_PASSWORD@localhost:5432/maxi_docs_lab
```

El nombre `maxi_docs_lab` importa: hace obvio en cualquier log y en cualquier
cliente de BD que no estás en producción.

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
