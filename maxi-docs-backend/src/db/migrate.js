import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SEED_TEMPLATES = [
  {
    name: 'Propuesta Comercial MAXIRent',
    description: 'Plantilla oficial MAXIRent — TARIFAS, ADECUACIONES y VALOR DEL ACUERDO',
    variables: JSON.stringify(['name','ejecutivo','Fecha_creación','fecha_vigencia','telefono','correo_electronico']),
    content_html: `<style>
  .mr, .mr * { box-sizing: border-box; }
  .mr img { width:100%; display:block; }
  .mr { font-family: Arial, Helvetica, sans-serif; font-size:9.5pt; color:#222; }
  .mr-header-info { display:flex; justify-content:space-between; align-items:flex-start; margin:12px 0 10px; font-size:9.5pt; }
  .mr-bold { font-weight:700; }
  .mr-intro { font-size:9.5pt; line-height:1.55; margin:10px 0 14px; text-align:justify; }
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
  .pt-header { background:#F5A000 !important; }
  .pt-header .pt-title { color:white !important; }
</style>
<div class="mr">
<img src="https://analy-sys.pro/wp-content/uploads/2026/05/PRES_cotizacion_update-01.png" style="width:100%;display:block;margin-bottom:2px;" />
<div class="mr-header-info">
  <div>
    <p style="margin:3px 0;"><span class="mr-bold">CLIENTE: </span>{{razon_social}}</p>
    <p style="margin:3px 0;"><span class="mr-bold">ATENCIÓN: </span>{{name}}</p>
  </div>
  <div style="text-align:right;">
    <p style="margin:3px 0;"><span class="mr-bold">Fecha de elaboración </span>{{fecha}}</p>
    <p style="margin:3px 0;"><span class="mr-bold">Fecha de vigencia </span>{{fecha_vigencia}}</p>
  </div>
</div>
<p class="mr-intro">Presentamos una solución integral para la renta y administración de flota vehicular, diseñada para garantizar <strong>disponibilidad operativa, control de costos y continuidad de servicio</strong>.</p>
<pricing-table data-title="TARIFAS" data-table-type="tarifas" data-items-b64="W10=" data-iva-rate="0"></pricing-table>
<p class="mr-obs-label">Observaciones:</p>
<div class="mr-obs">Se requiere Pago por anticipado 30 días, garantía de 30 días + Firma de contrato + Firma pagaré</div>
<pricing-table data-title="ADECUACIONES" data-table-type="accesorios" data-items-b64="W10=" data-iva-rate="16"></pricing-table>
<pricing-table data-title="VALOR DEL ACUERDO INICIAL" data-table-type="acuerdo" data-items-b64="W10=" data-iva-rate="16"></pricing-table>
<h3 class="mr-h3">Condiciones comerciales</h3>
<ul class="mr-ul">
  <li>Tarifas de rentas, traslados y/o adecuaciones son más IVA</li>
  <li>Seguro con deducible del 0% o el 10% acorde a la tarifa pactada</li>
  <li>Pago anticipado mensual (30 días) y meses subsecuentes</li>
  <li>Renta por anticipado y costo de entrega en una sola exhibición</li>
  <li>Los accesorios pasan a ser propiedad del cliente</li>
</ul>
<h3 class="mr-h3">Requisitos para Alta de Cliente</h3>
<ul class="mr-ul">
  <li>Cédula del registro federal de contribuyentes (RFC)</li>
  <li>INE vigente del representante legal</li>
  <li>Comprobante de domicilio fiscal (no mayor a 2 meses)</li>
  <li>Acta constitutiva con especificación de poderes</li>
  <li>Opinión de cumplimiento POSITIVA con fecha actual</li>
  <li>Estado de cuenta bancario SOLO CARATULA</li>
  <li>Solicitud de renta y CARTACOBERTURA firmadas por representante legal</li>
</ul>
<div class="mr-firma-box"></div>
<p class="mr-nota">**Nota: La firma de la presente propuesta no implica compromiso de compra. Vigencia 15 días hábiles.</p>
<img src="https://analy-sys.pro/wp-content/uploads/2026/05/PRES_cotizacion_update-03.png" style="width:100%;display:block;margin-top:20px;" />
<div style="page-break-before:always;page-break-after:always;">
<h3 class="mr-h3">Requisitos para entrega de unidades</h3>
<ul class="mr-ul">
  <li>Cubrir primer mes de renta</li>
  <li>Retención de Garantía de 30 días de renta</li>
  <li>Firma de contrato y Carta Cobertura</li>
  <li>Firma de pagaré a valor factura del vehículo</li>
</ul>
<h3 class="mr-h3">SERVICIOS BÁSICOS INCLUIDOS</h3>
<ul class="mr-ul">
  <li>Kilometraje libre en cualquier parte de la república mexicana</li>
  <li>Cambio llantas sin costo llegando a los 60,000 km</li>
  <li>Mantenimientos correctivos y preventivos</li>
  <li>Seguro de auto con cobertura a terceros</li>
  <li>GPS en cada vehículo con cuenta espejo</li>
</ul>
<h3 class="mr-h3">Beneficios para su empresa</h3>
<ul class="mr-check">
  <li><strong style="color:#1B3055;">Flota siempre</strong> disponible y operativa</li>
  <li><strong style="color:#1B3055;">Evitas</strong> costos imprevistos</li>
  <li><strong style="color:#1B3055;">Sin inversión</strong> en compra de vehículos</li>
  <li><strong style="color:#1B3055;">Control</strong> y visibilidad total de sus operadores</li>
</ul>
<div class="mr-rep">
  <p style="margin:2px 0;font-weight:700;">{{ejecutivo}}</p>
  <p style="margin:2px 0;">Ejecutivo Comercial</p>
  <p style="margin:2px 0;">{{correo_electronico}}</p>
</div>
<img src="https://analy-sys.pro/wp-content/uploads/2026/05/PRES_cotizacion_update-03.png" style="width:100%;display:block;margin-top:24px;" />
</div>
</div>`
  }
];

async function migrate() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  console.log('Ejecutando migraciones...');
  const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('Migraciones completadas.');

  // Seed: insertar plantillas base si no existen
  for (const tpl of SEED_TEMPLATES) {
    const exists = await pool.query(
      `SELECT id FROM templates WHERE name = $1 AND monday_account_id = 'dev'`,
      [tpl.name]
    );
    if (exists.rows.length === 0) {
      await pool.query(
        `INSERT INTO templates (name, description, content_html, variables, monday_account_id)
         VALUES ($1, $2, $3, $4, 'dev')`,
        [tpl.name, tpl.description, tpl.content_html, tpl.variables]
      );
      console.log(`Plantilla seed insertada: ${tpl.name}`);
    }
  }

  await pool.end();
}

migrate().catch((err) => {
  console.error('Error en migración:', err.message);
  process.exit(1);
});
