import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db/connection.js';
import { requireEditor } from '../middleware/mondayAuth.js';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET debe estar definido en .env');

// POST /api/embed/token — genera token JWT temporal para embedded signing
router.post('/token', requireEditor, async (req, res) => {
  const { signature_id, expires_in = 3600 } = req.body; // expires_in en segundos, default 1h

  if (!signature_id) return res.status(400).json({ error: 'signature_id es requerido' });

  const sigRes = await query(
    `SELECT s.*, d.name AS document_name FROM signatures s
     JOIN documents d ON d.id = s.document_id
     WHERE s.id = $1`,
    [signature_id]
  );
  const sig = sigRes.rows[0];
  if (!sig) return res.status(404).json({ error: 'Firma no encontrada' });
  if (sig.status === 'signed') return res.status(400).json({ error: 'Ya fue firmado' });

  const expiresAt = new Date(Date.now() + expires_in * 1000);
  const token = jwt.sign(
    {
      type:         'embed_sign',
      signature_id: sig.id,
      signer_email: sig.signer_email,
      document_id:  sig.document_id,
    },
    JWT_SECRET,
    { expiresIn: expires_in }
  );

  // Guardar token en BD para revocación
  await query(
    `INSERT INTO embed_tokens (signature_id, token, expires_at)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [signature_id, token, expiresAt]
  );

  const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:8301';

  res.json({
    token,
    expires_at:  expiresAt.toISOString(),
    embed_url:   `${PUBLIC_URL}/sign/${sig.id}?token=${token}`,
    iframe_html: `<iframe src="${PUBLIC_URL}/sign/${sig.id}?token=${token}" width="100%" height="700" frameborder="0" allow="camera"></iframe>`,
  });
});

// GET /api/embed/verify/:token — verifica un token de embed
router.get('/verify/:token', async (req, res) => {
  try {
    const payload = jwt.verify(req.params.token, JWT_SECRET);
    // Verificar que no fue revocado
    const tokenRow = await query(
      `SELECT * FROM embed_tokens WHERE token = $1 AND used = false AND expires_at > NOW()`,
      [req.params.token]
    );
    if (!tokenRow.rows[0]) {
      return res.status(401).json({ error: 'Token inválido o expirado' });
    }
    res.json({ valid: true, payload });
  } catch (e) {
    res.status(401).json({ error: 'Token inválido', detail: e.message });
  }
});

// POST /api/embed/revoke — revocar un token (tras firma exitosa)
router.post('/revoke', async (req, res) => {
  const { token } = req.body;
  await query(`UPDATE embed_tokens SET used = true WHERE token = $1`, [token]);
  res.json({ ok: true });
});

export default router;
