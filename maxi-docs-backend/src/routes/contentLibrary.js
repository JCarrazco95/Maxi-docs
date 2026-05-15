import { Router } from 'express';
import { query } from '../db/connection.js';
import { requireEditor } from '../middleware/mondayAuth.js';

const router = Router();

// GET /api/content-library — listar bloques del account
router.get('/', async (req, res) => {
  const { accountId } = req.mondayContext;
  const result = await query(
    `SELECT id, name, description, content_html, monday_user_id, created_at
     FROM content_blocks WHERE monday_account_id = $1 ORDER BY created_at DESC`,
    [accountId]
  );
  res.json(result.rows);
});

// POST /api/content-library — guardar un bloque nuevo
router.post('/', requireEditor, async (req, res) => {
  const { accountId, userId } = req.mondayContext;
  const { name, description, content_html } = req.body;

  if (!name?.trim() || !content_html?.trim()) {
    return res.status(400).json({ error: 'name y content_html son requeridos' });
  }

  const result = await query(
    `INSERT INTO content_blocks (name, description, content_html, monday_account_id, monday_user_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [name.trim(), description?.trim() || null, content_html.trim(), accountId, userId]
  );
  res.status(201).json(result.rows[0]);
});

// PUT /api/content-library/:id — actualizar nombre/descripción
router.put('/:id', requireEditor, async (req, res) => {
  const { accountId } = req.mondayContext;
  const { name, description } = req.body;
  const result = await query(
    `UPDATE content_blocks SET name = COALESCE($1, name), description = COALESCE($2, description)
     WHERE id = $3 AND monday_account_id = $4 RETURNING *`,
    [name?.trim() || null, description?.trim() || null, req.params.id, accountId]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Bloque no encontrado' });
  res.json(result.rows[0]);
});

// DELETE /api/content-library/:id — eliminar bloque
router.delete('/:id', requireEditor, async (req, res) => {
  const { accountId } = req.mondayContext;
  await query(
    `DELETE FROM content_blocks WHERE id = $1 AND monday_account_id = $2`,
    [req.params.id, accountId]
  );
  res.status(204).end();
});

export default router;
