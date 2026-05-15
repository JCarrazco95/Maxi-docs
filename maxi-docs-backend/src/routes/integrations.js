/**
 * Endpoints para integraciones externas: Zapier, Make, API keys
 * - Triggers: eventos que Zapier/Make pueden suscribir via webhook
 * - Actions: acciones que Zapier/Make pueden ejecutar
 * - API keys: autenticación para acceso externo
 */
import { Router } from 'express';
import crypto from 'crypto';
import { query } from '../db/connection.js';
import { fillTemplate, generatePdf, wrapDocumentHtml } from '../services/pdfService.js';
import { uploadPdf } from '../services/storageService.js';
import { sendSignatureRequest } from '../services/emailService.js';

const router = Router();

// ── Middleware de API Key ────────────────────────────────────────
async function apiKeyAuth(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.api_key;
  if (!key) return res.status(401).json({ error: 'API key requerida (header x-api-key)' });

  const hash = crypto.createHash('sha256').update(key).digest('hex');
  const result = await query(
    `SELECT * FROM api_keys WHERE key_hash = $1`,
    [hash]
  );
  if (!result.rows[0]) return res.status(401).json({ error: 'API key inválida' });

  await query(`UPDATE api_keys SET last_used_at = NOW() WHERE key_hash = $1`, [hash]);
  req.apiKey     = result.rows[0];
  req.mondayContext = { accountId: result.rows[0].monday_account_id, userId: 'api', isAdmin: false, role: 'editor' };
  next();
}

// ── Gestión de API Keys ─────────────────────────────────────────
// GET /api/integrations/keys — listar keys de la cuenta (requiere auth de Monday)
router.get('/keys', async (req, res) => {
  const { accountId } = req.mondayContext;
  const result = await query(
    `SELECT id, name, scopes, last_used_at, created_at FROM api_keys WHERE monday_account_id = $1 ORDER BY created_at DESC`,
    [accountId]
  );
  res.json(result.rows);
});

// POST /api/integrations/keys — crear nueva API key
router.post('/keys', async (req, res) => {
  const { accountId } = req.mondayContext;
  const { name, scopes } = req.body;
  if (!name) return res.status(400).json({ error: 'name es requerido' });

  const rawKey  = `mxd_${crypto.randomBytes(24).toString('hex')}`;
  const hash    = crypto.createHash('sha256').update(rawKey).digest('hex');

  await query(
    `INSERT INTO api_keys (monday_account_id, key_hash, name, scopes) VALUES ($1, $2, $3, $4)`,
    [accountId, hash, name, scopes ?? ['documents:read', 'documents:write', 'signatures:write']]
  );

  // Solo se muestra UNA vez — luego no se puede recuperar
  res.status(201).json({ key: rawKey, name, message: 'Guarda esta clave ahora, no se mostrará de nuevo.' });
});

// DELETE /api/integrations/keys/:id — eliminar key
router.delete('/keys/:id', async (req, res) => {
  const { accountId } = req.mondayContext;
  await query(`DELETE FROM api_keys WHERE id = $1 AND monday_account_id = $2`, [req.params.id, accountId]);
  res.status(204).end();
});

// ── Endpoints públicos para Zapier/Make (autenticados con API key) ──

// GET /api/integrations/documents — listar documentos (Zapier trigger)
router.get('/documents', apiKeyAuth, async (req, res) => {
  const { accountId } = req.mondayContext;
  const { status, limit = 50 } = req.query;

  const validStatuses = ['draft', 'sent', 'signed', 'rejected'];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error: `status debe ser uno de: ${validStatuses.join(', ')}` });
  }

  const params = [accountId];
  const statusClause = status ? `AND status = $${params.push(status)}` : '';
  params.push(Math.min(Number(limit) || 50, 200));

  const result = await query(
    `SELECT id, name, status, pdf_url, created_at, updated_at, monday_item_id
     FROM documents WHERE monday_account_id = $1 ${statusClause}
     ORDER BY created_at DESC LIMIT $${params.length}`,
    params
  );
  res.json(result.rows);
});

// POST /api/integrations/documents/generate — generar documento (Make action)
router.post('/documents/generate', apiKeyAuth, async (req, res) => {
  const { accountId, userId } = req.mondayContext;
  const { template_id, name, variables = {}, monday_item_id } = req.body;

  if (!template_id || !name) return res.status(400).json({ error: 'template_id y name son requeridos' });

  const tplRes = await query(`SELECT * FROM templates WHERE id = $1`, [template_id]);
  const tpl    = tplRes.rows[0];
  if (!tpl) return res.status(404).json({ error: 'Template no encontrado' });

  const filledHtml  = fillTemplate(tpl.content_html, variables);
  const wrappedHtml = wrapDocumentHtml(filledHtml);
  const pdfBuffer   = await generatePdf(wrappedHtml);
  const pdfUrl      = await uploadPdf(pdfBuffer, `${accountId}-${Date.now()}.pdf`);

  const result = await query(
    `INSERT INTO documents (template_id, name, monday_account_id, monday_user_id, monday_item_id, filled_data, content_html, pdf_url, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft') RETURNING *`,
    [template_id, name, accountId, userId, monday_item_id, JSON.stringify(variables), filledHtml, pdfUrl]
  );
  res.status(201).json(result.rows[0]);
});

// POST /api/integrations/documents/:id/send — enviar a firma (Make action)
router.post('/documents/:id/send', apiKeyAuth, async (req, res) => {
  const { accountId } = req.mondayContext;
  const { signers, expire_days, sender_note } = req.body;

  if (!signers?.length) return res.status(400).json({ error: 'signers es requerido' });

  const docRes = await query(`SELECT * FROM documents WHERE id = $1 AND monday_account_id = $2`, [req.params.id, accountId]);
  const doc    = docRes.rows[0];
  if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });

  const PUBLIC_URL  = process.env.PUBLIC_URL || 'http://localhost:8301';
  const signatures  = [];

  for (let i = 0; i < signers.length; i++) {
    const signer  = signers[i];
    const sigRes  = await query(
      `INSERT INTO signatures (document_id, signer_name, signer_email, status, sign_url, signing_order)
       VALUES ($1, $2, $3, 'pending', '', $4) RETURNING *`,
      [doc.id, signer.name, signer.email, i + 1]
    );
    const sig    = sigRes.rows[0];
    const signUrl = `${PUBLIC_URL}/sign/${sig.id}`;
    await query(`UPDATE signatures SET sign_url = $1 WHERE id = $2`, [signUrl, sig.id]);
    signatures.push({ ...sig, sign_url: signUrl });

    if (i === 0) {
      sendSignatureRequest({
        signatureId:  sig.id,
        signerName:   signer.name,
        signerEmail:  signer.email,
        documentName: doc.name,
        signUrl,
        senderNote:   sender_note ?? null,
        expireDays:   expire_days ?? null,
      }).catch(() => {});
    }
  }

  await query(`UPDATE documents SET status = 'sent' WHERE id = $1`, [doc.id]);
  res.status(201).json({ document: doc, signatures });
});

// GET /api/integrations/signatures — listar firmas recientes (Zapier trigger)
router.get('/signatures', apiKeyAuth, async (req, res) => {
  const { accountId } = req.mondayContext;
  const { status, limit = 50 } = req.query;

  const validStatuses = ['pending', 'signed', 'rejected', 'expired'];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error: `status debe ser uno de: ${validStatuses.join(', ')}` });
  }

  const params = [accountId];
  const statusClause = status ? `AND s.status = $${params.push(status)}` : '';
  params.push(Math.min(Number(limit) || 50, 200));

  const result = await query(
    `SELECT s.id, s.signer_name, s.signer_email, s.status, s.signed_at, s.created_at, d.name AS document_name
     FROM signatures s JOIN documents d ON d.id = s.document_id
     WHERE d.monday_account_id = $1 ${statusClause}
     ORDER BY s.created_at DESC LIMIT $${params.length}`,
    params
  );
  res.json(result.rows);
});

// GET /api/integrations/templates — listar templates (Make action)
router.get('/templates', apiKeyAuth, async (req, res) => {
  const { accountId } = req.mondayContext;
  const result = await query(
    `SELECT id, name, description, variables, created_at FROM templates WHERE monday_account_id = $1 ORDER BY name`,
    [accountId]
  );
  res.json(result.rows);
});

// GET /api/integrations/schema — schema de la API para Zapier (auth endpoint)
router.get('/schema', (_req, res) => {
  res.json({
    name:        'MaxiDocs API',
    description: 'Gestión de documentos y firmas electrónicas',
    auth: {
      type:   'api_key',
      header: 'x-api-key',
    },
    triggers: [
      { key: 'document_signed',  name: 'Documento firmado',    endpoint: 'GET /api/integrations/signatures?status=signed' },
      { key: 'document_sent',    name: 'Documento enviado',    endpoint: 'GET /api/integrations/documents?status=sent' },
      { key: 'document_created', name: 'Documento creado',     endpoint: 'GET /api/integrations/documents?status=draft' },
    ],
    actions: [
      { key: 'generate_document', name: 'Generar documento',   endpoint: 'POST /api/integrations/documents/generate' },
      { key: 'send_for_signature',name: 'Enviar a firma',      endpoint: 'POST /api/integrations/documents/:id/send' },
    ],
  });
});

export default router;
