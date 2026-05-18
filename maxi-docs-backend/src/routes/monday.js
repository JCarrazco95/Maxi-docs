/**
 * Monday.com proxy — permite al frontend llamar a Monday GraphQL
 * desde contextos donde monday-sdk-js no funciona (nuevas pestañas, ngrok, etc.)
 *
 * GET /api/monday/board/:boardId/columns   — columnas del board
 * GET /api/monday/board/:boardId/item/:itemId — valores del item
 */
import { Router } from 'express';

const router = Router();

const MONDAY_TOKEN = process.env.MONDAY_API_TOKEN;

// Tipos de columna útiles como variables de plantilla
const USEFUL_TYPES = new Set([
  'text', 'long_text', 'email', 'phone', 'numbers',
  'date', 'dropdown', 'status', 'people', 'formula',
  'name', 'lookup', 'mirror', 'rating', 'color',
  'link', 'location', 'country', 'hour', 'week',
  'timeline', 'world_clock', 'checkbox',
]);

function normalize(title) {
  return title
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    || 'col';
}

async function mondayGql(query) {
  if (!MONDAY_TOKEN) throw new Error('MONDAY_API_TOKEN no configurado en .env');
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: MONDAY_TOKEN },
    body: JSON.stringify({ query }),
  });
  const data = await res.json();
  if (data.errors?.length) throw new Error(data.errors[0].message);
  return data.data;
}

// ── Columnas del board ────────────────────────────────────────
router.get('/board/:boardId/columns', async (req, res) => {
  const { boardId } = req.params;

  if (!MONDAY_TOKEN) {
    // Sin token: devolver conjunto mínimo para que el panel funcione
    return res.json({
      columns: [
        { id: 'name',     title: 'Nombre del ítem', type: 'name',    varName: 'nombre' },
        { id: 'ciudad',   title: 'Ciudad',           type: 'text',   varName: 'ciudad' },
        { id: 'fecha',    title: 'Fecha',            type: 'date',   varName: 'fecha' },
        { id: 'contacto', title: 'Contacto',         type: 'people', varName: 'contacto' },
      ],
      noToken: true,
    });
  }

  try {
    const data = await mondayGql(`{
      boards(ids:[${boardId}]) {
        columns { id title type }
      }
    }`);

    const rawCols = data?.boards?.[0]?.columns ?? [];

    // Columna "nombre del ítem" siempre primero
    const columns = [
      { id: 'name', title: 'Nombre del ítem', type: 'name', varName: 'nombre' },
      ...rawCols
        .filter(c => c.id !== 'name' && USEFUL_TYPES.has(c.type))
        .map(c => ({
          id:      c.id,
          title:   c.title,
          type:    c.type,
          varName: normalize(c.title) || c.id,
        })),
    ];

    // Deduplicar varName (si dos columnas generan el mismo nombre, añadir sufijo)
    const seen = new Map();
    columns.forEach(c => {
      const base = c.varName;
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      if (count > 0) c.varName = `${base}_${count}`;
    });

    res.json({ columns, boardId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Valores actuales del item ─────────────────────────────────
router.get('/board/:boardId/item/:itemId', async (req, res) => {
  const { boardId, itemId } = req.params;

  if (!MONDAY_TOKEN) {
    return res.json({ values: {}, noToken: true });
  }

  try {
    // Obtener columnas para saber los varNames
    const colData = await mondayGql(`{
      boards(ids:[${boardId}]) {
        columns { id title type }
      }
    }`);
    const rawCols = colData?.boards?.[0]?.columns ?? [];

    const itemData = await mondayGql(`{
      items(ids:[${itemId}]) {
        name
        column_values { id text }
      }
    }`);

    const item = itemData?.items?.[0];
    if (!item) return res.json({ values: {} });

    // Construir mapa varName → valor
    const colMap = {};
    rawCols.forEach(c => { colMap[c.id] = normalize(c.title) || c.id; });

    // El nombre del item se expone como {{name}} Y {{nombre}} para cubrir ambas convenciones
    const itemName = item.name ?? '';
    const values = { name: itemName, nombre: itemName };

    item.column_values?.forEach(cv => {
      if (cv.text && colMap[cv.id]) {
        values[colMap[cv.id]] = cv.text;
      }
    });

    res.json({ values, itemName: item.name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Lista de todos los boards de la cuenta ───────────────────
// GET /api/monday/boards — devuelve id + name de todos los boards
router.get('/boards', async (req, res) => {
  if (!MONDAY_TOKEN) {
    return res.json({ boards: [], noToken: true });
  }
  try {
    const data = await mondayGql(`{
      boards(limit:100, order_by:created_at) {
        id
        name
        board_kind
        columns { id title type }
      }
    }`);

    const USEFUL = new Set([
      'text','long_text','email','phone','numbers','date',
      'dropdown','status','people','formula','link','location',
      'country','hour','week','checkbox','name',
    ]);

    const boards = (data?.boards ?? []).map(b => ({
      id:   b.id,
      name: b.name,
      kind: b.board_kind,
      columns: b.columns
        .filter(c => USEFUL.has(c.type))
        .map(c => ({
          id:      c.id,
          title:   c.title,
          type:    c.type,
          varName: normalize(c.title) || c.id,
        })),
    }));

    res.json({ boards });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Email del usuario actual de Monday ────────────────────────
// GET /api/monday/me — devuelve email + nombre del usuario autenticado en Monday
router.get('/me', async (req, res) => {
  const { userId } = req.mondayContext;

  if (!MONDAY_TOKEN || !userId || userId === 'dev') {
    return res.json({ email: null, name: null, noToken: true });
  }

  try {
    const data = await mondayGql(`{
      users(ids:[${userId}]) {
        id
        name
        email
        phone
        title
      }
    }`);
    const user = data?.users?.[0];
    res.json({
      email: user?.email ?? null,
      name:  user?.name  ?? null,
      phone: user?.phone ?? null,
      title: user?.title ?? null,
      id:    user?.id    ?? null,
    });
  } catch (e) {
    res.json({ email: null, name: null, error: e.message });
  }
});

export default router;
