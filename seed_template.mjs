import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const html = readFileSync(join(__dirname, 'plantilla_maxirent.html'), 'utf8')

const res = await fetch('http://localhost:3001/api/templates', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-monday-account-id': 'dev',
    'x-monday-user-id': 'dev',
  },
  body: JSON.stringify({
    name: 'Propuesta Comercial MAXIRent',
    description: 'Propuesta de renta vehicular con cotización, traslados y sección de firma',
    content_html: html,
  }),
})

const data = await res.json()
if (!res.ok) {
  console.error('Error:', data)
  process.exit(1)
}
console.log('✓ Plantilla creada — ID:', data.id)
console.log('✓ Variables:', data.variables.join(', '))
