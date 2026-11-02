// La cotización se hace desde Oportunidades Maxirent: MAXI-DOCS actualiza ese
// mismo elemento y nunca crea ni mueve uno.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { actualizarMondayDocItem } from '../src/routes/documents.js';

const OPORTUNIDADES = '8311006777';
let llamadas, tablero, responsable, fetchOriginal;

beforeEach(() => {
  llamadas = []; tablero = OPORTUNIDADES; responsable = '';
  process.env.MONDAY_API_TOKEN = 'token-prueba';
  fetchOriginal = globalThis.fetch;
  globalThis.fetch = async (_url, opts) => {
    const { query } = JSON.parse(opts.body);
    llamadas.push(query);
    const data = query.trim().startsWith('mutation')
      ? { change_multiple_column_values: { id: '555' } }
      : { items: [{ board: { id: tablero }, column_values: [{ id: 'deal_owner', text: responsable }] }] };
    return { json: async () => ({ data }) };
  };
});
afterEach(() => { globalThis.fetch = fetchOriginal; });

const html = `<pricing-table data-table-type="tarifas" data-items-b64="${Buffer.from(JSON.stringify([
  { name: 'Hino 3.5', dailyRate: 100, quantity: 2, delivery: 500, retrieval: 500 },
])).toString('base64')}"></pricing-table>`;

const columnas = q => JSON.parse(JSON.parse(q.match(/column_values: ("(?:[^"\\]|\\.)*")/)[1]));

test('actualiza el mismo elemento de Oportunidades, sin create_item ni move', async () => {
  const id = await actualizarMondayDocItem({ mondayItemId: '555', docNumber: 'MR-2026-0001', html, mondayUserId: '42' });
  assert.equal(id, '555');
  const mutacion = llamadas.find(q => q.trim().startsWith('mutation'));
  assert.match(mutacion, /change_multiple_column_values/);
  assert.match(mutacion, /item_id: 555/);
  assert.doesNotMatch(llamadas.join('\n'), /create_item|move_item/);
  const cols = columnas(mutacion);
  assert.equal(cols.text_mktmgv5z, 'MR-2026-0001');
  assert.deepEqual(cols.deal_stage, { label: 'Cotización enviada' });
  assert.equal(cols.deal_value, '7000');
  assert.deepEqual(cols.deal_owner, { personsAndTeams: [{ id: 42, kind: 'person' }] });
});

test('no pisa al ejecutivo, la razón social ni el correo que ya tenía', async () => {
  responsable = 'Nadia Mejorado';
  await actualizarMondayDocItem({ mondayItemId: '555', docNumber: 'X', html, mondayUserId: '42' });
  const cols = columnas(llamadas.find(q => q.trim().startsWith('mutation')));
  assert.equal(cols.deal_owner, undefined);
  assert.equal(cols.text_mkvxs7sb, undefined);
  assert.equal(cols.email, undefined);
});

test('si el elemento no está en Oportunidades no escribe nada', async () => {
  tablero = '8311006929';
  const id = await actualizarMondayDocItem({ mondayItemId: '555', docNumber: 'X', html, mondayUserId: '42' });
  assert.equal(id, null);
  assert.equal(llamadas.some(q => q.trim().startsWith('mutation')), false);
});

test('sin elemento de monday no hace nada', async () => {
  assert.equal(await actualizarMondayDocItem({ mondayItemId: null, docNumber: 'X', html }), null);
  assert.equal(llamadas.length, 0);
});
