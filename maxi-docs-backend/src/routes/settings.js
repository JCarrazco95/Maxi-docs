import { Router } from 'express';
import { query } from '../db/connection.js';
import { requireAdmin } from '../middleware/mondayAuth.js';
import { send as sendEmail, getEmailDiagnostics } from '../services/emailService.js';

const router = Router();

// GET /api/settings — obtener configuración de la cuenta
router.get('/', async (req, res) => {
  const { accountId } = req.mondayContext;
  const result = await query(
    `SELECT * FROM account_settings WHERE monday_account_id = $1`,
    [accountId]
  );
  // Devolver defaults si no existe
  res.json(result.rows[0] ?? {
    monday_account_id: accountId,
    company_name:  'MAXIRent Renta Empresarial',
    logo_url:      null,
    primary_color: '#1B3055',
    email_from_name: 'MaxiDocs',
    notify_email:  null,
    webhook_url:   null,
  });
});

// PUT /api/settings — crear o actualizar configuración
router.put('/', async (req, res) => {
  const { accountId } = req.mondayContext;
  const { company_name, logo_url, primary_color, email_from_name, notify_email, webhook_url } = req.body;

  const result = await query(
    `INSERT INTO account_settings
       (monday_account_id, company_name, logo_url, primary_color, email_from_name, notify_email, webhook_url, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (monday_account_id) DO UPDATE SET
       company_name    = COALESCE(EXCLUDED.company_name,    account_settings.company_name),
       logo_url        = COALESCE(EXCLUDED.logo_url,        account_settings.logo_url),
       primary_color   = COALESCE(EXCLUDED.primary_color,   account_settings.primary_color),
       email_from_name = COALESCE(EXCLUDED.email_from_name, account_settings.email_from_name),
       notify_email    = COALESCE(EXCLUDED.notify_email,    account_settings.notify_email),
       webhook_url     = COALESCE(EXCLUDED.webhook_url,     account_settings.webhook_url),
       updated_at      = NOW()
     RETURNING *`,
    [accountId, company_name, logo_url, primary_color, email_from_name, notify_email, webhook_url]
  );
  res.json(result.rows[0]);
});

// GET /api/settings/webhooks — listar webhooks configurados
router.get('/webhooks', async (req, res) => {
  const { accountId } = req.mondayContext;
  const result = await query(
    `SELECT * FROM webhook_configs WHERE monday_account_id = $1 ORDER BY created_at DESC`,
    [accountId]
  );
  res.json(result.rows);
});

// POST /api/settings/webhooks — agregar webhook
router.post('/webhooks', async (req, res) => {
  const { accountId } = req.mondayContext;
  const { url, events } = req.body;
  if (!url) return res.status(400).json({ error: 'url es requerida' });

  // Prevenir SSRF — solo URLs HTTPS externas
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).json({ error: 'url debe usar http o https' });
    }
    const blocked = ['localhost', '127.0.0.1', '0.0.0.0', '::1', '169.254.169.254'];
    if (blocked.some(h => parsed.hostname === h) || parsed.hostname.endsWith('.local')) {
      return res.status(400).json({ error: 'url apunta a una dirección no permitida' });
    }
  } catch {
    return res.status(400).json({ error: 'url inválida' });
  }

  const validEvents = ['document.sent', 'document.signed', 'document.viewed', 'document.rejected'];
  const safeEvents = Array.isArray(events)
    ? events.filter(e => validEvents.includes(e))
    : ['document.sent', 'document.signed'];

  const result = await query(
    `INSERT INTO webhook_configs (monday_account_id, url, events) VALUES ($1, $2, $3) RETURNING *`,
    [accountId, url, safeEvents]
  );
  res.status(201).json(result.rows[0]);
});

// DELETE /api/settings/webhooks/:id — eliminar webhook
router.delete('/webhooks/:id', async (req, res) => {
  const { accountId } = req.mondayContext;
  await query(
    `DELETE FROM webhook_configs WHERE id = $1 AND monday_account_id = $2`,
    [req.params.id, accountId]
  );
  res.status(204).end();
});

// GET /api/settings/email/status — diagnóstico de configuración de email
router.get('/email/status', (_req, res) => {
  res.json(getEmailDiagnostics());
});

// POST /api/settings/email/test — enviar email de prueba
router.post('/email/test', async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'Proporciona to (email destino)' });

  const diag = getEmailDiagnostics();
  if (!diag.configured) {
    return res.status(503).json({
      error: 'Email no configurado',
      diagnostics: diag,
      instructions: [
        'Opción 1 — Resend: agrega RESEND_API_KEY=re_... al .env (obtén la clave en resend.com)',
        'Opción 2 — Gmail SMTP: agrega SMTP_HOST=smtp.gmail.com, SMTP_PORT=587, SMTP_USER=tu@gmail.com, SMTP_PASS=tu-app-password al .env',
      ],
    });
  }

  try {
    await sendEmail({
      to,
      subject: '✅ MaxiDocs — Email de prueba',
      html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:32px auto;padding:24px;border:1px solid #e0e2ea;border-radius:10px;">
        <h2 style="color:#1B3055;margin:0 0 12px;">✅ Email funcionando</h2>
        <p>Si recibes este mensaje, la configuración de email en MaxiDocs es correcta.</p>
        <p style="color:#94a3b8;font-size:12px;margin-top:20px;">Proveedor: <strong>${diag.provider}</strong> · Enviado desde: ${diag.from}</p>
      </div>`,
    });
    res.json({ ok: true, to, provider: diag.provider });
  } catch (err) {
    res.status(500).json({ error: err.message, diagnostics: diag });
  }
});

export default router;
