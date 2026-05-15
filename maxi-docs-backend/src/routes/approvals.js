import { Router } from 'express';
import { query } from '../db/connection.js';
import { requireEditor, requireAdmin } from '../middleware/mondayAuth.js';
import { logEvent } from '../services/auditService.js';

const router = Router();

// GET /api/approvals/:documentId — listar aprobaciones de un documento
router.get('/:documentId', async (req, res) => {
  const { accountId } = req.mondayContext;
  // Verifica pertenencia al account antes de exponer aprobaciones
  const docCheck = await query(
    `SELECT id FROM documents WHERE id = $1 AND monday_account_id = $2`,
    [req.params.documentId, accountId]
  );
  if (!docCheck.rows[0]) return res.status(404).json({ error: 'Documento no encontrado' });

  const result = await query(
    `SELECT * FROM approvals WHERE document_id = $1 ORDER BY created_at DESC`,
    [req.params.documentId]
  );
  res.json(result.rows);
});

// POST /api/approvals/request — solicitar aprobación de un documento
router.post('/request', requireEditor, async (req, res) => {
  const { userId, accountId } = req.mondayContext;
  const { document_id, approver_email, approver_name } = req.body;

  if (!document_id || !approver_email) {
    return res.status(400).json({ error: 'document_id y approver_email son requeridos' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(approver_email) || /[\r\n]/.test(approver_email)) {
    return res.status(400).json({ error: 'approver_email inválido' });
  }

  // Verificar que el documento existe Y pertenece a esta cuenta
  const docRes = await query(
    `SELECT * FROM documents WHERE id = $1 AND monday_account_id = $2`,
    [document_id, accountId]
  );
  if (!docRes.rows[0]) return res.status(404).json({ error: 'Documento no encontrado' });

  const result = await query(
    `INSERT INTO approvals (document_id, approver_id, approver_name, approver_email)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [document_id, userId, approver_name || approver_email, approver_email]
  );

  // Marcar documento como pending_approval
  await query(
    `UPDATE documents SET approval_status = 'pending_approval' WHERE id = $1`,
    [document_id]
  );

  logEvent({
    documentId: document_id,
    action:     'document.approval_requested',
    actor:      { id: userId },
    metadata:   { approver_email, approver_name },
  });

  res.status(201).json(result.rows[0]);
});

// POST /api/approvals/:approvalId/resolve — aprobar o rechazar
router.post('/:approvalId/resolve', async (req, res) => {
  const { accountId } = req.mondayContext;
  const { decision, comment } = req.body; // decision: 'approved' | 'rejected'

  if (!['approved', 'rejected'].includes(decision)) {
    return res.status(400).json({ error: 'decision debe ser approved o rejected' });
  }

  // Verifica que la aprobación pertenece a un documento de esta cuenta
  const approvalRes = await query(
    `UPDATE approvals SET status = $1, comment = $2, resolved_at = NOW()
     WHERE id = $3
       AND document_id IN (SELECT id FROM documents WHERE monday_account_id = $4)
     RETURNING *`,
    [decision, comment || null, req.params.approvalId, accountId]
  );
  const approval = approvalRes.rows[0];
  if (!approval) return res.status(404).json({ error: 'Aprobación no encontrada' });

  // Verificar si todas las aprobaciones del doc están resueltas
  const pending = await query(
    `SELECT COUNT(*) AS cnt FROM approvals WHERE document_id = $1 AND status = 'pending'`,
    [approval.document_id]
  );

  const newStatus = Number(pending.rows[0].cnt) === 0
    ? (decision === 'approved' ? 'approved' : 'rejected')
    : 'pending_approval';

  await query(
    `UPDATE documents SET approval_status = $1 WHERE id = $2`,
    [newStatus, approval.document_id]
  );

  logEvent({
    documentId: approval.document_id,
    action:     `document.approval_${decision}`,
    actor:      { email: approval.approver_email, name: approval.approver_name },
    metadata:   { comment, approval_id: approval.id },
  });

  res.json({ ok: true, approval, documentApprovalStatus: newStatus });
});

// DELETE /api/approvals/:approvalId — cancelar solicitud de aprobación
router.delete('/:approvalId', requireEditor, async (req, res) => {
  const { accountId } = req.mondayContext;
  const result = await query(
    `DELETE FROM approvals WHERE id = $1
       AND document_id IN (SELECT id FROM documents WHERE monday_account_id = $2)
     RETURNING document_id`,
    [req.params.approvalId, accountId]
  );
  if (result.rows[0]) {
    // Revisar si quedan aprobaciones pendientes
    const remaining = await query(
      `SELECT COUNT(*) AS cnt FROM approvals WHERE document_id = $1 AND status = 'pending'`,
      [result.rows[0].document_id]
    );
    if (Number(remaining.rows[0].cnt) === 0) {
      await query(`UPDATE documents SET approval_status = NULL WHERE id = $1`, [result.rows[0].document_id]);
    }
  }
  res.status(204).end();
});

export default router;
