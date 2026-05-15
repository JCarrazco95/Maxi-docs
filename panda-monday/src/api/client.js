import axios from 'axios'

// Contexto de Monday.com — se actualiza cuando la app se carga dentro de Monday
let _context = { accountId: 'dev', userId: 'dev', isAdmin: false }

export function updateMondayContext(ctx) {
  if (!ctx) return
  _context = {
    accountId: String(ctx.account?.id ?? ctx.accountId ?? 'dev'),
    userId:    String(ctx.user?.id    ?? ctx.userId    ?? 'dev'),
    isAdmin:   Boolean(ctx.user?.isAdmin ?? ctx.isAdmin ?? false),
  }
}

export function getContext() { return { ..._context } }

// Sin baseURL: las peticiones van al mismo origen (Vite hace proxy a localhost:3001)
// Funciona tanto en local (http://localhost:8301) como via ngrok (https://...)
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
})

// Inyecta los headers de Monday en cada request
api.interceptors.request.use(config => {
  config.headers['x-monday-account-id'] = _context.accountId
  config.headers['x-monday-user-id']    = _context.userId
  config.headers['x-monday-is-admin']   = String(_context.isAdmin)
  return config
})

export default api
