/**
 * Pruebas del candado de cotización (diagnóstico comercial).
 *
 *   node --test test/diagnostico.test.mjs
 *
 * No llaman al formulario real: verificarDiagnostico acepta un `fetchImpl`
 * inyectable que simula lo que responde verificar.php.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluarCandado, verificarDiagnostico } from '../src/services/diagnosticoService.js';

const ENV = { DIAGNOSTICO_URL: 'https://form.test/verificar.php', DIAGNOSTICO_KEY: 'k123' };

/** verificar.php falso: guarda la última llamada y responde lo que se le pida. */
function fakeFetch(status, body) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, headers: opts.headers });
    return { ok: status < 400, status, json: async () => body };
  };
  fn.calls = calls;
  return fn;
}

const INCOMPLETO = {
  ok: true, listo: false,
  mensaje: 'No se puede cotizar todavía: falta completar el diagnóstico en Alcance (5/19), Meet agendado (0/1).',
  faltantes: ['Alcance (5/19)', 'Meet agendado (0/1)'], secciones: [],
};
const COMPLETO = { ok: true, listo: true, mensaje: 'Diagnóstico completo. Se puede cotizar.', faltantes: [], secciones: [] };

test('sin DIAGNOSTICO_URL el candado está apagado y deja cotizar', async () => {
  const r = await evaluarCandado('111', { env: {} });
  assert.equal(r.permitido, true);
});

test('lead completo: deja cotizar', async () => {
  const r = await evaluarCandado('111', { env: ENV, fetchImpl: fakeFetch(200, COMPLETO) });
  assert.equal(r.permitido, true);
  assert.equal(r.diagnostico.listo, true);
});

test('lead incompleto: 409 con el mensaje para el vendedor en `error`', async () => {
  const r = await evaluarCandado('111', { env: ENV, fetchImpl: fakeFetch(200, INCOMPLETO) });
  assert.equal(r.permitido, false);
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'DIAGNOSTICO_INCOMPLETO');
  assert.match(r.body.error, /Alcance \(5\/19\)/);
  assert.deepEqual(r.body.faltantes, INCOMPLETO.faltantes);
});

test('sin lead: 400, no se puede validar', async () => {
  const r = await evaluarCandado(undefined, { env: ENV, fetchImpl: fakeFetch(200, COMPLETO) });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'DIAGNOSTICO_SIN_LEAD');
});

test('formulario caído: 503 por defecto', async () => {
  const caido = async () => { throw new Error('ECONNREFUSED'); };
  const r = await evaluarCandado('111', { env: ENV, fetchImpl: caido });
  assert.equal(r.status, 503);
  assert.equal(r.body.code, 'DIAGNOSTICO_NO_DISPONIBLE');
});

test('formulario caído con DIAGNOSTICO_FAIL_OPEN=true: deja cotizar', async () => {
  const caido = async () => { throw new Error('ECONNREFUSED'); };
  const r = await evaluarCandado('111', { env: { ...ENV, DIAGNOSTICO_FAIL_OPEN: 'true' }, fetchImpl: caido });
  assert.equal(r.permitido, true);
});

test('clave rechazada (401 de verificar.php): 503, no deja cotizar', async () => {
  const r = await evaluarCandado('111', { env: ENV, fetchImpl: fakeFetch(401, { ok: false, error: 'No autorizado' }) });
  assert.equal(r.status, 503);
});

test('manda el ID del lead y la clave a verificar.php', async () => {
  const f = fakeFetch(200, COMPLETO);
  await verificarDiagnostico('9876543210', { env: ENV, fetchImpl: f });
  assert.equal(f.calls[0].url, 'https://form.test/verificar.php?item=9876543210');
  assert.equal(f.calls[0].headers['X-Cotizador-Key'], 'k123');
});
