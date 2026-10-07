/**
 * Candado de cotización — diagnóstico comercial de MAXIRent.
 *
 * Antes de generar una cotización se pregunta al formulario de diagnóstico
 * (verificar.php, hospedado aparte) si el lead tiene las 5 luces del semáforo
 * en verde: Dolor, Alcance, Impacto, Decisión y Meet agendado. El formulario
 * lo recalcula con las respuestas guardadas en monday, así que cambiar a mano
 * la columna "Estatus diagnóstico" no abre el candado.
 *
 * Variables de entorno:
 *   DIAGNOSTICO_URL        URL de verificar.php. Vacía = candado apagado.
 *   DIAGNOSTICO_KEY        clave_cotizador del config.php del formulario.
 *   DIAGNOSTICO_FAIL_OPEN  'true' = si el formulario no responde, se deja cotizar.
 *                          Por defecto se bloquea.
 */

const TIMEOUT_MS = 10_000;

export function diagnosticoConfig(env = process.env) {
  return {
    url:      (env.DIAGNOSTICO_URL || '').trim(),
    key:      (env.DIAGNOSTICO_KEY || '').trim(),
    failOpen: String(env.DIAGNOSTICO_FAIL_OPEN || 'false').trim() === 'true',
  };
}

export function candadoActivo(env = process.env) {
  return diagnosticoConfig(env).url !== '';
}

/**
 * Consulta el semáforo de un lead.
 * Devuelve { listo, mensaje, faltantes, secciones } o lanza si no se pudo verificar.
 */
export async function verificarDiagnostico(itemId, { env = process.env, fetchImpl = fetch } = {}) {
  const { url, key } = diagnosticoConfig(env);
  if (!url || !key) throw new Error('Faltan DIAGNOSTICO_URL / DIAGNOSTICO_KEY');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${url}?item=${encodeURIComponent(String(itemId))}`, {
      headers: { 'X-Cotizador-Key': key },
      signal:  ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return {
      listo:     Boolean(data.listo),
      mensaje:   data.mensaje || '',
      faltantes: data.faltantes || [],
      secciones: data.secciones || [],
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Decide si se puede cotizar un lead. Nunca lanza.
 * Devuelve { permitido, status, body } — status/body son la respuesta HTTP si no se permite.
 */
export async function evaluarCandado(itemId, opts = {}) {
  const env = opts.env || process.env;
  if (!candadoActivo(env)) return { permitido: true, motivo: 'candado-apagado' };

  if (!itemId) {
    return {
      permitido: false,
      status: 400,
      body: {
        error: 'Abre la cotización desde el lead en monday para poder validar su diagnóstico comercial.',
        code:  'DIAGNOSTICO_SIN_LEAD',
      },
    };
  }

  try {
    const d = await verificarDiagnostico(itemId, opts);
    if (d.listo) return { permitido: true, diagnostico: d };
    return {
      permitido: false,
      status: 409,
      body: {
        error:     d.mensaje || 'Completa el diagnóstico comercial antes de cotizar.',
        code:      'DIAGNOSTICO_INCOMPLETO',
        faltantes: d.faltantes,
        secciones: d.secciones,
      },
    };
  } catch (err) {
    console.error(`[Diagnóstico] No se pudo verificar el lead ${itemId}:`, err.message);
    if (diagnosticoConfig(env).failOpen) return { permitido: true, motivo: 'fail-open' };
    return {
      permitido: false,
      status: 503,
      body: {
        error: 'No se pudo validar el diagnóstico comercial del lead. Intenta de nuevo en un momento.',
        code:  'DIAGNOSTICO_NO_DISPONIBLE',
      },
    };
  }
}
