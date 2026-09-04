/**
 * backup-db.mjs — Punto de restauración de la base de datos.
 *
 * pg_dump no está disponible en todas las máquinas del equipo, así que el
 * respaldo se hace con el cliente `pg` que el backend ya tiene instalado.
 *
 *   node scripts/backup-db.mjs                    # usa DATABASE_URL del .env
 *   DATABASE_URL="postgresql://..." node scripts/backup-db.mjs
 *
 * Escribe una CARPETA por respaldo, con un archivo NDJSON por tabla (una fila
 * JSON por línea). No arma un JSON gigante en memoria a propósito: en
 * producción los documentos guardan HTML con imágenes en base64 y el volcado
 * completo revienta el largo máximo de una cadena en Node ("Invalid string
 * length"). Con NDJSON el tamaño de la base deja de importar.
 *
 * No usa src/db/connection.js: ese pool apaga SSL salvo con
 * NODE_ENV=production, y respaldar una base remota desde una laptop fallaría.
 *
 * Para reponer las plantillas: scripts/restore-templates.mjs
 */
import 'dotenv/config';
import pg from 'pg';
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = join(__dirname, '..', 'backups');

// Orden importante: al restaurar, las tablas referenciadas van primero.
const TABLES = [
  'workspaces', 'templates', 'documents', 'signatures',
  'document_attachments', 'document_events',
  'catalog_categories', 'catalog_products',
  'account_settings', 'content_blocks', 'approvals', 'cpq_rules',
  'rate_cards', 'rate_card_rows',
];

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Falta DATABASE_URL. Pásala por entorno o ponla en .env');
  process.exit(1);
}

// Una base local no habla SSL; una remota (Railway, Neon, RDS) casi siempre lo exige.
const host    = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
const esLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
const pool = new pg.Pool({
  connectionString: url,
  ssl: esLocal ? false : { rejectUnauthorized: false },
});

// Lotes chicos: una sola fila puede pesar megas (HTML con imágenes en base64),
// así que traer la tabla entera de un golpe es justo lo que hay que evitar.
const LOTE = 50;

/**
 * Vuelca una tabla por páginas. Devuelve el número de filas escritas.
 * Ordena por ctid — el identificador físico de fila que Postgres siempre
 * tiene — para que el paginado sea estable sin depender de que exista PK.
 */
async function dumpTable(client, table, file) {
  const out = createWriteStream(file, { encoding: 'utf8' });
  let total = 0;
  try {
    for (;;) {
      const res = await client.query(
        `SELECT * FROM ${table} ORDER BY ctid LIMIT $1 OFFSET $2`, [LOTE, total]
      );
      if (res.rows.length === 0) break;
      for (const row of res.rows) {
        if (!out.write(JSON.stringify(row) + '\n')) await once(out, 'drain');
      }
      total += res.rows.length;
      if (res.rows.length < LOTE) break;
    }
  } finally {
    out.end();
    await once(out, 'finish');
  }
  return total;
}

async function main() {
  console.log(`Base: ${host || '(desconocida)'} | SSL: ${esLocal ? 'no' : 'sí'}\n`);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir   = join(BACKUP_DIR, `backup-${stamp}`);
  mkdirSync(dir, { recursive: true });

  const client  = await pool.connect();
  const resumen = [];
  const meta    = { created_at: new Date().toISOString(), host, tables: {} };

  try {
    for (const table of TABLES) {
      try {
        const n = await dumpTable(client, table, join(dir, `${table}.ndjson`));
        meta.tables[table] = n;
        resumen.push(`  ${table.padEnd(22)} ${String(n).padStart(6)} filas`);
      } catch (e) {
        // Una tabla que no existe todavía no debe abortar el respaldo
        meta.tables[table] = null;
        resumen.push(`  ${table.padEnd(22)}      — ${e.message}`);
      }
    }
  } finally {
    client.release();
  }

  writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');

  console.log('Respaldo completo:\n');
  console.log(resumen.join('\n'));
  console.log(`\n→ ${dir}\n`);
}

main()
  .catch(e => { console.error('Error en el respaldo:', e.message); process.exitCode = 1; })
  .finally(() => pool.end());
