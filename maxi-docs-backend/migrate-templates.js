// Script de migración de plantillas — corre una sola vez en Railway Shell
// Uso: node migrate-templates.js
import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const templates = [
  {
    name: "Propuesta Comercial MAXIRent",
    description: "Plantilla oficial con header/footer reales, 3 tablas interactivas (Renta·Accesorios·Traslados) y página 2.",
    variables: ["name","ciudad","fecha","contacto","nombre_cliente_firma","cargo_cliente","nombre_representante","cargo_representante"],
    content_html: `<style>
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

<img src="https://analy-sys.pro/wp-content/uploads/2026/05/PRES_cotizacion_update-01.png" style="width:100%;display:block;" alt="MAXIRent Header"/>

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

  <pricing-table data-title="COTIZACIÓN RENTA" data-table-type="renta" data-items-b64="W10=" data-iva="16"></pricing-table>

  <div class="promo-title">¡OPTIMIZA TU EXPERIENCIA DE RENTA!</div>
  <div class="promo-body">
    En MAXIRent Renta Empresarial ofrecemos una gama de accesorios y adecuaciones en los vehículos
    de tu flota para adaptarnos a tus necesidades específicas.
  </div>

  <pricing-table data-title="COTIZACIÓN ACCESORIOS" data-table-type="accesorios" data-items-b64="W10=" data-iva="16"></pricing-table>

  <pricing-table data-title="COTIZACIÓN TRASLADOS" data-table-type="traslados" data-items-b64="W10=" data-iva="16"></pricing-table>

  <div class="notes">
    <span class="note-bold">*Nota: La firma de la presente propuesta no implica compromiso de compra.</span>
    <span class="note-regular">*Esta cotización tiene vigencia de 15 días.</span>
  </div>

  <div class="firma-section">
    <div class="firma-title">Aceptación de propuesta comercial</div>
    <div class="firma-grid">
      <div class="firma-box">
        <div class="firma-espacio"></div>
        <div class="firma-linea"></div>
        <div class="firma-nombre">{{razon_social}}</div>
        <div class="firma-label">Nombre y firma del cliente</div>
        <div class="firma-label">{{cargo_cliente}}</div>
      </div>
      <div class="firma-box">
        <div class="firma-espacio"></div>
        <div class="firma-linea"></div>
        <div class="firma-nombre">{{representante}}</div>
        <div class="firma-label">Representante MAXIRent Renta Empresarial</div>
        <div class="firma-label">{{cargo_representante}}</div>
      </div>
    </div>
  </div>

</div>

<img src="https://analy-sys.pro/wp-content/uploads/2026/05/PRES_cotizacion_update-03.png" style="width:100%;display:block;margin-top:16px;" alt="MAXIRent Footer"/>

<div class="page2">
  <img src="https://analy-sys.pro/wp-content/uploads/2026/05/PRES_cotizacion_update-02.png" style="width:100%;display:block;" alt="MAXIRent Perfil"/>
</div>`
  },
  {
    name: "Propuesta Comercial MAXIRent v2",
    description: "Plantilla oficial MAXIRent — TARIFAS, ADECUACIONES y VALOR DEL ACUERDO",
    variables: ["razon_social","representante","fecha","fecha_vigencia","telefono","correo_electronico"],
    content_html: `<style>
  .mr, .mr * { box-sizing: border-box; }
  .mr img { width:100%; display:block; }
  .mr { font-family: Arial, Helvetica, sans-serif; font-size:9.5pt; color:#222; }
  .mr-header-info { display:flex; justify-content:space-between; align-items:flex-start; margin:12px 0 10px; font-size:9.5pt; }
  .mr-bold { font-weight:700; }
  .mr-intro { font-size:9.5pt; line-height:1.55; margin:10px 0 14px; text-align:justify; }
  .mr-sec { text-align:center; font-weight:700; color:#1B3055; font-size:10pt; text-transform:uppercase; letter-spacing:.5px; margin:16px 0 4px; }
  .mr-obs-label { font-size:9pt; font-weight:700; margin:10px 0 3px; }
  .mr-obs { border:1px solid #ccc; padding:8px 10px; font-size:9pt; min-height:30px; margin:0 0 14px; border-radius:2px; line-height:1.5; }
  .mr-firma-box { border:2px dashed #555; width:220px; height:72px; margin:18px 0; border-radius:4px; }
  .mr-nota { font-size:8pt; color:#444; text-decoration:underline; margin-top:18px; line-height:1.5; }
  .mr-h3 { color:#1B3055; font-size:10pt; font-weight:700; margin:14px 0 5px; }
  .mr-h4 { color:#F5A000; font-size:10pt; font-weight:700; margin:12px 0 4px; }
  .mr-ul { margin:4px 0 10px; padding-left:18px; font-size:9pt; line-height:1.6; }
  .mr-check { list-style:none; padding:0; margin:4px 0 10px; font-size:9pt; }
  .mr-check li::before { content:"✓ "; color:#1B3055; font-weight:700; }
  .mr-rep { text-align:right; margin-top:20px; font-size:9.5pt; line-height:1.7; }
  .mr-tag { background:#F5A000; color:white; font-weight:900; font-size:9pt; display:inline-block; padding:3px 8px; border-radius:3px; }
  .pt-header { background:#F5A000 !important; }
  .pt-header .pt-title { color:white !important; }
</style>
<div class="mr">
<img src="https://analy-sys.pro/wp-content/uploads/2026/05/PRES_cotizacion_update-01.png" style="width:100%;display:block;margin-bottom:2px;" />
<div class="mr-header-info">
  <div>
    <p style="margin:3px 0;"><span class="mr-bold">CLIENTE: </span>{{razon_social}}</p>
    <p style="margin:3px 0;"><span class="mr-bold">ATENCIÓN: </span>{{representante}}</p>
  </div>
  <div style="text-align:right;">
    <p style="margin:3px 0;"><span class="mr-bold">Fecha de elaboración </span>{{fecha}}</p>
    <p style="margin:3px 0;"><span class="mr-bold">Fecha de vigencia </span>{{fecha_vigencia}}</p>
  </div>
</div>
<p class="mr-intro">Presentamos una solución integral para la renta y administración de flota vehicular.</p>
<pricing-table data-title="TARIFAS" data-table-type="tarifas" data-items-b64="W10=" data-iva-rate="0"></pricing-table>
<p class="mr-obs-label">Observaciones:</p>
<div class="mr-obs">Se requiere Pago por anticipado 30 días, garantía de 30 días + Firma de contrato + Firma pagaré</div>
<pricing-table data-title="ADECUACIONES" data-table-type="accesorios" data-items-b64="W10=" data-iva-rate="16"></pricing-table>
<pricing-table data-title="VALOR DEL ACUERDO INICIAL" data-table-type="acuerdo" data-items-b64="W10=" data-iva-rate="0"></pricing-table>
<div class="mr-firma-box"></div>
<p class="mr-nota">**Nota: La firma no implica compromiso de compra. Vigencia 15 días.</p>
<img src="https://analy-sys.pro/wp-content/uploads/2026/05/PRES_cotizacion_update-03.png" style="width:100%;display:block;margin-top:20px;" />
<div class="mr-rep">
  <p style="margin:2px 0;font-weight:700;">{{representante}}</p>
  <p style="margin:2px 0;">Ejecutivo Comercial</p>
  <p style="margin:2px 0;">{{telefono}}</p>
  <p style="margin:2px 0;">{{correo_electronico}}</p>
</div>
</div>`
  }
];

let inserted = 0, updated = 0;

for (const tpl of templates) {
  const exists = await pool.query(
    `SELECT id FROM templates WHERE name = $1 AND monday_account_id = 'dev'`,
    [tpl.name]
  );

  if (exists.rows.length > 0) {
    await pool.query(
      `UPDATE templates SET content_html=$1, description=$2, variables=$3, updated_at=NOW()
       WHERE name=$4 AND monday_account_id='dev'`,
      [tpl.content_html, tpl.description, JSON.stringify(tpl.variables), tpl.name]
    );
    updated++;
    console.log(`✅ Actualizada: ${tpl.name}`);
  } else {
    await pool.query(
      `INSERT INTO templates (name, description, content_html, variables, monday_account_id)
       VALUES ($1, $2, $3, $4, 'dev')`,
      [tpl.name, tpl.description, tpl.content_html, JSON.stringify(tpl.variables)]
    );
    inserted++;
    console.log(`✅ Insertada: ${tpl.name}`);
  }
}

console.log(`\nListo: ${inserted} nueva(s), ${updated} actualizada(s)`);
console.log('Ahora abre Monday.com → MaxiDocs → Plantillas para completar la migración.');
await pool.end();
