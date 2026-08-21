/**
 * quoteService — LA fórmula de cotización de MAXIRent. Una sola, en un solo sitio.
 *
 * Antes vivía duplicada en tres lugares que no coincidían entre sí:
 *   - documents.js  extractPricingTotal()   → multiplicaba la renta por el deducible
 *   - documents.js  extractQuoteValues()    → no lo aplicaba
 *   - pdfService.js processPricingTableNodes() → tampoco
 * Resultado: el valor que se escribía en Monday podía no coincidir con el total
 * impreso en el PDF que firmaba el cliente.
 *
 * DECISIÓN DE NEGOCIO (2026-08-20): el deducible del seguro es INFORMATIVO.
 * Se muestra en la tabla pero NO suma al total.
 *
 *   línea de tarifa = renta_diaria × DIAS_POR_MES × cantidad + entrega + recolección
 *   línea de adecuación = precio × cantidad
 *   total = (Σ tarifas + Σ adecuaciones) × (1 + IVA)
 *
 * Este módulo no sabe nada de HTTP, de Monday ni de Puppeteer: es una función
 * pura sobre datos, y por eso se puede probar. Ver quoteService.test.js.
 */

/** Días que se facturan por mes de renta. */
export const DIAS_POR_MES = 30;

/** IVA de México. Fijo: la UI no lo expone y los documentos viejos lo traen en 0. */
export const IVA_RATE = 16;

/** Redondeo a 2 decimales sin arrastrar el error binario de coma flotante. */
function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** La cantidad por defecto es 1: una línea sin `quantity` cuenta como una unidad. */
function qtyOf(item) {
  const q = Number(item?.quantity);
  return Number.isFinite(q) && q > 0 ? q : 1;
}

// ── Extracción de los nodos <pricing-table> del HTML ──────────────────────
// Se mantiene mientras el documento siga siendo un blob de HTML. Cuando el
// documento pase a ser JSON (Fase 1), esta parte desaparece y `calculateQuote`
// recibe las secciones directamente.

// Acepta tanto <pricing-table ...></pricing-table> como <pricing-table ... />
const PRICING_TABLE_RE = /<pricing-table([^>]*?)(?:\s*\/?>|>)/gi;

function decodeItemsB64(b64) {
  if (!b64) return [];
  try {
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  } catch {
    return [];
  }
}

/**
 * Lee todas las tablas de precios de un HTML y las agrupa por tipo.
 * @param {string} html
 * @returns {{ tarifas: object[], accesorios: object[] }}
 */
export function parsePricingTables(html) {
  const tables = { tarifas: [], accesorios: [] };
  if (!html) return tables;

  PRICING_TABLE_RE.lastIndex = 0;   // el flag /g mantiene estado entre llamadas
  let m;
  while ((m = PRICING_TABLE_RE.exec(html)) !== null) {
    const attrs = m[1];
    const type  = attrs.match(/data-table-type=["']([^"']+)["']/i)?.[1];
    const b64   = attrs.match(/data-items-b64=["']([^"']*)["']/i)?.[1];
    if (!type || !b64) continue;

    const items = decodeItemsB64(b64);
    if (!Array.isArray(items)) continue;

    if (type === 'tarifas')    tables.tarifas.push(...items);
    if (type === 'accesorios') tables.accesorios.push(...items);
  }
  return tables;
}

// ── El cálculo ────────────────────────────────────────────────────────────

/**
 * Subtotal de UNA línea de tarifas, sin IVA.
 * El deducible NO entra: es informativo.
 */
export function tarifaLineSubtotal(item) {
  const qty     = qtyOf(item);
  const mensual = num(item?.dailyRate) * DIAS_POR_MES * qty;
  return round2(mensual + num(item?.delivery) + num(item?.retrieval));
}

/** Subtotal de UNA línea de adecuaciones, sin IVA. */
export function adecuacionLineSubtotal(item) {
  return round2(num(item?.price) * qtyOf(item));
}

/**
 * Calcula la cotización completa a partir de las tablas ya parseadas.
 *
 * @param {{ tarifas: object[], accesorios: object[] }} tables
 * @returns {{
 *   rentaMensual: number, entregaRecoleccion: number,
 *   subtotalTarifas: number, subtotalAdecuaciones: number,
 *   totalSinIVA: number, ivaMonto: number, totalConIVA: number,
 *   unidades: string[], unidadesCount: number, primeraUnidad: string,
 *   lineasTarifas: {name: string, quantity: number, subtotal: number}[]
 * }}
 */
export function calculateQuote(tables) {
  const tarifas    = Array.isArray(tables?.tarifas)    ? tables.tarifas    : [];
  const accesorios = Array.isArray(tables?.accesorios) ? tables.accesorios : [];

  let rentaMensual = 0;
  let entregaRecoleccion = 0;
  let unidadesCount = 0;
  const unidades = [];
  const lineasTarifas = [];

  for (const item of tarifas) {
    const qty     = qtyOf(item);
    const mensual = num(item.dailyRate) * DIAS_POR_MES * qty;
    const extras  = num(item.delivery) + num(item.retrieval);

    rentaMensual       += mensual;
    entregaRecoleccion += extras;
    unidadesCount      += qty;

    if (item.name) unidades.push(item.name);

    lineasTarifas.push({
      name:     item.name ?? '',
      quantity: qty,
      subtotal: round2(mensual + extras),
    });
  }

  const subtotalAdecuaciones = accesorios.reduce(
    (sum, item) => sum + num(item.price) * qtyOf(item),
    0
  );

  const subtotalTarifas = rentaMensual + entregaRecoleccion;
  const totalSinIVA     = subtotalTarifas + subtotalAdecuaciones;
  const ivaMonto        = totalSinIVA * (IVA_RATE / 100);

  const unidadesUnicas = [...new Set(unidades)];

  return {
    rentaMensual:         round2(rentaMensual),
    entregaRecoleccion:   round2(entregaRecoleccion),
    subtotalTarifas:      round2(subtotalTarifas),
    subtotalAdecuaciones: round2(subtotalAdecuaciones),
    totalSinIVA:          round2(totalSinIVA),
    ivaMonto:             round2(ivaMonto),
    totalConIVA:          round2(totalSinIVA + ivaMonto),
    unidades:             unidadesUnicas,
    unidadesCount,
    primeraUnidad:        unidades[0] ?? '',
    lineasTarifas,
  };
}

/**
 * Atajo para el caso habitual: de HTML a totales en un paso.
 * @param {string} html
 */
export function quoteFromHtml(html) {
  return calculateQuote(parsePricingTables(html));
}
