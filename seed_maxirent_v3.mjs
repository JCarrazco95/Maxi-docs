/**
 * Crea la plantilla oficial MAXIRent Propuesta Comercial en MaxiDocs.
 * Usa nodos <pricing-table> interactivos para Renta, Accesorios y Traslados.
 * Variables de cliente se autollenan desde Monday.com.
 *
 * Ejecutar:  node seed_maxirent_v3.mjs
 */

const BASE64_EMPTY = 'W10=' // btoa('[]')

const templateHtml = `
<style>
.document-body { max-width: 100% !important; padding: 0 !important; margin: 0 !important; }
body { font-family: Arial, Helvetica, sans-serif !important; font-size: 10pt !important; color: #222 !important; background: white !important; margin: 0 !important; padding: 0 !important; }

.prop { width: 100%; font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #222; }

/* Header */
.prop-header { background: #1B3055; padding: 18px 28px; display: flex; align-items: center; justify-content: space-between; }
.prop-header-left { color: white; }
.prop-header-subtitle { font-size: 9pt; color: #aac4e0; margin-bottom: 3px; letter-spacing: 0.5px; }
.prop-header-title   { font-size: 17pt; font-weight: bold; color: white; }

/* Body */
.prop-body { padding: 22px 28px; }

/* Cliente */
.cliente-row   { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 3px; }
.cliente-nombre{ font-size: 11pt; font-weight: bold; color: #222; }
.cliente-fecha { font-size: 10pt; color: #444; }
.cliente-atn   { font-size: 10pt; color: #444; margin-bottom: 14px; }

/* Intro */
.intro { font-size: 9.5pt; line-height: 1.6; color: #333; margin-bottom: 18px; }
.intro .intro-highlight { color: #1B3055; font-weight: bold; }

/* Sección promo */
.promo-title { font-style: italic; font-weight: bold; color: #F5A000; font-size: 10pt; margin: 18px 0 5px; }
.promo-body  { font-size: 9pt; color: #444; line-height: 1.5; margin-bottom: 8px; }

/* Notas */
.notes { font-size: 7.5pt; color: #444; line-height: 1.6; margin-top: 14px; border-top: 1px solid #e0e0e0; padding-top: 10px; }
.notes .note-bold    { font-weight: bold; text-decoration: underline; display: block; margin-bottom: 3px; }
.notes .note-regular { display: block; margin-bottom: 2px; }

/* Firma */
.firma-section { margin-top: 28px; padding-top: 14px; page-break-inside: avoid; }
.firma-title   { font-weight: bold; font-size: 9.5pt; color: #1B3055; margin-bottom: 22px; text-transform: uppercase; letter-spacing: 0.5px; }
.firma-grid    { display: flex; gap: 50px; margin-top: 10px; }
.firma-box     { flex: 1; }
.firma-espacio { height: 40px; }
.firma-linea   { border-top: 1.5px solid #333; margin-bottom: 7px; }
.firma-nombre  { font-size: 9pt; font-weight: bold; color: #1B3055; margin-bottom: 2px; }
.firma-label   { font-size: 8pt; color: #666; margin-bottom: 1px; }

/* Footer */
.prop-footer-bar  { margin-top: 24px; height: 9px; background: linear-gradient(90deg,#F5A000 0%,#FF6000 100%); }
.prop-footer-logo { text-align: right; padding: 8px 28px 14px; }
.logo-text  { font-size: 16pt; font-weight: 900; color: #1B3055; letter-spacing: -0.5px; }
.logo-rent  { color: #F5A000; }
.logo-sub   { font-size: 7pt; color: #888; letter-spacing: 1px; text-transform: uppercase; }
</style>

<div class="prop">

  <!-- ══ HEADER ══════════════════════════════════════════════ -->
  <div class="prop-header">
    <div class="prop-header-left">
      <div class="prop-header-subtitle">Propuesta Comercial</div>
      <div class="prop-header-title">MAXIRent Renta Empresarial</div>
    </div>
  </div>

  <!-- ══ CUERPO ═══════════════════════════════════════════════ -->
  <div class="prop-body">

    <!-- Cliente y fecha -->
    <div class="cliente-row">
      <div class="cliente-nombre">{{cliente}}</div>
      <div class="cliente-fecha">{{ciudad}} a {{fecha}}</div>
    </div>
    <div class="cliente-atn">ATN: {{contacto}}</div>

    <!-- Texto introductorio -->
    <div class="intro">
      <span class="intro-highlight">MAXIRent Renta Empresarial</span> se enfoca en tu Rentabilidad,
      para que tú te enfoques en tu Core Business. A través de la renta y gestión de flotillas te
      ofrecemos servicios integrales para que tu operación no se detenga.<br/>
      Gracias por tu interés y confianza, enseguida podrás encontrar la propuesta comercial de nuestros servicios:
    </div>

    <!-- ══ COTIZACIÓN RENTA — bloque interactivo ══════════════ -->
    <pricing-table
      data-title="COTIZACIÓN RENTA"
      data-table-type="renta"
      data-items-b64="${BASE64_EMPTY}"
      data-iva="16">
    </pricing-table>

    <!-- Promo accesorios -->
    <div class="promo-title">¡OPTIMIZA TU EXPERIENCIA DE RENTA!</div>
    <div class="promo-body">
      En MAXIRent Renta Empresarial ofrecemos una gama de accesorios y adecuaciones en los vehículos
      de tu flota para adaptarnos a tus necesidades específicas.
    </div>

    <!-- ══ COTIZACIÓN ACCESORIOS — bloque interactivo ══════════ -->
    <pricing-table
      data-title="COTIZACIÓN ACCESORIOS"
      data-table-type="accesorios"
      data-items-b64="${BASE64_EMPTY}"
      data-iva="16">
    </pricing-table>

    <!-- ══ COTIZACIÓN TRASLADOS — bloque interactivo ═══════════ -->
    <pricing-table
      data-title="COTIZACIÓN TRASLADOS"
      data-table-type="traslados"
      data-items-b64="${BASE64_EMPTY}"
      data-iva="16">
    </pricing-table>

    <!-- Notas -->
    <div class="notes">
      <span class="note-bold">
        *Nota: La firma de la presente propuesta no implica compromiso de compra. Indica únicamente
        que el cliente está de acuerdo con los precios y condiciones aquí establecidos, y que los
        acepta dentro del periodo de vigencia indicado en esta propuesta.
      </span>
      <span class="note-bold">
        Tarifas de recolección de unidades deberán cotizarse al momento de retornar las unidades
        por término proyecto.
      </span>
      <span class="note-regular">
        *Esta cotización tiene vigencia de 15 días. Consulta términos y condiciones en:
        <strong>maxirentempresas.com.mx</strong>
      </span>
    </div>

    <!-- ══ SECCIÓN DE FIRMA ═══════════════════════════════════ -->
    <div class="firma-section">
      <div class="firma-title">Aceptación de propuesta comercial</div>
      <div class="firma-grid">

        <div class="firma-box">
          <div class="firma-espacio"></div>
          <div class="firma-linea"></div>
          <div class="firma-nombre">{{nombre_cliente_firma}}</div>
          <div class="firma-label">Nombre y firma del cliente</div>
          <div class="firma-label">{{cargo_cliente}}</div>
          <div class="firma-label">{{cliente}}</div>
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

  </div><!-- /prop-body -->

  <!-- ══ FOOTER ═══════════════════════════════════════════════ -->
  <div class="prop-footer-bar"></div>
  <div class="prop-footer-logo">
    <div class="logo-text">MAXI<span class="logo-rent">Rent</span></div>
    <div class="logo-sub">Autos y Camionetas</div>
  </div>

</div><!-- /prop -->
`

// ── Enviar al backend ──────────────────────────────────────────
const res = await fetch('http://localhost:3001/api/templates', {
  method: 'POST',
  headers: {
    'Content-Type':        'application/json',
    'x-monday-account-id': 'dev',
    'x-monday-user-id':    'dev',
  },
  body: JSON.stringify({
    name:         'Propuesta Comercial MAXIRent v3',
    description:  'Plantilla oficial con tablas interactivas Renta + Accesorios + Traslados. Variables de cliente desde Monday.',
    content_html: templateHtml,
  }),
})

const data = await res.json()
if (!res.ok) {
  console.error('❌ Error:', data)
  process.exit(1)
}
console.log('✅ Plantilla creada — ID:', data.id)
console.log('📋 Variables:', data.variables?.join(', '))
