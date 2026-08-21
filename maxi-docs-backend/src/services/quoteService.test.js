import { describe, it, expect } from 'vitest';
import {
  parsePricingTables,
  calculateQuote,
  quoteFromHtml,
  tarifaLineSubtotal,
  adecuacionLineSubtotal,
  DIAS_POR_MES,
  IVA_RATE,
} from './quoteService.js';

// Helper: arma un nodo <pricing-table> como los que genera el editor.
function pricingTable(type, items, extra = '') {
  const b64 = Buffer.from(JSON.stringify(items), 'utf8').toString('base64');
  return `<pricing-table data-title="X" data-table-type="${type}" data-items-b64="${b64}"${extra}></pricing-table>`;
}

describe('constantes de negocio', () => {
  it('factura 30 días por mes de renta', () => {
    expect(DIAS_POR_MES).toBe(30);
  });

  it('usa IVA del 16%', () => {
    expect(IVA_RATE).toBe(16);
  });
});

describe('tarifaLineSubtotal', () => {
  it('cobra renta diaria × 30 × cantidad', () => {
    expect(tarifaLineSubtotal({ dailyRate: 1000, quantity: 2 })).toBe(60000);
  });

  it('suma entrega y recolección una sola vez, no por unidad', () => {
    // 1000×30×2 = 60000, más 5000 de entrega y 3000 de recolección
    expect(tarifaLineSubtotal({
      dailyRate: 1000, quantity: 2, delivery: 5000, retrieval: 3000,
    })).toBe(68000);
  });

  it('IGNORA el deducible — es informativo, no se cobra', () => {
    const sinDeducible = tarifaLineSubtotal({ dailyRate: 1000, quantity: 1 });
    const conDeducible = tarifaLineSubtotal({ dailyRate: 1000, quantity: 1, deductible: 10 });
    expect(conDeducible).toBe(sinDeducible);
    expect(conDeducible).toBe(30000);
  });

  it('trata una línea sin cantidad como una unidad', () => {
    expect(tarifaLineSubtotal({ dailyRate: 500 })).toBe(15000);
  });

  it('no revienta con campos ausentes, nulos o basura', () => {
    expect(tarifaLineSubtotal({})).toBe(0);
    expect(tarifaLineSubtotal({ dailyRate: null, quantity: null })).toBe(0);
    expect(tarifaLineSubtotal({ dailyRate: 'abc', delivery: undefined })).toBe(0);
    expect(tarifaLineSubtotal(undefined)).toBe(0);
  });

  it('acepta números en texto, como llegan del editor', () => {
    expect(tarifaLineSubtotal({ dailyRate: '1200', quantity: '2' })).toBe(72000);
  });

  it('una cantidad de 0 cuenta como 1, no como línea gratis', () => {
    // El editor manda quantity:0 cuando el campo se vacía; cobrarlo a cero
    // silenciosamente sería peor que asumir una unidad.
    expect(tarifaLineSubtotal({ dailyRate: 1000, quantity: 0 })).toBe(30000);
  });
});

describe('adecuacionLineSubtotal', () => {
  it('cobra precio × cantidad', () => {
    expect(adecuacionLineSubtotal({ price: 2500, quantity: 4 })).toBe(10000);
  });

  it('no aplica los 30 días — las adecuaciones son precio cerrado', () => {
    expect(adecuacionLineSubtotal({ price: 1000, quantity: 1 })).toBe(1000);
  });
});

describe('calculateQuote', () => {
  const tables = {
    tarifas: [
      { name: 'Hino 3.5 caja seca', dailyRate: 1200, quantity: 2, delivery: 5000, retrieval: 5000, deductible: 10 },
      { name: 'NPR chasis',         dailyRate: 900,  quantity: 1, delivery: 3000 },
    ],
    accesorios: [
      { name: 'Rotulación', price: 4500, quantity: 2 },
      { name: 'GPS extra',  price: 1200, quantity: 1 },
    ],
  };

  it('separa renta mensual de entrega y recolección', () => {
    const q = calculateQuote(tables);
    expect(q.rentaMensual).toBe(1200 * 30 * 2 + 900 * 30);        // 72000 + 27000
    expect(q.entregaRecoleccion).toBe(5000 + 5000 + 3000);        // 13000
    expect(q.subtotalTarifas).toBe(q.rentaMensual + q.entregaRecoleccion);
  });

  it('suma las adecuaciones aparte', () => {
    expect(calculateQuote(tables).subtotalAdecuaciones).toBe(4500 * 2 + 1200);  // 10200
  });

  it('aplica IVA sobre tarifas MÁS adecuaciones, no solo sobre tarifas', () => {
    const q = calculateQuote(tables);
    expect(q.subtotalTarifas).toBe(112000);      // 99000 renta + 13000 entrega/recolección
    expect(q.subtotalAdecuaciones).toBe(10200);
    expect(q.totalSinIVA).toBe(122200);          // las dos cosas
    expect(q.ivaMonto).toBe(round2(122200 * 0.16));
  });

  it('el total con IVA es el subtotal más su IVA, sin descuadres de centavos', () => {
    const q = calculateQuote(tables);
    expect(q.totalConIVA).toBe(round2(q.totalSinIVA * 1.16));
    expect(round2(q.totalSinIVA + q.ivaMonto)).toBe(q.totalConIVA);
  });

  it('el deducible no mueve el total', () => {
    const conDeducible = calculateQuote(tables);
    const sinDeducible = calculateQuote({
      tarifas:    tables.tarifas.map(({ deductible, ...rest }) => rest),
      accesorios: tables.accesorios,
    });
    expect(conDeducible.totalConIVA).toBe(sinDeducible.totalConIVA);
  });

  it('lista las unidades sin repetir pero cuenta todas', () => {
    const q = calculateQuote({
      tarifas: [
        { name: 'Hino 3.5', dailyRate: 100, quantity: 2 },
        { name: 'Hino 3.5', dailyRate: 100, quantity: 3 },
        { name: 'NPR',      dailyRate: 100, quantity: 1 },
      ],
      accesorios: [],
    });
    expect(q.unidades).toEqual(['Hino 3.5', 'NPR']);
    expect(q.unidadesCount).toBe(6);
    expect(q.primeraUnidad).toBe('Hino 3.5');
  });

  it('devuelve una línea por tarifa, para pintar la tabla del acuerdo', () => {
    const q = calculateQuote(tables);
    expect(q.lineasTarifas).toHaveLength(2);
    expect(q.lineasTarifas[0]).toEqual({
      name: 'Hino 3.5 caja seca', quantity: 2, subtotal: 82000,
    });
  });

  it('una cotización vacía da cero en todo, no NaN', () => {
    const q = calculateQuote({ tarifas: [], accesorios: [] });
    expect(q.totalSinIVA).toBe(0);
    expect(q.totalConIVA).toBe(0);
    expect(q.ivaMonto).toBe(0);
    expect(q.unidades).toEqual([]);
  });

  it('aguanta que no le pasen nada', () => {
    expect(calculateQuote(undefined).totalConIVA).toBe(0);
    expect(calculateQuote({}).totalConIVA).toBe(0);
    expect(calculateQuote({ tarifas: null, accesorios: 'nope' }).totalConIVA).toBe(0);
  });
});

describe('parsePricingTables', () => {
  it('lee los items en base64 de cada tabla', () => {
    const html = pricingTable('tarifas', [{ name: 'Hino', dailyRate: 100 }])
               + pricingTable('accesorios', [{ name: 'GPS', price: 50 }]);
    const t = parsePricingTables(html);
    expect(t.tarifas).toHaveLength(1);
    expect(t.tarifas[0].name).toBe('Hino');
    expect(t.accesorios[0].name).toBe('GPS');
  });

  it('junta varias tablas del mismo tipo', () => {
    const html = pricingTable('tarifas', [{ name: 'A', dailyRate: 100 }])
               + pricingTable('tarifas', [{ name: 'B', dailyRate: 200 }]);
    expect(parsePricingTables(html).tarifas).toHaveLength(2);
  });

  it('ignora la tabla "acuerdo", que es un total calculado y no líneas', () => {
    const html = pricingTable('tarifas',  [{ name: 'A', dailyRate: 100 }])
               + pricingTable('acuerdo',  [{ name: 'NO CONTAR', dailyRate: 9999 }]);
    const t = parsePricingTables(html);
    expect(t.tarifas).toHaveLength(1);
    expect(JSON.stringify(t)).not.toContain('NO CONTAR');
  });

  it('sobrevive a nombres con acentos y eñes', () => {
    const html = pricingTable('tarifas', [{ name: 'Camión Ñ — 3½ tón', dailyRate: 100 }]);
    expect(parsePricingTables(html).tarifas[0].name).toBe('Camión Ñ — 3½ tón');
  });

  it('salta las tablas vacías o con base64 corrupto sin tirar nada', () => {
    const html = `<pricing-table data-table-type="tarifas" data-items-b64="W10="></pricing-table>`
               + `<pricing-table data-table-type="tarifas" data-items-b64="no-es-base64-valido!!"></pricing-table>`
               + pricingTable('tarifas', [{ name: 'Buena', dailyRate: 100 }]);
    const t = parsePricingTables(html);
    expect(t.tarifas).toHaveLength(1);
    expect(t.tarifas[0].name).toBe('Buena');
  });

  it('acepta la etiqueta auto-cerrada además de la de cierre explícito', () => {
    const b64 = Buffer.from(JSON.stringify([{ name: 'A', dailyRate: 100 }])).toString('base64');
    const html = `<pricing-table data-table-type="tarifas" data-items-b64="${b64}" />`;
    expect(parsePricingTables(html).tarifas).toHaveLength(1);
  });

  it('devuelve tablas vacías si el HTML no trae ninguna', () => {
    expect(parsePricingTables('<p>hola</p>')).toEqual({ tarifas: [], accesorios: [] });
    expect(parsePricingTables('')).toEqual({ tarifas: [], accesorios: [] });
    expect(parsePricingTables(null)).toEqual({ tarifas: [], accesorios: [] });
  });

  it('no se desincroniza entre llamadas por el flag /g del regex', () => {
    const html = pricingTable('tarifas', [{ name: 'A', dailyRate: 100 }]);
    expect(parsePricingTables(html).tarifas).toHaveLength(1);
    expect(parsePricingTables(html).tarifas).toHaveLength(1);   // segunda pasada igual
    expect(parsePricingTables(html).tarifas).toHaveLength(1);
  });
});

describe('quoteFromHtml — el caso real de una propuesta MAXIRent', () => {
  it('calcula el total del documento completo', () => {
    const html = `
      <div class="mr">
        ${pricingTable('tarifas', [
          { name: 'Hino 3.5 caja seca', dailyRate: 1200, quantity: 2, delivery: 5000, retrieval: 5000, deductible: 10 },
        ])}
        <p>Observaciones…</p>
        ${pricingTable('accesorios', [{ name: 'Rotulación', price: 4500, quantity: 2 }])}
        ${pricingTable('acuerdo', [])}
      </div>`;

    const q = quoteFromHtml(html);
    // 1200×30×2 = 72000, +5000 entrega +5000 recolección = 82000
    // adecuaciones 4500×2 = 9000  →  subtotal 91000  →  IVA 14560  →  105560
    expect(q.subtotalTarifas).toBe(82000);
    expect(q.subtotalAdecuaciones).toBe(9000);
    expect(q.totalSinIVA).toBe(91000);
    expect(q.ivaMonto).toBe(14560);
    expect(q.totalConIVA).toBe(105560);
  });

  it('el documento sin tablas vale cero', () => {
    expect(quoteFromHtml('<div>Propuesta sin cotizar</div>').totalConIVA).toBe(0);
  });
});

function round2(n) {
  return Math.round(n * 100) / 100;
}
