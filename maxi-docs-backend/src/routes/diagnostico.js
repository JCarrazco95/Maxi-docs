import { Router } from 'express';
import { candadoActivo, verificarDiagnostico } from '../services/diagnosticoService.js';

const router = Router();

// GET /api/diagnostico — ¿está activo el candado? (para cuando no hay lead abierto)
router.get('/', (_req, res) => {
  res.json({ activo: candadoActivo() });
});

// GET /api/diagnostico/:itemId — ¿se puede cotizar este lead?
// Lo usa el selector de plantillas para avisar antes de abrir el editor.
// El bloqueo real está en POST /api/documents/generate (requireDiagnostico).
router.get('/:itemId', async (req, res) => {
  if (!candadoActivo()) {
    return res.json({ activo: false, listo: true, mensaje: '', faltantes: [], secciones: [] });
  }
  try {
    const d = await verificarDiagnostico(req.params.itemId);
    res.json({ activo: true, ...d });
  } catch (err) {
    console.error(`[Diagnóstico] No se pudo verificar el lead ${req.params.itemId}:`, err.message);
    res.status(503).json({
      activo: true,
      listo: false,
      mensaje: 'No se pudo validar el diagnóstico comercial del lead. Intenta de nuevo en un momento.',
      faltantes: [],
      secciones: [],
    });
  }
});

export default router;
