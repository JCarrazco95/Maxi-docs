/**
 * rateCardService — Tabulador de tarifas por plazo.
 *
 * Las tarifas del tabulador son DIARIAS por placa, antes de IVA. La
 * mensualidad se deriva siempre con monthlyFrom() — es el punto único de
 * verdad de esa fórmula, para que el editor, el PDF y las columnas de Monday
 * no puedan discrepar.
 *
 * ⚠️ panda-monday/src/shared/rateCard.js es el espejo de TRAMOS / rateFor /
 * monthlyFrom en el frontend (son paquetes npm separados, no comparten
 * módulos). Los dos archivos se cambian juntos o se rompe la paridad.
 */
import { query } from '../db/connection.js';

/** Días que se facturan por mes. Convención existente en todo el proyecto. */
export const DAYS_PER_MONTH = 30;

/**
 * Tramos de plazo del tabulador. `col` es la columna de rate_card_rows;
 * null significa que ese tramo no tiene tarifa de tabla.
 */
export const TRAMOS = [
  { id: '1-3',  label: '1 a 3 meses',  col: 'tramo_1_3'  },
  { id: '4-6',  label: '4 a 6 meses',  col: 'tramo_4_6'  },
  { id: '7-12', label: '7 a 12 meses', col: 'tramo_7_12' },
  { id: '13+',  label: '13+ meses',    col: null         },
];

/** Orden de menor a mayor plazo — para derivar el "plazo mínimo" del hero. */
export const TRAMO_ORDER = TRAMOS.map(t => t.id);

export function tramoById(tramoId) {
  return TRAMOS.find(t => t.id === tramoId) ?? null;
}

/**
 * Tarifa diaria de tabla para un grupo en un tramo.
 * @returns {number|null} null si el tramo no tiene tarifa de tabla (13+) o
 *                        si la fila no trae valor para ese tramo.
 */
export function rateFor(row, tramoId) {
  const tramo = tramoById(tramoId);
  if (!row || !tramo || !tramo.col) return null;
  const raw = row[tramo.col];
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Mensualidad sin IVA a partir de la tarifa diaria. */
export function monthlyFrom(dailyRate, qty = 1) {
  return (Number(dailyRate) || 0) * DAYS_PER_MONTH * (Number(qty) || 1);
}

/**
 * El tramo más corto presente en un conjunto de filas — el "plazo mínimo"
 * que se muestra en el hero de la propuesta.
 * @returns {string|null} el id del tramo, o null si ninguna fila trae tramo.
 */
export function minTramo(tramoIds) {
  let best = null;
  for (const id of tramoIds) {
    const i = TRAMO_ORDER.indexOf(id);
    if (i < 0) continue;
    if (best === null || i < TRAMO_ORDER.indexOf(best)) best = id;
  }
  return best;
}

// ── Puente entre el board de catálogo de Monday y el tabulador ──────
//
// Los grupos del board y los del tabulador casi coinciden, pero no del todo.
// Nueve son idénticos; "3.5 CS" y "3.5 RE" solo difieren en un espacio, y
// "PASAJEROS" es como el board llama al grupo que el tabulador llama "HIACE"
// (sus unidades son Hiace 12 y 15 pasajeros).

/** Grupos del board que no cotizan con el tabulador. */
export const GRUPOS_NO_TARIFABLES = new Set([
  'ACCESORIOS', // insumos y adecuaciones — van en COSTOS ADICIONALES / ADECUACIONES
  'VARIOS',     // cajón de sastre sin tarifa definida; sus items traen precio 0
]);

/** Nombres del board que no coinciden por normalización y necesitan traducción. */
export const GRUPO_ALIAS = {
  PASAJEROS: 'HIACE',
};

/** Ignora mayúsculas y espacios: "3.5 CS" y "3.5CS" son el mismo grupo. */
export function normalizeGrupo(s) {
  return String(s ?? '').toUpperCase().replace(/\s+/g, '');
}

/**
 * Traduce un grupo del board de Monday al grupo del tabulador.
 * @param {string}   boardGroup      título del grupo en el board
 * @param {string[]} gruposTabulador grupos existentes en el tabulador
 * @returns {string|null} el grupo del tabulador, o null si no cotiza con tabla
 */
export function boardGroupToTabulador(boardGroup, gruposTabulador) {
  const raw = String(boardGroup ?? '').trim();
  if (!raw || GRUPOS_NO_TARIFABLES.has(raw.toUpperCase())) return null;

  const objetivo = GRUPO_ALIAS[raw.toUpperCase()] ?? raw;
  const porNorma = new Map(gruposTabulador.map(g => [normalizeGrupo(g), g]));
  return porNorma.get(normalizeGrupo(objetivo)) ?? null;
}

/**
 * Tabulador activo de la cuenta, con sus filas ordenadas.
 * @returns {Promise<{card: object, rows: object[]}|null>}
 */
export async function getActiveRateCard(accountId) {
  const cardRes = await query(
    `SELECT * FROM rate_cards
     WHERE monday_account_id = $1 AND active = true
     ORDER BY valid_from DESC NULLS LAST, created_at DESC
     LIMIT 1`,
    [accountId]
  );
  const card = cardRes.rows[0];
  if (!card) return null;

  const rowsRes = await query(
    `SELECT * FROM rate_card_rows WHERE rate_card_id = $1 ORDER BY sort_order, grupo`,
    [card.id]
  );
  return { card, rows: rowsRes.rows };
}
