/**
 * Traslados — destinos y tarifas para COSTOS ADICIONALES de la propuesta LP.
 */
import { Router } from 'express';
import { fetchTraslados, trasladosEnabled, TIPOS_TRASLADO } from '../services/trasladosService.js';

const router = Router();

// Cache en memoria: el board cambia poco y el editor pide esto en cada
// documento. Sin cache, cada apertura son ~1s esperando a la API de Monday.
let cache = null;
const TTL_MS = 10 * 60 * 1000;

// GET /api/traslados — estados con sus municipios y costos por tipo de unidad.
// Nunca falla el request: si Monday no responde, devuelve la lista vacía y el
// editor cae a captura manual.
router.get('/', async (_req, res) => {
  if (!trasladosEnabled()) {
    return res.json({ source: 'none', tipos: TIPOS_TRASLADO, estados: [] });
  }

  if (cache && Date.now() - cache.at < TTL_MS) {
    return res.json({ ...cache.data, source: 'cache', tipos: TIPOS_TRASLADO });
  }

  try {
    const data = await fetchTraslados();
    cache = { at: Date.now(), data };
    res.json({ ...data, source: 'monday', tipos: TIPOS_TRASLADO });
  } catch (e) {
    console.warn('[Traslados] no se pudo leer el board:', e.message);
    res.json({ source: 'error', tipos: TIPOS_TRASLADO, estados: [], error: e.message });
  }
});

export default router;
