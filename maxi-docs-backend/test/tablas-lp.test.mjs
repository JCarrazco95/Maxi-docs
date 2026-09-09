/**
 * Estructura de las tablas de la propuesta LP en el PDF.
 *
 *   node --test "test/**\/*.test.mjs"
 *
 * Lo que protege: UNIDADES PROPUESTAS lleva la columna PLAZO — el precio
 * depende del plazo contratado y el cliente necesita verlo — mientras que
 * costos adicionales y adecuaciones NO la llevan. Es fácil romperlo al tocar
 * la rama compartida que genera las tres.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPricingTableHtml } from '../src/services/catalogService.js';

const encabezados = html => [...html.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map(m => m[1]);

const unidades = [
  { id: 1, grupo: 'DOB.C', tramo: '4-6',  name: 'Hilux', specs: 'NP300', quantity: 2, dailyRate: 1120 },
  { id: 2, grupo: 'HIACE', tramo: '13+',  name: 'Hiace', specs: '',      quantity: 1, dailyRate: 0 },
  { id: 3, grupo: 'SUV',   tramo: '',     name: 'Rush',  specs: '',      quantity: 1, dailyRate: 0 },
];
const adicionales = [{ id: 9, name: 'Traslado', specs: 'COAHUILA', quantity: 1, price: 3900 }];

test('UNIDADES PROPUESTAS muestra el PLAZO entre especificaciones y mensualidad', () => {
  const cols = encabezados(buildPricingTableHtml(unidades, 16, 'tabulador'));
  assert.deepEqual(cols, ['CANT.', 'UNIDAD', 'ESPECIFICACIONES', 'PLAZO', 'MENSUALIDAD SIN IVA']);
});

test('el plazo se imprime con su etiqueta, no con el id interno', () => {
  const html = buildPricingTableHtml(unidades, 16, 'tabulador');
  assert.ok(html.includes('4 a 6 meses'), 'esperaba la etiqueta del tramo');
  assert.ok(!html.includes('>4-6<'), 'no debe imprimirse el id del tramo');
});

test('una fila sin plazo muestra un guion y no revienta', () => {
  const html = buildPricingTableHtml([unidades[2]], 16, 'tabulador');
  assert.ok(html.includes('—'));
});

test('13+ meses se escala a Dirección Comercial en vez de un importe', () => {
  const html = buildPricingTableHtml([unidades[1]], 16, 'tabulador');
  assert.ok(html.includes('Ver con Dirección Comercial'));
});

test('costos adicionales y adecuaciones NO llevan columna de plazo', () => {
  for (const tipo of ['costos', 'adicionales']) {
    const cols = encabezados(buildPricingTableHtml(adicionales, 16, tipo));
    assert.deepEqual(cols, ['CANT.', 'UNIDAD', 'ESPECIFICACIONES', 'MENSUALIDAD SIN IVA'], tipo);
  }
});

test('esas dos sí llevan TOTAL; unidades propuestas no, porque su suma es el hero', () => {
  assert.ok(buildPricingTableHtml(adicionales, 16, 'costos').includes('TOTAL'));
  assert.ok(!buildPricingTableHtml(unidades, 16, 'tabulador').includes('TOTAL'));
});
