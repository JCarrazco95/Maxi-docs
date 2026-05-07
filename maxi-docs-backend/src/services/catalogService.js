import 'dotenv/config';

const MONDAY_TOKEN    = process.env.MONDAY_API_TOKEN;
const BOARD_ID        = process.env.MONDAY_CATALOG_BOARD_ID;
const SKU_COL         = process.env.MONDAY_CATALOG_SKU_COL    || 'text_mm32knkd';
const PRICE_COL       = process.env.MONDAY_CATALOG_PRICE_COL  || 'numeric_mm321j2y';

async function mondayQuery(query) {
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: MONDAY_TOKEN,
    },
    body: JSON.stringify({ query }),
  });
  const data = await res.json();
  if (data.errors) throw new Error(data.errors[0]?.message ?? 'Monday API error');
  return data.data;
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

const TH = (txt, align = 'left') =>
  `<th style="padding:7px 10px;font-size:8.5pt;text-align:${align};white-space:nowrap;">${txt}</th>`;
const TD = (txt, align = 'left', extra = '') =>
  `<td style="padding:7px 10px;font-size:9pt;text-align:${align};${extra}">${txt}</td>`;

const tblStart = `<table style="width:100%;border-collapse:collapse;margin:12px 0;font-family:Arial,sans-serif;">`;
const footStyle = `border-top:2px solid #F5A000;`;

/**
 * Genera el HTML estático de una tabla de cotización para el PDF.
 * @param {Array}  items     — items con campos según tableType
 * @param {number} ivaRate   — % de IVA
 * @param {string} tableType — 'renta' | 'traslados' | 'generic'
 */
export function buildPricingTableHtml(items, ivaRate = 16, tableType = 'renta') {
  if (!items?.length) return '';

  const fmt = n => `$${Number(n||0).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const hdr = `background:#F5A000;color:white;`;

  let headRow = '', bodyRows = '', subtotal = 0, colSpanTotal = 4;

  if (tableType === 'renta') {
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
    headRow = `<tr style="${hdr}">${TH('CANTIDAD','center')}${TH('ACCESORIO / SERVICIO')}${TH('SUBTOTAL','right')}</tr>`;
    colSpanTotal = 2;
    bodyRows = items.map(i => {
      const qty = i.quantity || 1;
      const sub = (i.price||0) * qty;
      subtotal += sub;
      return `<tr>${TD(qty,'center')}${TD(i.name)}${TD(fmt(sub),'right','font-weight:700;color:#1B3055;')}</tr>`;
    }).join('');

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
