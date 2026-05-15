import 'dotenv/config';
import nodemailer from 'nodemailer';

const RESEND_KEY  = process.env.RESEND_API_KEY;
const SMTP_HOST   = process.env.SMTP_HOST;
const SMTP_PORT   = Number(process.env.SMTP_PORT  || 587);
const SMTP_USER   = process.env.SMTP_USER;
const SMTP_PASS   = process.env.SMTP_PASS;
const FROM        = process.env.EMAIL_FROM || 'MaxiDocs <noreply@maxidocs.app>';

// Detectar qué proveedor está configurado
function getProvider() {
  if (RESEND_KEY && RESEND_KEY !== 'tu_resend_api_key') return 'resend';
  if (SMTP_HOST && SMTP_USER && SMTP_PASS)               return 'smtp';
  return null;
}

// Crear transporter SMTP (reutilizable)
let _smtpTransport;
function getSmtp() {
  if (_smtpTransport) return _smtpTransport;
  _smtpTransport = nodemailer.createTransport({
    host:   SMTP_HOST,
    port:   SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth:   { user: SMTP_USER, pass: SMTP_PASS },
  });
  return _smtpTransport;
}

async function send({ to, subject, html }) {
  const provider = getProvider();

  if (!provider) {
    console.warn('[Email] ⚠️  Sin proveedor configurado. Agrega RESEND_API_KEY o SMTP_HOST/SMTP_USER/SMTP_PASS al .env');
    console.warn('[Email] Email no enviado a:', to, '— Asunto:', subject);
    return { skipped: true };
  }

  const recipients = Array.isArray(to) ? to : [to];

  if (provider === 'resend') {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
      body:    JSON.stringify({ from: FROM, to: recipients, subject, html }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Resend ${res.status}: ${JSON.stringify(data)}`);
    console.log('[Email/Resend] ✅ Enviado a', recipients.join(', '), '— ID:', data.id);
    return data;
  }

  // SMTP
  const info = await getSmtp().sendMail({ from: FROM, to: recipients.join(', '), subject, html });
  console.log('[Email/SMTP] ✅ Enviado a', recipients.join(', '), '— MsgID:', info.messageId);
  return info;
}

// ── Templates ─────────────────────────────────────────────────

function signatureRequestTemplate({ signerName, documentName, signUrl, senderNote, senderName, expireDays }) {
  const expiryText = expireDays ? `Este enlace expira en ${expireDays} días.` : '';
  const from = senderName ? `${senderName} — MAXIRent Renta Empresarial` : 'MAXIRent Renta Empresarial';
  return `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Documento para firma</title>
</head>
<body style="margin:0;padding:0;background:#f6f7fb;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:560px;margin:32px auto;background:white;border-radius:10px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">

  <!-- Header -->
  <div style="background:#1B3055;padding:28px 32px;display:flex;align-items:center;gap:12px;">
    <div style="background:linear-gradient(135deg,#0073ea,#0060c0);width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;">
      <span style="color:white;font-size:18px;font-weight:900;line-height:1;">M</span>
    </div>
    <div>
      <div style="color:white;font-size:18px;font-weight:700;letter-spacing:-0.3px;">Maxi<span style="color:#60a5fa;">Docs</span></div>
      <div style="color:#94a3b8;font-size:11px;margin-top:1px;">Gestión de documentos</div>
    </div>
  </div>

  <!-- Body -->
  <div style="padding:32px;">
    <p style="font-size:16px;font-weight:600;color:#323338;margin:0 0 8px;">Hola, ${signerName} 👋</p>
    <p style="font-size:14px;color:#676879;line-height:1.6;margin:0 0 24px;">
      Tienes un documento pendiente de firma:
    </p>

    <!-- Doc card -->
    <div style="background:#f6f7fb;border:1px solid #e0e2ea;border-radius:8px;padding:18px 20px;margin-bottom:24px;">
      <div style="font-size:12px;color:#9699a6;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Documento</div>
      <div style="font-size:16px;font-weight:700;color:#323338;">${documentName}</div>
    </div>

    <p style="font-size:13px;color:#676879;margin:0 0 16px;">
      Te envía esta propuesta: <strong style="color:#1B3055;">${from}</strong>
    </p>

    ${senderNote ? `
    <div style="background:#fff8e6;border-left:3px solid #f5a623;padding:12px 16px;border-radius:0 6px 6px 0;margin-bottom:24px;">
      <p style="margin:0;font-size:13px;color:#676879;font-style:italic;">"${senderNote}"</p>
    </div>` : ''}

    <!-- CTA Button -->
    <div style="text-align:center;margin:28px 0;">
      <a href="${signUrl}"
         style="display:inline-block;background:linear-gradient(135deg,#0073ea,#0060c0);color:white;text-decoration:none;padding:14px 36px;border-radius:6px;font-size:15px;font-weight:700;letter-spacing:0.2px;box-shadow:0 4px 12px rgba(0,115,234,0.35);">
        ✍️ Firmar documento
      </a>
    </div>

    ${expiryText ? `<p style="text-align:center;font-size:12px;color:#9699a6;margin:0 0 24px;">${expiryText}</p>` : ''}

    <hr style="border:none;border-top:1px solid #e0e2ea;margin:24px 0;">
    <p style="font-size:12px;color:#9699a6;line-height:1.6;margin:0;">
      Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
      <a href="${signUrl}" style="color:#0073ea;word-break:break-all;">${signUrl}</a>
    </p>
  </div>

  <!-- Footer -->
  <div style="background:#f6f7fb;padding:16px 32px;border-top:1px solid #e0e2ea;text-align:center;">
    <p style="margin:0;font-size:11px;color:#9699a6;">
      Enviado via MaxiDocs · Powered by MAXIRent Renta Empresarial
    </p>
  </div>
</div>
</body>
</html>`;
}

function documentSignedTemplate({ documentName, pdfUrl, signerName }) {
  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Documento firmado</title></head>
<body style="margin:0;padding:0;background:#f6f7fb;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:560px;margin:32px auto;background:white;border-radius:10px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
  <div style="background:#1B3055;padding:28px 32px;">
    <div style="color:white;font-size:18px;font-weight:700;">Maxi<span style="color:#60a5fa;">Docs</span></div>
  </div>
  <div style="padding:32px;">
    <div style="text-align:center;margin-bottom:24px;">
      <div style="width:56px;height:56px;background:#e6f4ec;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:28px;">✅</div>
      <p style="font-size:18px;font-weight:700;color:#258750;margin:0;">¡Documento firmado!</p>
    </div>
    <p style="font-size:14px;color:#676879;text-align:center;margin:0 0 24px;">
      <strong>${signerName}</strong> ha firmado el documento <strong>${documentName}</strong>.
    </p>
    ${pdfUrl ? `
    <div style="text-align:center;">
      <a href="${pdfUrl}" style="display:inline-block;background:#258750;color:white;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:700;">
        📄 Descargar PDF firmado
      </a>
    </div>` : ''}
  </div>
</div>
</body>
</html>`;
}

// ── Diagnóstico ────────────────────────────────────────────────
export function getEmailDiagnostics() {
  const provider = getProvider();
  return {
    provider:    provider ?? 'none',
    configured:  !!provider,
    resend_key:  RESEND_KEY && RESEND_KEY !== 'tu_resend_api_key' ? '✅ configurado' : '❌ placeholder o vacío',
    smtp_host:   SMTP_HOST  || '—',
    smtp_user:   SMTP_USER  || '—',
    from:        FROM,
    hint: provider ? null : 'Configura RESEND_API_KEY o SMTP_HOST+SMTP_USER+SMTP_PASS en el .env',
  };
}

export { send };

// ── Exports ───────────────────────────────────────────────────

function buildPortalUrl(signatureId, signUrl) {
  const publicUrl = process.env.PUBLIC_URL;
  if (publicUrl && signatureId) return `${publicUrl}/sign/${signatureId}`;
  return signUrl;
}

export async function sendSignatureRequest({ signatureId, signerName, signerEmail, documentName, signUrl, senderNote, senderName, expireDays }) {
  const portalUrl = buildPortalUrl(signatureId, signUrl);
  await send({
    to:      signerEmail,
    subject: `✍️ Documento para firma: ${documentName}`,
    html:    signatureRequestTemplate({ signerName, documentName, signUrl: portalUrl, senderNote, senderName, expireDays }),
  });
}

export async function sendSignedNotification({ toEmail, documentName, pdfUrl, signerName }) {
  await send({
    to:      toEmail,
    subject: `✅ Firmado: ${documentName}`,
    html:    documentSignedTemplate({ documentName, pdfUrl, signerName }),
  });
}

export async function sendViewedNotification({ toEmail, documentName, signerName, signerEmail }) {
  await send({
    to:      toEmail,
    subject: `👁️ ${signerName} abrió el documento: ${documentName}`,
    html: `
<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f6f7fb;font-family:Arial,sans-serif;">
<div style="max-width:520px;margin:32px auto;background:white;border-radius:10px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
  <div style="background:#1B3055;padding:24px 32px;">
    <div style="color:white;font-size:18px;font-weight:700;">Maxi<span style="color:#60a5fa;">Docs</span></div>
  </div>
  <div style="padding:28px 32px;">
    <p style="font-size:16px;font-weight:600;color:#323338;margin:0 0 8px;">Documento abierto 👁️</p>
    <p style="font-size:14px;color:#676879;line-height:1.6;margin:0 0 20px;">
      <strong>${signerName}</strong> (${signerEmail}) acaba de abrir el documento
      <strong>"${documentName}"</strong> para revisarlo.
    </p>
    <p style="font-size:12px;color:#94a3b8;margin:0;">Notificación automática de MaxiDocs · MAXIRent</p>
  </div>
</div>
</body></html>`,
  });
}
