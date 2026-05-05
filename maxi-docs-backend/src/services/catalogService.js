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

/**
 * Genera el HTML de la tabla de cotización de renta a partir de los items seleccionados.
 * Compatible con el estilo de la plantilla MAXIRent.
 * @param {Array} items — [{ name, sku, price, quantity }]
 * @param {number} ivaRate — porcentaje de IVA (default 16)
 */
export function buildPricingTableHtml(items, ivaRate = 16) {
  if (!items?.length) return '';

  const subtotal = items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
  const iva      = subtotal * (ivaRate / 100);
  const total    = subtotal + iva;

  const fmt = n => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const rows = items.map(i => `
    <tr>
      <td style="text-align:center;">${i.quantity}</td>
      <td>${i.name}</td>
      <td style="text-align:center;">${i.sku}</td>
      <td style="text-align:right;">${fmt(i.price)}</td>
      <td style="text-align:right;">${fmt(i.price * i.quantity)}</td>
    </tr>`).join('');

  return `
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <thead>
        <tr style="background:#F5A000;color:white;">
          <th style="padding:8px 10px;font-size:9pt;text-align:center;">CANTIDAD</th>
          <th style="padding:8px 10px;font-size:9pt;text-align:left;">SERVICIO</th>
          <th style="padding:8px 10px;font-size:9pt;text-align:center;">SKU</th>
          <th style="padding:8px 10px;font-size:9pt;text-align:right;">PRECIO UNIT.</th>
          <th style="padding:8px 10px;font-size:9pt;text-align:right;">SUBTOTAL</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="4" style="text-align:right;padding:6px 10px;font-weight:600;font-size:9pt;">
            IVA ${ivaRate}%
          </td>
          <td style="text-align:right;padding:6px 10px;font-size:9pt;color:#0073ea;font-weight:700;">
            ${fmt(iva)}
          </td>
        </tr>
        <tr style="border-top:2px solid #F5A000;">
          <td colspan="4" style="text-align:right;padding:8px 10px;font-weight:800;font-size:11pt;">
            TOTAL CON IVA
          </td>
          <td style="text-align:right;padding:8px 10px;font-weight:900;font-size:13pt;color:#F5A000;">
            ${fmt(total)}
          </td>
        </tr>
      </tfoot>
    </table>`;
}
