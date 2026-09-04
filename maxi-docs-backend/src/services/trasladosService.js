/**
 * trasladosService — Tarifas de traslado por municipio y tipo de unidad.
 *
 * Los datos viven en el board "Traslados" de Monday: cada item es un
 * MUNICIPIO (el nombre del item), con su estado en una columna y siete
 * columnas de costo, una por categoría de vehículo.
 *
 * Ojo: las siete categorías de traslado NO son los catorce grupos del
 * tabulador. "Sedan y Compacto" agrupa lo que el tabulador separa en SEDANES
 * y COMPACTOS, "4x4 y Caja Seca" mezcla dos cosas, etc. Por eso el ejecutivo
 * elige la categoría a mano en vez de deducirla de la unidad cotizada:
 * cualquier mapeo automático sería una suposición nuestra sobre su negocio.
 *
 * El board se hardcodea con override por entorno, igual que los otros ids de
 * board del proyecto (ver MONDAY_COTIZACIONES_BOARD en routes/documents.js).
 * Así no hace falta recordar otra variable al desplegar.
 */
import 'dotenv/config';

const BOARD_ID = process.env.MONDAY_TRASLADOS_BOARD_ID || '18429801935';
const COL_ESTADO    = 'text_mm6w9v3d';
const COL_PROVEEDOR = 'text_mm6wsywn';

/** Las siete categorías de costo, en el orden en que se ven en el board. */
export const TIPOS_TRASLADO = [
  { id: 'sedan',      label: 'Sedán y Compacto',  col: 'text_mm6w9j1y' },
  { id: 'suv',        label: 'SUV, 4x2, Panel',   col: 'text_mm6wxjp4' },
  { id: '4x4',        label: '4x4 y Caja Seca',   col: 'text_mm6w77py' },
  { id: '35redilas',  label: '3½ Redilas',        col: 'text_mm6wnhjr' },
  { id: '35cajaseca', label: '3½ Caja Seca',      col: 'text_mm6whant' },
  { id: '35plat',     label: '3½ Plataforma',     col: 'text_mm6whwem' },
  { id: 'hino',       label: 'Hino',              col: 'text_mm6wrmr7' },
];

export function tipoTrasladoById(id) {
  return TIPOS_TRASLADO.find(t => t.id === id) ?? null;
}

/** True cuando hay token para consultar Monday. */
export function trasladosEnabled() {
  return !!(process.env.MONDAY_API_TOKEN && BOARD_ID);
}

async function mondayQuery(gql) {
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: process.env.MONDAY_API_TOKEN },
    body: JSON.stringify({ query: gql }),
  });
  const data = await res.json();
  if (data.errors) throw new Error(data.errors[0]?.message ?? 'Monday API error');
  return data.data;
}

const num = v => {
  const n = parseFloat(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Destinos de traslado agrupados por estado.
 * @returns {Promise<{estados: Array<{estado:string, municipios:Array}>, descartados:number}>}
 */
export async function fetchTraslados() {
  const data = await mondayQuery(`{
    boards(ids:[${BOARD_ID}]) {
      name
      groups {
        items_page(limit: 500) {
          items { name column_values { id text } }
        }
      }
    }
  }`);

  const board = data.boards?.[0];
  if (!board) throw new Error('Board de traslados no encontrado');

  const porEstado = new Map();
  let descartados = 0;

  for (const group of board.groups) {
    for (const item of group.items_page.items) {
      const cv     = Object.fromEntries(item.column_values.map(c => [c.id, c.text]));
      const muni   = String(item.name ?? '').trim();
      const estado = String(cv[COL_ESTADO] ?? '').trim();

      // El board trae filas placeholder ("Item 1"…"Item 5") sin estado.
      // Sin estado o sin municipio la fila no sirve para cotizar.
      if (!muni || !estado) { descartados++; continue; }

      const costos = {};
      for (const t of TIPOS_TRASLADO) costos[t.id] = num(cv[t.col]);

      if (!porEstado.has(estado)) porEstado.set(estado, new Map());
      const bucket = porEstado.get(estado);
      const clave  = muni.toLowerCase();
      if (bucket.has(clave)) continue;   // mismo municipio repetido en el board
      bucket.set(clave, { municipio: muni, proveedor: cv[COL_PROVEEDOR] ?? '', costos });
    }
  }

  const estados = [...porEstado.entries()]
    .map(([estado, m]) => ({
      estado,
      municipios: [...m.values()].sort((a, b) => a.municipio.localeCompare(b.municipio, 'es')),
    }))
    .sort((a, b) => a.estado.localeCompare(b.estado, 'es'));

  return { board: board.name, estados, descartados };
}

/** Costo de un traslado. @returns {number|null} null si no hay tarifa para esa combinación. */
export function costoTraslado(municipio, tipoId) {
  if (!municipio?.costos) return null;
  return municipio.costos[tipoId] ?? null;
}
