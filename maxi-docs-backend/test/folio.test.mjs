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
import { resolverFolio, letraPropuesta, indiceLetra } from '../src/routes/documents.js';

const HTML_LP = '<pricing-table data-table-type="tabulador" data-items-b64="W10="></pricing-table>';
const HTML_MR = '<pricing-table data-table-type="tarifas" data-items-b64="W10="></pricing-table>';

/** Base falsa: simula las secuencias y la búsqueda del folio previo. */
function fakeDb(previos = []) {
  const seqs = { doc_number_seq: 40, doc_number_lp_seq: 0 };
  return async (sql, params) => {
    const seq = sql.match(/nextval\('(\w+)'\)/);
    if (seq) { seqs[seq[1]] += 1; return { rows: [{ n: seqs[seq[1]] }] }; }
    const [cuenta, item] = params;
    const hits = previos.filter(p => p.account === cuenta && p.item === item && p.folio.startsWith('MRLP-'));
    return { rows: hits.map(h => ({ doc_number: h.folio })) };
  };
}

test('la plantilla comercial conserva su serie MR-AÑO-NNNN', async () => {
  const folio = await resolverFolio({ srcHtml: HTML_MR, accountId: 'A', mondayItemId: '111', db: fakeDb() });
  assert.match(folio, /^MR-\d{4}-0041$/);
});

test('la propuesta LP usa su propia serie MRLP', async () => {
  const folio = await resolverFolio({ srcHtml: HTML_LP, accountId: 'A', mondayItemId: '111', db: fakeDb() });
  assert.equal(folio, 'MRLP-0001-A');
});

test('varias propuestas del mismo item comparten número con letra distinta', async () => {
  const db = fakeDb([
    { account: 'A', item: '111', folio: 'MRLP-0007-A' },
    { account: 'A', item: '111', folio: 'MRLP-0007-B' },
  ]);
  const folio = await resolverFolio({ srcHtml: HTML_LP, accountId: 'A', mondayItemId: '111', db });
  assert.equal(folio, 'MRLP-0007-C');
});

test('un folio viejo sin letra cuenta como la A', async () => {
  const db = fakeDb([{ account: 'A', item: '111', folio: 'MRLP-0007' }]);
  const folio = await resolverFolio({ srcHtml: HTML_LP, accountId: 'A', mondayItemId: '111', db });
  assert.equal(folio, 'MRLP-0007-B');
});

test('si se borró una propuesta intermedia no se repite letra', async () => {
  const db = fakeDb([
    { account: 'A', item: '111', folio: 'MRLP-0007-A' },
    { account: 'A', item: '111', folio: 'MRLP-0007-C' },
  ]);
  const folio = await resolverFolio({ srcHtml: HTML_LP, accountId: 'A', mondayItemId: '111', db });
  assert.equal(folio, 'MRLP-0007-D');
});

test('letras después de la Z', () => {
  assert.deepEqual([0, 1, 25, 26, 27, 51, 52].map(letraPropuesta), ['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA']);
  for (const i of [0, 1, 25, 26, 27, 51, 52, 700]) assert.equal(indiceLetra(`MRLP-0001-${letraPropuesta(i)}`), i);
});

test('otro item recibe folio nuevo', async () => {
  const db = fakeDb([{ account: 'A', item: '111', folio: 'MRLP-0007' }]);
  const folio = await resolverFolio({ srcHtml: HTML_LP, accountId: 'A', mondayItemId: '222', db });
  assert.equal(folio, 'MRLP-0001-A');
});

test('el folio no se cruza entre cuentas de Monday', async () => {
  const db = fakeDb([{ account: 'A', item: '111', folio: 'MRLP-0007' }]);
  const folio = await resolverFolio({ srcHtml: HTML_LP, accountId: 'B', mondayItemId: '111', db });
  assert.equal(folio, 'MRLP-0001-A');
});

test('sin item de Monday se emite folio nuevo', async () => {
  const folio = await resolverFolio({ srcHtml: HTML_LP, accountId: 'A', mondayItemId: null, db: fakeDb() });
  assert.equal(folio, 'MRLP-0001-A');
});

test('un item numérico se compara igual que uno de texto', async () => {
  const db = fakeDb([{ account: 'A', item: '111', folio: 'MRLP-0009-A' }]);
  const folio = await resolverFolio({ srcHtml: HTML_LP, accountId: 'A', mondayItemId: 111, db });
  assert.equal(folio, 'MRLP-0009-B');
});

test('un HTML vacío cae a la serie de siempre, no revienta', async () => {
  for (const html of ['', null, undefined]) {
    const folio = await resolverFolio({ srcHtml: html, accountId: 'A', mondayItemId: '1', db: fakeDb() });
    assert.match(folio, /^MR-\d{4}-/);
  }
});
