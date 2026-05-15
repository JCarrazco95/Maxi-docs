import { Router } from 'express';
import { query } from '../db/connection.js';
import { sendSignatureRequest, sendSignedNotification, sendViewedNotification } from '../services/emailService.js';
import { embedSignaturesInPdf, saveSignedPdf } from '../services/selfSignService.js';
import { logEvent, hashPdfFile, hashBuffer } from '../services/auditService.js';
import { requireEditor } from '../middleware/mondayAuth.js';

const router = Router();

// Rate limiter local para el portal y el endpoint de firma
const _rlSign = new Map();
function signRateLimit(req, res, next) {
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const now  = Date.now();
  const win  = 15 * 60 * 1000; // 15 min
  const max  = 10;
  const entry = _rlSign.get(key);
  if (!entry || now > entry.reset) {
    _rlSign.set(key, { count: 1, reset: now + win });
    return next();
  }
  entry.count++;
  if (entry.count > max) {
    return res.status(429).json({ error: 'Demasiados intentos de firma. Intenta en 15 minutos.' });
  }
  next();
}

// Llama a un webhook saliente con timeout para evitar bloqueos
async function callOutgoingWebhook(event, payload) {
  const url = process.env.WEBHOOK_URL;
  if (!url) return;
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 5000);
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, timestamp: new Date().toISOString(), ...payload }),
      signal: ctrl.signal,
    });
    clearTimeout(timeout);
    console.log(`[Webhook] ${event} → ${url}`);
  } catch (err) {
    console.error('[Webhook] Error:', err.message);
  }
}

// POST /api/signatures/send — enviar documento a firma (requiere rol editor o admin)
router.post('/send', requireEditor, async (req, res) => {
  console.log('[FIRMA V2] Recibiendo request de firma - SIN DOCUSEAL');
  const { accountId, userId, isAdmin } = req.mondayContext;
  const { document_id, signers, expire_days, sender_note, sender_name, field_config } = req.body;

  if (!document_id || !signers?.length) {
    return res.status(400).json({ error: 'document_id y signers son requeridos' });
  }

  // Buscar por ID primero; verificar cuenta solo si no es admin
  // (evita condición de carrera donde el contexto de Monday no cargó aún)
  const docResult = await query(
    `SELECT * FROM documents WHERE id = $1`,
    [document_id]
  );
  const document = docResult.rows[0];
  if (!document) return res.status(404).json({ error: 'Documento no encontrado' });
  if (!isAdmin && document.monday_account_id !== accountId && accountId !== 'dev') {
    return res.status(403).json({ error: 'No tienes permiso sobre este documento' });
  }
  if (!document.pdf_url) return res.status(400).json({ error: 'El documento no tiene PDF generado' });

  const insertedSignatures = [];
  const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:8301';

  for (let i = 0; i < signers.length; i++) {
    const signer       = signers[i];
    const signingOrder = signer.order ?? (i + 1); // Orden explícito o posición del array

    const result = await query(
      `INSERT INTO signatures
         (document_id, signer_name, signer_email, status, sign_url, opensign_document_id, signing_order)
       VALUES ($1, $2, $3, 'pending', '', '', $4)
       RETURNING *`,
      [document_id, signer.name, signer.email, signingOrder]
    );
    const sig = result.rows[0];

    // Guardar solo los campos que pertenecen a este firmante (filtrar por signerIndex)
    if (Array.isArray(field_config) && field_config.length > 0) {
      const signerFields = field_config
        .filter(f => f.signerIndex === i || f.signerIndex === undefined)
        .map(({ type, x, y, w, h, page }) => ({ type, x, y, w, h, page }));
      if (signerFields.length > 0) {
        await query(
          `UPDATE signatures SET opensign_document_id = $1 WHERE id = $2`,
          [JSON.stringify(signerFields), sig.id]
        );
      }
    }

    const signUrl = `${PUBLIC_URL}/sign/${sig.id}`;
    await query(`UPDATE signatures SET sign_url = $1 WHERE id = $2`, [signUrl, sig.id]);
    insertedSignatures.push({ ...sig, sign_url: signUrl, signing_order: signingOrder });

    // Solo enviar email al primer firmante en orden secuencial (los demás esperan su turno)
    if (signingOrder === 1) {
      sendSignatureRequest({
        signatureId:  sig.id,
        signerName:   signer.name,
        signerEmail:  signer.email,
        documentName: document.name,
        signUrl,
        senderNote:   sender_note ?? null,
        senderName:   sender_name ?? null,
        expireDays:   expire_days ? Number(expire_days) : null,
      }).catch(err => console.error('[Email] Error:', err.message));
    }
  }

  await query(`UPDATE documents SET status = 'sent' WHERE id = $1`, [document_id]);

  // Audit: documento enviado a firma
  const pdfHash = hashPdfFile(document.pdf_url);
  logEvent({
    documentId: document_id,
    action:     'document.sent',
    actor:      { id: userId },
    pdfHash,
    metadata:   { signers: signers.map(s => ({ name: s.name, email: s.email })), expire_days },
  });

  callOutgoingWebhook('document.sent', {
    document: { id: document.id, name: document.name },
    signers:  signers.map(s => ({ name: s.name, email: s.email })),
  });

  res.status(201).json({ signatures: insertedSignatures });
});

// GET /api/signatures/portal/:signatureId — datos públicos para el portal del firmante
// MUST be before /:documentId to avoid wildcard route shadowing
router.get('/portal/:signatureId', async (req, res) => {
  const result = await query(
    `SELECT s.id, s.signer_name, s.signer_email, s.status, s.sign_url, s.signed_at, s.viewed_at,
            s.opensign_document_id AS field_config,
            d.id AS document_id, d.name AS document_name, d.pdf_url, d.monday_account_id,
            d.owner_email
     FROM signatures s
     JOIN documents d ON d.id = s.document_id
     WHERE s.id = $1`,
    [req.params.signatureId]
  );
  const row = result.rows[0];
  if (!row) return res.status(404).json({ error: 'Firma no encontrada' });

  // Registrar primera vista del firmante
  if (!row.viewed_at) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
    await query(`UPDATE signatures SET viewed_at = NOW() WHERE id = $1`, [req.params.signatureId]);
    logEvent({
      documentId: row.document_id,
      action:     'document.viewed',
      actor:      { name: row.signer_name, email: row.signer_email },
      ip,
      metadata:   { signature_id: row.id },
    });

    // Notificar al vendedor/remitente que el firmante abrió el documento
    const notifyEmail = row.owner_email || process.env.NOTIFY_EMAIL;
    if (notifyEmail) {
      sendViewedNotification({
        toEmail:      notifyEmail,
        documentName: row.document_name,
        signerName:   row.signer_name,
        signerEmail:  row.signer_email,
      }).catch(() => {});
    }
  }

  res.json({
    signature: {
      id:                   row.id,
      signer_name:          row.signer_name,
      signer_email:         row.signer_email,
      status:               row.status,
      sign_url:             row.sign_url,
      signed_at:            row.signed_at,
      viewed_at:            row.viewed_at,
      opensign_document_id: row.field_config,  // campo reutilizado para fieldConfig JSON
    },
    document: {
      id:      row.document_id,
      name:    row.document_name,
      pdf_url: row.pdf_url,
    },
  });
});

// GET /api/signatures/:documentId — estado detallado de firmas de un documento
router.get('/:documentId', async (req, res) => {
  const result = await query(
    `SELECT id, signer_name, signer_email, status, sign_url, signed_at, viewed_at, signing_order, created_at
     FROM signatures WHERE document_id = $1 ORDER BY signing_order ASC, created_at ASC`,
    [req.params.documentId]
  );
  res.json(result.rows);
});

// POST /api/signatures/:signatureId/sign — el firmante envía su firma dibujada/tipada/imagen
router.post('/:signatureId/sign', signRateLimit, async (req, res) => {
  const { signatureId } = req.params;
  const { signatureDataUrl, signerIp } = req.body;
  const ip = signerIp || req.headers['x-forwarded-for']?.split(',')[0] || req.ip || 'N/D';

  if (!signatureDataUrl) return res.status(400).json({ error: 'Se requiere la imagen de la firma' });

  const sigRes = await query(
    `SELECT s.*, d.pdf_url, d.name AS document_name, d.id AS document_id, d.monday_account_id,
            d.owner_email, s.signing_order
     FROM signatures s JOIN documents d ON d.id = s.document_id
     WHERE s.id = $1`,
    [signatureId]
  );
  const sig = sigRes.rows[0];
  if (!sig) return res.status(404).json({ error: 'Firma no encontrada' });
  if (sig.status === 'signed') return res.status(400).json({ error: 'Ya fue firmado' });

  // Verificar signing order: el firmante anterior debe haber firmado
  if (sig.signing_order > 1) {
    const prevCheck = await query(
      `SELECT COUNT(*) AS pending
       FROM signatures
       WHERE document_id = $1 AND signing_order = $2 AND status != 'signed'`,
      [sig.document_id, sig.signing_order - 1]
    );
    if (Number(prevCheck.rows[0].pending) > 0) {
      return res.status(400).json({
        error: 'Debes esperar a que el firmante anterior complete su firma primero',
        code:  'WAITING_FOR_PREVIOUS_SIGNER',
      });
    }
  }

  // Parsear field_config (guardado en opensign_document_id)
  let fieldConfig = [];
  try {
    if (sig.opensign_document_id && sig.opensign_document_id.startsWith('[')) {
      fieldConfig = JSON.parse(sig.opensign_document_id);
    }
  } catch { /* sin campo configurado */ }

  if (!fieldConfig.length) {
    fieldConfig = [{
      type: 'signature',
      x:    Number(process.env.SIGNATURE_X    ?? 5),
      y:    Number(process.env.SIGNATURE_Y    ?? 77),
      w:    Number(process.env.SIGNATURE_W    ?? 38),
      h:    Number(process.env.SIGNATURE_H    ?? 9),
      page: Number(process.env.SIGNATURE_PAGE ?? 1),
    }];
  }

  // Embeber firma en el PDF
  const signedBuffer = await embedSignaturesInPdf(sig.pdf_url, [{
    name:             sig.signer_name,
    email:            sig.signer_email,
    signatureDataUrl,
    ip,
    signedAt:         new Date().toISOString(),
    fieldConfig,
  }]);

  const signedPdfUrl = saveSignedPdf(sig.pdf_url, signedBuffer);
  const signedPdfHash = hashBuffer(signedBuffer);

  await query(
    `UPDATE signatures SET status = 'signed', signed_at = NOW() WHERE id = $1`,
    [signatureId]
  );
  await query(
    `UPDATE documents SET pdf_url = $1, pdf_hash = $2, status = 'signed' WHERE id = $3`,
    [signedPdfUrl, signedPdfHash, sig.document_id]
  );

  // Audit: firmante completó
  logEvent({
    documentId: sig.document_id,
    action:     'document.signed',
    actor:      { name: sig.signer_name, email: sig.signer_email },
    ip,
    pdfHash:    signedPdfHash,
    metadata:   { signature_id: signatureId, signing_order: sig.signing_order },
  });

  // Email de notificación al vendedor que generó el documento (o al admin como fallback)
  const notifyEmail = sig.owner_email || process.env.NOTIFY_EMAIL;
  if (notifyEmail) {
    sendSignedNotification({
      toEmail:      notifyEmail,
      documentName: sig.document_name,
      pdfUrl:       signedPdfUrl,
      signerName:   sig.signer_name,
    }).catch(() => {});
  }

  // Verificar si hay firmantes siguientes en el orden secuencial
  const nextSigner = await query(
    `SELECT * FROM signatures
     WHERE document_id = $1 AND signing_order = $2 AND status = 'pending'
     LIMIT 1`,
    [sig.document_id, sig.signing_order + 1]
  );

  if (nextSigner.rows[0]) {
    const next = nextSigner.rows[0];
    const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:8301';
    const signUrl = next.sign_url || `${PUBLIC_URL}/sign/${next.id}`;

    // Enviar email al siguiente firmante
    sendSignatureRequest({
      signatureId:  next.id,
      signerName:   next.signer_name,
      signerEmail:  next.signer_email,
      documentName: sig.document_name,
      signUrl,
      senderNote:   null,
      senderName:   null,
      expireDays:   null,
    }).catch(err => console.error('[Email] Error next signer:', err.message));

    logEvent({
      documentId: sig.document_id,
      action:     'document.next_signer_notified',
      actor:      { name: next.signer_name, email: next.signer_email },
      metadata:   { signing_order: next.signing_order },
    });
  } else {
    // Verificar si todos firmaron (documento completado)
    const allCheck = await query(
      `SELECT COUNT(*) FILTER (WHERE status != 'signed') AS pending
       FROM signatures WHERE document_id = $1`,
      [sig.document_id]
    );
    if (Number(allCheck.rows[0].pending) === 0) {
      await query(`UPDATE documents SET status = 'signed' WHERE id = $1`, [sig.document_id]);
      logEvent({
        documentId: sig.document_id,
        action:     'document.completed',
        pdfHash:    signedPdfHash,
        metadata:   { all_signers_done: true },
      });
    }
  }

  callOutgoingWebhook('document.signed', {
    document: { id: sig.document_id, name: sig.document_name, pdf_url: signedPdfUrl },
    signer:   { name: sig.signer_name, email: sig.signer_email },
    monday_account_id: sig.monday_account_id,
  });

  res.json({ ok: true, pdf_url: signedPdfUrl, signedPdfUrl, pdfHash: signedPdfHash });
});

// GET /api/signatures/:documentId/events — historial de auditoría
router.get('/:documentId/events', async (req, res) => {
  const { getEvents } = await import('../services/auditService.js');
  const events = await getEvents(req.params.documentId);
  res.json(events);
});

// POST /api/signatures/:signatureId/time-spent — registrar tiempo de lectura
router.post('/:signatureId/time-spent', async (req, res) => {
  const { seconds } = req.body;
  if (!seconds || seconds < 1) return res.status(400).json({ error: 'seconds requerido' });
  await query(
    `UPDATE signatures SET time_spent_seconds = time_spent_seconds + $1 WHERE id = $2`,
    [Math.round(seconds), req.params.signatureId]
  );
  res.json({ ok: true });
});

// POST /api/signatures/bulk-send — enviar mismo template a lista de contactos
router.post('/bulk-send', requireEditor, async (req, res) => {
  const { accountId, userId } = req.mondayContext;
  const { template_id, contacts, expire_days, sender_note, sender_name } = req.body;
  // contacts: [{ name, email, variables: {} }]

  if (!template_id || !contacts?.length) {
    return res.status(400).json({ error: 'template_id y contacts son requeridos' });
  }

  const PUBLIC_URL  = process.env.PUBLIC_URL || 'http://localhost:8301';
  const results = [];

  for (const contact of contacts) {
    try {
      // Generar PDF para cada contacto
      const { fillTemplate, generatePdf, wrapDocumentHtml } = await import('../services/pdfService.js');
      const { uploadPdf } = await import('../services/storageService.js');

      const tplRes = await query(`SELECT * FROM templates WHERE id = $1`, [template_id]);
      const tpl    = tplRes.rows[0];
      if (!tpl) { results.push({ email: contact.email, error: 'Template no encontrado' }); continue; }

      const filledHtml = fillTemplate(tpl.content_html, contact.variables || {});
      const wrappedHtml = wrapDocumentHtml(filledHtml);
      const pdfBuffer  = await generatePdf(wrappedHtml);
      const pdfUrl     = await uploadPdf(pdfBuffer, `${accountId}-bulk-${Date.now()}.pdf`);

      // Crear documento
      const docRes = await query(
        `INSERT INTO documents (template_id, name, monday_account_id, monday_user_id, filled_data, content_html, pdf_url, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft') RETURNING *`,
        [template_id, contact.name || tpl.name, accountId, userId,
         JSON.stringify(contact.variables || {}), filledHtml, pdfUrl]
      );
      const doc = docRes.rows[0];

      // Crear firma y enviar email
      const sigRes = await query(
        `INSERT INTO signatures (document_id, signer_name, signer_email, status, sign_url, signing_order)
         VALUES ($1, $2, $3, 'pending', '', 1) RETURNING *`,
        [doc.id, contact.name, contact.email]
      );
      const sig    = sigRes.rows[0];
      const signUrl = `${PUBLIC_URL}/sign/${sig.id}`;
      await query(`UPDATE signatures SET sign_url = $1 WHERE id = $2`, [signUrl, sig.id]);
      await query(`UPDATE documents SET status = 'sent' WHERE id = $1`, [doc.id]);

      sendSignatureRequest({
        signatureId:  sig.id,
        signerName:   contact.name,
        signerEmail:  contact.email,
        documentName: doc.name,
        signUrl,
        senderNote:   sender_note ?? null,
        senderName:   sender_name ?? null,
        expireDays:   expire_days ?? null,
      }).catch(() => {});

      results.push({ email: contact.email, documentId: doc.id, signatureId: sig.id, signUrl, ok: true });
    } catch (e) {
      results.push({ email: contact.email, error: e.message });
    }
  }

  res.status(201).json({ total: contacts.length, results });
});

export default router;
