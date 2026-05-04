import { Router } from 'express';
import { query } from '../db/connection.js';
import { sendForSignature } from '../services/signService.js';
import { sendSignatureRequest, sendSignedNotification } from '../services/emailService.js';

const router = Router();

// Llama a un webhook saliente configurado en .env cuando un evento ocurre
async function callOutgoingWebhook(event, payload) {
  const url = process.env.WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, timestamp: new Date().toISOString(), ...payload }),
    });
    console.log(`[Webhook] ${event} → ${url}`);
  } catch (err) {
    console.error('[Webhook] Error:', err.message);
  }
}

// POST /api/signatures/send — envía un documento a firma via DocuSeal + email personalizado
router.post('/send', async (req, res) => {
  const { accountId } = req.mondayContext;
  const { document_id, signers, expire_days, sender_note } = req.body;

  if (!document_id || !signers?.length) {
    return res.status(400).json({ error: 'document_id y signers son requeridos' });
  }

  const docResult = await query(
    `SELECT * FROM documents WHERE id = $1 AND monday_account_id = $2`,
    [document_id, accountId]
  );
  const document = docResult.rows[0];
  if (!document) return res.status(404).json({ error: 'Documento no encontrado' });
  if (!document.pdf_url) return res.status(400).json({ error: 'El documento no tiene PDF generado' });

  if (!process.env.DOCUSEAL_API_KEY || process.env.DOCUSEAL_API_KEY === 'tu_api_key') {
    const err = new Error('DocuSeal no está configurado. Agrega DOCUSEAL_API_KEY en el .env del backend.');
    err.status = 503;
    throw err;
  }

  const { opensignDocumentId, signUrls } = await sendForSignature({
    documentName: document.name,
    pdfUrl:       document.pdf_url,
    signers,
    expireDays:   expire_days ? Number(expire_days) : null,
  });

  const insertedSignatures = [];
  for (const signer of signers) {
    const signUrl = signUrls.find(s => s.email === signer.email)?.signUrl ?? '';
    const result = await query(
      `INSERT INTO signatures
         (document_id, signer_name, signer_email, status, opensign_document_id, sign_url)
       VALUES ($1, $2, $3, 'pending', $4, $5)
       RETURNING *`,
      [document_id, signer.name, signer.email, opensignDocumentId, signUrl]
    );
    insertedSignatures.push(result.rows[0]);

    // Email personalizado de MaxiDocs con link al portal del firmante
    const insertedSig = result.rows[0];
    if (signUrl) {
      sendSignatureRequest({
        signatureId:  insertedSig.id,
        signerName:   signer.name,
        signerEmail:  signer.email,
        documentName: document.name,
        signUrl,
        senderNote:   sender_note ?? null,
        expireDays:   expire_days ? Number(expire_days) : null,
      }).catch(err => console.error('[Email] Error:', err.message));
    }
  }

  await query(`UPDATE documents SET status = 'sent' WHERE id = $1`, [document_id]);

  // Webhook saliente: documento enviado a firma
  callOutgoingWebhook('document.sent', {
    document: { id: document.id, name: document.name },
    signers:  signers.map(s => ({ name: s.name, email: s.email })),
  });

  res.status(201).json({ signatures: insertedSignatures });
});

// GET /api/signatures/:documentId — estado detallado de firmas de un documento
router.get('/:documentId', async (req, res) => {
  const result = await query(
    `SELECT id, signer_name, signer_email, status, sign_url, signed_at, created_at
     FROM signatures WHERE document_id = $1 ORDER BY created_at`,
    [req.params.documentId]
  );
  res.json(result.rows);
});

// GET /api/portal/:signatureId — datos públicos para el portal del firmante (sin auth)
router.get('/portal/:signatureId', async (req, res) => {
  const result = await query(
    `SELECT s.id, s.signer_name, s.signer_email, s.status, s.sign_url, s.signed_at,
            d.id AS document_id, d.name AS document_name, d.pdf_url
     FROM signatures s
     JOIN documents d ON d.id = s.document_id
     WHERE s.id = $1`,
    [req.params.signatureId]
  );
  const row = result.rows[0];
  if (!row) return res.status(404).json({ error: 'Firma no encontrada' });
  res.json({
    signature: {
      id:           row.id,
      signer_name:  row.signer_name,
      signer_email: row.signer_email,
      status:       row.status,
      sign_url:     row.sign_url,
      signed_at:    row.signed_at,
    },
    document: {
      id:      row.document_id,
      name:    row.document_name,
      pdf_url: row.pdf_url,
    },
  });
});

// POST /api/signatures/webhook — recibe notificaciones de DocuSeal al firmar
router.post('/webhook', async (req, res) => {
  console.log('[Webhook DocuSeal]', JSON.stringify(req.body).slice(0, 300));
  const { event_type, data } = req.body;

  if (event_type === 'submitter.completed') {
    const signerEmail = data?.email;
    const templateId  = String(data?.submission?.template_id ?? '');

    if (signerEmail && templateId) {
      await query(
        `UPDATE signatures SET status = 'signed', signed_at = NOW()
         WHERE opensign_document_id = $1 AND signer_email = $2`,
        [templateId, signerEmail]
      );
    }

    if (templateId) {
      const check = await query(
        `SELECT document_id,
                COUNT(*)                                   AS total,
                COUNT(*) FILTER (WHERE status = 'signed') AS signed_count
         FROM signatures WHERE opensign_document_id = $1 GROUP BY document_id`,
        [templateId]
      );
      const row = check.rows[0];
      if (row && Number(row.total) === Number(row.signed_count)) {
        await query(`UPDATE documents SET status = 'signed' WHERE id = $1`, [row.document_id]);

        // Obtener info del documento para notificaciones
        const docRes = await query(
          `SELECT d.*, m.signer_name, m.signer_email
           FROM documents d
           LEFT JOIN signatures m ON m.document_id = d.id AND m.status = 'signed'
           WHERE d.id = $1 LIMIT 1`,
          [row.document_id]
        );
        const doc = docRes.rows[0];
        if (doc) {
          // Email de notificación al remitente
          const notifyEmail = process.env.NOTIFY_EMAIL;
          if (notifyEmail) {
            sendSignedNotification({
              toEmail:      notifyEmail,
              documentName: doc.name,
              pdfUrl:       doc.pdf_url,
              signerName:   signerEmail,
            }).catch(() => {});
          }

          // Webhook saliente: documento firmado
          callOutgoingWebhook('document.signed', {
            document: { id: doc.id, name: doc.name, pdf_url: doc.pdf_url },
            signer:   { email: signerEmail },
            monday_item_id: doc.monday_item_id,
          });
        }
      }
    }

  } else if (event_type === 'submission.completed') {
    const templateId = String(data?.template_id ?? '');
    if (templateId) {
      await query(
        `UPDATE signatures SET status = 'signed', signed_at = NOW()
         WHERE opensign_document_id = $1 AND status = 'pending'`,
        [templateId]
      );
      const docRes = await query(
        `UPDATE documents SET status = 'signed'
         WHERE id = (SELECT document_id FROM signatures WHERE opensign_document_id = $1 LIMIT 1)
         RETURNING *`,
        [templateId]
      );
      if (docRes.rows[0]) {
        callOutgoingWebhook('document.signed', {
          document: { id: docRes.rows[0].id, name: docRes.rows[0].name, pdf_url: docRes.rows[0].pdf_url },
          monday_item_id: docRes.rows[0].monday_item_id,
        });
      }
    }

  } else if (event_type === 'submitter.declined') {
    const signerEmail = data?.email;
    const templateId  = String(data?.submission?.template_id ?? '');
    if (signerEmail && templateId) {
      await query(`UPDATE signatures SET status = 'rejected' WHERE opensign_document_id = $1 AND signer_email = $2`, [templateId, signerEmail]);
      await query(`UPDATE documents SET status = 'rejected' WHERE id = (SELECT document_id FROM signatures WHERE opensign_document_id = $1 LIMIT 1)`, [templateId]);
    }
  }

  res.status(200).end();
});

export default router;
