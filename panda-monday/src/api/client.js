import axios from 'axios'
import { getSessionToken, olvidarToken } from './sessionToken.js'

/**
 * Cliente HTTP hacia el backend.
 *
 * La identidad va en el sessionToken de Monday (un JWT firmado que el backend
 * verifica), no en headers de texto plano. Antes se mandaban
 * x-monday-account-id / x-monday-user-id / x-monday-is-admin tal cual y el
 * backend se los creía: cualquiera podía escribir los suyos.
 */

// Contexto de Monday — ya NO se usa para identificarse, solo para saber en qué
// board e item estamos y para el modo de desarrollo fuera de Monday.
let _context = { accountId: null, userId: null, isAdmin: false }

export function updateMondayContext(ctx) {
  if (!ctx) return
  _context = {
    accountId: ctx.account?.id != null ? String(ctx.account.id) : (ctx.accountId ?? null),
    userId:    ctx.user?.id    != null ? String(ctx.user.id)    : (ctx.userId    ?? null),
    isAdmin:   Boolean(ctx.user?.isAdmin ?? ctx.isAdmin ?? false),
  }
}

export function getContext() { return { ..._context } }

// Modo desarrollo: permite trabajar en local sin estar dentro de Monday. El
// backend solo lo acepta si a su vez tiene ALLOW_HEADER_AUTH=true, así que no
// sirve de nada contra un servidor configurado como producción.
const HEADERS_SIN_FIRMAR = import.meta.env.VITE_ALLOW_HEADER_AUTH === 'true'

// Sin baseURL: las peticiones van al mismo origen (Vite hace proxy al backend
// en local; en producción lo resuelve el rewrite de vercel.json).
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
})

api.interceptors.request.use(async config => {
  const token = await getSessionToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  } else if (HEADERS_SIN_FIRMAR) {
    config.headers['x-monday-account-id'] = _context.accountId ?? 'dev'
    config.headers['x-monday-user-id']    = _context.userId    ?? 'dev'
    config.headers['x-monday-is-admin']   = String(_context.isAdmin)
  }
  return config
})

// Un 401 casi siempre significa que el token caducó a mitad de sesión. Se pide
// uno nuevo y se reintenta una vez; si vuelve a fallar, se propaga el error.
api.interceptors.response.use(
  res => res,
  async error => {
    const original = error.config
    const esAuth   = error.response?.status === 401
    if (!esAuth || original?._reintentado) return Promise.reject(error)

    original._reintentado = true
    olvidarToken()
    const token = await getSessionToken(true)
    if (!token) return Promise.reject(error)

    original.headers = { ...original.headers, Authorization: `Bearer ${token}` }
    return api(original)
  }
)

export default api
