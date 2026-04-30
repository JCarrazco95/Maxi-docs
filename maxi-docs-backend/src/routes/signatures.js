import { Router } from 'express';
import { query } from '../db/connection.js';
import { sendForSignature, getSignatureStatus } from '../services/signService.js';

const router = Router();

// POST /api/signatures/send — envia un documento a firma
router.post('/send', async (req, res) => {
  const { accountId } = req.mondayContext;
  const { document_id, signers } = req.body;
  // signers: [{ name: 'Juan', email: 'juan@empresa.com' }]

  if (!document_id || !signers?.length) {
    return res.status(400).json({ error: 'document_id y signers son requeridos' });
  }

  // Verificar que el documento existe y pertenece a la cuenta
  const docResult = await query(
    `SELECT * FROM documents WHERE id = $1 AND monday_account_id = $2`,
    [document_id, accountId]
  );
  const document = docResult.rows[0];
  if (!document) return res.status(404).json({ error: 'Document not found' });
  if (!document.pdf_url) return res.status(400).json({ error: 'El documento no tiene PDF generado' });

  // Verificar que DocuSeal está configurado
  if (!process.env.DOCUSEAL_API_KEY || process.env.DOCUSEAL_API_KEY === 'tu_api_key') {
    const err = new Error('DocuSeal no está configurado. Agrega DOCUSEAL_API_KEY en el .env del backend.');
    err.status = 503;
    throw err;
  }

  // Enviar a OpenSign
  const { opensignDocumentId, signUrls } = await sendForSignature({
    documentName: document.name,
    pdfUrl: document.pdf_url,
    signers,
  });

  // Guardar las firmas pendientes en la base de datos
  const insertedSignatures = [];
  for (const signer of signers) {
    const signUrl = signUrls.find((s) => s.email === signer.email)?.signUrl;
    const result = await query(
      `INSERT INTO signatures
         (document_id, signer_name, signer_email, status, opensign_document_id, sign_url)
       VALUES ($1, $2, $3, 'pending', $4, $5)
       RETURNING *`,
      [document_id, signer.name, signer.email, opensignDocumentId, signUrl]
    );
    insertedSignatures.push(result.rows[0]);
  }

  // Actualizar el status del documento a 'sent'
  await query(
    `UPDATE documents SET status = 'sent' WHERE id = $1`,
    [document_id]
  );

  res.status(201).json({ signatures: insertedSignatures });
});

// GET /api/signatures/:documentId — consulta el estado de las firmas de un documento
router.get('/:documentId', async (req, res) => {
  const result = await query(
    `SELECT * FROM signatures WHERE document_id = $1 ORDER BY created_at`,
    [req.params.documentId]
  );
  res.json(result.rows);
});

// POST /api/signatures/webhook — recibe notificaciones de OpenSign cuando alguien firma
// Este endpoint lo llama OpenSign directamente (no el frontend)
router.post('/webhook', async (req, res) => {
  const { document_id: opensignId, status, signer_email } = req.body;

  const statusMap = { completed: 'signed', declined: 'rejected', expired: 'expired' };
  const newStatus = statusMap[status];
  if (!newStatus) return res.status(200).end(); // ignorar eventos desconocidos

  // Actualizar la firma
  await query(
    `UPDATE signatures
     SET status = $1, signed_at = CASE WHEN $1 = 'signed' THEN NOW() ELSE NULL END
     WHERE opensign_document_id = $2 AND signer_email = $3`,
    [newStatus, opensignId, signer_email]
  );

  // Si todas las firmas estan completas, marcar el documento como 'signed'
  const signResult = await query(
    `SELECT document_id,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status = 'signed') AS signed_count
     FROM signatures
     WHERE opensign_document_id = $1
     GROUP BY document_id`,
    [opensignId]
  );
  const row = signResult.rows[0];
  if (row && row.total === row.signed_count) {
    await query(
      `UPDATE documents SET status = 'signed' WHERE id = $1`,
      [row.document_id]
    );
  }

  res.status(200).end();
});

export default router;
