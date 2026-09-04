/**
 * backup-db.mjs — Punto de restauración de la base de datos.
 *
 * pg_dump no está disponible en todas las máquinas del equipo, así que el
 * respaldo se hace con el cliente `pg` que el backend ya tiene instalado.
 * Vuelca cada tabla a JSON en backups/backup-<timestamp>.json.
 *
 *   node scripts/backup-db.mjs
 *
 * Para reponer las plantillas desde un backup: scripts/restore-templates.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pool, { query } from '../src/db/connection.js';

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
];

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = { created_at: new Date().toISOString(), tables: {} };
  const counts = [];

  for (const table of TABLES) {
    try {
      const res = await query(`SELECT * FROM ${table}`);
      backup.tables[table] = res.rows;
      counts.push(`  ${table.padEnd(22)} ${String(res.rows.length).padStart(6)} filas`);
    } catch (e) {
      // Una tabla que no existe todavía no debe abortar el respaldo
      backup.tables[table] = null;
      counts.push(`  ${table.padEnd(22)}      — ${e.message}`);
    }
  }

  mkdirSync(BACKUP_DIR, { recursive: true });
  const file = join(BACKUP_DIR, `backup-${stamp}.json`);
  writeFileSync(file, JSON.stringify(backup, null, 2), 'utf8');

  console.log('\nRespaldo completo:\n');
  console.log(counts.join('\n'));
  console.log(`\n→ ${file}\n`);
}

main()
  .catch(e => { console.error('Error en el respaldo:', e.message); process.exitCode = 1; })
  .finally(() => pool.end());
