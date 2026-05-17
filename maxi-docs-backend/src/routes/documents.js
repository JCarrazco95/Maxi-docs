import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/connection.js';
import { fillTemplate, generatePdf, wrapDocumentHtml, processPricingTableNodes } from '../services/pdfService.js';
import { uploadPdf, buildPdfKey } from '../services/storageService.js';
import { buildPricingTableHtml } from '../services/catalogService.js';
import { requireEditor } from '../middleware/mondayAuth.js';
import { logEvent, hashPdfFile } from '../services/auditService.js';

const router = Router();

const MONDAY_COTIZACIONES_BOARD = '18413534550';
const MONDAY_COTIZACIONES_GROUP = 'group_mm3ep2rx';

// Columnas del board de cotizaciones
const COL_CLIENTE       = 'text_mm3e1jhd';
const COL_MONTO_TOTAL   = 'numeric_mm3etbvx';
const COL_FECHA_EMISION = 'date_mm3ett0s';
const COL_ESTADO        = 'color_mm3e5383';
const COL_RESPONSABLE   = 'multiple_person_mm3ekbxy';
const COL_PDF           = 'file_mm3ermnh';

// Extrae el total de todas las tablas de precios en el HTML
function extractPricingTotal(html) {
  if (!html) return 0;
  let total = 0;
  const re = /<pricing-table([^>]*)>/g;
  let m;
  let subtotalTarifas = 0;
  let subtotalAcc     = 0;

  while ((m = re.exec(html)) !== null) {
    const attrs     = m[1];
    const typeMatch = attrs.match(/data-table-type="([^"]*)"/);
    const b64Match  = attrs.match(/data-items-b64="([^"]*)"/);
    if (!b64Match || !typeMatch) continue;
    const tableType = typeMatch[1];
    try {
      const items = JSON.parse(Buffer.from(b64Match[1], 'base64').toString('utf8'));
      for (const i of items) {
        const qty = Number(i.quantity) || 1;
        if (tableType === 'tarifas') {
          const mensual   = (Number(i.dailyRate) || 0) * 30 * qty;
          const deduc     = (Number(i.deductible) || 0) / 100;
          const delivery  = Number(i.delivery)  || 0;
          const retrieval = Number(i.retrieval) || 0;
          subtotalTarifas += mensual * (1 + deduc) + delivery + retrieval;
        } else if (tableType === 'accesorios') {
          subtotalAcc += (Number(i.price) || 0) * qty;
        }
      }
    } catch { /* ignorar items corruptos */ }
  }

  // Total = (tarifas + adecuaciones) + 16% IVA
  total = (subtotalTarifas + subtotalAcc) * 1.16;
  return Math.round(total);
}

async function createMondayDocItem({ docNumber, docName, clientName, totalAmount, html, mondayUserId }) {
  const token = process.env.MONDAY_API_TOKEN;
  if (!token) return null;
  try {
    const itemName  = `${docNumber} | ${docName}`;
    const today     = new Date().toISOString().split('T')[0];
    const computed  = totalAmount ?? extractPricingTotal(html);
    const client    = clientName ?? '';

    const colValues = {
      [COL_CLIENTE]:       client,
      [COL_MONTO_TOTAL]:   String(computed),
      [COL_FECHA_EMISION]: { date: today },
      [COL_ESTADO]:        { label: 'En Revisión' },
    };

    if (mondayUserId && mondayUserId !== 'dev') {
      colValues[COL_RESPONSABLE] = { personsAndTeams: [{ id: Number(mondayUserId), kind: 'person' }] };
    }

    const mutation = `
      mutation {
        create_item(
          board_id: ${MONDAY_COTIZACIONES_BOARD},
          group_id: "${MONDAY_COTIZACIONES_GROUP}",
          item_name: ${JSON.stringify(itemName)},
          column_values: ${JSON.stringify(JSON.stringify(colValues))}
        ) { id }
      }
    `;
    const res = await fetch('https://api.monday.com/v2', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token },
      body:    JSON.stringify({ query: mutation }),
    });
    const data = await res.json();
    if (data.errors?.length) throw new Error(data.errors[0].message);
    const mondayItemId = data?.data?.create_item?.id ?? null;
    console.log(`[Monday] Item creado: ${mondayItemId} — ${itemName} | Cliente: ${client} | Total: $${computed}`);
    return mondayItemId;
  } catch (e) {
    console.warn('[Monday] No se pudo crear item:', e.message);
    return null;
  }
}

async function uploadPdfToMondayItem(itemId, pdfBuffer, docNumber) {
  const token = process.env.MONDAY_API_TOKEN;
  if (!token || !itemId || !pdfBuffer) return;
  try {
    const filename = `cotizacion-${docNumber}.pdf`;
    const query    = `mutation ($file: File!) { add_file_to_column(item_id: ${itemId}, column_id: "${COL_PDF}", file: $file) { id } }`;
    const formData = new FormData();
    formData.append('query', query);
    formData.append('variables[file]', new Blob([pdfBuffer], { type: 'application/pdf' }), filename);
    const res = await fetch('https://api.monday.com/v2/file', {
      method:  'POST',
      headers: { Authorization: token },
      body:    formData,
    });
    const data = await res.json();
    if (data.errors?.length) throw new Error(data.errors[0].message);
    console.log(`[Monday] PDF subido al item ${itemId}`);
  } catch (e) {
    console.warn('[Monday] No se pudo subir PDF:', e.message);
  }
}

// POST /api/documents/preview — renderizar HTML del documento sin generar PDF
// Expande <pricing-table> y aplica el wrapper CSS para mostrar en iframe
router.post('/preview', (req, res) => {
  const { content_html, title = 'Vista previa' } = req.body;
  if (!content_html) return res.status(400).json({ error: 'content_html requerido' });
  const processed = processPricingTableNodes(content_html);
  const wrapped   = wrapDocumentHtml(processed, title);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(wrapped);
});

// GET /api/documents/stats — resumen de KPIs por cuenta
router.get('/stats', async (req, res) => {
  const { accountId, userId, isAdmin } = req.mondayContext;
  const { monday_item_id } = req.query;

  const itemCond   = monday_item_id ? ` AND monday_item_id = '${monday_item_id}'` : '';
  const itemCondD  = monday_item_id ? ` AND d.monday_item_id = '${monday_item_id}'` : '';

  const docFilter = isAdmin
    ? `d.monday_account_id = $1${itemCondD}`
    : `d.monday_account_id = $1 AND d.monday_user_id = $2${itemCondD}`;
  const simpleFilter = isAdmin
    ? `monday_account_id = $1${itemCond}`
    : `monday_account_id = $1 AND monday_user_id = $2${itemCond}`;
  const params = isAdmin ? [accountId] : [accountId, userId];

  const [counts, recent, byTemplate, timingRow, overdueRow, periodRows] = await Promise.all([
    query(`SELECT status, COUNT(*) AS count FROM documents WHERE ${simpleFilter} GROUP BY status`, params),

    query(`SELECT id, name, status, pdf_url, created_at, monday_item_id FROM documents WHERE ${simpleFilter} ORDER BY created_at DESC LIMIT 5`, params),

    // byTemplate usa alias d. para evitar ambigüedad con el JOIN
    query(
      `SELECT t.name AS template_name, COUNT(d.id) AS count
       FROM documents d LEFT JOIN templates t ON t.id = d.template_id
       WHERE ${docFilter} GROUP BY t.name ORDER BY count DESC LIMIT 5`,
      params
    ),

    // timingRow: JOIN con signatures — usa alias d.
    query(
      `SELECT ROUND(AVG(EXTRACT(EPOCH FROM (s.signed_at - d.created_at)) / 86400), 1) AS avg_days
       FROM documents d JOIN signatures s ON s.document_id = d.id
       WHERE ${docFilter} AND s.status = 'signed' AND s.signed_at IS NOT NULL`,
      params
    ),

    query(
      `SELECT COUNT(*) AS count FROM documents
       WHERE ${simpleFilter} AND status = 'sent'
       AND created_at < NOW() - INTERVAL '7 days'`,
      params
    ),

    query(
      `SELECT DATE_TRUNC('week', created_at) AS week, COUNT(*) AS count
       FROM documents WHERE ${simpleFilter}
       AND created_at > NOW() - INTERVAL '30 days'
       GROUP BY week ORDER BY week`,
      params
    ),
  ]);

  const statsMap = { draft: 0, sent: 0, signed: 0, rejected: 0 };
  counts.rows.forEach(r => { statsMap[r.status] = Number(r.count); });

  res.json({
    total:       Object.values(statsMap).reduce((a, b) => a + b, 0),
    ...statsMap,
    avgSigningDays: timingRow.rows[0]?.avg_days ? Number(timingRow.rows[0].avg_days) : null,
    overdue:        Number(overdueRow.rows[0]?.count ?? 0),
    recent:         recent.rows,
    byTemplate:     byTemplate.rows,
    byWeek:         periodRows.rows.map(r => ({
      week:  new Date(r.week).toLocaleDateString('es', { day: '2-digit', month: 'short' }),
      count: Number(r.count),
    })),
  });
});

// GET /api/documents/export — descarga CSV con historial completo
router.get('/export', async (req, res) => {
  const { accountId, userId, isAdmin } = req.mondayContext;
  const accountFilter = isAdmin
    ? `d.monday_account_id = $1`
    : `d.monday_account_id = $1 AND d.monday_user_id = $2`;
  const params = isAdmin ? [accountId] : [accountId, userId];

  const result = await query(
    `SELECT d.name AS documento,
            t.name AS plantilla,
            d.status AS estado,
            d.monday_item_id AS item_monday,
            d.created_at AS fecha_creacion,
            d.pdf_url,
            STRING_AGG(s.signer_name || ' <' || s.signer_email || '> [' || s.status || ']', '; ') AS firmantes
     FROM documents d
     LEFT JOIN templates t ON t.id = d.template_id
     LEFT JOIN signatures s ON s.document_id = d.id
     WHERE ${accountFilter}
     GROUP BY d.id, t.name
     ORDER BY d.created_at DESC`,
    params
  );

  const statusLabel = { draft: 'Borrador', sent: 'Enviado', signed: 'Firmado', rejected: 'Rechazado' };
  const rows = result.rows;

  // Construir CSV
  const headers = ['Documento', 'Plantilla', 'Estado', 'Item Monday', 'Fecha', 'PDF', 'Firmantes'];
  const lines = [
    headers.join(','),
    ...rows.map(r => [
      `"${(r.documento ?? '').replace(/"/g, '""')}"`,
      `"${(r.plantilla ?? '').replace(/"/g, '""')}"`,
      `"${statusLabel[r.estado] ?? r.estado}"`,
      `"${r.item_monday ?? ''}"`,
      `"${new Date(r.fecha_creacion).toLocaleString('es')}"`,
      `"${r.pdf_url ?? ''}"`,
      `"${(r.firmantes ?? '').replace(/"/g, '""')}"`,
    ].join(','))
  ];

  const csv = '﻿' + lines.join('\r\n'); // BOM para Excel
  const filename = `maxi-docs-${new Date().toISOString().split('T')[0]}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
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
    `SELECT id, name, doc_number, template_id, monday_item_id, monday_user_id,
            owner_name, owner_email, status, pdf_url, created_at, updated_at
     FROM documents
     WHERE ${conditions.join(' AND ')}
     ORDER BY updated_at DESC`,
    params
  );
  res.json(result.rows);
});

// GET /api/documents/:id/pdf — sirve el PDF desde PostgreSQL
router.get('/:id/pdf', async (req, res) => {
  const result = await query(
    `SELECT name, signed_pdf_content, pdf_content FROM documents WHERE id = $1`,
    [req.params.id]
  );
  const doc = result.rows[0];
  if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });

  const content = doc.signed_pdf_content || doc.pdf_content;
  if (!content) return res.status(404).send('PDF no disponible aún');

  const filename = `${(doc.name || 'documento').replace(/[^a-z0-9]/gi, '_')}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(content);
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
// Acepta dos modos:
//   a) Clásico: template_id + filled_data → el backend llena las variables
//   b) Editor:  content_html             → HTML ya editado en el editor del cliente
router.post('/generate', requireEditor, async (req, res) => {
  const { accountId, userId } = req.mondayContext;
  const {
    template_id,
    name,
    monday_board_id,
    monday_item_id,
    filled_data = {},
    catalog_items = [],
    catalog_iva = 16,
    content_html,
    owner_email,
    owner_name,     // Nombre del vendedor — se muestra en la lista de documentos
  } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'name es requerido' });
  }
  if (!template_id && !content_html) {
    return res.status(400).json({ error: 'Se requiere template_id o content_html' });
  }

  let filledHtml;

  if (content_html) {
    // Modo editor: el HTML ya viene con variables reemplazadas desde el cliente.
    // fillTemplate solo procesará los nodos <pricing-table> y cualquier {{variable}}
    // que el usuario haya dejado sin llenar (se blanquea).
    filledHtml = fillTemplate(content_html, filled_data);
  } else {
    // Modo clásico: cargar plantilla y reemplazar variables en el backend
    const templateResult = await query(
      `SELECT * FROM templates WHERE id = $1 AND monday_account_id = $2`,
      [template_id, accountId]
    );
    const template = templateResult.rows[0];
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const enrichedData = { ...filled_data };
    if (catalog_items.length > 0) {
      enrichedData.tabla_renta = buildPricingTableHtml(catalog_items, catalog_iva);
    }
    filledHtml = fillTemplate(template.content_html, enrichedData);
  }

  const fullHtml = wrapDocumentHtml(filledHtml, name);

  // 3. Generar PDF con Puppeteer
  const pdfBuffer = await generatePdf(fullHtml);

  // 4. Subir PDF a Cloudflare R2
  const documentId = uuidv4();
  const pdfKey = buildPdfKey(documentId);
  const pdfUrl = await uploadPdf(pdfKey, pdfBuffer);

  // 5. Generar folio único: MR-{AÑO}-{NNNN}
  const seqRow = await query(`SELECT nextval('doc_number_seq') AS n`);
  const docNumber = `MR-${new Date().getFullYear()}-${String(seqRow.rows[0].n).padStart(4, '0')}`;

  // 6. Crear item en Monday con columnas rellenas — no bloquea si falla
  const clientName = filled_data?.razon_social || filled_data?.nombre || filled_data?.name || '';
  const mondayDocItemId = await createMondayDocItem({
    docNumber,
    docName:      name,
    clientName,
    html:         filledHtml,
    mondayUserId: userId,
  });

  // 7. La URL del PDF apunta a la API (sirve desde DB)
  const apiPdfUrl = `/api/documents/${documentId}/pdf`;

  // 8. Guardar documento en la base de datos
  const result = await query(
    `INSERT INTO documents
       (id, template_id, name, doc_number, monday_board_id, monday_item_id, monday_account_id,
        monday_user_id, owner_email, owner_name, monday_doc_item_id,
        filled_data, content_html, pdf_url, pdf_content, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'draft')
     RETURNING *`,
    [
      documentId, template_id, name, docNumber,
      monday_board_id, monday_item_id, accountId,
      userId, owner_email || null, owner_name || null, mondayDocItemId,
      JSON.stringify(filled_data), filledHtml, apiPdfUrl, pdfBuffer,
    ]
  );

  const doc = result.rows[0];

  logEvent({
    documentId: doc.id,
    action:     'document.created',
    actor:      { id: userId },
    pdfHash:    hashPdfFile(apiPdfUrl),
    metadata:   { template_id, name, monday_item_id, monday_doc_item_id: mondayDocItemId },
  });

  // Subir PDF al item de Monday en background — no bloquea la respuesta
  if (mondayDocItemId) {
    uploadPdfToMondayItem(mondayDocItemId, pdfBuffer, docNumber).catch(() => {});
  }

  res.status(201).json(doc);
});

// DELETE /api/documents/:id
router.delete('/:id', requireEditor, async (req, res) => {
  const { accountId } = req.mondayContext;
  await query(
    `DELETE FROM documents WHERE id = $1 AND monday_account_id = $2`,
    [req.params.id, accountId]
  );
  res.status(204).end();
});

export default router;
