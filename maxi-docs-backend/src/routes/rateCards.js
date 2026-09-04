/**
 * Tabulador de tarifas — CRUD y seed.
 *
 * Las tarifas son diarias por placa antes de IVA. La tabla cambia cada
 * semestre, por eso vive en BD y se edita desde la pestaña Tabulador en vez
 * de estar hardcodeada.
 */
import { Router } from 'express';
import { query, getClient } from '../db/connection.js';
import { requireEditor } from '../middleware/mondayAuth.js';
import { getActiveRateCard, TRAMOS, boardGroupToTabulador } from '../services/rateCardService.js';
import { fetchCatalog, mondaySyncEnabled } from '../services/catalogService.js';

const router = Router();

// Tabulador Nuevos Negocios — Semestre 2 2026. Fuente: NN_Tarifas_S2_2026.xlsx
const SEED_CARD = {
  name:       'NN Tarifas S2 2026',
  valid_from: '2026-07-01',
  valid_to:   '2026-12-31',
  notes:      'Tarifa diaria por placa, MXN, antes de IVA. 1-3 y 4-6 meses llevan prima '
            + '(bloquean inventario a corto plazo); 7-12 meses lleva descuento real. '
            + '13+ meses, subarrendamientos y compras nuevas a solicitud del cliente no '
            + 'tienen tarifa de tabla — se cotizan con Dirección Comercial.',
};

// grupo, label sugerido, precio_hoy, 1-3, 4-6, 7-12
const SEED_ROWS = [
  ['DOB.C',           'Pick up doble cabina',  1071, 1230, 1120,  980],
  ['4X4',             'Pick up 4x4',           1205, 1390, 1270, 1210],
  ['SEDANES',         'Sedán',                  825,  950,  870,  800],
  ['COMPACTOS',       'Compacto',               678,  790,  720,  680],
  ['3.5CS',           'Camión 3.5 ton caja seca', 2052, 2360, 2160, 2000],
  ['SUV',             'Camioneta SUV',         1144, 1320, 1200, 1100],
  ['PANEL',           'Panel',                 1101, 1200, 1100, 1000],
  ['EST.C',           'Estacas',                794,  930,  850,  800],
  ['ECS',             'Estacas caja seca',      821,  950,  880,  840],
  ['EST.C REF',       'Estacas refrigerada',   1500, 1750, 1650, 1500],
  ['KANGOO',          'Kangoo',                 739,  850,  780,  720],
  ['HIACE',           'Hiace',                 1257, 1450, 1330, 1200],
  ['3.5RE',           'Camión 3.5 ton redilas', 1701, 1960, 1810, 1710],
  ['PROMA / CRAFTER', 'ProMaster / Crafter',   1917, 2200, 2100, 2000],
];

/**
 * Siembra "NN Tarifas S2 2026" para la cuenta. Idempotente: no pisa tarifas
 * ya editadas ni borra grupos que el usuario haya agregado.
 * @returns {Promise<string>} id del tabulador
 */
async function seedRateCard(accountId) {
  const existing = await query(
    `SELECT id FROM rate_cards WHERE monday_account_id = $1 AND name = $2`,
    [accountId, SEED_CARD.name]
  );

  let cardId;
  if (existing.rows.length > 0) {
    cardId = existing.rows[0].id;
    await query(
      `UPDATE rate_cards SET valid_from = $1, valid_to = $2, notes = $3 WHERE id = $4`,
      [SEED_CARD.valid_from, SEED_CARD.valid_to, SEED_CARD.notes, cardId]
    );
  } else {
    const ins = await query(
      `INSERT INTO rate_cards (monday_account_id, name, valid_from, valid_to, notes, active)
       VALUES ($1, $2, $3, $4, $5, true) RETURNING id`,
      [accountId, SEED_CARD.name, SEED_CARD.valid_from, SEED_CARD.valid_to, SEED_CARD.notes]
    );
    cardId = ins.rows[0].id;
  }

  let i = 0;
  for (const [grupo, label, hoy, t13, t46, t712] of SEED_ROWS) {
    await query(
      `INSERT INTO rate_card_rows
         (rate_card_id, grupo, label, precio_hoy, tramo_1_3, tramo_4_6, tramo_7_12, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (rate_card_id, grupo) DO NOTHING`,
      [cardId, grupo, label, hoy, t13, t46, t712, i++]
    );
  }
  return cardId;
}

// GET /api/rate-cards/tramos — catálogo de tramos (para poblar selects)
router.get('/tramos', (_req, res) => res.json(TRAMOS));

// GET /api/rate-cards/active — tabulador vigente + filas. Lo consume el editor.
// Auto-siembra si la cuenta no tiene ninguno: de lo contrario un vendedor que
// abre un documento antes de que un admin visite la pestaña Tabulador se
// encontraría los selects vacíos y sin forma de arreglarlo él mismo.
router.get('/active', async (req, res) => {
  const { accountId } = req.mondayContext;
  let active = await getActiveRateCard(accountId);
  if (!active) {
    const any = await query(
      `SELECT 1 FROM rate_cards WHERE monday_account_id = $1 LIMIT 1`,
      [accountId]
    );
    // Solo sembrar si nunca hubo tabulador. Si existe pero está inactivo, es
    // una decisión deliberada del admin y no la revertimos.
    if (any.rows.length === 0) {
      await seedRateCard(accountId).catch(e =>
        console.warn('[RateCards] auto-seed falló:', e.message));
      active = await getActiveRateCard(accountId);
    }
  }
  if (!active) return res.json({ card: null, rows: [], tramos: TRAMOS });
  res.json({ ...active, tramos: TRAMOS });
});

// GET /api/rate-cards/units — unidades del catálogo, agrupadas por grupo del
// tabulador. Es lo que llena el dropdown de UNIDADES PROPUESTAS: el ejecutivo
// elige una unidad y el grupo (y por tanto la tarifa) se deduce solo.
//
// Nunca falla el request: si Monday no está configurado o la API se cae,
// devuelve grupos vacíos y el editor cae a captura manual.
router.get('/units', async (req, res) => {
  const { accountId } = req.mondayContext;

  const active = await getActiveRateCard(accountId);
  const grupos = (active?.rows ?? []).map(r => r.grupo);

  if (!mondaySyncEnabled()) {
    return res.json({ source: 'none', grupos: [], sinMapeo: [], grupos_tabulador: grupos });
  }

  try {
    const catalogo = await fetchCatalog();
    const porGrupo = new Map();   // grupo del tabulador → Map(nombre → unidad)
    const sinMapeo = [];

    for (const cat of catalogo.categories) {
      const grupo = boardGroupToTabulador(cat.name, grupos);
      if (!grupo) { sinMapeo.push(cat.name); continue; }

      if (!porGrupo.has(grupo)) porGrupo.set(grupo, new Map());
      const bucket = porGrupo.get(grupo);
      for (const p of cat.products) {
        const nombre = String(p.name ?? '').trim();
        if (!nombre) continue;
        // El board repite el mismo modelo con precios distintos (p. ej. tres
        // "Corolla") y a veces con distinta capitalización ("Hino 3.5 Redilas"
        // y "Hino 3.5 redilas"). Aquí el precio lo pone el tabulador, así que
        // esas filas son indistinguibles: se deduplica ignorando mayúsculas
        // para no ofrecer opciones que al ejecutivo le parecen idénticas.
        const clave = nombre.toLowerCase();
        if (bucket.has(clave)) continue;
        bucket.set(clave, { name: nombre, sku: p.sku ?? '' });
      }
    }

    res.json({
      source: 'monday',
      board:  catalogo.boardName,
      grupos: [...porGrupo.entries()]
        .map(([grupo, m]) => ({ grupo, unidades: [...m.values()] }))
        // Mismo orden que el tabulador, para que el dropdown sea predecible
        .sort((a, b) => grupos.indexOf(a.grupo) - grupos.indexOf(b.grupo)),
      sinMapeo,
      grupos_tabulador: grupos,
    });
  } catch (e) {
    console.warn('[RateCards] no se pudo leer el catálogo de Monday:', e.message);
    res.json({ source: 'error', grupos: [], sinMapeo: [], grupos_tabulador: grupos, error: e.message });
  }
});

// GET /api/rate-cards — lista de tabuladores de la cuenta
router.get('/', async (req, res) => {
  const { accountId } = req.mondayContext;
  const result = await query(
    `SELECT c.*, COUNT(r.id)::int AS row_count
     FROM rate_cards c
     LEFT JOIN rate_card_rows r ON r.rate_card_id = c.id
     WHERE c.monday_account_id = $1
     GROUP BY c.id
     ORDER BY c.active DESC, c.valid_from DESC NULLS LAST, c.created_at DESC`,
    [accountId]
  );
  res.json(result.rows);
});

// GET /api/rate-cards/:id — un tabulador con sus filas
router.get('/:id', async (req, res) => {
  const { accountId } = req.mondayContext;
  const cardRes = await query(
    `SELECT * FROM rate_cards WHERE id = $1 AND monday_account_id = $2`,
    [req.params.id, accountId]
  );
  const card = cardRes.rows[0];
  if (!card) return res.status(404).json({ error: 'Tabulador no encontrado' });

  const rowsRes = await query(
    `SELECT * FROM rate_card_rows WHERE rate_card_id = $1 ORDER BY sort_order, grupo`,
    [card.id]
  );
  res.json({ card, rows: rowsRes.rows, tramos: TRAMOS });
});

// POST /api/rate-cards/seed — siembra "NN Tarifas S2 2026" (idempotente)
router.post('/seed', async (req, res) => {
  const { accountId } = req.mondayContext;
  const cardId = await seedRateCard(accountId);
  const active = await getActiveRateCard(accountId);
  res.json({ ok: true, card_id: cardId, rows: active?.rows.length ?? 0 });
});

// POST /api/rate-cards — crear tabulador nuevo (p. ej. S1 2027)
router.post('/', requireEditor, async (req, res) => {
  const { accountId } = req.mondayContext;
  const { name, valid_from = null, valid_to = null, notes = '', active = true } = req.body;

  if (!name) return res.status(400).json({ error: 'name es requerido' });

  // Solo un tabulador activo por cuenta — el editor lee siempre el vigente
  if (active) {
    await query(
      `UPDATE rate_cards SET active = false WHERE monday_account_id = $1`,
      [accountId]
    );
  }

  const result = await query(
    `INSERT INTO rate_cards (monday_account_id, name, valid_from, valid_to, notes, active)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [accountId, name, valid_from, valid_to, notes, active]
  );
  res.status(201).json(result.rows[0]);
});

// PUT /api/rate-cards/:id — nombre, vigencia, notas, activo
router.put('/:id', requireEditor, async (req, res) => {
  const { accountId } = req.mondayContext;
  const { name, valid_from, valid_to, notes, active } = req.body;

  if (active === true) {
    await query(
      `UPDATE rate_cards SET active = false WHERE monday_account_id = $1 AND id <> $2`,
      [accountId, req.params.id]
    );
  }

  const result = await query(
    `UPDATE rate_cards SET
       name       = COALESCE($1, name),
       valid_from = COALESCE($2, valid_from),
       valid_to   = COALESCE($3, valid_to),
       notes      = COALESCE($4, notes),
       active     = COALESCE($5, active)
     WHERE id = $6 AND monday_account_id = $7
     RETURNING *`,
    [name ?? null, valid_from ?? null, valid_to ?? null, notes ?? null,
     active ?? null, req.params.id, accountId]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Tabulador no encontrado' });
  res.json(result.rows[0]);
});

// PUT /api/rate-cards/:id/rows — reemplazo masivo de filas, en transacción
router.put('/:id/rows', requireEditor, async (req, res) => {
  const { accountId } = req.mondayContext;
  const { rows } = req.body;

  if (!Array.isArray(rows)) {
    return res.status(400).json({ error: 'rows debe ser un arreglo' });
  }

  const owned = await query(
    `SELECT id FROM rate_cards WHERE id = $1 AND monday_account_id = $2`,
    [req.params.id, accountId]
  );
  if (!owned.rows[0]) return res.status(404).json({ error: 'Tabulador no encontrado' });

  const clean = rows
    .filter(r => (r.grupo ?? '').trim())
    .map((r, i) => [
      req.params.id,
      String(r.grupo).trim(),
      r.label ?? null,
      r.precio_hoy ?? null,
      r.tramo_1_3 ?? null,
      r.tramo_4_6 ?? null,
      r.tramo_7_12 ?? null,
      r.sort_order ?? i,
    ]);

  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM rate_card_rows WHERE rate_card_id = $1`, [req.params.id]);
    for (const values of clean) {
      await client.query(
        `INSERT INTO rate_card_rows
           (rate_card_id, grupo, label, precio_hoy, tramo_1_3, tramo_4_6, tramo_7_12, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        values
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  const rowsRes = await query(
    `SELECT * FROM rate_card_rows WHERE rate_card_id = $1 ORDER BY sort_order, grupo`,
    [req.params.id]
  );
  res.json({ rows: rowsRes.rows });
});

// DELETE /api/rate-cards/:id
router.delete('/:id', requireEditor, async (req, res) => {
  const { accountId } = req.mondayContext;
  await query(
    `DELETE FROM rate_cards WHERE id = $1 AND monday_account_id = $2`,
    [req.params.id, accountId]
  );
  res.status(204).end();
});

export default router;
