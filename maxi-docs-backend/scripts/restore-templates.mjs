/**
 * restore-templates.mjs — Repone la tabla `templates` desde un respaldo.
 *
 * `templates` es la única tabla que el seed puede sobrescribir, así que es la
 * única que este script restaura. Documentos, firmas y PDFs quedan fuera a
 * propósito: restaurarlos automáticamente haría más daño que bien.
 *
 *   node scripts/restore-templates.mjs backups/backup-2026-09-04T20-51-30-022Z
 *   node scripts/restore-templates.mjs <carpeta> --dry-run
 *
 * Restaura por id: UPDATE si la plantilla sigue existiendo, INSERT si fue
 * borrada. No toca plantillas creadas después del respaldo.
 */
import 'dotenv/config';
import pg from 'pg';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const [, , dir, ...flags] = process.argv;
const dryRun = flags.includes('--dry-run');

if (!dir) {
  console.error('Uso: node scripts/restore-templates.mjs <carpeta-del-respaldo> [--dry-run]');
  process.exit(1);
}

const file = join(dir, 'templates.ndjson');
if (!existsSync(file)) {
  console.error(`No encontré ${file}`);
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) { console.error('Falta DATABASE_URL'); process.exit(1); }

const host    = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
const esLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
const pool = new pg.Pool({
  connectionString: url,
  ssl: esLocal ? false : { rejectUnauthorized: false },
});

async function main() {
  const rows = readFileSync(file, 'utf8')
    .split('\n').filter(Boolean).map(l => JSON.parse(l));

  console.log(`\nBase: ${host} | respaldo: ${rows.length} plantilla(s)\n`);

  for (const t of rows) {
    const existe = await pool.query(`SELECT id FROM templates WHERE id = $1`, [t.id]);
    const accion = existe.rows.length > 0 ? 'UPDATE' : 'INSERT';
    console.log(`  ${accion.padEnd(7)} ${t.name}`);
    if (dryRun) continue;

    if (accion === 'UPDATE') {
      await pool.query(
        `UPDATE templates
         SET name = $1, description = $2, content_html = $3, variables = $4
         WHERE id = $5`,
        [t.name, t.description, t.content_html, JSON.stringify(t.variables ?? []), t.id]
      );
    } else {
      await pool.query(
        `INSERT INTO templates (id, name, description, content_html, variables,
                                monday_user_id, monday_account_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [t.id, t.name, t.description, t.content_html, JSON.stringify(t.variables ?? []),
         t.monday_user_id, t.monday_account_id, t.created_at]
      );
    }
  }

  console.log(dryRun ? '\n(dry-run — no se escribió nada)\n' : '\nRestauración completa.\n');
}

main()
  .catch(e => { console.error('Error restaurando:', e.message); process.exitCode = 1; })
  .finally(() => pool.end());
