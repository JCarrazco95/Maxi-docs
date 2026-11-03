/**
 * Pruebas de la aprobación de propuestas por el cliente.
 *
 * Necesitan una base Postgres de prueba con el esquema cargado:
 *   psql "$TEST_DATABASE_URL" -f src/db/schema.sql
 *   TEST_DATABASE_URL=postgres://... node --test test/propuestas.test.mjs
 * Sin TEST_DATABASE_URL se omiten.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { listarPropuestas, propuestasDelPortal, aprobarPropuesta, propuestaAprobadaDelItem }
  from '../src/services/propuestasService.js';

const URL = process.env.TEST_DATABASE_URL;
const opts = { skip: !URL && 'sin TEST_DATABASE_URL' };
let pool, db;

before(async () => {
  if (!URL) return;
  pool = new pg.Pool({ connectionString: URL });
  db = (text, params) => pool.query(text, params);
});
after(async () => { await pool?.end(); });

beforeEach(async () => {
  if (!URL) return;
  await db(`DELETE FROM signatures`);
  await db(`DELETE FROM documents`);
});

const tabla = items => `<pricing-table data-table-type="tabulador" data-items-b64="${
  Buffer.from(JSON.stringify(items)).toString('base64')}"></pricing-table>`;

async function crearDoc({ item = '777', cuenta = 'A', folio, status = 'sent', unidad = 'Frontier', renta = 1000 }) {
  const r = await db(
    `INSERT INTO documents (name, doc_number, monday_account_id, monday_item_id, status, content_html, filled_data, owner_email)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'vendedor@maxirent.com.mx') RETURNING id`,
    [`Propuesta ${folio}`, folio, cuenta, item, status,
     tabla([{ name: unidad, dailyRate: renta / 30, quantity: 1, tramo: '7-12' }]),
     JSON.stringify({ plazo: '7 a 12 meses' })]
  );
  return r.rows[0].id;
}
async function crearFirma(documentId) {
  const r = await db(
    `INSERT INTO signatures (document_id, signer_name, signer_email, status, sign_url)
     VALUES ($1, 'JR Cliente', 'jr@cliente.com', 'pending', '') RETURNING id`,
    [documentId]
  );
  return r.rows[0].id;
}

test('el enlace de cualquier propuesta muestra todas las enviadas de la oportunidad', opts, async () => {
  const a = await crearDoc({ folio: 'MRLP-0001-A', unidad: 'Frontier' });
  const b = await crearDoc({ folio: 'MRLP-0001-B', unidad: 'Hilux' });
  await crearDoc({ folio: 'MRLP-0001-C', status: 'draft' });         // borrador: no se muestra
  await crearDoc({ folio: 'MRLP-0002-A', item: '888' });             // otra oportunidad
  await crearDoc({ folio: 'MRLP-0001-A', cuenta: 'B' });             // otra cuenta de monday
  const firma = await crearFirma(a);

  const { propuestas, aprobada_id } = await propuestasDelPortal({ signatureId: firma, db });
  assert.deepEqual(propuestas.map(p => p.folio), ['MRLP-0001-A', 'MRLP-0001-B']);
  assert.equal(aprobada_id, null);
  assert.deepEqual(propuestas[1].unidades, ['Hilux']);
  assert.equal(propuestas[1].plazo, '7 a 12 meses');
  assert.equal(propuestas[1].renta_mensual, 1000);
  assert.equal(propuestas.find(p => p.id === b).pdf_url, `/api/documents/${b}/pdf`);
  assert.equal('content_html' in propuestas[0], false, 'no expone el HTML');
});

test('el documento abierto aparece aunque siga en borrador', opts, async () => {
  const a = await crearDoc({ folio: 'MRLP-0001-A', status: 'draft' });
  const lista = await listarPropuestas({ documentId: a, db });
  assert.equal(lista.length, 1);
});

test('aprobar una deja las demás como no seleccionadas', opts, async () => {
  const a = await crearDoc({ folio: 'MRLP-0001-A' });
  const b = await crearDoc({ folio: 'MRLP-0001-B' });
  const c = await crearDoc({ folio: 'MRLP-0001-C' });
  const firma = await crearFirma(a);

  const r = await aprobarPropuesta({ signatureId: firma, documentId: b, db });
  assert.equal(r.ok, true);
  assert.equal(r.aprobada.id, b);
  assert.deepEqual(new Set(r.descartadas), new Set([a, c]));

  const filas = (await db(`SELECT id, client_selection, client_selected_by FROM documents`)).rows;
  const por = Object.fromEntries(filas.map(f => [f.id, f]));
  assert.equal(por[b].client_selection, 'approved');
  assert.equal(por[a].client_selection, 'not_selected');
  assert.equal(por[c].client_selection, 'not_selected');
  assert.equal(por[b].client_selected_by, 'JR Cliente <jr@cliente.com>');

  const aprobada = await propuestaAprobadaDelItem({ accountId: 'A', mondayItemId: 777, db });
  assert.equal(aprobada.id, b);
});

test('no se puede cambiar la elección desde el portal', opts, async () => {
  const a = await crearDoc({ folio: 'MRLP-0001-A' });
  const b = await crearDoc({ folio: 'MRLP-0001-B' });
  const firma = await crearFirma(a);
  await aprobarPropuesta({ signatureId: firma, documentId: a, db });

  const r = await aprobarPropuesta({ signatureId: firma, documentId: b, db });
  assert.equal(r.ok, false);
  assert.equal(r.status, 409);
  assert.equal(r.code, 'YA_APROBADA');
  assert.equal(r.aprobada_id, a);
  const sel = (await db(`SELECT client_selection FROM documents WHERE id = $1`, [b])).rows[0];
  assert.equal(sel.client_selection, 'not_selected');
});

test('no se puede aprobar una propuesta de otra oportunidad', opts, async () => {
  const a = await crearDoc({ folio: 'MRLP-0001-A' });
  const ajena = await crearDoc({ folio: 'MRLP-0002-A', item: '888' });
  const firma = await crearFirma(a);
  const r = await aprobarPropuesta({ signatureId: firma, documentId: ajena, db });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'NO_ES_PROPUESTA');
  const n = (await db(`SELECT count(*)::int AS n FROM documents WHERE client_selection IS NOT NULL`)).rows[0].n;
  assert.equal(n, 0);
});

test('enlace inexistente', opts, async () => {
  const r = await aprobarPropuesta({ signatureId: '00000000-0000-0000-0000-000000000000', documentId: '00000000-0000-0000-0000-000000000000', db });
  assert.equal(r.code, 'ENLACE_INVALIDO');
});

test('dos aprobaciones simultáneas: solo una gana', opts, async () => {
  const a = await crearDoc({ folio: 'MRLP-0001-A' });
  const b = await crearDoc({ folio: 'MRLP-0001-B' });
  const firma = await crearFirma(a);
  const [r1, r2] = await Promise.all([
    aprobarPropuesta({ signatureId: firma, documentId: a, db }),
    aprobarPropuesta({ signatureId: firma, documentId: b, db }),
  ]);
  assert.equal([r1, r2].filter(r => r.ok).length, 1);
  const n = (await db(`SELECT count(*)::int AS n FROM documents WHERE client_selection = 'approved'`)).rows[0].n;
  assert.equal(n, 1);
});

test('una propuesta sin oportunidad de monday se aprueba sola', opts, async () => {
  const a = await crearDoc({ folio: 'MR-2026-0001', item: null });
  const firma = await crearFirma(a);
  const r = await aprobarPropuesta({ signatureId: firma, documentId: a, db });
  assert.equal(r.ok, true);
  assert.deepEqual(r.descartadas, []);
});
