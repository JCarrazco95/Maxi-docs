import 'dotenv/config'
import crypto from 'node:crypto'
import { query } from '../db/connection.js'

// ── Config OAuth Google ────────────────────────────────────────
const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const REDIRECT_URI  = process.env.GOOGLE_REDIRECT_URI ||
  `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/integrations/gmail/callback`
const SCOPE         = 'https://www.googleapis.com/auth/gmail.send'

// ── Cifrado simétrico del refresh_token ────────────────────────
// AES-256-GCM. Clave derivada de APP_ENCRYPTION_KEY (min 32 chars en .env)
function getKey() {
  const raw = process.env.APP_ENCRYPTION_KEY || process.env.JWT_SECRET || 'change-in-production-very-long-key'
  return crypto.createHash('sha256').update(raw).digest()
}

export function encrypt(plain) {
  const iv     = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv)
  const enc    = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag    = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

export function decrypt(packed) {
  const buf = Buffer.from(packed, 'base64')
  const iv  = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const enc = buf.subarray(28)
  const dec = crypto.createDecipheriv('aes-256-gcm', getKey(), iv)
  dec.setAuthTag(tag)
  return Buffer.concat([dec.update(enc), dec.final()]).toString('utf8')
}

// ── Generar URL de consentimiento ──────────────────────────────
export function buildAuthUrl(state) {
  if (!CLIENT_ID) throw new Error('GOOGLE_CLIENT_ID no configurado')
  const p = new URLSearchParams({
    client_id:     CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    response_type: 'code',
    scope:         SCOPE,
    access_type:   'offline',     // necesario para obtener refresh_token
    prompt:        'consent',     // fuerza refresh_token aun si ya autorizó antes
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`
}

// ── Intercambiar code por tokens ───────────────────────────────
export async function exchangeCodeForTokens(code) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri:  REDIRECT_URI,
      grant_type:    'authorization_code',
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Google token exchange: ${JSON.stringify(data)}`)
  return data  // { access_token, refresh_token, expires_in, id_token, scope }
}

// ── Obtener email del usuario desde id_token (sin pedir scope extra) ──
export function emailFromIdToken(idToken) {
  if (!idToken) return null
  const [, payload] = idToken.split('.')
  if (!payload) return null
  try {
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return json.email || null
  } catch { return null }
}

// ── Refresh access_token usando refresh_token guardado ────────
async function refreshAccessToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Google refresh: ${JSON.stringify(data)}`)
  return data.access_token
}

// ── Obtener integración Gmail del usuario ──────────────────────
export async function getIntegration(accountId, userId) {
  const r = await query(
    `SELECT id, email, refresh_token, scopes, connected_at
     FROM user_email_integrations
     WHERE monday_account_id = $1 AND monday_user_id = $2 AND provider = 'gmail'`,
    [String(accountId), String(userId)]
  )
  return r.rows[0] || null
}

// ── Guardar / actualizar integración ───────────────────────────
export async function saveIntegration({ accountId, userId, email, refreshToken, scopes }) {
  const encrypted = encrypt(refreshToken)
  await query(
    `INSERT INTO user_email_integrations
       (monday_account_id, monday_user_id, provider, email, refresh_token, scopes)
     VALUES ($1, $2, 'gmail', $3, $4, $5)
     ON CONFLICT (monday_account_id, monday_user_id, provider)
     DO UPDATE SET email = EXCLUDED.email,
                   refresh_token = EXCLUDED.refresh_token,
                   scopes = EXCLUDED.scopes,
                   connected_at = NOW()`,
    [String(accountId), String(userId), email, encrypted, scopes || SCOPE]
  )
}

export async function deleteIntegration(accountId, userId) {
  await query(
    `DELETE FROM user_email_integrations
     WHERE monday_account_id = $1 AND monday_user_id = $2 AND provider = 'gmail'`,
    [String(accountId), String(userId)]
  )
}

// ── Construir RFC 5322 message + enviar ────────────────────────
function buildRawMessage({ from, to, subject, html, replyTo }) {
  const boundary = `mxd-${Date.now().toString(36)}`
  const lines = [
    `From: ${from}`,
    `To: ${Array.isArray(to) ? to.join(', ') : to}`,
    replyTo ? `Reply-To: ${replyTo}` : null,
    `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: text/html; charset="UTF-8"`,
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html, 'utf8').toString('base64'),
  ].filter(Boolean)
  return Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url')
}

export async function sendViaGmail({ accountId, userId, to, subject, html, fromName, replyTo }) {
  const integ = await getIntegration(accountId, userId)
  if (!integ) throw new Error('Usuario no tiene Gmail conectado')

  const refreshToken = decrypt(integ.refresh_token)
  const accessToken  = await refreshAccessToken(refreshToken)

  // From: "Nombre <email@dominio.com>"
  const fromHeader = fromName ? `${fromName} <${integ.email}>` : integ.email

  const raw = buildRawMessage({
    from:    fromHeader,
    to,
    subject,
    html,
    replyTo: replyTo || integ.email,  // por defecto el cliente responde al vendedor
  })

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Gmail send: ${JSON.stringify(data)}`)

  // Actualizar last_used_at
  await query(
    `UPDATE user_email_integrations SET last_used_at = NOW() WHERE id = $1`,
    [integ.id]
  )

  console.log('[Email/Gmail] ✅ Enviado desde', integ.email, 'a', to, '— ID:', data.id)
  return { id: data.id, from: integ.email, provider: 'gmail' }
}

// ── ¿El usuario tiene Gmail conectado? ─────────────────────────
export async function hasGmailConnected(accountId, userId) {
  const integ = await getIntegration(accountId, userId)
  return !!integ
}
