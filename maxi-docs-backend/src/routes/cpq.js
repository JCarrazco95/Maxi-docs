/**
 * CPQ — Configure, Price, Quote
 * Motor de reglas de descuento configurable.
 * Reglas ejemplo: { condition: { field: "discount_pct", op: ">", value: 20 }, action: { type: "require_approval" } }
 */
import { Router } from 'express';
import { query } from '../db/connection.js';
import { requireEditor } from '../middleware/mondayAuth.js';

const router = Router();

// GET /api/cpq/rules — listar reglas de la cuenta
router.get('/rules', async (req, res) => {
  const { accountId } = req.mondayContext;
  const result = await query(
    `SELECT * FROM cpq_rules WHERE monday_account_id = $1 AND active = true ORDER BY created_at DESC`,
    [accountId]
  );
  res.json(result.rows);
});

// POST /api/cpq/rules — crear regla
router.post('/rules', requireEditor, async (req, res) => {
  const { accountId } = req.mondayContext;
  const { name, condition, action } = req.body;

  if (!name || !condition || !action) {
    return res.status(400).json({ error: 'name, condition y action son requeridos' });
  }

  const result = await query(
    `INSERT INTO cpq_rules (monday_account_id, name, condition, action) VALUES ($1, $2, $3, $4) RETURNING *`,
    [accountId, name, JSON.stringify(condition), JSON.stringify(action)]
  );
  res.status(201).json(result.rows[0]);
});

// PUT /api/cpq/rules/:id — actualizar regla
router.put('/rules/:id', requireEditor, async (req, res) => {
  const { accountId } = req.mondayContext;
  const { name, condition, action, active } = req.body;
  const result = await query(
    `UPDATE cpq_rules SET
       name      = COALESCE($1, name),
       condition = COALESCE($2::jsonb, condition),
       action    = COALESCE($3::jsonb, action),
       active    = COALESCE($4, active)
     WHERE id = $5 AND monday_account_id = $6 RETURNING *`,
    [name, condition ? JSON.stringify(condition) : null,
     action ? JSON.stringify(action) : null,
     active ?? null, req.params.id, accountId]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Regla no encontrada' });
  res.json(result.rows[0]);
});

// DELETE /api/cpq/rules/:id — eliminar regla
router.delete('/rules/:id', requireEditor, async (req, res) => {
  const { accountId } = req.mondayContext;
  await query(`DELETE FROM cpq_rules WHERE id = $1 AND monday_account_id = $2`, [req.params.id, accountId]);
  res.status(204).end();
});

// POST /api/cpq/evaluate — evaluar si las reglas aplican a un set de items del pricing table
router.post('/evaluate', async (req, res) => {
  const { accountId } = req.mondayContext;
  const { items, total_discount_pct } = req.body;

  const rulesRes = await query(
    `SELECT * FROM cpq_rules WHERE monday_account_id = $1 AND active = true`,
    [accountId]
  );

  const triggered = [];
  for (const rule of rulesRes.rows) {
    const cond   = rule.condition;
    const action = rule.action;
    let matches  = false;

    if (cond.field === 'discount_pct' && total_discount_pct != null) {
      const val = Number(total_discount_pct);
      if (cond.op === '>'  && val >  cond.value) matches = true;
      if (cond.op === '>=' && val >= cond.value) matches = true;
      if (cond.op === '<'  && val <  cond.value) matches = true;
      if (cond.op === '<=' && val <= cond.value) matches = true;
      if (cond.op === '='  && val === cond.value) matches = true;
    }

    if (cond.field === 'total_amount' && items?.length) {
      const total = items.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
      if (cond.op === '>'  && total >  cond.value) matches = true;
      if (cond.op === '>=' && total >= cond.value) matches = true;
      if (cond.op === '<'  && total <  cond.value) matches = true;
    }

    if (matches) triggered.push({ rule_id: rule.id, name: rule.name, action });
  }

  const requiresApproval = triggered.some(t => t.action.type === 'require_approval');
  const alerts           = triggered.filter(t => t.action.type === 'alert').map(t => t.action.message || t.name);

  res.json({ triggered, requiresApproval, alerts });
});

export default router;
