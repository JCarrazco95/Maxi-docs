/**
 * SSO / Auth — Google OAuth 2.0
 * Permite a usuarios externos (no de Monday.com) acceder a Deal Rooms
 * y al panel de administración con Google.
 */
import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { query } from '../db/connection.js';

const router = Router();

const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const JWT_SECRET           = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET debe estar definido en .env');
const PUBLIC_URL           = process.env.PUBLIC_URL || 'http://localhost:8301';

function isGoogleConfigured() {
  return GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET &&
    GOOGLE_CLIENT_ID !== 'tu_google_client_id';
}

// GET /api/auth/google/config — verifica si Google OAuth está configurado
router.get('/google/config', (_req, res) => {
  res.json({
    configured:  isGoogleConfigured(),
    clientId:    isGoogleConfigured() ? GOOGLE_CLIENT_ID : null,
    redirectUri: `${PUBLIC_URL}/api/auth/google/callback`,
    hint: isGoogleConfigured() ? null : 'Configura GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en .env (console.cloud.google.com)',
  });
});

// GET /api/auth/google — inicia el flujo OAuth
router.get('/google', (req, res) => {
  if (!isGoogleConfigured()) {
    return res.status(503).json({ error: 'Google OAuth no configurado' });
  }

  const { returnTo } = req.query;
  const client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, `${PUBLIC_URL}/api/auth/google/callback`);

  const url = client.generateAuthUrl({
    access_type: 'offline',
    scope:       ['email', 'profile'],
    state:       returnTo ? Buffer.from(returnTo).toString('base64') : '',
  });

  res.redirect(url);
});

// GET /api/auth/google/callback — Google redirige aquí tras autenticación
router.get('/google/callback', async (req, res) => {
  if (!isGoogleConfigured()) return res.status(503).send('Google OAuth no configurado');

  const { code, state, error } = req.query;
  if (error) return res.redirect(`${PUBLIC_URL}?auth_error=${error}`);
  if (!code)  return res.status(400).send('Missing code');

  try {
    const client   = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, `${PUBLIC_URL}/api/auth/google/callback`);
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Obtener perfil del usuario
    const ticket = await client.verifyIdToken({
      idToken:  tokens.id_token,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    const sessionToken = jwt.sign(
      {
        type:      'google_sso',
        email:     payload.email,
        name:      payload.name,
        picture:   payload.picture,
        google_id: payload.sub,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Redirigir al frontend con el token en la URL (se guarda en sessionStorage)
    const returnTo = state ? Buffer.from(state, 'base64').toString() : '/';
    res.redirect(`${PUBLIC_URL}${returnTo}?session_token=${sessionToken}`);
  } catch (err) {
    console.error('[Auth/Google]', err.message);
    res.redirect(`${PUBLIC_URL}?auth_error=${encodeURIComponent(err.message)}`);
  }
});

// POST /api/auth/verify — verificar un session token (desde el frontend)
router.post('/verify', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'token es requerido' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    res.json({ valid: true, user: { email: payload.email, name: payload.name, picture: payload.picture } });
  } catch (e) {
    res.status(401).json({ valid: false, error: e.message });
  }
});

// Middleware exportado para proteger rutas con SSO
export function requireGoogleAuth(req, res, next) {
  const token = req.headers['x-session-token'] || req.query.session_token;
  if (!token) return res.status(401).json({ error: 'Autenticación requerida', loginUrl: `${PUBLIC_URL}/api/auth/google` });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.type !== 'google_sso') throw new Error('Token inválido');
    req.googleUser = payload;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Sesión inválida o expirada', loginUrl: `${PUBLIC_URL}/api/auth/google` });
  }
}

export default router;
