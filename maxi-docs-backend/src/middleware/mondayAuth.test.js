/**
 * Pruebas del hallazgo #1: la identidad venía en headers sin firmar.
 * Aquí se comprueba que ahora solo se acepta un JWT firmado con el signing
 * secret de la app, y que un token manipulado no pasa.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import jwt from 'jsonwebtoken';

const SECRETO = 'secreto-de-prueba-para-los-tests';

// El middleware lee las variables al importarse, así que hay que ponerlas antes.
process.env.MONDAY_SIGNING_SECRET = SECRETO;
process.env.ALLOW_HEADER_AUTH = 'false';

let verifyMondaySessionToken, extractMondayContext, requireAuth, requireAdmin, requireEditor;

beforeAll(async () => {
  const mod = await import('./mondayAuth.js');
  ({ verifyMondaySessionToken, extractMondayContext, requireAuth, requireAdmin, requireEditor } = mod);
});

/** Token como el que emite Monday: firmado con el signing secret de la app. */
function tokenDeMonday(dat = {}, opciones = {}) {
  return jwt.sign(
    { dat: { account_id: 12345678, user_id: 4012689, ...dat } },
    opciones.secreto ?? SECRETO,
    { expiresIn: opciones.expiresIn ?? '1h', ...(opciones.jwt ?? {}) }
  );
}

/** Simula req/res/next de Express. */
function contexto({ authorization, headers = {} } = {}) {
  const req = { headers: { ...(authorization ? { authorization } : {}), ...headers } };
  const res = {
    statusCode: null, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b)   { this.body = b; return this; },
  };
  let llamoNext = false;
  const next = () => { llamoNext = true; };
  return { req, res, next, seSiguio: () => llamoNext };
}

describe('verifyMondaySessionToken', () => {
  it('acepta un token bien firmado y saca la cuenta y el usuario', () => {
    const id = verifyMondaySessionToken(tokenDeMonday());
    expect(id.accountId).toBe('12345678');
    expect(id.userId).toBe('4012689');
  });

  it('acepta también la forma plana de las peticiones de integración', () => {
    const token = jwt.sign({ accountId: 999, userId: 111 }, SECRETO, { expiresIn: '1h' });
    const id = verifyMondaySessionToken(token);
    expect(id.accountId).toBe('999');
    expect(id.userId).toBe('111');
  });

  it('RECHAZA un token firmado con otro secreto', () => {
    const falso = tokenDeMonday({}, { secreto: 'otro-secreto-cualquiera' });
    expect(() => verifyMondaySessionToken(falso)).toThrow();
  });

  it('RECHAZA un token sin firma (alg: none)', () => {
    const sinFirma = jwt.sign({ dat: { account_id: 1, user_id: 2 } }, '', { algorithm: 'none' });
    expect(() => verifyMondaySessionToken(sinFirma)).toThrow();
  });

  it('RECHAZA un token caducado', () => {
    const viejo = tokenDeMonday({}, { expiresIn: '-1h' });
    expect(() => verifyMondaySessionToken(viejo)).toThrow(/expired/i);
  });

  it('RECHAZA un payload manipulado aunque el resto del token sea válido', () => {
    const [cabecera, , firma] = tokenDeMonday().split('.');
    const payloadFalso = Buffer
      .from(JSON.stringify({ dat: { account_id: 'otra-empresa', user_id: 1 } }))
      .toString('base64url');
    expect(() => verifyMondaySessionToken(`${cabecera}.${payloadFalso}.${firma}`)).toThrow();
  });

  it('rechaza un token válido que no trae cuenta ni usuario', () => {
    const vacio = jwt.sign({ dat: {} }, SECRETO, { expiresIn: '1h' });
    expect(() => verifyMondaySessionToken(vacio)).toThrow(/account_id/);
  });
});

describe('extractMondayContext', () => {
  it('deja la identidad verificada en req.mondayContext', async () => {
    const c = contexto({ authorization: `Bearer ${tokenDeMonday()}` });
    await extractMondayContext(c.req, c.res, c.next);
    expect(c.req.mondayContext.accountId).toBe('12345678');
    expect(c.req.mondayContext.via).toBe('session-token');
    expect(c.seSiguio()).toBe(true);
  });

  it('NO se cree los headers x-monday-* cuando el modo compatibilidad está apagado', async () => {
    const c = contexto({ headers: {
      'x-monday-account-id': 'empresa-ajena',
      'x-monday-is-admin':   'true',
    }});
    await extractMondayContext(c.req, c.res, c.next);
    expect(c.req.mondayContext).toBeNull();
  });

  it('ya no inventa la cuenta "dev" cuando no hay identidad', async () => {
    const c = contexto();
    await extractMondayContext(c.req, c.res, c.next);
    expect(c.req.mondayContext).toBeNull();
  });

  it('con un token inválido deja constancia del motivo y sigue sin identidad', async () => {
    const c = contexto({ authorization: 'Bearer esto-no-es-un-jwt' });
    await extractMondayContext(c.req, c.res, c.next);
    expect(c.req.mondayContext).toBeNull();
    expect(c.req.authError).toBeTruthy();
  });

  it('un usuario de solo lectura queda como viewer', async () => {
    const c = contexto({ authorization: `Bearer ${tokenDeMonday({ is_view_only: true })}` });
    await extractMondayContext(c.req, c.res, c.next);
    expect(c.req.mondayContext.role).toBe('viewer');
    expect(c.req.mondayContext.isAdmin).toBe(false);
  });

  it('user_kind=admin da rol de administrador', async () => {
    const c = contexto({ authorization: `Bearer ${tokenDeMonday({ user_kind: 'admin' })}` });
    await extractMondayContext(c.req, c.res, c.next);
    expect(c.req.mondayContext.isAdmin).toBe(true);
  });

  it('user_kind=member da rol de editor, no de admin', async () => {
    const c = contexto({ authorization: `Bearer ${tokenDeMonday({ user_kind: 'member' })}` });
    await extractMondayContext(c.req, c.res, c.next);
    expect(c.req.mondayContext.isAdmin).toBe(false);
    expect(c.req.mondayContext.role).toBe('editor');
  });

  it('un invitado no puede editar', async () => {
    const c = contexto({ authorization: `Bearer ${tokenDeMonday({ user_kind: 'guest' })}` });
    await extractMondayContext(c.req, c.res, c.next);
    expect(c.req.mondayContext.role).toBe('viewer');
  });
});

describe('guardas de acceso', () => {
  it('requireAuth devuelve 401 sin identidad', () => {
    const c = contexto();
    c.req.mondayContext = null;
    requireAuth(c.req, c.res, c.next);
    expect(c.res.statusCode).toBe(401);
    expect(c.res.body.code).toBe('AUTH_REQUIRED');
    expect(c.seSiguio()).toBe(false);
  });

  it('requireAuth deja pasar con identidad', () => {
    const c = contexto();
    c.req.mondayContext = { accountId: '1', userId: '2', role: 'editor' };
    requireAuth(c.req, c.res, c.next);
    expect(c.seSiguio()).toBe(true);
  });

  it('requireAdmin devuelve 403 a un editor', () => {
    const c = contexto();
    c.req.mondayContext = { accountId: '1', userId: '2', isAdmin: false, role: 'editor' };
    requireAdmin(c.req, c.res, c.next);
    expect(c.res.statusCode).toBe(403);
  });

  it('requireAdmin deja pasar a un admin', () => {
    const c = contexto();
    c.req.mondayContext = { accountId: '1', userId: '2', isAdmin: true, role: 'admin' };
    requireAdmin(c.req, c.res, c.next);
    expect(c.seSiguio()).toBe(true);
  });

  it('requireEditor devuelve 403 a un viewer', () => {
    const c = contexto();
    c.req.mondayContext = { accountId: '1', userId: '2', isAdmin: false, role: 'viewer' };
    requireEditor(c.req, c.res, c.next);
    expect(c.res.statusCode).toBe(403);
  });

  it('requireAdmin y requireEditor devuelven 401, no 403, si no hay sesión', () => {
    for (const guarda of [requireAdmin, requireEditor]) {
      const c = contexto();
      c.req.mondayContext = null;
      guarda(c.req, c.res, c.next);
      expect(c.res.statusCode).toBe(401);
    }
  });
});
