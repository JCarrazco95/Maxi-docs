/**
 * backup-db.mjs — Punto de restauración de la base de datos.
 *
 * pg_dump no está disponible en todas las máquinas del equipo, así que el
 * respaldo se hace con el cliente `pg` que el backend ya tiene instalado.
 * Vuelca cada tabla a JSON en backups/backup-<timestamp>.json.
 *
 *   node scripts/backup-db.mjs                    # usa DATABASE_URL del .env
 *   DATABASE_URL="postgresql://..." node scripts/backup-db.mjs
 *
 * No usa src/db/connection.js a propósito: ese pool apaga SSL salvo cuando
 * NODE_ENV=production, y respaldar una base remota (Railway, por ejemplo)
 * desde una laptop fallaría la conexión. Aquí el SSL se decide por el host.
 *
 * Para reponer las plantillas desde un backup: scripts/restore-templates.mjs
 */
import 'dotenv/config';
import pg from 'pg';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = join(__dirname, '..', 'backups');

// Orden importante: al restaurar, las tablas referenciadas van primero.
const TABLES = [
  'workspaces',
  'templates',
  'documents',
  'signatures',
  'document_attachments',
  'document_events',
  'catalog_categories',
  'catalog_products',
  'account_settings',
  'content_blocks',
  'approvals',
  'cpq_rules',
  'rate_cards',
  'rate_card_rows',
];

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Falta DATABASE_URL. Pásala por entorno o ponla en .env');
  process.exit(1);
}

// Una base local no habla SSL; una remota (Railway, Neon, RDS) casi siempre lo exige.
const host = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
const esLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
const pool = new pg.Pool({
  connectionString: url,
  ssl: esLocal ? false : { rejectUnauthorized: false },
});

async function main() {
  console.log(`Base: ${host || '(desconocida)'} | SSL: ${esLocal ? 'no' : 'sí'}\n`);

  const stamp  = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = { created_at: new Date().toISOString(), host, tables: {} };
  const resumen = [];

  for (const table of TABLES) {
    try {
      const res = await pool.query(`SELECT * FROM ${table}`);
      backup.tables[table] = res.rows;
      resumen.push(`  ${table.padEnd(22)} ${String(res.rows.length).padStart(6)} filas`);
    } catch (e) {
      // Una tabla que no existe todavía no debe abortar el respaldo
      backup.tables[table] = null;
      resumen.push(`  ${table.padEnd(22)}      — ${e.message}`);
    }
  }

  mkdirSync(BACKUP_DIR, { recursive: true });
  const file = join(BACKUP_DIR, `backup-${stamp}.json`);
  writeFileSync(file, JSON.stringify(backup, null, 2), 'utf8');

  console.log('Respaldo completo:\n');
  console.log(resumen.join('\n'));
  console.log(`\n→ ${file}\n`);
}

main()
  .catch(e => { console.error('Error en el respaldo:', e.message); process.exitCode = 1; })
  .finally(() => pool.end());
