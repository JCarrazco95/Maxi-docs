import 'dotenv/config';
import { monthlyFrom, tramoById } from './rateCardService.js';
import { tipoTrasladoById } from './trasladosService.js';

const MONDAY_TOKEN    = process.env.MONDAY_API_TOKEN;
const BOARD_ID        = process.env.MONDAY_CATALOG_BOARD_ID;
const SKU_COL         = process.env.MONDAY_CATALOG_SKU_COL    || 'text_mm32knkd';
const PRICE_COL       = process.env.MONDAY_CATALOG_PRICE_COL  || 'numeric_mm321j2y';

/** True when Monday sync is fully configured */
export function mondaySyncEnabled() {
  return !!(MONDAY_TOKEN && BOARD_ID);
}

async function mondayQuery(gql, variables) {
  const body = variables ? { query: gql, variables } : { query: gql };
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: MONDAY_TOKEN },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.errors) throw new Error(data.errors[0]?.message ?? 'Monday API error');
  return data.data;
}

/**
 * Crea un item en el board de catálogo de Monday.com.
 * Devuelve el ID del item creado (string).
 */
export async function createMondayProduct({ name, sku = '', price = 0, groupId }) {
  if (!mondaySyncEnabled()) return null;
  const colVals = JSON.stringify({ [SKU_COL]: sku, [PRICE_COL]: String(price) });
  const mutation = groupId
    ? `mutation { create_item(board_id:${BOARD_ID}, group_id:"${groupId}", item_name:${JSON.stringify(name)}, column_values:${JSON.stringify(colVals)}) { id } }`
    : `mutation { create_item(board_id:${BOARD_ID}, item_name:${JSON.stringify(name)}, column_values:${JSON.stringify(colVals)}) { id } }`;
  const data = await mondayQuery(mutation);
  return data.create_item?.id ?? null;
}

/**
 * Actualiza nombre y columnas de un item en Monday.
 */
export async function updateMondayProduct(mondayItemId, { name, sku, price }) {
  if (!mondaySyncEnabled() || !mondayItemId) return;
  const colVals = JSON.stringify({ [SKU_COL]: sku ?? '', [PRICE_COL]: String(price ?? 0) });
  await mondayQuery(
    `mutation { change_item_value(board_id:${BOARD_ID}, item_id:${mondayItemId}, column_id:"name", value:${JSON.stringify(JSON.stringify(name))}) { id } }`
  );
  await mondayQuery(
    `mutation { change_multiple_column_values(board_id:${BOARD_ID}, item_id:${mondayItemId}, column_values:${JSON.stringify(colVals)}) { id } }`
  );
}

/**
 * Elimina (archiva) un item en Monday.
 */
export async function deleteMondayProduct(mondayItemId) {
  if (!mondaySyncEnabled() || !mondayItemId) return;
  await mondayQuery(`mutation { archive_item(item_id:${mondayItemId}) { id } }`);
}

/**
 * Crea un grupo (categoría) en el board de Monday.
 * Devuelve el group_id del grupo creado.
 */
export async function createMondayGroup(name) {
  if (!mondaySyncEnabled()) return null;
  const data = await mondayQuery(
    `mutation { create_group(board_id:${BOARD_ID}, group_name:${JSON.stringify(name)}) { id } }`
  );
  return data.create_group?.id ?? null;
}

/**
 * Obtiene el catálogo completo del board de Monday.com.
 * Devuelve categorías (grupos) con sus productos (items).
 */
export async function fetchCatalog() {
  const data = await mondayQuery(`{
    boards(ids:[${BOARD_ID}]) {
      name
      groups {
        id
        title
        items_page(limit: 200) {
          items {
            id
            name
            column_values {
              id
              text
            }
          }
        }
      }
    }
  }`);

  const board = data.boards?.[0];
  if (!board) throw new Error('Board de catálogo no encontrado');

  return {
    boardName: board.name,
    categories: board.groups.map(group => ({
      id:       group.id,
      name:     group.title,
      products: group.items_page.items.map(item => {
        const colMap = {};
        item.column_values.forEach(cv => { colMap[cv.id] = cv.text; });
        return {
          id:    item.id,
          name:  item.name,
          sku:   colMap[SKU_COL]   ?? '',
          price: parseFloat(colMap[PRICE_COL] ?? '0') || 0,
          // Columnas adicionales (extensible): todo lo que no sea SKU/PRICE
          extra: Object.fromEntries(
            item.column_values
              .filter(cv => cv.id !== SKU_COL && cv.id !== PRICE_COL && cv.text)
              .map(cv => [cv.id, cv.text])
          ),
        };
      }),
    })),
  };
}

// Estilo unificado: cabecera azul MAXIRent, filas limpias, totales naranja
const HDR_BG  = '#1B3055';
const TOTAL_C = '#F5A000';
const CELL_BR = 'border-bottom:1px solid #e5e7eb;';

const TH = (txt, align = 'left') =>
  `<th style="padding:7px 10px;font-size:8.5pt;text-align:${align};white-space:nowrap;background:${HDR_BG};color:white;-webkit-print-color-adjust:exact;print-color-adjust:exact;">${txt}</th>`;
const TD = (txt, align = 'left', extra = '') =>
  `<td style="padding:7px 10px;font-size:9pt;text-align:${align};${CELL_BR}${extra}">${txt}</td>`;

const tblStart = `<table style="width:100%;border-collapse:collapse;margin:8px 0;font-family:Arial,sans-serif;border:1px solid #e5e7eb;">`;
const footStyle = `border-top:2px solid ${TOTAL_C};`;

// Cabecera navy de la propuesta LP — distinta del azul de la plantilla comercial
const LP_HDR_BG = '#063B4A';
const LP_ORANGE = '#F58220';

/**
 * Genera el HTML estático de una tabla de cotización para el PDF.
 * @param {Array}  items     — items con campos según tableType
 * @param {number} ivaRate   — % de IVA
 * @param {string} tableType — 'renta' | 'traslados' | 'tabulador' | 'adicionales' | 'generic'
 */
export function buildPricingTableHtml(items, ivaRate = 16, tableType = 'renta') {
  if (!items?.length) return '';

  const fmt = n => `$${Number(n||0).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const hdr = `background:#1B3055;color:white;-webkit-print-color-adjust:exact;print-color-adjust:exact;`;

  let headRow = '', bodyRows = '', subtotal = 0, colSpanTotal = 4;

  // ── TABLAS DE LA PROPUESTA LP ────────────────────────────────────────
  // Las tres salen de aquí pero cada una muestra lo suyo:
  //   tabulador   → la renta mensual, que depende del PLAZO contratado
  //   costos      → el traslado desglosado: estado, municipio y tipo de unidad
  //   adicionales → adecuaciones, un concepto y su importe
  // Importante para el cliente: solo el tabulador cobra por mes. Traslados y
  // adecuaciones son importes únicos, y la etiqueta de la columna lo dice.
  if (tableType === 'tabulador' || tableType === 'adicionales' || tableType === 'costos') {
    const lpHdr = `background:${LP_HDR_BG};color:white;-webkit-print-color-adjust:exact;print-color-adjust:exact;`;
    const LPTH  = (t, a = 'left') =>
      `<th style="padding:6px 8px;font-size:8pt;font-weight:700;letter-spacing:.4px;text-align:${a};white-space:nowrap;${lpHdr}">${t}</th>`;
    // Celda propia: el TD compartido lo usan también las tablas de la plantilla
    // vieja, y bajarle el padding ahí le cambiaría el alto a documentos que ya
    // existen. Aquí se aprieta para que quepan más renglones en la página.
    const LPTD  = (t, a = 'left', extra = '') =>
      `<td style="padding:4px 8px;font-size:9pt;text-align:${a};${CELL_BR}${extra}">${t}</td>`;

    const DASH   = '<span style="color:#9aa7ad;">—</span>';
    const dato   = v => (String(v ?? '').trim() || DASH);
    const importeStyle = `font-weight:700;color:${LP_HDR_BG};white-space:nowrap;`;

    let columnas;

    if (tableType === 'costos') {
      // Traslados: el cliente debe poder verificar a dónde va la unidad y de
      // qué tipo es, porque de eso depende la tarifa del tablero.
      columnas = ['CANT.', 'ESTADO', 'MUNICIPIO', 'TIPO DE UNIDAD', 'CONCEPTO', 'COSTO SIN IVA'];
      headRow = `<tr>${LPTH('CANT.','center')}${LPTH('ESTADO')}${LPTH('MUNICIPIO')}`
        + `${LPTH('TIPO DE UNIDAD')}${LPTH('CONCEPTO')}${LPTH('COSTO SIN IVA','right')}</tr>`;

      bodyRows = items.map(i => {
        const qty     = Number(i.quantity) || 1;
        const importe = (Number(i.price) || 0) * qty;
        subtotal += importe;
        // El tipo se guarda como id ('sedan'); al cliente se le muestra su
        // etiqueta ('Sedán y Compacto'). Las filas capturadas a mano no traen
        // estado ni municipio: ahí va un guion en vez de una celda vacía.
        const tipo = tipoTrasladoById(i.tipo)?.label;
        return `<tr>
          ${LPTD(qty,'center')}
          ${LPTD(dato(i.estado))}
          ${LPTD(dato(i.municipio))}
          ${LPTD(dato(tipo))}
          ${LPTD(dato(i.name))}
          ${LPTD(fmt(importe),'right',importeStyle)}
        </tr>`;
      }).join('');

    } else {
      const conPlazo = tableType === 'tabulador';
      const etiquetaImporte = conPlazo ? 'RENTA MENSUAL SIN IVA' : 'IMPORTE ÚNICO SIN IVA';
      columnas = ['CANT.', 'UNIDAD', 'ESPECIFICACIONES', ...(conPlazo ? ['PLAZO'] : []), etiquetaImporte];
      headRow = `<tr>${LPTH('CANT.','center')}${LPTH('UNIDAD')}${LPTH('ESPECIFICACIONES')}`
        + (conPlazo ? LPTH('PLAZO','center') : '')
        + `${LPTH(etiquetaImporte,'right')}</tr>`;

      bodyRows = items.map(i => {
        const qty = Number(i.quantity) || 1;
        // El tabulador cotiza tarifa diaria; las adecuaciones, importe directo.
        const monto = conPlazo ? monthlyFrom(i.dailyRate, qty) : (Number(i.price) || 0) * qty;
        subtotal += monto;
        // 13+ meses no tiene tarifa de tabla. Si el ejecutivo ya capturó el
        // precio que le dio Dirección Comercial, se imprime: dejar el aviso ahí
        // haría que el total incluyera un importe que la fila no muestra.
        const importe = (conPlazo && i.tramo === '13+' && monto === 0)
          ? '<span style="color:#607078;font-style:italic;">Ver con Dirección Comercial</span>'
          : fmt(monto);
        // El plazo se guarda como id ('4-6'); se muestra su etiqueta.
        const plazo = conPlazo
          ? LPTD(tramoById(i.tramo)?.label ?? DASH, 'center', 'white-space:nowrap;')
          : '';
        return `<tr>
          ${LPTD(qty,'center')}
          ${LPTD(i.name || '')}
          ${LPTD(i.specs || '','left','color:#607078;font-size:8.5pt;')}
          ${plazo}
          ${LPTD(importe,'right',importeStyle)}
        </tr>`;
      }).join('');
    }

    // UNIDADES PROPUESTAS no lleva total propio: su suma ES la mensualidad del
    // hero y repetirla sería decir el mismo número dos veces. Costos
    // adicionales y adecuaciones sí, porque no entran en ese total y si no el
    // cliente no tiene de dónde leer cuánto suman.
    const pie = tableType === 'tabulador' ? '' : `<tfoot>
        <tr style="border-top:2px solid ${LP_ORANGE};">
          <td colspan="${columnas.length - 1}" style="text-align:right;padding:5px 8px;font-weight:800;font-size:9pt;color:${LP_HDR_BG};">TOTAL</td>
          <td style="text-align:right;padding:5px 8px;font-weight:900;font-size:10.5pt;color:${LP_HDR_BG};">${fmt(subtotal)}</td>
        </tr>
      </tfoot>`;

    return `${tblStart}
      <thead>${headRow}</thead>
      <tbody>${bodyRows}</tbody>
      ${pie}
    </table>`;
  }

  if (tableType === 'tarifas') {
    headRow = `<tr style="${hdr}">${TH('TIPO DE UNIDAD')}${TH('CANT.','center')}${TH('DEDUCIBLE','center')}${TH('RENTA DIARIA','right')}${TH('RENTA MENSUAL','right')}${TH('ENTREGA','right')}${TH('RECOLECCIÓN','right')}</tr>`;
    colSpanTotal = 6;
    let totalMensual = 0, totalEntrega = 0, totalRecoleccion = 0;
    bodyRows = items.map(i => {
      const qty       = Number(i.quantity) || 1;
      const diaria    = Number(i.dailyRate) || 0;
      const mensual   = diaria * 30 * qty;
      const dedPct    = Number(i.deductible) || 0;
      const entrega   = Number(i.delivery)  || 0;
      const recolecc  = Number(i.retrieval) || 0;
      totalMensual     += mensual;
      totalEntrega     += entrega;
      totalRecoleccion += recolecc;
      // Subtotal real del vehículo = renta mensual + entrega + recolección
      // (deducible es solo informativo, no suma al total)
      subtotal         += mensual + entrega + recolecc;
      return `<tr style="-webkit-print-color-adjust:exact;print-color-adjust:exact;">
        ${TD(i.name)}
        ${TD(qty,'center')}
        ${TD(`${dedPct}%`,'center')}
        ${TD(fmt(diaria),'right')}
        ${TD(fmt(diaria * 30),'right','font-weight:700;color:#1B3055;')}
        ${TD(fmt(entrega),'right')}
        ${TD(fmt(recolecc),'right')}
      </tr>`;
    }).join('');
    const grandTotal = totalMensual + totalEntrega + totalRecoleccion;
    // Filas extra del pie solo si hay valor (>0) para no saturar visualmente
    const extraRows = `
      ${totalEntrega > 0 ? `
        <tr><td colspan="6" style="text-align:right;padding:4px 10px;font-size:9pt;color:#676879;">Entrega</td>
            <td style="text-align:right;padding:4px 10px;font-size:9pt;color:#676879;">${fmt(totalEntrega)}</td></tr>` : ''}
      ${totalRecoleccion > 0 ? `
        <tr><td colspan="6" style="text-align:right;padding:4px 10px;font-size:9pt;color:#676879;">Recolección</td>
            <td style="text-align:right;padding:4px 10px;font-size:9pt;color:#676879;">${fmt(totalRecoleccion)}</td></tr>` : ''}
    `;
    return `${tblStart}
      <thead>${headRow}</thead>
      <tbody>${bodyRows}</tbody>
      <tfoot>
        <tr><td colspan="6" style="text-align:right;padding:4px 10px;font-size:9pt;color:#676879;">Total renta mensual</td>
            <td style="text-align:right;padding:4px 10px;font-size:9pt;color:#676879;">${fmt(totalMensual)}</td></tr>
        ${extraRows}
        <tr style="${footStyle}">
          <td colspan="6" style="text-align:right;padding:8px 10px;font-weight:800;font-size:10pt;">Total</td>
          <td style="text-align:right;padding:8px 10px;font-weight:900;font-size:12pt;color:#F5A000;">${fmt(grandTotal)}</td>
        </tr>
      </tfoot>
    </table>`;

  } else if (tableType === 'renta') {
    headRow = `<tr style="${hdr}">${TH('CANTIDAD','center')}${TH('TIPO DE UNIDAD')}${TH('TARIFA DIARIA','right')}${TH('TARIFA MENSUAL','right')}${TH('DEDUCIBLE','center')}${TH('DÍAS','center')}</tr>`;
    colSpanTotal = 5;
    bodyRows = items.map(i => {
      const qty    = i.quantity || 1;
      const daily  = i.dailyRate != null ? i.dailyRate : (i.price || 0) / 30;
      const sub    = (i.price || 0) * qty;
      subtotal += sub;
      return `<tr>${TD(qty,'center')}${TD(i.name)}${TD(fmt(daily),'right')}${TD(fmt(i.price||0),'right','font-weight:700;color:#1B3055;')}${TD(`${i.deductible??10}%`,'center')}${TD(i.days??30,'center')}</tr>`;
    }).join('');

  } else if (tableType === 'traslados') {
    headRow = `<tr style="${hdr}">${TH('CANTIDAD','center')}${TH('TIPO UNIDAD')}${TH('TRASLADO','right')}${TH('ENTREGA','right')}${TH('RECOLECCIÓN','right')}${TH('SUBTOTAL','right')}</tr>`;
    colSpanTotal = 5;
    bodyRows = items.map(i => {
      const qty = i.quantity || 1;
      const sub = ((i.price||0) + (i.delivery||0) + (i.retrieval||0)) * qty;
      subtotal += sub;
      return `<tr>${TD(qty,'center')}${TD(i.name)}${TD(fmt(i.price||0),'right')}${TD(fmt(i.delivery||0),'right')}${TD(fmt(i.retrieval||0),'right')}${TD(fmt(sub),'right','font-weight:700;color:#1B3055;')}</tr>`;
    }).join('');

  } else if (tableType === 'accesorios') {
    // Columnas: CANTIDAD | DESCRIPCIÓN | PRECIO POR UNIDAD | SUBTOTAL (sin IVA)
    headRow = `<tr style="${hdr}">${TH('CANTIDAD','center')}${TH('DESCRIPCIÓN')}${TH('PRECIO POR UNIDAD','right')}${TH('SUBTOTAL','right')}</tr>`;
    colSpanTotal = 3;
    bodyRows = items.map(i => {
      const qty = i.quantity || 1;
      const sub = (i.price||0) * qty;
      subtotal += sub;
      return `<tr>${TD(qty,'center')}${TD(i.name)}${TD(fmt(i.price||0),'right')}${TD(fmt(sub),'right','font-weight:700;color:#1B3055;')}</tr>`;
    }).join('');
    // Retorno especial: solo TOTAL sin IVA
    return `${tblStart}
      <thead>${headRow}</thead>
      <tbody>${bodyRows}</tbody>
      <tfoot>
        <tr style="${footStyle}">
          <td colspan="${colSpanTotal}" style="text-align:right;padding:8px 10px;font-weight:800;font-size:10pt;">TOTAL</td>
          <td style="text-align:right;padding:8px 10px;font-weight:900;font-size:12pt;color:#F5A000;">${fmt(subtotal)}</td>
        </tr>
      </tfoot>
    </table>`;

  } else {
    // generic
    headRow = `<tr style="${hdr}">${TH('CANTIDAD','center')}${TH('SERVICIO')}${TH('SKU','center')}${TH('PRECIO/MES','right')}${TH('SUBTOTAL','right')}</tr>`;
    colSpanTotal = 4;
    bodyRows = items.map(i => {
      const qty = i.quantity || 1;
      const sub = (i.price||0) * qty;
      subtotal += sub;
      return `<tr>${TD(qty,'center')}${TD(i.name)}${TD(i.sku||'','center')}${TD(fmt(i.price||0),'right')}${TD(fmt(sub),'right','font-weight:700;color:#1B3055;')}</tr>`;
    }).join('');
  }

  const iva   = subtotal * (ivaRate / 100);
  const total = subtotal + iva;

  return `${tblStart}
    <thead>${headRow}</thead>
    <tbody>${bodyRows}</tbody>
    <tfoot>
      <tr>
        <td colspan="${colSpanTotal}" style="text-align:right;padding:6px 10px;font-weight:600;font-size:9pt;">IVA ${ivaRate}%</td>
        <td style="text-align:right;padding:6px 10px;font-size:9pt;color:#F5A000;font-weight:700;">${fmt(iva)}</td>
      </tr>
      <tr style="${footStyle}">
        <td colspan="${colSpanTotal}" style="text-align:right;padding:8px 10px;font-weight:800;font-size:10pt;">TOTAL CON IVA</td>
        <td style="text-align:right;padding:8px 10px;font-weight:900;font-size:12pt;color:#F5A000;">${fmt(total)}</td>
      </tr>
    </tfoot>
  </table>`;
}
