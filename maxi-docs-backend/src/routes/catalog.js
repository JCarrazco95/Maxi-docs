/**
 * Catalog CRUD — categorías y productos con sync a Monday.com
 *
 * GET /api/catalog              — lista completa para el picker
 * GET /api/catalog/categories   — listar categorías
 * POST /api/catalog/categories  — crear (+ grupo en Monday si está configurado)
 * PUT  /api/catalog/categories/:id
 * DELETE /api/catalog/categories/:id
 * GET /api/catalog/products     — listar productos
 * POST /api/catalog/products    — crear (+ item en Monday si está configurado)
 * PUT  /api/catalog/products/:id
 * DELETE /api/catalog/products/:id
 * POST /api/catalog/import-monday — importar desde board de Monday
 */
import { Router } from 'express';
import { query }  from '../db/connection.js';
import { requireEditor } from '../middleware/mondayAuth.js';
import {
  fetchCatalog,
  mondaySyncEnabled,
  createMondayProduct,
  updateMondayProduct,
  deleteMondayProduct,
  createMondayGroup,
} from '../services/catalogService.js';

const router = Router();

// ── Catálogo completo (para el picker en el editor) ───────────
router.get('/', async (req, res) => {
  const { accountId } = req.mondayContext;

  const catRes = await query(
    `SELECT id, name, sort_order FROM catalog_categories
     WHERE monday_account_id = $1 ORDER BY sort_order, name`,
    [accountId]
  );
  const prodRes = await query(
    `SELECT id, category_id, name, sku, price::float AS price, unit, description
     FROM catalog_products
     WHERE monday_account_id = $1 AND active = true
     ORDER BY sort_order, name`,
    [accountId]
  );

  // Sin productos locales → intentar Monday.com como fallback
  if (prodRes.rows.length === 0 && mondaySyncEnabled()) {
    try {
      const mc = await fetchCatalog();
      return res.json({ ...mc, source: 'monday' });
    } catch { /* caer al catálogo local vacío */ }
  }

  const catMap = {};
  catRes.rows.forEach(c => { catMap[c.id] = { ...c, products: [] }; });
  const uncategorized = { id: null, name: 'Sin categoría', products: [] };

  prodRes.rows.forEach(p => {
    const target = p.category_id && catMap[p.category_id] ? catMap[p.category_id] : uncategorized;
    target.products.push(p);
  });

  const categories = catRes.rows.map(c => catMap[c.id]);
  if (uncategorized.products.length) categories.push(uncategorized);

  res.json({ boardName: 'Catálogo', categories, source: 'local', mondaySync: mondaySyncEnabled() });
});

// ── Categorías ────────────────────────────────────────────────
router.get('/categories', async (req, res) => {
  const { accountId } = req.mondayContext;
  const r = await query(
    `SELECT id, name, sort_order,
            (SELECT COUNT(*) FROM catalog_products
             WHERE category_id = catalog_categories.id AND active = true) AS product_count
     FROM catalog_categories WHERE monday_account_id = $1 ORDER BY sort_order, name`,
    [accountId]
  );
  res.json(r.rows);
});

router.post('/categories', requireEditor, async (req, res) => {
  const { accountId } = req.mondayContext;
  const { name, sort_order = 0 } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name es requerido' });

  // Crear grupo en Monday si está configurado
  let mondayGroupId = null;
  try { mondayGroupId = await createMondayGroup(name.trim()); } catch {}

  const r = await query(
    `INSERT INTO catalog_categories (monday_account_id, name, sort_order, monday_group_id)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [accountId, name.trim(), sort_order, mondayGroupId]
  );
  res.status(201).json({ ...r.rows[0], mondaySynced: !!mondayGroupId });
});

router.put('/categories/:id', requireEditor, async (req, res) => {
  const { accountId } = req.mondayContext;
  const { name, sort_order } = req.body;
  const r = await query(
    `UPDATE catalog_categories
     SET name = COALESCE($1, name), sort_order = COALESCE($2, sort_order)
     WHERE id = $3 AND monday_account_id = $4 RETURNING *`,
    [name?.trim() || null, sort_order ?? null, req.params.id, accountId]
  );
  if (!r.rows[0]) return res.status(404).json({ error: 'Categoría no encontrada' });
  res.json(r.rows[0]);
});

router.delete('/categories/:id', requireEditor, async (req, res) => {
  const { accountId } = req.mondayContext;
  await query(`DELETE FROM catalog_categories WHERE id = $1 AND monday_account_id = $2`, [req.params.id, accountId]);
  res.status(204).end();
});

// ── Productos ─────────────────────────────────────────────────
router.get('/products', async (req, res) => {
  const { accountId } = req.mondayContext;
  const { category_id, search } = req.query;

  let sql = `SELECT p.id, p.category_id, p.name, p.sku, p.price::float AS price,
                    p.unit, p.description, p.monday_item_id, p.sort_order, p.active,
                    c.name AS category_name
             FROM catalog_products p
             LEFT JOIN catalog_categories c ON c.id = p.category_id
             WHERE p.monday_account_id = $1 AND p.active = true`;
  const params = [accountId];
  if (category_id) { params.push(category_id); sql += ` AND p.category_id = $${params.length}`; }
  if (search) {
    params.push(`%${search}%`);
    const n = params.length;
    sql += ` AND (p.name ILIKE $${n} OR p.sku ILIKE $${n})`;
  }
  sql += ` ORDER BY p.sort_order, p.name`;
  const r = await query(sql, params);
  res.json(r.rows);
});

router.post('/products', requireEditor, async (req, res) => {
  const { accountId } = req.mondayContext;
  const { name, sku = '', price = 0, description = '', unit = '', category_id, sort_order = 0 } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name es requerido' });

  // Obtener group_id de Monday si la categoría tiene uno
  let mondayGroupId = null;
  if (category_id) {
    const catRow = await query(
      `SELECT monday_group_id FROM catalog_categories WHERE id = $1 AND monday_account_id = $2`,
      [category_id, accountId]
    );
    mondayGroupId = catRow.rows[0]?.monday_group_id ?? null;
  }

  // Crear en Monday si está configurado
  let mondayItemId = null;
  try {
    mondayItemId = await createMondayProduct({
      name: name.trim(), sku: sku.trim(), price, groupId: mondayGroupId,
    });
  } catch (e) {
    console.warn('[Catalog] Monday sync falló al crear producto:', e.message);
  }

  const r = await query(
    `INSERT INTO catalog_products
       (monday_account_id, category_id, name, sku, price, description, unit, sort_order, monday_item_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [accountId, category_id || null, name.trim(), sku.trim(), price,
     description.trim(), unit.trim(), sort_order, mondayItemId]
  );
  res.status(201).json({ ...r.rows[0], mondaySynced: !!mondayItemId });
});

router.put('/products/:id', requireEditor, async (req, res) => {
  const { accountId } = req.mondayContext;
  const { name, sku, price, description, unit, category_id, sort_order, active } = req.body;

  // Obtener monday_item_id actual para sync
  const current = await query(
    `SELECT monday_item_id FROM catalog_products WHERE id = $1 AND monday_account_id = $2`,
    [req.params.id, accountId]
  );
  if (!current.rows[0]) return res.status(404).json({ error: 'Producto no encontrado' });

  const r = await query(
    `UPDATE catalog_products SET
       name        = COALESCE($1, name),
       sku         = COALESCE($2, sku),
       price       = COALESCE($3, price),
       description = COALESCE($4, description),
       unit        = COALESCE($5, unit),
       category_id = COALESCE($6, category_id),
       sort_order  = COALESCE($7, sort_order),
       active      = COALESCE($8, active)
     WHERE id = $9 AND monday_account_id = $10 RETURNING *`,
    [name?.trim() || null, sku?.trim() ?? null, price ?? null, description?.trim() ?? null,
     unit?.trim() ?? null, category_id ?? null, sort_order ?? null, active ?? null,
     req.params.id, accountId]
  );

  // Sync a Monday si tiene item_id
  if (current.rows[0].monday_item_id) {
    try {
      await updateMondayProduct(current.rows[0].monday_item_id, {
        name:  r.rows[0].name,
        sku:   r.rows[0].sku,
        price: r.rows[0].price,
      });
    } catch (e) {
      console.warn('[Catalog] Monday sync falló al actualizar:', e.message);
    }
  }

  res.json(r.rows[0]);
});

router.delete('/products/:id', requireEditor, async (req, res) => {
  const { accountId } = req.mondayContext;

  const current = await query(
    `SELECT monday_item_id FROM catalog_products WHERE id = $1 AND monday_account_id = $2`,
    [req.params.id, accountId]
  );

  await query(`DELETE FROM catalog_products WHERE id = $1 AND monday_account_id = $2`, [req.params.id, accountId]);

  // Archivar en Monday si tiene item_id
  if (current.rows[0]?.monday_item_id) {
    try { await deleteMondayProduct(current.rows[0].monday_item_id); } catch {}
  }

  res.status(204).end();
});

// ── Importar desde Monday.com ─────────────────────────────────
router.post('/import-monday', requireEditor, async (req, res) => {
  if (!mondaySyncEnabled()) {
    return res.status(503).json({ error: 'Configura MONDAY_API_TOKEN y MONDAY_CATALOG_BOARD_ID en .env para importar' });
  }
  const { accountId } = req.mondayContext;

  const mc = await fetchCatalog();
  let categoriesImported = 0, productsImported = 0;

  for (const cat of mc.categories) {
    // Upsert categoría por nombre (única por cuenta)
    const catR = await query(
      `INSERT INTO catalog_categories (monday_account_id, name, monday_group_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (monday_account_id, name) DO UPDATE SET monday_group_id = EXCLUDED.monday_group_id
       RETURNING id, (xmax = 0) AS inserted`,
      [accountId, cat.name, cat.id]
    );
    const catId = catR.rows[0].id;
    if (catR.rows[0].inserted) categoriesImported++;

    for (const prod of cat.products) {
      const skuVal = prod.sku?.trim() || '';
      if (skuVal) {
        // Upsert por SKU (unique cuando sku != '')
        const res2 = await query(
          `INSERT INTO catalog_products (monday_account_id, category_id, name, sku, price, monday_item_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (monday_account_id, sku) WHERE sku <> ''
           DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, category_id = EXCLUDED.category_id,
                         monday_item_id = EXCLUDED.monday_item_id
           RETURNING (xmax = 0) AS inserted`,
          [accountId, catId, prod.name, skuVal, prod.price, prod.id]
        );
        if (res2.rows[0]?.inserted) productsImported++;
      } else {
        // Sin SKU: insertar solo si no existe igual nombre en esa categoría
        const exists = await query(
          `SELECT 1 FROM catalog_products WHERE monday_account_id = $1 AND name = $2 AND category_id = $3`,
          [accountId, prod.name, catId]
        );
        if (!exists.rows[0]) {
          await query(
            `INSERT INTO catalog_products (monday_account_id, category_id, name, sku, price, monday_item_id)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [accountId, catId, prod.name, '', prod.price, prod.id]
          );
          productsImported++;
        }
      }
    }
  }

  res.json({ ok: true, categoriesImported, productsImported });
});

// ── Estado de sincronización con Monday ───────────────────────
router.get('/monday-status', (req, res) => {
  res.json({
    enabled:  mondaySyncEnabled(),
    boardId:  process.env.MONDAY_CATALOG_BOARD_ID ?? null,
    skuCol:   process.env.MONDAY_CATALOG_SKU_COL    || 'text_mm32knkd',
    priceCol: process.env.MONDAY_CATALOG_PRICE_COL  || 'numeric_mm321j2y',
  });
});

export default router;
