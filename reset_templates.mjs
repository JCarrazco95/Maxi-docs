/**
 * Limpia templates viejos de 'dev' y crea la plantilla MAXIRent oficial.
 * Ejecutar: node reset_templates.mjs
 */
import { readFileSync } from 'fs'

const API = 'http://localhost:3001'
const HEADERS = {
  'Content-Type': 'application/json',
  'x-monday-account-id': 'dev',
  'x-monday-user-id': 'dev',
}

// 1. Listar templates actuales
const list = await fetch(`${API}/api/templates`, { headers: HEADERS })
const templates = await list.json()
console.log(`\n📋 Templates existentes: ${templates.length}`)
templates.forEach(t => console.log(`  • [${t.id.slice(0,8)}] ${t.name}`))

// 2. Borrar todos los templates dev existentes
for (const t of templates) {
  await fetch(`${API}/api/templates/${t.id}`, { method: 'DELETE', headers: HEADERS })
  console.log(`🗑  Borrado: ${t.name}`)
}

// 3. Crear la plantilla MAXIRent oficial con pricing-tables interactivos
const EMPTY  = 'W10='
const HDR    = 'https://analy-sys.pro/wp-content/uploads/2026/05/PRES_cotizacion_update-01.png'
const FTR    = 'https://analy-sys.pro/wp-content/uploads/2026/05/PRES_cotizacion_update-03.png'
const PG2    = 'https://analy-sys.pro/wp-content/uploads/2026/05/PRES_cotizacion_update-02.png'

const html = `<style>
.document-body{max-width:100%!important;padding:0!important;margin:0!important;}
body{font-family:Arial,Helvetica,sans-serif!important;font-size:10pt!important;color:#222!important;background:white!important;margin:0!important;padding:0!important;}
.prop-body{padding:22px 28px;font-family:Arial,Helvetica,sans-serif;font-size:10pt;color:#222;}
.cliente-row{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px;}
.cliente-nombre{font-size:11pt;font-weight:bold;color:#222;}
.cliente-fecha{font-size:10pt;color:#444;}
.cliente-atn{font-size:10pt;color:#444;margin-bottom:14px;}
.intro{font-size:9.5pt;line-height:1.6;color:#333;margin-bottom:18px;}
.intro-highlight{color:#1B3055;font-weight:bold;}
.promo-title{font-style:italic;font-weight:bold;color:#F5A000;font-size:10pt;margin:18px 0 5px;}
.promo-body{font-size:9pt;color:#444;line-height:1.5;margin-bottom:8px;}
.notes{font-size:7.5pt;color:#444;line-height:1.6;margin-top:14px;border-top:1px solid #e0e0e0;padding-top:10px;}
.note-bold{font-weight:bold;text-decoration:underline;display:block;margin-bottom:3px;}
.note-regular{display:block;margin-bottom:2px;}
.firma-section{margin-top:28px;padding-top:14px;page-break-inside:avoid;}
.firma-title{font-weight:bold;font-size:9.5pt;color:#1B3055;margin-bottom:22px;text-transform:uppercase;letter-spacing:.5px;}
.firma-grid{display:flex;gap:50px;margin-top:10px;}
.firma-box{flex:1;}
.firma-espacio{height:40px;}
.firma-linea{border-top:1.5px solid #333;margin-bottom:7px;}
.firma-nombre{font-size:9pt;font-weight:bold;color:#1B3055;margin-bottom:2px;}
.firma-label{font-size:8pt;color:#666;margin-bottom:1px;}
.page2{page-break-before:always;display:block;}
.page2 img{width:100%;display:block;page-break-inside:avoid;max-width:100%;}
</style>

<img src="${HDR}" style="width:100%;display:block;" alt="MAXIRent Header"/>

<div class="prop-body">

  <div class="cliente-row">
    <div class="cliente-nombre">{{name}}</div>
    <div class="cliente-fecha">{{ciudad}} a {{fecha}}</div>
  </div>
  <div class="cliente-atn">ATN: {{contacto}}</div>

  <div class="intro">
    <span class="intro-highlight">MAXIRent Renta Empresarial</span> se enfoca en tu Rentabilidad,
    para que tú te enfoques en tu Core Business. A través de la renta y gestión de flotillas te
    ofrecemos servicios integrales para que tu operación no se detenga.<br/>
    Gracias por tu interés y confianza, enseguida podrás encontrar la propuesta comercial de nuestros servicios:
  </div>

  <pricing-table data-title="COTIZACIÓN RENTA" data-table-type="renta" data-items-b64="${EMPTY}" data-iva="16"></pricing-table>

  <div class="promo-title">¡OPTIMIZA TU EXPERIENCIA DE RENTA!</div>
  <div class="promo-body">
    En MAXIRent Renta Empresarial ofrecemos una gama de accesorios y adecuaciones en los vehículos
    de tu flota para adaptarnos a tus necesidades específicas.
  </div>

  <pricing-table data-title="COTIZACIÓN ACCESORIOS" data-table-type="accesorios" data-items-b64="${EMPTY}" data-iva="16"></pricing-table>

  <pricing-table data-title="COTIZACIÓN TRASLADOS" data-table-type="traslados" data-items-b64="${EMPTY}" data-iva="16"></pricing-table>

  <div class="notes">
    <span class="note-bold">*Nota: La firma de la presente propuesta no implica compromiso de compra. Indica únicamente que el cliente está de acuerdo con los precios y condiciones aquí establecidos, y que los acepta dentro del periodo de vigencia indicado en esta propuesta.</span>
    <span class="note-bold">Tarifas de recolección de unidades deberán cotizarse al momento de retornar las unidades por término proyecto.</span>
    <span class="note-regular">*Esta cotización tiene vigencia de 15 días. Consulta términos y condiciones en: <strong>maxirentempresas.com.mx</strong></span>
  </div>

  <div class="firma-section">
    <div class="firma-title">Aceptación de propuesta comercial</div>
    <div class="firma-grid">
      <div class="firma-box">
        <div class="firma-espacio"></div>
        <div class="firma-linea"></div>
        <div class="firma-nombre">{{nombre_cliente_firma}}</div>
        <div class="firma-label">Nombre y firma del cliente</div>
        <div class="firma-label">{{cargo_cliente}}</div>
        <div class="firma-label">{{name}}</div>
      </div>
      <div class="firma-box">
        <div class="firma-espacio"></div>
        <div class="firma-linea"></div>
        <div class="firma-nombre">{{nombre_representante}}</div>
        <div class="firma-label">Representante MAXIRent Renta Empresarial</div>
        <div class="firma-label">{{cargo_representante}}</div>
      </div>
    </div>
  </div>

</div>

<img src="${FTR}" style="width:100%;display:block;margin-top:16px;" alt="MAXIRent Footer"/>

<div class="page2">
  <img src="${PG2}" style="width:100%;display:block;" alt="MAXIRent Perfil"/>
</div>`

const res = await fetch(`${API}/api/templates`, {
  method: 'POST',
  headers: HEADERS,
  body: JSON.stringify({
    name: 'Propuesta Comercial MAXIRent',
    description: 'Plantilla oficial con header/footer reales, 3 tablas interactivas (Renta·Accesorios·Traslados) y página 2.',
    content_html: html,
  }),
})
const data = await res.json()
if (!res.ok) { console.error('❌', data); process.exit(1) }
console.log(`\n✅ Template creado — ID: ${data.id}`)
console.log(`📋 Variables: ${data.variables?.join(', ')}`)
console.log('\n✔ Listo — importa desde Monday.com con el botón "📥 Importar plantillas MAXIRent"')
