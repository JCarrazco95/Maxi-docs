/**
 * Obtención del sessionToken de Monday.
 *
 * Es un JWT que Monday firma con el signing secret de la app. El backend lo
 * verifica y de ahí saca la cuenta y el usuario, en vez de creerse unos headers
 * que cualquiera puede escribir.
 *
 * El problema: monday.get('sessionToken') solo funciona DENTRO del iframe de
 * Monday, porque el SDK habla con la ventana padre. El editor se abre en una
 * pestaña nueva (window.open), donde no hay padre — por eso antes la identidad
 * viajaba en la URL como ?account=…&user=…&admin=1, que además de falsificable
 * queda en el historial del navegador.
 *
 * La solución: la pestaña del editor le pide el token a la pestaña que la abrió
 * (window.opener), que sí está dentro de Monday. Van por postMessage con el
 * origen comprobado en los dos sentidos, así que el token no toca la URL.
 *
 *   editor  ──{ mxd-need-token }──▶  app dentro de Monday
 *   editor  ◀──{ mxd-token, ... }──  app (llama a monday.get y responde)
 */
import mondaySdk from 'monday-sdk-js'

const monday = mondaySdk()

const REQ  = 'mxd-need-token'
const RESP = 'mxd-token'

/** Margen antes de la expiración para no usar un token que caduca a mitad de vuelo. */
const RENOVAR_ANTES_MS = 60_000
const ESPERA_OPENER_MS = 5_000

let cache = null        // { token, expMs }
let enCurso = null      // promesa compartida, para no pedir varios a la vez

/** Lee el `exp` del JWT sin verificar la firma — solo para saber cuándo renovar. */
function expiracionDe(token) {
  try {
    const [, payload] = token.split('.')
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return json.exp ? json.exp * 1000 : 0
  } catch {
    return 0
  }
}

function vigente() {
  return cache && cache.expMs - RENOVAR_ANTES_MS > Date.now() ? cache.token : null
}

function guardar(token) {
  if (!token) return null
  cache = { token, expMs: expiracionDe(token) }
  return token
}

/** ¿Estamos embebidos en Monday? Si no, el SDK no puede darnos el token. */
export function dentroDeMonday() {
  try { return window.self !== window.top } catch { return true }
}

async function pedirAlSdk() {
  try {
    const res = await monday.get('sessionToken')
    return res?.data ?? null
  } catch {
    return null
  }
}

/** Pide el token a la pestaña que nos abrió (la que sí está dentro de Monday). */
function pedirAlOpener() {
  return new Promise(resolve => {
    const opener = window.opener
    if (!opener || opener.closed) return resolve(null)

    const origen = window.location.origin
    let listo = false

    function alRecibir(e) {
      if (e.origin !== origen) return          // solo nuestro propio origen
      if (e.data?.type !== RESP) return
      listo = true
      window.removeEventListener('message', alRecibir)
      clearTimeout(temporizador)
      resolve(e.data.token ?? null)
    }

    window.addEventListener('message', alRecibir)
    const temporizador = setTimeout(() => {
      if (listo) return
      window.removeEventListener('message', alRecibir)
      resolve(null)
    }, ESPERA_OPENER_MS)

    try {
      opener.postMessage({ type: REQ }, origen)
    } catch {
      clearTimeout(temporizador)
      window.removeEventListener('message', alRecibir)
      resolve(null)
    }
  })
}

/**
 * Devuelve un sessionToken válido, o null si no se puede conseguir
 * (por ejemplo, corriendo la app fuera de Monday en desarrollo).
 * @param {boolean} forzar — ignora la caché; úsalo al recibir un 401.
 */
export async function getSessionToken(forzar = false) {
  if (!forzar) {
    const yaLoTengo = vigente()
    if (yaLoTengo) return yaLoTengo
  }
  if (enCurso) return enCurso

  enCurso = (async () => {
    try {
      const token = (await pedirAlSdk()) ?? (await pedirAlOpener())
      return guardar(token)
    } finally {
      enCurso = null
    }
  })()

  return enCurso
}

/**
 * La app principal (la que vive dentro del iframe de Monday) llama a esto una
 * vez al montar, para poder servirle tokens frescos a la pestaña del editor
 * durante toda la sesión de edición.
 */
export function atenderPeticionesDeToken() {
  const origen = window.location.origin

  window.addEventListener('message', async e => {
    if (e.origin !== origen) return
    if (e.data?.type !== REQ) return
    if (!e.source) return

    const token = await pedirAlSdk()
    try {
      e.source.postMessage({ type: RESP, token }, origen)
    } catch { /* la pestaña se cerró mientras tanto */ }
  })
}

/** Para las pruebas y para forzar una renovación tras un 401. */
export function olvidarToken() {
  cache = null
}
