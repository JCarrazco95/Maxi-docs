import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 8301,
    allowedHosts: ['veteran-grape-tartness.ngrok-free.dev'],
    // Proxy: todas las llamadas /api y /uploads se reenvían al backend local
    // Esto evita el problema de mixed content (HTTPS frontend → HTTP backend)
    proxy: {
      '/api':     { target: 'http://localhost:3001', changeOrigin: true },
      '/uploads': { target: 'http://localhost:3001', changeOrigin: true },
      '/health':  { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
})
