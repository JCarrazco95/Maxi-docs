import { Router } from 'express';
import { query } from '../db/connection.js';
import { sendForSignature } from '../services/signService.js';

const router = Router();

// POST /api/signatures/send — envía un documento a firma via DocuSeal
router.post('/send', async (req, res) => {
  const { accountId } = req.mondayContext;
  const { document_id, signers, expire_days } = req.body;

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
  }

  await query(`UPDATE documents SET status = 'sent' WHERE id = $1`, [document_id]);

  res.status(201).json({ signatures: insertedSignatures });
});

// GET /api/signatures/:documentId — estado detallado de firmas de un documento
router.get('/:documentId', async (req, res) => {
  const result = await query(
    `SELECT id, signer_name, signer_email, status, sign_url, signed_at, created_at
     FROM signatures
     WHERE document_id = $1
     ORDER BY created_at`,
    [req.params.documentId]
  );
  res.json(result.rows);
});

// POST /api/signatures/webhook — recibe notificaciones de DocuSeal al firmar
router.post('/webhook', async (req, res) => {
  console.log('[Webhook DocuSeal]', JSON.stringify(req.body).slice(0, 300));

  const { event_type, data } = req.body;

  if (event_type === 'submitter.completed') {
    // Una persona firmó
    const signerEmail = data?.email;
    const templateId  = String(data?.submission?.template_id ?? '');

    if (signerEmail && templateId) {
      await query(
        `UPDATE signatures
         SET status = 'signed', signed_at = NOW()
         WHERE opensign_document_id = $1 AND signer_email = $2`,
        [templateId, signerEmail]
      );
    }

    // Revisar si todos firmaron
    if (templateId) {
      const check = await query(
        `SELECT document_id,
                COUNT(*)                                          AS total,
                COUNT(*) FILTER (WHERE status = 'signed')        AS signed_count
         FROM signatures WHERE opensign_document_id = $1
         GROUP BY document_id`,
        [templateId]
      );
      const row = check.rows[0];
      if (row && Number(row.total) === Number(row.signed_count)) {
        await query(`UPDATE documents SET status = 'signed' WHERE id = $1`, [row.document_id]);
        console.log(`[Webhook] Documento ${row.document_id} firmado completamente`);
      }
    }

  } else if (event_type === 'submission.completed') {
    // Todos firmaron
    const templateId = String(data?.template_id ?? '');
    if (templateId) {
      await query(
        `UPDATE signatures SET status = 'signed', signed_at = NOW()
         WHERE opensign_document_id = $1 AND status = 'pending'`,
        [templateId]
      );
      await query(
        `UPDATE documents SET status = 'signed'
         WHERE id = (SELECT document_id FROM signatures WHERE opensign_document_id = $1 LIMIT 1)`,
        [templateId]
      );
    }

  } else if (event_type === 'submitter.declined') {
    const signerEmail = data?.email;
    const templateId  = String(data?.submission?.template_id ?? '');
    if (signerEmail && templateId) {
      await query(
        `UPDATE signatures SET status = 'rejected'
         WHERE opensign_document_id = $1 AND signer_email = $2`,
        [templateId, signerEmail]
      );
      await query(
        `UPDATE documents SET status = 'rejected'
         WHERE id = (SELECT document_id FROM signatures WHERE opensign_document_id = $1 LIMIT 1)`,
        [templateId]
      );
    }
  }

  res.status(200).end();
});

export default router;
