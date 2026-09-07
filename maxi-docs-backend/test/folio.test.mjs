/**
 * Pruebas de resolverFolio — la numeración de las cotizaciones.
 *
 *   node --test test/folio.test.mjs
 *
 * No tocan la base: resolverFolio acepta un `db` inyectable. Un error aquí
 * se ve en el documento que recibe el cliente, así que conviene poder
 * correrlas sin levantar Postgres.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolverFolio } from '../src/routes/documents.js';

const HTML_LP = '<pricing-table data-table-type="tabulador" data-items-b64="W10="></pricing-table>';
const HTML_MR = '<pricing-table data-table-type="tarifas" data-items-b64="W10="></pricing-table>';

/** Base falsa: simula las secuencias y la búsqueda del folio previo. */
function fakeDb(previos = []) {
  const seqs = { doc_number_seq: 40, doc_number_lp_seq: 0 };
  return async (sql, params) => {
    const seq = sql.match(/nextval\('(\w+)'\)/);
    if (seq) { seqs[seq[1]] += 1; return { rows: [{ n: seqs[seq[1]] }] }; }
    const [cuenta, item] = params;
    const hit = previos.find(p => p.account === cuenta && p.item === item && p.folio.startsWith('MRLP-'));
    return { rows: hit ? [{ doc_number: hit.folio }] : [] };
  };
}

test('la plantilla comercial conserva su serie MR-AÑO-NNNN', async () => {
  const folio = await resolverFolio({ srcHtml: HTML_MR, accountId: 'A', mondayItemId: '111', db: fakeDb() });
  assert.match(folio, /^MR-\d{4}-0041$/);
});

test('la propuesta LP usa su propia serie MRLP', async () => {
  const folio = await resolverFolio({ srcHtml: HTML_LP, accountId: 'A', mondayItemId: '111', db: fakeDb() });
  assert.equal(folio, 'MRLP-0001');
});

test('varias cotizaciones del mismo item comparten folio', async () => {
  const db = fakeDb([{ account: 'A', item: '111', folio: 'MRLP-0007' }]);
  const folio = await resolverFolio({ srcHtml: HTML_LP, accountId: 'A', mondayItemId: '111', db });
  assert.equal(folio, 'MRLP-0007');
});

test('otro item recibe folio nuevo', async () => {
  const db = fakeDb([{ account: 'A', item: '111', folio: 'MRLP-0007' }]);
  const folio = await resolverFolio({ srcHtml: HTML_LP, accountId: 'A', mondayItemId: '222', db });
  assert.equal(folio, 'MRLP-0001');
});

test('el folio no se cruza entre cuentas de Monday', async () => {
  const db = fakeDb([{ account: 'A', item: '111', folio: 'MRLP-0007' }]);
  const folio = await resolverFolio({ srcHtml: HTML_LP, accountId: 'B', mondayItemId: '111', db });
  assert.equal(folio, 'MRLP-0001');
});

test('sin item de Monday se emite folio nuevo', async () => {
  const folio = await resolverFolio({ srcHtml: HTML_LP, accountId: 'A', mondayItemId: null, db: fakeDb() });
  assert.equal(folio, 'MRLP-0001');
});

test('un item numérico se compara igual que uno de texto', async () => {
  const db = fakeDb([{ account: 'A', item: '111', folio: 'MRLP-0009' }]);
  const folio = await resolverFolio({ srcHtml: HTML_LP, accountId: 'A', mondayItemId: 111, db });
  assert.equal(folio, 'MRLP-0009');
});

test('un HTML vacío cae a la serie de siempre, no revienta', async () => {
  for (const html of ['', null, undefined]) {
    const folio = await resolverFolio({ srcHtml: html, accountId: 'A', mondayItemId: '1', db: fakeDb() });
    assert.match(folio, /^MR-\d{4}-/);
  }
});
