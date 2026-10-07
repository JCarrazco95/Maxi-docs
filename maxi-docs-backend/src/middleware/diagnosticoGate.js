import { evaluarCandado } from '../services/diagnosticoService.js';

/**
 * Bloquea la ruta si el lead no tiene el diagnóstico comercial completo.
 * `getItemId(req)` devuelve el pulse ID del lead en monday.
 * La respuesta de bloqueo trae `error` con un mensaje listo para mostrar al vendedor.
 */
export function requireDiagnostico(getItemId) {
  return async (req, res, next) => {
    const r = await evaluarCandado(getItemId(req));
    if (!r.permitido) return res.status(r.status).json(r.body);
    req.diagnostico = r.diagnostico || null;
    next();
  };
}
