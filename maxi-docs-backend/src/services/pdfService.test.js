import { describe, it, expect } from 'vitest';
import {
  processPricingTableNodes,
  applyVariables,
  fillTemplate,
  extractVariables,
} from './pdfService.js';

function pricingTable(title, type, items) {
  const b64 = Buffer.from(JSON.stringify(items), 'utf8').toString('base64');
  return `<pricing-table data-title="${title}" data-table-type="${type}" data-items-b64="${b64}"></pricing-table>`;
}

// La propuesta MAXIRent tal cual sale del editor: tarifas, adecuaciones y la
// tabla "acuerdo", que no lleva items propios — se calcula desde las otras dos.
const TARIFAS = [
  { name: 'Hino 3.5 caja seca', dailyRate: 1200, quantity: 2, delivery: 5000, retrieval: 5000, deductible: 10 },
];
const ADECUACIONES = [
  { name: 'Rotulación', price: 4500, quantity: 2 },
];

const DOC = pricingTable('TARIFAS', 'tarifas', TARIFAS)
          + pricingTable('ADECUACIONES', 'accesorios', ADECUACIONES)
          + pricingTable('VALOR DEL ACUERDO INICIAL', 'acuerdo', []);

describe('processPricingTableNodes', () => {
  it('no deja ningún <pricing-table> sin expandir', () => {
    expect(processPricingTableNodes(DOC)).not.toMatch(/<pricing-table/);
  });

  it('imprime el subtotal, el IVA y el total que dice quoteService', () => {
    // 1200×30×2 = 72000 + 5000 + 5000 = 82000 de tarifas
    // 4500×2 = 9000 de adecuaciones  →  91,000 sin IVA
    // IVA 16% = 14,560  →  105,560 con IVA
    const out = processPricingTableNodes(DOC);
    expect(out).toContain('$91,000.00');
    expect(out).toContain('$14,560.00');
    expect(out).toContain('$105,560.00');
  });

  it('muestra el deducible en la tabla — es informativo, tiene que verse', () => {
    expect(processPricingTableNodes(DOC)).toContain('>10%<');
  });

  it('...pero el deducible NO cambia ningún monto', () => {
    const montos = html => [...new Set(html.match(/\$[\d,]+\.\d{2}/g) || [])].sort();

    const conDeducible = processPricingTableNodes(DOC);
    const sinDeducible = processPricingTableNodes(
      pricingTable('TARIFAS', 'tarifas', [{ ...TARIFAS[0], deductible: 0 }])
      + pricingTable('ADECUACIONES', 'accesorios', ADECUACIONES)
      + pricingTable('VALOR DEL ACUERDO INICIAL', 'acuerdo', [])
    );

    // Los porcentajes difieren (10% vs 0%), los pesos no.
    expect(montos(conDeducible)).toEqual(montos(sinDeducible));
    expect(conDeducible).toContain('$105,560.00');
    expect(sinDeducible).toContain('$105,560.00');
  });

  it('pone una fila por unidad cotizada en la tabla del acuerdo', () => {
    expect(processPricingTableNodes(DOC)).toContain('Renta mensual Hino 3.5 caja seca');
  });

  it('omite la tabla del acuerdo cuando no hay nada cotizado', () => {
    const vacio = pricingTable('VALOR DEL ACUERDO INICIAL', 'acuerdo', []);
    expect(processPricingTableNodes(vacio).trim()).toBe('');
  });

  it('deja intacto el HTML que no son tablas de precios', () => {
    const html = '<h3 class="mr-h3">Condiciones comerciales</h3><ul><li>Uno</li></ul>';
    expect(processPricingTableNodes(html)).toBe(html);
  });
});

describe('variables de plantilla', () => {
  it('sustituye {{variable}} por su valor', () => {
    expect(applyVariables('Hola {{name}}', { name: 'Ana' })).toBe('Hola Ana');
  });

  it('deja vacía la variable sin valor en vez de imprimir undefined', () => {
    expect(applyVariables('Hola {{name}}!', {})).toBe('Hola !');
  });

  it('applyVariables PRESERVA las tablas para poder re-editar el documento', () => {
    const out = applyVariables(DOC, {});
    expect(out).toMatch(/<pricing-table/);
  });

  it('fillTemplate SÍ las expande, porque va al PDF', () => {
    expect(fillTemplate(DOC, {})).not.toMatch(/<pricing-table/);
  });

  it('extractVariables las lista sin repetir', () => {
    expect(extractVariables('{{a}} {{b}} {{a}}')).toEqual(['a', 'b']);
  });
});
