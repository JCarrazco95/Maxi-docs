import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/connection.js';
import { fillTemplate, generatePdf, wrapDocumentHtml } from '../services/pdfService.js';
import { uploadPdf, buildPdfKey } from '../services/storageService.js';

const router = Router();

// GET /api/documents/stats — resumen de KPIs por cuenta
router.get('/stats', async (req, res) => {
  const { accountId, userId, isAdmin } = req.mondayContext;

  const accountFilter = isAdmin
    ? `monday_account_id = $1`
    : `monday_account_id = $1 AND monday_user_id = $2`;
  const params = isAdmin ? [accountId] : [accountId, userId];

  const [counts, recent, byTemplate] = await Promise.all([
    query(
      `SELECT status, COUNT(*) AS count
       FROM documents WHERE ${accountFilter}
       GROUP BY status`,
      params
    ),
    query(
      `SELECT id, name, status, pdf_url, created_at, monday_item_id
       FROM documents WHERE ${accountFilter}
       ORDER BY created_at DESC LIMIT 5`,
      params
    ),
    query(
      `SELECT t.name AS template_name, COUNT(d.id) AS count
       FROM documents d
       LEFT JOIN templates t ON t.id = d.template_id
       WHERE ${accountFilter.replace(/\$(\d)/g, (_, n) => `$${n}`)}
       GROUP BY t.name
       ORDER BY count DESC LIMIT 5`,
      params
    ),
  ]);

  const statsMap = { draft: 0, sent: 0, signed: 0, rejected: 0 };
  counts.rows.forEach(r => { statsMap[r.status] = Number(r.count); });

  res.json({
    total:    Object.values(statsMap).reduce((a, b) => a + b, 0),
    ...statsMap,
    recent:   recent.rows,
    byTemplate: byTemplate.rows,
  });
});

// GET /api/documents — lista documentos filtrados por cuenta, usuario e item
// Los admins ven todos los documentos de la cuenta; usuarios normales solo los suyos
router.get('/', async (req, res) => {
  const { accountId, userId, isAdmin } = req.mondayContext;
  const { monday_item_id } = req.query;

  const conditions = ['monday_account_id = $1'];
  const params = [accountId];

  if (!isAdmin) {
    conditions.push(`monday_user_id = $${params.length + 1}`);
    params.push(userId);
  }

  if (monday_item_id) {
    conditions.push(`monday_item_id = $${params.length + 1}`);
    params.push(monday_item_id);
  }

  const result = await query(
    `SELECT id, name, template_id, monday_item_id, monday_user_id, status, pdf_url, created_at, updated_at
     FROM documents
     WHERE ${conditions.join(' AND ')}
     ORDER BY updated_at DESC`,
    params
  );
  res.json(result.rows);
});

// GET /api/documents/:id — detalle de un documento
router.get('/:id', async (req, res) => {
  const { accountId } = req.mondayContext;
  const result = await query(
    `SELECT d.*,
            json_agg(s.*) FILTER (WHERE s.id IS NOT NULL) AS signatures
     FROM documents d
     LEFT JOIN signatures s ON s.document_id = d.id
     WHERE d.id = $1 AND d.monday_account_id = $2
     GROUP BY d.id`,
    [req.params.id, accountId]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Document not found' });
  res.json(result.rows[0]);
});

// POST /api/documents/generate — genera un documento desde una plantilla + datos del item
router.post('/generate', async (req, res) => {
  const { accountId, userId } = req.mondayContext;  // userId se guarda en el documento
  const {
    template_id,
    name,
    monday_board_id,
    monday_item_id,
    filled_data = {},   // { nombre: 'Juan', empresa: 'Acme', ... }
  } = req.body;

  if (!template_id || !name) {
    return res.status(400).json({ error: 'template_id y name son requeridos' });
  }

  // 1. Obtener la plantilla
  const templateResult = await query(
    `SELECT * FROM templates WHERE id = $1 AND monday_account_id = $2`,
    [template_id, accountId]
  );
  const template = templateResult.rows[0];
  if (!template) return res.status(404).json({ error: 'Template not found' });

  // 2. Reemplazar variables en el HTML
  const filledHtml = fillTemplate(template.content_html, filled_data);
  const fullHtml = wrapDocumentHtml(filledHtml, name);

  // 3. Generar PDF con Puppeteer
  const pdfBuffer = await generatePdf(fullHtml);

  // 4. Subir PDF a Cloudflare R2
  const documentId = uuidv4();
  const pdfKey = buildPdfKey(documentId);
  const pdfUrl = await uploadPdf(pdfKey, pdfBuffer);

  // 5. Guardar documento en la base de datos
  const result = await query(
    `INSERT INTO documents
       (id, template_id, name, monday_board_id, monday_item_id, monday_account_id,
        monday_user_id, filled_data, content_html, pdf_url, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'draft')
     RETURNING *`,
    [
      documentId, template_id, name,
      monday_board_id, monday_item_id, accountId,
      userId, JSON.stringify(filled_data), filledHtml, pdfUrl,
    ]
  );

  res.status(201).json(result.rows[0]);
});

// DELETE /api/documents/:id
router.delete('/:id', async (req, res) => {
  const { accountId } = req.mondayContext;
  await query(
    `DELETE FROM documents WHERE id = $1 AND monday_account_id = $2`,
    [req.params.id, accountId]
  );
  res.status(204).end();
});

export default router;
