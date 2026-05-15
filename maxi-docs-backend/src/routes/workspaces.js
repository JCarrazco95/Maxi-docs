import { Router } from 'express';
import { query } from '../db/connection.js';
import { requireEditor } from '../middleware/mondayAuth.js';

const router = Router();

// Obtiene o crea el workspace default de la cuenta (garantiza que siempre exista uno)
async function ensureDefaultWorkspace(accountId, userId) {
  const existing = await query(
    `SELECT id FROM workspaces WHERE monday_account_id = $1 AND is_default = true LIMIT 1`,
    [accountId]
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const created = await query(
    `INSERT INTO workspaces (monday_account_id, name, slug, is_default, created_by)
     VALUES ($1, 'Principal', 'principal', true, $2) RETURNING id`,
    [accountId, userId]
  );
  return created.rows[0].id;
}

// GET /api/workspaces — listar workspaces de la cuenta
router.get('/', async (req, res) => {
  const { accountId, userId } = req.mondayContext;

  // Auto-crear workspace default si no existe
  await ensureDefaultWorkspace(accountId, userId);

  const result = await query(
    `SELECT w.*,
       (SELECT COUNT(*) FROM documents  d WHERE d.workspace_id = w.id) AS doc_count,
       (SELECT COUNT(*) FROM templates  t WHERE t.workspace_id = w.id) AS tpl_count
     FROM workspaces w
     WHERE w.monday_account_id = $1
     ORDER BY w.is_default DESC, w.created_at ASC`,
    [accountId]
  );
  res.json(result.rows);
});

// POST /api/workspaces — crear workspace
router.post('/', requireEditor, async (req, res) => {
  const { accountId, userId } = req.mondayContext;
  const { name, description } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name es requerido' });

  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  const result = await query(
    `INSERT INTO workspaces (monday_account_id, name, slug, description, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [accountId, name.trim(), slug, description?.trim() || null, userId]
  );
  res.status(201).json(result.rows[0]);
});

// PUT /api/workspaces/:id — renombrar workspace
router.put('/:id', requireEditor, async (req, res) => {
  const { accountId } = req.mondayContext;
  const { name, description } = req.body;

  const result = await query(
    `UPDATE workspaces SET
       name        = COALESCE($1, name),
       description = COALESCE($2, description)
     WHERE id = $3 AND monday_account_id = $4 RETURNING *`,
    [name?.trim() || null, description?.trim() || null, req.params.id, accountId]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Workspace no encontrado' });
  res.json(result.rows[0]);
});

// DELETE /api/workspaces/:id — eliminar workspace (no se puede eliminar el default)
router.delete('/:id', requireEditor, async (req, res) => {
  const { accountId } = req.mondayContext;

  const ws = await query(`SELECT * FROM workspaces WHERE id = $1 AND monday_account_id = $2`, [req.params.id, accountId]);
  if (!ws.rows[0]) return res.status(404).json({ error: 'Workspace no encontrado' });
  if (ws.rows[0].is_default) return res.status(400).json({ error: 'No se puede eliminar el workspace principal' });

  // Mover docs y templates al workspace default antes de eliminar
  const defaultWs = await query(`SELECT id FROM workspaces WHERE monday_account_id = $1 AND is_default = true`, [accountId]);
  const defaultId = defaultWs.rows[0]?.id;
  if (defaultId) {
    await query(`UPDATE documents SET workspace_id = $1 WHERE workspace_id = $2`, [defaultId, req.params.id]);
    await query(`UPDATE templates  SET workspace_id = $1 WHERE workspace_id = $2`, [defaultId, req.params.id]);
  }

  await query(`DELETE FROM workspaces WHERE id = $1`, [req.params.id]);
  res.status(204).end();
});

// POST /api/workspaces/:id/move-document — mover documento a otro workspace
router.post('/:id/move-document', requireEditor, async (req, res) => {
  const { document_id } = req.body;
  if (!document_id) return res.status(400).json({ error: 'document_id es requerido' });

  await query(`UPDATE documents SET workspace_id = $1 WHERE id = $2`, [req.params.id, document_id]);
  res.json({ ok: true });
});

export { ensureDefaultWorkspace };
export default router;
