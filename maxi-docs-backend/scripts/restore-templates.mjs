/**
 * restore-templates.mjs — Repone la tabla `templates` desde un backup.
 *
 * `templates` es la única tabla que el seed puede sobrescribir, así que es la
 * única que este script restaura. Todo lo demás (documentos, firmas, PDFs)
 * queda fuera a propósito: restaurarlo automáticamente haría más daño que bien.
 *
 *   node scripts/restore-templates.mjs backups/backup-2026-08-26T...json
 *   node scripts/restore-templates.mjs <archivo> --dry-run    (solo muestra qué haría)
 *
 * Restaura por `id`: hace UPDATE si la plantilla sigue existiendo, INSERT si
 * fue borrada. No toca plantillas creadas después del respaldo.
 */
import { readFileSync } from 'node:fs';
import pool, { query } from '../src/db/connection.js';

const [, , file, ...flags] = process.argv;
const dryRun = flags.includes('--dry-run');

if (!file) {
  console.error('Uso: node scripts/restore-templates.mjs <archivo-backup.json> [--dry-run]');
  process.exit(1);
}

async function main() {
  const backup = JSON.parse(readFileSync(file, 'utf8'));
  const rows = backup.tables?.templates;

  if (!Array.isArray(rows)) {
    throw new Error('El backup no contiene la tabla `templates`');
  }

  console.log(`\nBackup del ${backup.created_at} — ${rows.length} plantilla(s)\n`);

  for (const t of rows) {
    const existing = await query(`SELECT id, name FROM templates WHERE id = $1`, [t.id]);
    const action = existing.rows.length > 0 ? 'UPDATE' : 'INSERT';
    console.log(`  ${action.padEnd(7)} ${t.name}`);

    if (dryRun) continue;

    if (action === 'UPDATE') {
      await query(
        `UPDATE templates
         SET name = $1, description = $2, content_html = $3, variables = $4
         WHERE id = $5`,
        [t.name, t.description, t.content_html, JSON.stringify(t.variables ?? []), t.id]
      );
    } else {
      await query(
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
