import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pool from './connection.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
  console.log('Ejecutando migraciones...');
  const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('Migraciones completadas.');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Error en migracion:', err.message);
  process.exit(1);
});
