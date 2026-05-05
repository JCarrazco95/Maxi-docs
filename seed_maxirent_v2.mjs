/**
 * Recrea la plantilla MAXIRent con bloques <pricing-table> interactivos.
 * Los bloques se renderizan como tablas dinámicas en el editor y como
 * HTML estático en el PDF generado.
 */
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Encodes items array to base64 (mismo helper que el frontend)
function encodeItems(items) {
  return Buffer.from(JSON.stringify(items)).toString('base64')
}

// HTML de la plantilla MAXIRent con nodos <pricing-table> embebidos
const templateHtml = `
<style>
.document-body { max-width: 100% !important; padding: 0 !important; margin: 0 !important; }
body { font-family: Arial, Helvetica, sans-serif !important; font-size: 10pt !important; }
</style>

<div style="font-family:Arial,Helvetica,sans-serif;font-size:10pt;color:#222;">

  <!-- HEADER -->
  <div style="background:#1B3055;padding:22px 28px;">
    <div style="font-size:9pt;color:#aac4e0;margin-bottom:3px;">Propuesta Comercial</div>
    <div style="font-size:17pt;font-weight:900;color:white;">MAXIRent Renta Empresarial</div>
  </div>

  <!-- DATOS DEL CLIENTE -->
  <div style="padding:20px 28px 0;">
    <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
      <div style="font-size:11pt;font-weight:bold;">{{cliente}}</div>
      <div style="font-size:10pt;color:#444;">{{ciudad}} a {{fecha}}</div>
    </div>
    <div style="font-size:10pt;color:#444;margin-bottom:14px;">ATN: {{contacto}}</div>

    <!-- INTRO -->
    <p style="font-size:9.5pt;line-height:1.6;color:#333;margin-bottom:18px;">
      <strong>MAXIRent Renta Empresarial</strong> se enfoca en tu Rentabilidad, para que tú te enfoques en tu Core Business.
      A través de la renta y gestión de flotillas te ofrecemos servicios integrales para que tu operación no se detenga.<br/>
      Gracias por tu interés y confianza, enseguida podrás encontrar la propuesta comercial de nuestros servicios:
    </p>

    <!-- ═══ COTIZACIÓN RENTA — Bloque interactivo ═══ -->
    <pricing-table
      data-title="COTIZACIÓN RENTA"
      data-items-b64="${encodeItems([])}"
      data-iva="16">
    </pricing-table>

    <!-- PROMO -->
    <p style="font-style:italic;font-weight:bold;color:#F5A000;font-size:10pt;margin:18px 0 5px;">
      ¡OPTIMIZA TU EXPERIENCIA DE RENTA!
    </p>
    <p style="font-size:9pt;color:#444;margin-bottom:18px;">
      En MAXIRent Renta Empresarial ofrecemos una gama de accesorios y adecuaciones en los vehículos
      de tu flota para adaptarnos a tus necesidades específicas.
    </p>

    <!-- ═══ COTIZACIÓN TRASLADOS — Bloque interactivo ═══ -->
    <pricing-table
      data-title="COTIZACIÓN TRASLADOS"
      data-items-b64="${encodeItems([])}"
      data-iva="16">
    </pricing-table>

    <!-- NOTAS -->
    <div style="font-size:7.5pt;color:#444;line-height:1.6;margin-top:16px;border-top:1px solid #e0e2ea;padding-top:10px;">
      <p style="font-weight:bold;text-decoration:underline;margin-bottom:3px;">
        *Nota: La firma de la presente propuesta no implica compromiso de compra. Indica únicamente que el cliente está
        de acuerdo con los precios y condiciones aquí establecidos, y que los acepta dentro del periodo de vigencia.
      </p>
      <p style="font-weight:bold;margin-bottom:2px;">
        Tarifas de recolección de unidades deberán cotizarse al momento de retornar las unidades por término proyecto.
      </p>
      <p>*Esta cotización tiene vigencia de 15 días. Consulta términos y condiciones en: <strong>maxirentempresas.com.mx</strong></p>
    </div>

    <!-- FIRMA -->
    <div style="margin-top:30px;padding-top:14px;border-top:1px solid #ddd;">
      <div style="font-weight:bold;font-size:9.5pt;color:#1B3055;margin-bottom:22px;text-transform:uppercase;letter-spacing:0.5px;">
        Aceptación de propuesta comercial
      </div>
      <div style="display:flex;gap:50px;">
        <div style="flex:1;">
          <div style="height:40px;"></div>
          <div style="border-top:1.5px solid #333;margin-bottom:7px;"></div>
          <div style="font-size:9pt;font-weight:bold;color:#1B3055;">{{nombre_cliente_firma}}</div>
          <div style="font-size:8pt;color:#666;">Nombre y firma del cliente</div>
          <div style="font-size:8pt;color:#666;">{{cargo_cliente}}</div>
        </div>
        <div style="flex:1;">
          <div style="height:40px;"></div>
          <div style="border-top:1.5px solid #333;margin-bottom:7px;"></div>
          <div style="font-size:9pt;font-weight:bold;color:#1B3055;">{{nombre_representante}}</div>
          <div style="font-size:8pt;color:#666;">Representante MAXIRent Renta Empresarial</div>
          <div style="font-size:8pt;color:#666;">{{cargo_representante}}</div>
        </div>
      </div>
    </div>
  </div>

  <!-- FOOTER -->
  <div style="margin-top:24px;height:9px;background:linear-gradient(90deg,#F5A000,#FF6000);border-radius:2px;"></div>
  <div style="text-align:right;padding:8px 28px 14px;">
    <div style="font-size:16pt;font-weight:900;color:#1B3055;">MAXI<span style="color:#F5A000;">Rent</span></div>
    <div style="font-size:7pt;color:#888;letter-spacing:1px;text-transform:uppercase;">Autos y Camionetas</div>
  </div>

</div>
`

// Enviar al backend
const res = await fetch('http://localhost:3001/api/templates', {
  method: 'POST',
  headers: {
    'Content-Type':         'application/json',
    'x-monday-account-id':  'dev',
    'x-monday-user-id':     'dev',
  },
  body: JSON.stringify({
    name:         'Propuesta Comercial MAXIRent v2 (Interactiva)',
    description:  'Plantilla con tablas de precios interactivas. Cotización Renta + Traslados desde el catálogo.',
    content_html: templateHtml,
  }),
})

const data = await res.json()
if (!res.ok) { console.error('Error:', data); process.exit(1) }
console.log('✓ Plantilla creada — ID:', data.id)
console.log('✓ Variables:', data.variables.join(', '))
