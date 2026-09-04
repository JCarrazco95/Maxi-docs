import { Router } from 'express';
import { query } from '../db/connection.js';
import { extractVariables, generateThumbnail, wrapDocumentHtml } from '../services/pdfService.js';
import { SEED_TEMPLATES } from '../templates/seedTemplates.js';

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

// POST /api/templates/seed — crea o actualiza las plantillas oficiales (idempotente)
// Se llama en cada carga de la pestaña Plantillas, así que sobrescribe el
// contenido de las plantillas sembradas. El HTML vive en templates/seedTemplates.js.
router.post('/seed', async (req, res) => {
  const { accountId, userId } = req.mondayContext;

  // Renombrar v2 → sin v2 (arrastre de una versión vieja)
  await query(
    `UPDATE templates SET name = $1 WHERE monday_account_id = $2 AND name = 'Propuesta Comercial MAXIRent v2'`,
    ['Propuesta Comercial MAXIRent', accountId]
  ).catch(() => {});

  const results = [];

  for (const tpl of SEED_TEMPLATES) {
    // Eliminar duplicados de esta plantilla — dejar solo el más reciente
    await query(
      `DELETE FROM templates WHERE monday_account_id = $1 AND name = $2
       AND id NOT IN (
         SELECT id FROM templates WHERE monday_account_id = $1 AND name = $2
         ORDER BY created_at DESC LIMIT 1
       )`,
      [accountId, tpl.name]
    ).catch(() => {});

    const variables = extractVariables(tpl.content_html);

    const existing = await query(
      `SELECT id FROM templates WHERE monday_account_id = $1 AND name = $2`,
      [accountId, tpl.name]
    );

    let row;
    if (existing.rows.length > 0) {
      const upd = await query(
        `UPDATE templates SET content_html = $1, variables = $2, description = $3, updated_at = NOW()
         WHERE id = $4 RETURNING *`,
        [tpl.content_html, JSON.stringify(variables), tpl.description, existing.rows[0].id]
      );
      row = upd.rows[0];
    } else {
      const ins = await query(
        `INSERT INTO templates (name, description, content_html, variables, monday_user_id, monday_account_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [tpl.name, tpl.description, tpl.content_html, JSON.stringify(variables), userId, accountId]
      );
      row = ins.rows[0];
    }

    if (row) scheduleThumbnail(row.id, tpl.content_html);
    results.push({ name: tpl.name, id: row?.id });
  }

  res.json({ ok: true, templates: results, message: `${results.length} plantilla(s) actualizada(s)` });
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
