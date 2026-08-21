/**
 * Regresión del hallazgo #19: había dos fórmulas distintas para el mismo total.
 * `extractPricingTotal` multiplicaba la renta por el deducible y el renderizador
 * del PDF no, así que el valor escrito en la columna de Monday podía no coincidir
 * con el total impreso en el documento que firmaba el cliente.
 *
 * Esta prueba compara las DOS salidas reales — la que va a Monday y la que se
 * imprime — sobre el mismo HTML. Si alguien vuelve a tocar una sin la otra,
 * revienta aquí.
 */
import { describe, it, expect } from 'vitest';
import { extractQuoteValues } from './documents.js';
import { processPricingTableNodes } from '../services/pdfService.js';

function pricingTable(title, type, items) {
  const b64 = Buffer.from(JSON.stringify(items), 'utf8').toString('base64');
  return `<pricing-table data-title="${title}" data-table-type="${type}" data-items-b64="${b64}"></pricing-table>`;
}

function documento(tarifas, adecuaciones = []) {
  return pricingTable('TARIFAS', 'tarifas', tarifas)
       + pricingTable('ADECUACIONES', 'accesorios', adecuaciones)
       + pricingTable('VALOR DEL ACUERDO INICIAL', 'acuerdo', []);
}

/** Formatea igual que el PDF, para poder buscar el importe en el HTML. */
function comoPeso(n) {
  return '$' + Number(n).toLocaleString('es-MX', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

const CASOS = [
  {
    nombre: 'una unidad, sin extras',
    tarifas: [{ name: 'NPR', dailyRate: 900, quantity: 1 }],
    adecuaciones: [],
  },
  {
    nombre: 'con deducible del 10% — no debe cambiar nada',
    tarifas: [{ name: 'Hino 3.5', dailyRate: 1200, quantity: 2, delivery: 5000, retrieval: 5000, deductible: 10 }],
    adecuaciones: [{ name: 'Rotulación', price: 4500, quantity: 2 }],
  },
  {
    nombre: 'con deducible del 0%',
    tarifas: [{ name: 'Hino 3.5', dailyRate: 1200, quantity: 2, delivery: 5000, retrieval: 5000, deductible: 0 }],
    adecuaciones: [{ name: 'Rotulación', price: 4500, quantity: 2 }],
  },
  {
    nombre: 'flota mixta con varias unidades',
    tarifas: [
      { name: 'Hino 3.5',  dailyRate: 1200, quantity: 3, delivery: 5000, retrieval: 5000, deductible: 10 },
      { name: 'NPR',       dailyRate: 950,  quantity: 2, delivery: 3500 },
      { name: 'Sprinter',  dailyRate: 780,  quantity: 1 },
    ],
    adecuaciones: [
      { name: 'Rotulación', price: 4500, quantity: 3 },
      { name: 'GPS',        price: 1200, quantity: 6 },
    ],
  },
  {
    nombre: 'solo adecuaciones, sin renta',
    tarifas: [],
    adecuaciones: [{ name: 'Rotulación', price: 4500, quantity: 1 }],
  },
];

describe('el total de Monday coincide con el total impreso', () => {
  for (const caso of CASOS) {
    it(caso.nombre, () => {
      const html = documento(caso.tarifas, caso.adecuaciones);

      const paraMonday = extractQuoteValues(html);
      const paraElPdf  = processPricingTableNodes(html);

      // El importe que se escribe en Monday tiene que aparecer literalmente
      // impreso en la tabla "VALOR DEL ACUERDO INICIAL" del documento.
      expect(paraElPdf).toContain(comoPeso(paraMonday.totalConIVA));
      expect(paraElPdf).toContain(comoPeso(paraMonday.totalSinIVA));
      expect(paraElPdf).toContain(comoPeso(paraMonday.ivaMonto));
    });
  }

  it('el deducible no mueve el valor que llega a Monday', () => {
    const base = { name: 'Hino 3.5', dailyRate: 1200, quantity: 2, delivery: 5000, retrieval: 5000 };
    const con  = extractQuoteValues(documento([{ ...base, deductible: 25 }]));
    const sin  = extractQuoteValues(documento([base]));
    expect(con.totalConIVA).toBe(sin.totalConIVA);
  });

  it('devuelve null sin HTML, como esperan los llamadores', () => {
    expect(extractQuoteValues(null)).toBeNull();
    expect(extractQuoteValues('')).toBeNull();
  });

  it('un documento sin cotizar vale cero y no imprime tabla de acuerdo', () => {
    const html = documento([], []);
    expect(extractQuoteValues(html).totalConIVA).toBe(0);
    expect(processPricingTableNodes(html).trim()).toBe('');
  });
});
