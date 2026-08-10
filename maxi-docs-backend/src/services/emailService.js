import 'dotenv/config';
import nodemailer from 'nodemailer';
import { hasGmailConnected, sendViaGmail } from './gmailService.js';

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

/** Extrae solo la dirección de email de un string tipo "Nombre <email@x.com>" */
function extractEmail(fromStr) {
  const m = (fromStr || '').match(/<([^>]+)>/)
  return m ? m[1] : (fromStr || '').trim()
}

// attachments: [{ filename, content: Buffer, mimeType }] — opcional
async function send({ to, subject, html, from: fromOverride, replyTo, attachments }) {
  const provider = getProvider();

  if (!provider) {
    console.warn('[Email] ⚠️  Sin proveedor configurado. Agrega RESEND_API_KEY o SMTP_HOST/SMTP_USER/SMTP_PASS al .env');
    console.warn('[Email] Email no enviado a:', to, '— Asunto:', subject);
    return { skipped: true };
  }

  const recipients  = Array.isArray(to) ? to : [to];
  const fromAddress = fromOverride || FROM;

  if (provider === 'resend') {
    const body = { from: fromAddress, to: recipients, subject, html };
    if (replyTo) body.reply_to = replyTo;   // Resend usa reply_to
    if (attachments?.length) {
      body.attachments = attachments.map(a => ({ filename: a.filename, content: a.content.toString('base64') }));
    }
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
      body:    JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Resend ${res.status}: ${JSON.stringify(data)}`);
    console.log('[Email/Resend] ✅ Enviado a', recipients.join(', '), '— ID:', data.id);
    return data;
  }

  // SMTP (nodemailer)
  const mail = { from: fromAddress, to: recipients.join(', '), subject, html };
  if (replyTo) mail.replyTo = replyTo;      // nodemailer usa replyTo
  if (attachments?.length) {
    mail.attachments = attachments.map(a => ({ filename: a.filename, content: a.content, contentType: a.mimeType }));
  }
  const info = await getSmtp().sendMail(mail);
  console.log('[Email/SMTP] ✅ Enviado a', recipients.join(', '), '— MsgID:', info.messageId);
  return info;
}

// ── Templates ─────────────────────────────────────────────────

// Paleta de marca MAXIRent Empresas
const BRAND_ORANGE = '#CC6227';
const BRAND_NAVY    = '#1A394C';

function firstNameOf(fullName) {
  return (fullName || '').trim().split(/\s+/)[0] || fullName || '';
}

function formatUnidades(unidades) {
  if (!unidades || !unidades.length) return '—';
  if (unidades.length <= 3) return unidades.join(', ');
  return `${unidades.slice(0, 3).join(', ')} y ${unidades.length - 3} más`;
}

function signatureRequestTemplate({
  signerName, documentName, signUrl, senderNote, senderName, senderEmail, expireDays,
  previewImageUrl, unidades, plazo,
}) {
  const expiryText  = expireDays ? `Este enlace expira en ${expireDays} días.` : '';
  const contactEmail = senderEmail || process.env.NOTIFY_EMAIL || extractEmail(FROM);
  const contactHref   = `mailto:${contactEmail}?subject=${encodeURIComponent('Consulta sobre mi propuesta: ' + documentName)}`;
  const adjustHref     = `mailto:${contactEmail}?subject=${encodeURIComponent('Solicito ajustes a mi propuesta: ' + documentName)}`;

  return `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Propuesta comercial</title>
</head>
<body style="margin:0;padding:0;background:#f2f4f5;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:560px;margin:32px auto;background:white;border-radius:10px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">

  <!-- Header -->
  <div style="background:#ffffff;padding:24px 32px 20px;">
    <img src="https://analy-sys.pro/wp-content/uploads/2026/08/MAXIRent-Renta-Empresarial-01.png"
         alt="MAXIRent Renta Empresarial" width="180" style="display:block;width:180px;max-width:180px;height:auto;">
  </div>
  <div style="height:4px;background:${BRAND_ORANGE};"></div>

  <!-- Body -->
  <div style="padding:32px;">
    <div style="font-size:11px;font-weight:700;color:${BRAND_ORANGE};text-transform:uppercase;letter-spacing:0.8px;margin:0 0 10px;">
      Tu propuesta está lista
    </div>
    <p style="font-size:20px;font-weight:700;color:${BRAND_NAVY};margin:0 0 10px;">Hola, ${firstNameOf(signerName)} 👋</p>
    <p style="font-size:14px;color:#5b6b74;line-height:1.6;margin:0 0 24px;">
      Preparamos una propuesta personalizada de acuerdo con las necesidades de tu empresa.
    </p>

    <!-- Doc card -->
    <div style="background:#f4f6f7;border:1px solid #e2e8ec;border-radius:10px;padding:20px;margin-bottom:20px;">
      <div style="display:flex;align-items:center;gap:10px;padding-bottom:14px;margin-bottom:14px;border-bottom:1px solid #e2e8ec;">
        <span style="font-size:20px;">📄</span>
        <span style="font-size:15px;font-weight:700;color:${BRAND_NAVY};">${documentName}</span>
      </div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;">
        <tr>
          <td style="padding:6px 0;color:#5b6b74;">🚚&nbsp; Unidades cotizadas</td>
          <td style="padding:6px 0;color:${BRAND_NAVY};font-weight:700;text-align:right;">${formatUnidades(unidades)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#5b6b74;">📅&nbsp; Plazo</td>
          <td style="padding:6px 0;color:${BRAND_NAVY};font-weight:700;text-align:right;">${plazo || '—'}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#5b6b74;">🧑‍💼&nbsp; Ejecutivo</td>
          <td style="padding:6px 0;color:${BRAND_NAVY};font-weight:700;text-align:right;">${senderName || 'MAXIRent Empresas'}</td>
        </tr>
      </table>
    </div>

    ${previewImageUrl ? `
    <!-- Vista previa de la cotización -->
    <div style="margin:0 0 24px;border:1px solid #e2e8ec;border-radius:10px;overflow:hidden;">
      <img src="${previewImageUrl}" alt="Vista previa de ${documentName}" width="496" style="display:block;width:100%;max-width:496px;height:auto;">
    </div>` : ''}

    ${senderNote ? `
    <div style="background:#fbeee8;border-left:3px solid ${BRAND_ORANGE};padding:12px 16px;border-radius:0 6px 6px 0;margin-bottom:24px;">
      <p style="margin:0;font-size:13px;color:#5b6b74;font-style:italic;">"${senderNote}"</p>
    </div>` : ''}

    <!-- CTA Button (Outlook-friendly: VML como fallback) -->
    <div style="text-align:center;margin:8px 0 12px;">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
                   href="${signUrl}" style="height:48px;v-text-anchor:middle;width:240px;" arcsize="13%" stroke="f" fillcolor="${BRAND_ORANGE}">
        <w:anchorlock/>
        <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">
          Revisar mi cotización
        </center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-- -->
      <a href="${signUrl}"
         style="display:block;background-color:${BRAND_ORANGE};color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:6px;font-size:15px;font-weight:700;letter-spacing:0.2px;mso-padding-alt:0;">
        <span style="color:#ffffff;">👁&nbsp; Revisar mi cotización</span>
      </a>
      <!--<![endif]-->
    </div>

    <p style="text-align:center;font-size:12px;color:#8a97a0;margin:0 0 28px;">
      🛡️&nbsp; Revisarla no implica compromiso ni aceptación.
    </p>

    ${expiryText ? `<p style="text-align:center;font-size:12px;color:#9699a6;margin:0 0 20px;">${expiryText}</p>` : ''}

    <!-- Soporte -->
    <div style="background:#f4f6f7;border-radius:10px;padding:18px 20px;">
      <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:14px;">
        <span style="font-size:18px;">🎧</span>
        <div>
          <div style="font-size:14px;font-weight:700;color:${BRAND_NAVY};margin-bottom:2px;">¿Necesitas algún ajuste?</div>
          <div style="font-size:13px;color:#5b6b74;">Tu ejecutivo puede ayudarte a modificar unidades, plazo o servicios.</div>
        </div>
      </div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="padding-right:6px;width:50%;">
          <a href="${contactHref}" style="display:block;text-align:center;border:1px solid #c7d0d6;color:${BRAND_NAVY};text-decoration:none;padding:10px 8px;border-radius:6px;font-size:12.5px;font-weight:700;">
            👤&nbsp; Contactar a mi ejecutivo
          </a>
        </td>
        <td style="padding-left:6px;width:50%;">
          <a href="${adjustHref}" style="display:block;text-align:center;border:1px solid #c7d0d6;color:${BRAND_NAVY};text-decoration:none;padding:10px 8px;border-radius:6px;font-size:12.5px;font-weight:700;">
            ⚙️&nbsp; Solicitar ajustes
          </a>
        </td>
      </tr></table>
    </div>

    <hr style="border:none;border-top:1px solid #e2e8ec;margin:24px 0 16px;">
    <p style="font-size:12px;color:#9699a6;line-height:1.6;margin:0;">
      Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
      <a href="${signUrl}" style="color:${BRAND_ORANGE};word-break:break-all;">${signUrl}</a>
    </p>
  </div>

  <!-- Footer -->
  <div style="background:#f4f6f7;padding:16px 32px;border-top:1px solid #e2e8ec;text-align:center;">
    <p style="margin:0;font-size:11px;color:#8a97a0;">
      🏢&nbsp; MAXIRent · Soluciones de movilidad para empresas
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

export async function sendSignatureRequest({
  signatureId, signerName, signerEmail, documentName, signUrl,
  senderNote, senderName, senderEmail, expireDays,
  senderAccountId, senderUserId,   // ← NUEVO: para enviar desde Gmail del vendedor
  attachments,                     // [{ filename, content: Buffer, mimeType }] — opcional
  previewImageUrl,                 // URL de la miniatura del documento — opcional
  unidades,                        // string[] — nombres de las unidades cotizadas
  plazo,                           // string — "Duración del Proyecto" del lead en Monday
}) {
  const portalUrl = buildPortalUrl(signatureId, signUrl);
  const subject   = `📋 Propuesta comercial: ${documentName}`;
  const html      = signatureRequestTemplate({
    signerName, documentName, signUrl: portalUrl, senderNote, senderName, senderEmail,
    expireDays, previewImageUrl, unidades, plazo,
  });

  // ── 1. Intentar enviar desde Gmail del vendedor si está conectado ──
  if (senderAccountId && senderUserId) {
    try {
      const hasGmail = await hasGmailConnected(senderAccountId, senderUserId);
      if (hasGmail) {
        return await sendViaGmail({
          accountId: senderAccountId,
          userId:    senderUserId,
          to:        signerEmail,
          subject,
          html,
          fromName:  senderName || 'MAXIRent',
          replyTo:   senderEmail || undefined,
          attachments,
        });
      }
    } catch (e) {
      console.warn('[Email] Gmail del vendedor falló, fallback a Resend:', e.message);
    }
  }

  // ── 2. Fallback al provider configurado (Resend/SMTP) ──
  // Construir From dinámico: "Juan García via MaxiDocs <noreply@maxidocs.app>"
  const baseEmail   = extractEmail(FROM)
  const fromDisplay = senderName
    ? `${senderName} via MaxiDocs <${baseEmail}>`
    : FROM

  await send({
    to:      signerEmail,
    subject,
    html,
    from:    fromDisplay,
    replyTo: senderEmail || undefined,
    attachments,
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
