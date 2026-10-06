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
const adicionales = [{ id: 9, name: 'WINCH', specs: '', quantity: 1, price: 3900 }];
const traslados = [
  { id: 9, estado: 'GUANAJUATO', municipio: 'CELAYA', tipo: '35redilas', name: 'Traslado a CELAYA', quantity: 1, price: 12300 },
];

test('UNIDADES PROPUESTAS muestra el PLAZO entre especificaciones y el importe', () => {
  const cols = encabezados(buildPricingTableHtml(unidades, 16, 'tabulador'));
  assert.deepEqual(cols, ['CANT.', 'UNIDAD', 'ESPECIFICACIONES', 'PLAZO', 'RENTA MENSUAL SIN IVA']);
});

test('COSTOS ADICIONALES desglosa el traslado en sus propias columnas', () => {
  const cols = encabezados(buildPricingTableHtml(traslados, 16, 'costos'));
  assert.deepEqual(cols, ['CANT.', 'ESTADO', 'MUNICIPIO', 'TIPO DE UNIDAD', 'CONCEPTO', 'IMPORTE ÚNICO SIN IVA']);
});

test('el tipo de traslado se imprime con su etiqueta, no con el id', () => {
  const html = buildPricingTableHtml(traslados, 16, 'costos');
  assert.ok(html.includes('3½ Redilas'), 'esperaba la etiqueta del tipo');
  assert.ok(!html.includes('>35redilas<'), 'no debe imprimirse el id interno');
});

test('una fila de costos capturada a mano no deja celdas vacías', () => {
  const manual = [{ id: 9, name: 'Entrega en sitio', quantity: 1, price: 2500 }];
  const html = buildPricingTableHtml(manual, 16, 'costos');
  assert.ok(html.includes('—'), 'estado, municipio y tipo deben mostrar guion');
  assert.ok(html.includes('Entrega en sitio'));
});

test('solo el tabulador cobra por mes; lo demás es importe único', () => {
  assert.ok(buildPricingTableHtml(unidades, 16, 'tabulador').includes('RENTA MENSUAL SIN IVA'));
  for (const tipo of ['costos', 'adicionales']) {
    assert.ok(buildPricingTableHtml(adicionales, 16, tipo).includes('IMPORTE ÚNICO SIN IVA'), tipo);
  }
});

test('13+ meses con precio ya capturado imprime el importe, no el aviso', () => {
  // Si se deja el aviso, el total suma algo que la fila no muestra.
  const conPrecio = [{ id: 1, grupo: 'DOB.C', tramo: '13+', name: 'Frontier', specs: '', quantity: 1, dailyRate: 1500 }];
  const html = buildPricingTableHtml(conPrecio, 16, 'tabulador');
  assert.ok(html.includes('$45,000.00'));
  assert.ok(!html.includes('Ver con Dirección Comercial'));
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

test('ADECUACIONES conserva sus cuatro columnas, sin plazo', () => {
  const cols = encabezados(buildPricingTableHtml(adicionales, 16, 'adicionales'));
  assert.deepEqual(cols, ['CANT.', 'UNIDAD', 'ESPECIFICACIONES', 'IMPORTE ÚNICO SIN IVA']);
});

test('esas dos sí llevan TOTAL; unidades propuestas no, porque su suma es el hero', () => {
  assert.ok(buildPricingTableHtml(adicionales, 16, 'costos').includes('TOTAL'));
  assert.ok(!buildPricingTableHtml(unidades, 16, 'tabulador').includes('TOTAL'));
});
