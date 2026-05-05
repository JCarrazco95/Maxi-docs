import { Router } from 'express';
import { fetchCatalog } from '../services/catalogService.js';

const router = Router();

// GET /api/catalog — devuelve el catálogo completo desde Monday.com
router.get('/', async (req, res) => {
  if (!process.env.MONDAY_CATALOG_BOARD_ID) {
    return res.status(503).json({ error: 'Catálogo no configurado. Agrega MONDAY_CATALOG_BOARD_ID en .env' });
  }
  const catalog = await fetchCatalog();
  res.json(catalog);
});

export default router;
