/**
 * rateCard — espejo en el frontend de maxi-docs-backend/src/services/rateCardService.js
 *
 * Backend y frontend son paquetes npm separados y no comparten módulos, así
 * que TRAMOS / rateFor / monthlyFrom viven duplicados a propósito. Los dos
 * archivos se cambian juntos o el editor y el PDF empiezan a discrepar.
 */

/** Días que se facturan por mes. Convención existente en todo el proyecto. */
export const DAYS_PER_MONTH = 30

export const TRAMOS = [
  { id: '1-3',  label: '1 a 3 meses',  col: 'tramo_1_3'  },
  { id: '4-6',  label: '4 a 6 meses',  col: 'tramo_4_6'  },
  { id: '7-12', label: '7 a 12 meses', col: 'tramo_7_12' },
  { id: '13+',  label: '13+ meses',    col: null         },
]

export const TRAMO_ORDER = TRAMOS.map(t => t.id)

export function tramoById(tramoId) {
  return TRAMOS.find(t => t.id === tramoId) ?? null
}

/** @returns {number|null} null si el tramo no tiene tarifa de tabla (13+). */
export function rateFor(row, tramoId) {
  const tramo = tramoById(tramoId)
  if (!row || !tramo || !tramo.col) return null
  const raw = row[tramo.col]
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function monthlyFrom(dailyRate, qty = 1) {
  return (Number(dailyRate) || 0) * DAYS_PER_MONTH * (Number(qty) || 1)
}

// Espejo del puente board ↔ tabulador (ver rateCardService.js).
export const GRUPOS_NO_TARIFABLES = new Set(['ACCESORIOS', 'VARIOS'])
export const GRUPO_ALIAS = { PASAJEROS: 'HIACE' }

/** Ignora mayúsculas y espacios: "3.5 CS" y "3.5CS" son el mismo grupo. */
export function normalizeGrupo(s) {
  return String(s ?? '').toUpperCase().replace(/\s+/g, '')
}

export function boardGroupToTabulador(boardGroup, gruposTabulador) {
  const raw = String(boardGroup ?? '').trim()
  if (!raw || GRUPOS_NO_TARIFABLES.has(raw.toUpperCase())) return null
  const objetivo = GRUPO_ALIAS[raw.toUpperCase()] ?? raw
  const porNorma = new Map(gruposTabulador.map(g => [normalizeGrupo(g), g]))
  return porNorma.get(normalizeGrupo(objetivo)) ?? null
}

/** El tramo más corto presente — el "plazo mínimo" del hero. */
export function minTramo(tramoIds) {
  let best = null
  for (const id of tramoIds) {
    const i = TRAMO_ORDER.indexOf(id)
    if (i < 0) continue
    if (best === null || i < TRAMO_ORDER.indexOf(best)) best = id
  }
  return best
}
