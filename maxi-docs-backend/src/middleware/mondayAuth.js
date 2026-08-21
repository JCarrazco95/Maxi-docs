/**
 * Autenticación de las peticiones que vienen de la app embebida en Monday.com.
 *
 * ANTES: `extractMondayContext` copiaba los headers x-monday-account-id,
 * x-monday-user-id y x-monday-is-admin a un objeto y se los creía. Nadie los
 * firmaba. Cualquiera con la URL del backend podía mandar
 *     curl ... -H "x-monday-account-id: <la que sea>" -H "x-monday-is-admin: true"
 * y leer, modificar o borrar los datos de cualquier cuenta. El aislamiento
 * multi-tenant por monday_account_id era decorativo.
 *
 * AHORA: el frontend pide monday.get('sessionToken') — un JWT que Monday firma
 * con el signing secret de la app — y lo manda en Authorization: Bearer. Aquí se
 * verifica la firma con MONDAY_SIGNING_SECRET, así que la identidad ya no la
 * elige el cliente.
 *
 * Forma del payload (developer.monday.com/apps/docs/mondayget):
 *   { exp, iat, dat: { account_id, user_id, user_kind, is_view_only, ... } }
 * Las peticiones de integración usan una forma plana: { accountId, userId, ... }.
 * Se aceptan las dos.
 */
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const SIGNING_SECRET = process.env.MONDAY_SIGNING_SECRET;

/**
 * Compatibilidad para desarrollo local: permite seguir identificándose con los
 * headers de siempre, sin firma. Es exactamente el agujero que este archivo
 * viene a cerrar, así que hay que activarlo A PROPÓSITO — el valor por defecto
 * es "no", para que un despliegue que olvide configurarlo quede seguro y no
 * abierto.
 */
const ALLOW_HEADER_AUTH = process.env.ALLOW_HEADER_AUTH === 'true';

if (ALLOW_HEADER_AUTH) {
  console.warn(
    '\n⚠️  ALLOW_HEADER_AUTH=true — la identidad se acepta por headers SIN FIRMAR.\n' +
    '    Esto es solo para desarrollo local. NUNCA en producción.\n'
  );
}
if (!SIGNING_SECRET && !ALLOW_HEADER_AUTH) {
  throw new Error(
    'MONDAY_SIGNING_SECRET no está definido. Sin él no se puede verificar la ' +
    'identidad de las peticiones. Para desarrollo local usa ALLOW_HEADER_AUTH=true.'
  );
}

// ── Verificación del sessionToken ────────────────────────────────────────

/**
 * Verifica la firma del token y devuelve la identidad. Lanza si no es válido.
 * @param {string} token
 */
export function verifyMondaySessionToken(token) {
  const payload = jwt.verify(token, SIGNING_SECRET, { algorithms: ['HS256'] });

  const dat = payload.dat ?? {};
  const accountId = dat.account_id ?? payload.accountId;
  const userId    = dat.user_id    ?? payload.userId;

  if (accountId == null || userId == null) {
    throw new Error('El token no trae account_id / user_id');
  }

  return {
    accountId:  String(accountId),
    userId:     String(userId),
    userKind:   dat.user_kind ?? null,
    isViewOnly: Boolean(dat.is_view_only),
  };
}

// ── Resolución del rol ───────────────────────────────────────────────────
// El sessionToken no siempre trae user_kind. Cuando falta, se le pregunta a
// Monday si el usuario es administrador y se cachea un rato: es una llamada de
// red y esto corre en cada petición.

const adminCache = new Map();          // userId → { isAdmin, expires }
const ADMIN_TTL_MS = 10 * 60 * 1000;

async function lookupIsAdmin(userId) {
  const cached = adminCache.get(userId);
  if (cached && cached.expires > Date.now()) return cached.isAdmin;

  const token = process.env.MONDAY_API_TOKEN;
  if (!token) return false;            // sin forma de comprobarlo: no es admin

  try {
    const res = await fetch('https://api.monday.com/v2', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token },
      body:    JSON.stringify({ query: `{ users(ids: [${Number(userId)}]) { is_admin } }` }),
    });
    const data = await res.json();
    const isAdmin = Boolean(data?.data?.users?.[0]?.is_admin);
    adminCache.set(userId, { isAdmin, expires: Date.now() + ADMIN_TTL_MS });
    return isAdmin;
  } catch (e) {
    console.warn('[Auth] No se pudo consultar si el usuario es admin:', e.message);
    return false;                      // ante la duda, no es admin
  }
}

/** Traduce la identidad del token a los roles que usan las rutas. */
async function resolveRole(identity) {
  if (identity.isViewOnly || identity.userKind === 'view_only' || identity.userKind === 'guest') {
    return { isAdmin: false, role: 'viewer' };
  }
  if (identity.userKind === 'admin') {
    return { isAdmin: true, role: 'admin' };
  }
  if (identity.userKind) {             // 'member' u otro: editor normal
    return { isAdmin: false, role: 'editor' };
  }
  const isAdmin = await lookupIsAdmin(identity.userId);
  return { isAdmin, role: isAdmin ? 'admin' : 'editor' };
}

// ── Middleware principal ─────────────────────────────────────────────────

/**
 * Resuelve la identidad de la petición y la deja en req.mondayContext.
 * NO rechaza: de eso se encarga requireAuth, para que las rutas públicas
 * (portal del firmante, callbacks de OAuth) puedan pasar sin identidad.
 */
export async function extractMondayContext(req, _res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (token && SIGNING_SECRET) {
    try {
      const identity = verifyMondaySessionToken(token);
      const { isAdmin, role } = await resolveRole(identity);
      req.mondayContext = {
        accountId:   identity.accountId,
        userId:      identity.userId,
        isAdmin,
        role,
        workspaceId: req.headers['x-monday-workspace-id'] || null,
        via:         'session-token',
      };
      return next();
    } catch (e) {
      // Token presente pero inválido o caducado: se anota y se sigue sin
      // identidad. requireAuth devolverá 401 y el frontend pedirá uno nuevo.
      req.authError = e.message;
    }
  }

  if (ALLOW_HEADER_AUTH) {
    const accountId = req.headers['x-monday-account-id'];
    const userId    = req.headers['x-monday-user-id'];
    if (accountId) {
      req.mondayContext = {
        accountId:   String(accountId),
        userId:      String(userId ?? 'dev'),
        isAdmin:     req.headers['x-monday-is-admin'] === 'true',
        role:        req.headers['x-monday-is-admin'] === 'true' ? 'admin'
                   : (req.headers['x-monday-role'] || 'editor'),
        workspaceId: req.headers['x-monday-workspace-id'] || null,
        via:         'headers-sin-firmar',
      };
      return next();
    }
  }

  // Sin identidad. Ya no se inventa una cuenta 'dev' por defecto: eso hacía que
  // una petición anónima se tratara como un inquilino real.
  req.mondayContext = null;
  next();
}

/** Rechaza la petición si no se pudo establecer una identidad verificada. */
export function requireAuth(req, res, next) {
  if (req.mondayContext) return next();
  return res.status(401).json({
    error:  'Sesión no válida. Vuelve a abrir la app desde Monday.com.',
    code:   'AUTH_REQUIRED',
    detail: req.authError,
  });
}

// ── Middlewares de rol ───────────────────────────────────────────────────

export function requireAdmin(req, res, next) {
  if (!req.mondayContext) {
    return res.status(401).json({ error: 'Sesión no válida', code: 'AUTH_REQUIRED' });
  }
  if (!req.mondayContext.isAdmin) {
    return res.status(403).json({ error: 'Se requieren permisos de administrador' });
  }
  next();
}

export function requireEditor(req, res, next) {
  if (!req.mondayContext) {
    return res.status(401).json({ error: 'Sesión no válida', code: 'AUTH_REQUIRED' });
  }
  if (req.mondayContext.role === 'viewer') {
    return res.status(403).json({ error: 'No tienes permisos para realizar esta acción' });
  }
  next();
}

// ── Webhooks entrantes de Monday ─────────────────────────────────────────

/**
 * Valida que la request viene de Monday comparando la firma HMAC del cuerpo.
 * Se usa en los endpoints que Monday llama directamente, no en los del frontend.
 */
export function validateMondayWebhook(req, res, next) {
  const signature = req.headers['x-monday-signature'];
  if (!signature) {
    return res.status(401).json({ error: 'Falta la firma de Monday' });
  }
  if (!SIGNING_SECRET) {
    return res.status(503).json({ error: 'MONDAY_SIGNING_SECRET no configurado' });
  }

  const hmac = crypto
    .createHmac('sha256', SIGNING_SECRET)
    .update(JSON.stringify(req.body))
    .digest('hex');

  // timingSafeEqual en vez de !==, para no filtrar la firma byte a byte.
  const a = Buffer.from(hmac, 'utf8');
  const b = Buffer.from(String(signature), 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Firma de Monday inválida' });
  }
  next();
}
