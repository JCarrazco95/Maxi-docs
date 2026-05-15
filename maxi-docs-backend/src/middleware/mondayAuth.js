import crypto from 'crypto';

/**
 * Valida que la request proviene de Monday.com usando el Signing Secret.
 * Debe aplicarse solo a endpoints que Monday llama directamente (webhooks).
 * Las requests del frontend usan el token del usuario, no este middleware.
 */
export function validateMondayWebhook(req, res, next) {
  const signature = req.headers['x-monday-signature'];

  if (!signature) {
    return res.status(401).json({ error: 'Missing Monday signature' });
  }

  const secret = process.env.MONDAY_SIGNING_SECRET;
  const body = JSON.stringify(req.body);
  const hmac = crypto.createHmac('sha256', secret).update(body).digest('hex');

  if (hmac !== signature) {
    return res.status(401).json({ error: 'Invalid Monday signature' });
  }

  next();
}

/**
 * Extrae el accountId y userId de Monday del header de authorization.
 * Monday envia un JWT cuando la app esta embebida — por ahora parseamos
 * los headers que el SDK de Monday adjunta automaticamente.
 */
export function extractMondayContext(req, res, next) {
  req.mondayContext = {
    accountId:   req.headers['x-monday-account-id']  || 'dev',
    userId:      req.headers['x-monday-user-id']     || 'dev',
    isAdmin:     req.headers['x-monday-is-admin']    === 'true',
    workspaceId: req.headers['x-monday-workspace-id'] || null, // workspace activo
    role: req.headers['x-monday-is-admin'] === 'true' ? 'admin'
        : req.headers['x-monday-role'] || 'editor',
  };
  next();
}

// Middlewares de rol para usar en rutas específicas
export function requireAdmin(req, res, next) {
  if (!req.mondayContext?.isAdmin) {
    return res.status(403).json({ error: 'Se requieren permisos de administrador' });
  }
  next();
}

export function requireEditor(req, res, next) {
  const role = req.mondayContext?.role;
  if (role === 'viewer') {
    return res.status(403).json({ error: 'No tienes permisos para realizar esta acción' });
  }
  next();
}
