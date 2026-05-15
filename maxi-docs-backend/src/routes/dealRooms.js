import { Router } from 'express';
import crypto from 'crypto';
import { query } from '../db/connection.js';
import { requireEditor } from '../middleware/mondayAuth.js';

const router = Router();

// GET /api/rooms — listar Deal Rooms de la cuenta
router.get('/', async (req, res) => {
  const { accountId } = req.mondayContext;
  const result = await query(
    `SELECT dr.*, COUNT(DISTINCT rd.document_id) AS doc_count, COUNT(DISTINCT rm.id) AS msg_count
     FROM deal_rooms dr
     LEFT JOIN room_documents rd ON rd.room_id = dr.id
     LEFT JOIN room_messages rm ON rm.room_id = dr.id
     WHERE dr.monday_account_id = $1
     GROUP BY dr.id ORDER BY dr.created_at DESC`,
    [accountId]
  );
  res.json(result.rows);
});

// POST /api/rooms — crear Deal Room
router.post('/', requireEditor, async (req, res) => {
  const { accountId, userId } = req.mondayContext;
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name es requerido' });

  const accessToken = crypto.randomBytes(16).toString('hex');
  const result = await query(
    `INSERT INTO deal_rooms (monday_account_id, name, description, owner_id, access_token)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [accountId, name, description || null, userId, accessToken]
  );
  res.status(201).json(result.rows[0]);
});

// GET /api/rooms/:id — detalle de un room con documentos y mensajes
router.get('/:id', async (req, res) => {
  const { accountId } = req.mondayContext;
  const room = await query(
    `SELECT * FROM deal_rooms WHERE id = $1 AND monday_account_id = $2`,
    [req.params.id, accountId]
  );
  if (!room.rows[0]) return res.status(404).json({ error: 'Room no encontrado' });

  const [docs, messages] = await Promise.all([
    query(
      `SELECT d.id, d.name, d.status, d.pdf_url, rd.added_at
       FROM room_documents rd JOIN documents d ON d.id = rd.document_id
       WHERE rd.room_id = $1 ORDER BY rd.added_at DESC`,
      [req.params.id]
    ),
    query(
      `SELECT * FROM room_messages WHERE room_id = $1 ORDER BY created_at ASC LIMIT 100`,
      [req.params.id]
    ),
  ]);

  res.json({ ...room.rows[0], documents: docs.rows, messages: messages.rows });
});

// POST /api/rooms/:id/documents — agregar documento al room
router.post('/:id/documents', requireEditor, async (req, res) => {
  const { accountId } = req.mondayContext;
  const { document_id } = req.body;
  if (!document_id) return res.status(400).json({ error: 'document_id es requerido' });

  // Verificar que el room y el documento pertenecen a esta cuenta
  const [roomCheck, docCheck] = await Promise.all([
    query(`SELECT id FROM deal_rooms WHERE id = $1 AND monday_account_id = $2`, [req.params.id, accountId]),
    query(`SELECT id FROM documents WHERE id = $1 AND monday_account_id = $2`, [document_id, accountId]),
  ]);
  if (!roomCheck.rows[0] || !docCheck.rows[0]) {
    return res.status(404).json({ error: 'Room o documento no encontrado' });
  }

  await query(
    `INSERT INTO room_documents (room_id, document_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [req.params.id, document_id]
  );
  res.status(201).json({ ok: true });
});

// DELETE /api/rooms/:id/documents/:docId — quitar documento del room
router.delete('/:id/documents/:docId', requireEditor, async (req, res) => {
  const { accountId } = req.mondayContext;
  const roomCheck = await query(
    `SELECT id FROM deal_rooms WHERE id = $1 AND monday_account_id = $2`,
    [req.params.id, accountId]
  );
  if (!roomCheck.rows[0]) return res.status(404).json({ error: 'Room no encontrado' });

  await query(`DELETE FROM room_documents WHERE room_id = $1 AND document_id = $2`, [req.params.id, req.params.docId]);
  res.status(204).end();
});

// POST /api/rooms/:id/messages — enviar mensaje en el room
router.post('/:id/messages', async (req, res) => {
  const { author_name, author_email, content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'content es requerido' });
  if (content.trim().length > 5000) return res.status(400).json({ error: 'content demasiado largo' });

  // Validar email si se proporciona
  if (author_email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(author_email) || /[\r\n]/.test(author_email)) {
      return res.status(400).json({ error: 'author_email inválido' });
    }
  }

  // El room debe existir (público o de la cuenta)
  const roomCheck = await query(`SELECT id FROM deal_rooms WHERE id = $1`, [req.params.id]);
  if (!roomCheck.rows[0]) return res.status(404).json({ error: 'Room no encontrado' });

  const result = await query(
    `INSERT INTO room_messages (room_id, author_name, author_email, content)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [req.params.id, (author_name || 'Anónimo').substring(0, 255), author_email || null, content.trim()]
  );
  res.status(201).json(result.rows[0]);
});

// DELETE /api/rooms/:id — eliminar room
router.delete('/:id', requireEditor, async (req, res) => {
  const { accountId } = req.mondayContext;
  await query(`DELETE FROM deal_rooms WHERE id = $1 AND monday_account_id = $2`, [req.params.id, accountId]);
  res.status(204).end();
});

// GET /api/rooms/public/:token — acceso público al room via token (para compradores)
router.get('/public/:token', async (req, res) => {
  const room = await query(`SELECT * FROM deal_rooms WHERE access_token = $1`, [req.params.token]);
  if (!room.rows[0]) return res.status(404).json({ error: 'Room no encontrado' });

  const [docs, messages] = await Promise.all([
    query(
      `SELECT d.id, d.name, d.status, d.pdf_url, rd.added_at
       FROM room_documents rd JOIN documents d ON d.id = rd.document_id
       WHERE rd.room_id = $1 ORDER BY rd.added_at DESC`,
      [room.rows[0].id]
    ),
    query(
      `SELECT * FROM room_messages WHERE room_id = $1 ORDER BY created_at ASC LIMIT 100`,
      [room.rows[0].id]
    ),
  ]);

  res.json({ ...room.rows[0], documents: docs.rows, messages: messages.rows });
});

export default router;
