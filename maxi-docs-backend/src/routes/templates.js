import { Router } from 'express';
import { query } from '../db/connection.js';
import { extractVariables, generateThumbnail, wrapDocumentHtml } from '../services/pdfService.js';

// Genera thumbnail en background sin bloquear la respuesta
async function scheduleThumbnail(templateId, contentHtml) {
  try {
    const wrapped = wrapDocumentHtml(contentHtml, 'Plantilla')
    const url     = await generateThumbnail(wrapped, templateId)
    await query(`UPDATE templates SET thumbnail_url = $1 WHERE id = $2`, [url, templateId])
  } catch (e) {
    console.warn('[Thumbnail] Error generando thumbnail:', e.message)
  }
}

const router = Router();

// GET /api/templates — lista todas las plantillas de la cuenta
router.get('/', async (req, res) => {
  const { accountId } = req.mondayContext;
  const result = await query(
    `SELECT id, name, description, variables, thumbnail_url, created_at, updated_at
     FROM templates
     WHERE monday_account_id = $1
     ORDER BY updated_at DESC`,
    [accountId]
  );
  res.json(result.rows);
});

// GET /api/templates/:id — detalle de una plantilla
// Busca por ID primero (sin filtro de cuenta) para que funcione desde
// el editor en nueva pestaña donde el contexto de Monday puede variar
router.get('/:id', async (req, res) => {
  const { accountId, isAdmin } = req.mondayContext;
  const result = await query(
    `SELECT * FROM templates WHERE id = $1`,
    [req.params.id]
  );
  const tpl = result.rows[0];
  if (!tpl) return res.status(404).json({ error: 'Template not found' });
  // Verificar pertenencia solo para no-admin y cuando no es 'dev'
  if (!isAdmin && tpl.monday_account_id !== accountId && accountId !== 'dev') {
    return res.status(403).json({ error: 'Sin permiso para esta plantilla' });
  }
  res.json(tpl);
});

// POST /api/templates — crea una plantilla nueva
router.post('/', async (req, res) => {
  const { accountId, userId } = req.mondayContext;
  const { name, description = '', content_html } = req.body;

  if (!name || !content_html) {
    return res.status(400).json({ error: 'name y content_html son requeridos' });
  }

  const variables = extractVariables(content_html);

  const result = await query(
    `INSERT INTO templates (name, description, content_html, variables, monday_user_id, monday_account_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [name, description, content_html, JSON.stringify(variables), userId, accountId]
  );

  const tpl = result.rows[0]
  // Generar thumbnail en background (no bloquea la respuesta)
  scheduleThumbnail(tpl.id, content_html)
  res.status(201).json(tpl);
});

// PUT /api/templates/:id — actualiza una plantilla
router.put('/:id', async (req, res) => {
  const { accountId } = req.mondayContext;
  const { name, description, content_html } = req.body;

  const variables = content_html ? extractVariables(content_html) : undefined;

  const result = await query(
    `UPDATE templates
     SET name        = COALESCE($1, name),
         description = COALESCE($2, description),
         content_html= COALESCE($3, content_html),
         variables   = COALESCE($4, variables)
     WHERE id = $5 AND monday_account_id = $6
     RETURNING *`,
    [name, description, content_html, variables ? JSON.stringify(variables) : null, req.params.id, accountId]
  );

  if (!result.rows[0]) return res.status(404).json({ error: 'Template not found' });
  const tpl = result.rows[0]
  if (content_html) scheduleThumbnail(tpl.id, content_html)
  res.json(tpl);
});

// POST /api/templates/migrate-dev — copia las plantillas de 'dev' a la cuenta real
// Úsalo una sola vez para importar plantillas creadas en local a Monday.com
router.post('/migrate-dev', async (req, res) => {
  const { accountId, userId } = req.mondayContext;

  if (accountId === 'dev') {
    return res.status(400).json({ error: 'Ya estás en modo dev, conéctate desde Monday.com' });
  }

  // Buscar plantillas del account 'dev' que no existan ya en la cuenta real
  const devTemplates = await query(
    `SELECT * FROM templates WHERE monday_account_id = 'dev'`
  );

  if (devTemplates.rows.length === 0) {
    return res.json({ migrated: 0, message: 'No hay plantillas en dev para migrar' });
  }

  let migrated = 0, updated = 0;
  for (const tpl of devTemplates.rows) {
    const exists = await query(
      `SELECT id FROM templates WHERE name = $1 AND monday_account_id = $2`,
      [tpl.name, accountId]
    );

    if (exists.rows.length > 0) {
      // Actualizar si ya existe (fuerza reemplazo con la versión más reciente)
      await query(
        `UPDATE templates
         SET content_html = $1, description = $2, variables = $3, updated_at = NOW()
         WHERE name = $4 AND monday_account_id = $5`,
        [tpl.content_html, tpl.description, JSON.stringify(tpl.variables), tpl.name, accountId]
      );
      updated++;
    } else {
      await query(
        `INSERT INTO templates (name, description, content_html, variables, monday_user_id, monday_account_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [tpl.name, tpl.description, tpl.content_html, JSON.stringify(tpl.variables), userId, accountId]
      );
      migrated++;
    }
  }

  res.json({
    migrated,
    updated,
    message: `${migrated} nueva(s) y ${updated} actualizada(s) en tu cuenta`,
  });
});

// DELETE /api/templates/:id
router.delete('/:id', async (req, res) => {
  const { accountId } = req.mondayContext;
  await query(
    `DELETE FROM templates WHERE id = $1 AND monday_account_id = $2`,
    [req.params.id, accountId]
  );
  res.status(204).end();
});

export default router;
