// Cuadro de NOTAS de la propuesta LP (pricing-table tipo "notas").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processPricingTableNodes } from '../src/services/pdfService.js';
import { SEED_TEMPLATES, PLANTILLAS_RETIRADAS } from '../src/templates/seedTemplates.js';

const nodo = items => `<pricing-table data-title="NOTAS" data-table-type="notas" data-items-b64="${
  Buffer.from(JSON.stringify(items)).toString('base64')}" data-iva-rate="16"></pricing-table>`;

test('con texto se imprime el recuadro con su título', () => {
  const html = processPricingTableNodes(nodo([{ id: 1, text: 'Incluye mantenimiento.\nPrecio sujeto a disponibilidad.' }]));
  assert.match(html, /NOTAS/);
  assert.match(html, /Incluye mantenimiento\.\nPrecio sujeto a disponibilidad\./);
  assert.match(html, /white-space:pre-wrap/);
});

test('vacío o solo espacios no se imprime', () => {
  assert.equal(processPricingTableNodes(nodo([])).trim(), '');
  assert.equal(processPricingTableNodes(nodo([{ id: 1, text: '   \n ' }])).trim(), '');
});

test('el texto del ejecutivo se escapa', () => {
  const html = processPricingTableNodes(nodo([{ id: 1, text: '<b>hola</b> & "adiós"' }]));
  assert.match(html, /&lt;b&gt;hola&lt;\/b&gt; &amp; &quot;adiós&quot;/);
  assert.doesNotMatch(html, /<b>hola/);
});

test('la plantilla LP trae el cuadro entre las tarjetas y UNIDADES PROPUESTAS', () => {
  const lp = SEED_TEMPLATES.find(t => t.name === 'Propuesta de Renta Empresarial (LP)').content_html;
  const iPago   = lp.indexOf('Pago inicial y garantía');
  const iNotas  = lp.indexOf('data-table-type="notas"');
  const iUnid   = lp.indexOf('data-title="UNIDADES PROPUESTAS"');
  assert.ok(iPago > 0 && iNotas > iPago && iUnid > iNotas);
});

test('la plantilla comercial ya no se siembra y se marca como retirada', () => {
  assert.deepEqual(SEED_TEMPLATES.map(t => t.name), ['Propuesta de Renta Empresarial (LP)']);
  assert.ok(PLANTILLAS_RETIRADAS.includes('Propuesta Comercial MAXIRent'));
});
