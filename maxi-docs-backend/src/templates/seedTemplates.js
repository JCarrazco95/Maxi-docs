/**
 * Plantillas oficiales de MAXIRent, sembradas por POST /api/templates/seed.
 *
 * Reglas de este archivo, aprendidas a golpes:
 *
 * 1. NADA de <table> en el cuerpo. El editor tiene la extensión Table de
 *    TipTap y convertiría cualquier tabla de maquetación en una tabla
 *    editable, destruyendo el layout. Todo se maqueta con divs + flex.
 * 2. NADA de <svg> inline. TipTap no tiene nodo para SVG y lo descarta.
 *    Los iconos van como data-URI en background-image dentro del <style>,
 *    que el editor nunca toca.
 * 3. El estilo vive en clases, no en atributos style= sueltos. GenericDiv
 *    preserva class y style en <div>, pero <p> no tiene atributo style
 *    definido y lo pierde al pasar por Edición libre.
 * 4. Un <div> solo admite hijos de bloque (GenericDiv content: 'block*'),
 *    así que TipTap envuelve el texto suelto en <p>. Por eso el reset
 *    `p { margin: 0 }` — si no, aparecen huecos que no pusimos.
 * 5. data-items-b64="W10=" es btoa('[]'): las tablas se siembran vacías y
 *    el ejecutivo las llena en el editor.
 */

// ── Assets hospedados ─────────────────────────────────────────────
// Extraídos de cotizacion_LP.pdf a 300 dpi. Las mascotas llevan alpha.
// URLs verificadas 200 OK y con el mismo tamaño en bytes que los originales
// antes de conectarlas — WordPress no las recomprimió.
// Ojo con el sufijo -1 de la última: WordPress lo agrega cuando ya existe un
// archivo con ese nombre. No quitarlo.
const LP_HEADER = 'https://analy-sys.pro/wp-content/uploads/2026/08/01-header-banda.png';
const LP_FOOTER = 'https://analy-sys.pro/wp-content/uploads/2026/08/02-footer-banda.png';
const LP_MASCOTA_HERO   = 'https://analy-sys.pro/wp-content/uploads/2026/08/03-mascota-brazos-cruzados.png';
const LP_MASCOTA_APUNTA = 'https://analy-sys.pro/wp-content/uploads/2026/08/04-mascota-senalando-1.png';

// ── Plantilla actual: Propuesta Comercial MAXIRent ────────────────
// COPIA VERBATIM de lo que había en routes/templates.js. No reformatear:
// el seed sobrescribe la plantilla en producción cada vez que alguien abre
// la pestaña Plantillas, así que cualquier cambio accidental aquí se
// publica solo.
const PROPUESTA_COMERCIAL_HTML = `<style>
  @page { margin: 0; }
  html, body { margin: 0 !important; padding: 0 !important; }
  .mr, .mr * { box-sizing: border-box; }
  .mr { font-family: Arial, Helvetica, sans-serif; font-size:9.5pt; color:#222; }
  /* ── Layout por página: márgenes manejados en CSS, @page anula los de Puppeteer ── */
  .mr-page {
    display: flex;
    flex-direction: column;
    min-height: 296mm;
  }
  .mr-page-content { flex: 1; padding: 0 15mm; }
  /* ── Full-bleed: 100% del ancho físico del A4 ── */
  .mr-full-bleed {
    display: block;
    width: 100%;
  }
  /* Header pegado al borde superior */
  .mr-page-header { margin-bottom: 6px; }
  /* Footer empujado al borde inferior */
  .mr-page-footer { margin-top: auto; }
  /* Página publicitaria: imagen A4 completa */
  .mr-ad-page {
    page-break-before: always;
    height: 296mm;
    width: 100%;
    overflow: hidden;
  }
  .mr-ad-page img { display:block; width:100%; height:100%; object-fit:cover; }
  .mr-header-info { display:flex; justify-content:space-between; align-items:flex-start; margin:0 0 10px; font-size:9.5pt; }
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

<!-- ══════ PÁGINA 1 ══════ -->
<div class="mr-page">
  <img src="https://analy-sys.pro/wp-content/uploads/2026/05/PRES_cotizacion_update-01.png" class="mr-full-bleed mr-page-header" />
  <div class="mr-page-content">
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
    <p class="mr-intro">Presentamos una solución integral para la renta y administración de flota vehicular.</p>
    <pricing-table data-title="TARIFAS" data-table-type="tarifas" data-items-b64="W10=" data-iva-rate="16"></pricing-table>
    <p class="mr-obs-label">Observaciones:</p>
    <div class="mr-obs">Se requiere Pago por anticipado 30 días, garantía de 30 días + Firma de contrato + Firma pagaré</div>
    <pricing-table data-title="ADECUACIONES" data-table-type="accesorios" data-items-b64="W10=" data-iva-rate="16"></pricing-table>
    <pricing-table data-title="VALOR DEL ACUERDO INICIAL" data-table-type="acuerdo" data-items-b64="W10=" data-iva-rate="16"></pricing-table>
    <h3 class="mr-h3">Condiciones comerciales</h3>
    <ul class="mr-ul">
      <li>Tarifas de rentas, traslados y/o adecuaciones son más IVA</li>
      <li>Seguro con deducible del 0% o el 10% acorde a la tarifa pactada</li>
      <li>Pago anticipado mensual (30 días) y meses subsecuentes</li>
      <li>Los accesorios pasan a ser propiedad del cliente</li>
    </ul>
    <div class="mr-firma-box"></div>
    <p class="mr-nota">**Nota: La firma no implica compromiso de compra. Vigencia 15 días.</p>
  </div>
  <img src="https://analy-sys.pro/wp-content/uploads/2026/05/PRES_cotizacion_update-03.png" class="mr-full-bleed mr-page-footer" />
</div>

<!-- ══════ PÁGINA 2 ══════ -->
<div class="mr-page" style="page-break-before:always; padding-top:15mm;">
  <div class="mr-page-content">
    <h3 class="mr-h3">Requisitos para entrega de unidades</h3>
    <ul class="mr-ul">
      <li>Cubrir primer mes de renta y costo por entrega</li>
      <li>Retención de Garantía de 30 días de renta</li>
      <li>Firma de contrato, Carta Cobertura y pagaré</li>
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
  </div>
  <img src="https://analy-sys.pro/wp-content/uploads/2026/05/PRES_cotizacion_update-03.png" class="mr-full-bleed mr-page-footer" />
</div>

<!-- ══════ PÁGINA 3 — PUBLICITARIA (full A4) ══════ -->
<div class="mr-ad-page">
  <img src="https://analy-sys.pro/wp-content/uploads/2026/05/PRES_cotizacion_update-02.png" alt="MAXIRent — propuesta de valor" />
</div>

</div>`;

// ── Plantilla nueva: Propuesta de Renta Empresarial (LP) ──────────
const PROPUESTA_LP_HTML = `<style>
  @page { margin: 0; }
  html, body { margin: 0 !important; padding: 0 !important; }
  .lp, .lp * { box-sizing: border-box; }
  .lp { font-family: Arial, Helvetica, sans-serif; font-size: 9.5pt; color: #2B3A40; }
  .lp p { margin: 0; }

  /* ── Layout por página ── */
  .lp-page { display: flex; flex-direction: column; min-height: 296mm; }
  .lp-page-content { flex: 1; padding: 0 14mm; }
  .lp-full-bleed { display: block; width: 100%; }
  .lp-page-footer { margin-top: auto; }

  /* ── Títulos ── */
  .lp-title { font-size: 23pt; font-weight: 800; color: #063B4A; letter-spacing: -0.4px; margin: 8px 0 3px; }
  .lp-subtitle { font-size: 10pt; color: #607078; margin-bottom: 12px; }
  .lp-h2 { font-size: 10pt; font-weight: 800; color: #063B4A; letter-spacing: 0.6px; text-transform: uppercase; margin: 10px 0 5px; }
  .lp-h2-orange { color: #F58220; }

  /* ── Tarjetas de folio / fecha / vigencia ── */
  .lp-meta { display: flex; gap: 10px; margin-bottom: 14px; }
  .lp-meta-card { flex: 1; border: 1px solid #D7E4E8; border-left: 3px solid #F58220; border-radius: 4px; padding: 8px 12px; }
  .lp-meta-label { font-size: 7pt; font-weight: 700; color: #607078; letter-spacing: 0.8px; text-transform: uppercase; margin-bottom: 3px; }
  /* 10pt para que "10 de septiembre de 2026" quepa en una línea */
  .lp-meta-value { font-size: 10pt; font-weight: 800; color: #063B4A; }

  /* ── Hero: la tabla "resumen" la construye el backend; la mascota se
        superpone desde aquí para que el asset viva en la plantilla ── */
  .lp-hero-wrap { position: relative; }
  .lp-hero-mascota { position: absolute; right: 8px; bottom: 0; width: 100px; display: block; }

  /* ── Tarjetas de condiciones ── */
  .lp-cards { display: flex; gap: 10px; margin: 12px 0 4px; }
  .lp-card { flex: 1; border: 1px solid #D7E4E8; border-radius: 5px; padding: 10px 14px; }
  .lp-card-label { font-size: 8pt; font-weight: 700; color: #607078; letter-spacing: 0.7px; text-transform: uppercase; margin-bottom: 4px; }
  .lp-card-body { font-size: 9pt; color: #2B3A40; line-height: 1.45; }
  .lp-card-strong { font-size: 10.5pt; font-weight: 800; color: #063B4A; line-height: 1.3; }

  /* ── Siguiente paso ── */
  .lp-steps { border: 1px solid #D7E4E8; border-radius: 6px; padding: 14px 18px 16px; margin-top: 18px; }
  .lp-steps-title { font-size: 10pt; font-weight: 800; color: #063B4A; letter-spacing: 0.6px; text-transform: uppercase; margin-bottom: 12px; padding-left: 42px; background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 44 16'%3E%3Cpath d='M2 2l5 6-5 6M13 2l5 6-5 6M24 2l5 6-5 6' fill='none' stroke='%23F58220' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat left center/34px 12px; }
  .lp-steps-row { display: flex; }
  .lp-step { flex: 1; text-align: center; }
  .lp-step-num { width: 26px; height: 26px; border-radius: 50%; margin: 0 auto 7px; color: #FFFFFF; font-size: 10pt; font-weight: 800; line-height: 26px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .lp-step-navy { background: #063B4A; }
  .lp-step-orange { background: #F58220; }
  .lp-step-label { font-size: 8pt; color: #2B3A40; line-height: 1.35; }

  /* ── Página 2: incluidos ── */
  .lp-incl-wrap { display: flex; gap: 16px; align-items: flex-start; margin-top: 8px; }
  .lp-mascota { width: 92px; flex: none; }
  .lp-mascota img { width: 100%; display: block; }
  .lp-incl { flex: 1; }
  .lp-incl-cols { display: flex; gap: 22px; }
  .lp-incl-col { flex: 1; }
  .lp-check { font-size: 8.5pt; color: #2B3A40; line-height: 1.35; padding: 2px 0 2px 20px; background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Ccircle cx='10' cy='10' r='9' fill='%232E9E5B'/%3E%3Cpath d='M5.5 10.2l3 3 6-6.4' fill='none' stroke='white' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat left 6px/13px 13px; }

  /* ── Página 2: 4 tarjetas de servicio ── */
  .lp-svcs { display: flex; gap: 9px; margin-top: 20px; }
  .lp-svc { flex: 1; background: #063B4A; border-radius: 5px; padding: 20px 11px 11px; position: relative; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .lp-svc-ico { position: absolute; top: -14px; left: 11px; width: 28px; height: 28px; border-radius: 50%; background-color: #F58220; background-repeat: no-repeat; background-position: center; background-size: 15px 15px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .lp-ico-mant { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z'/%3E%3C/svg%3E"); }
  .lp-ico-gest { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'/%3E%3C/svg%3E"); }
  .lp-ico-cap { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='8' r='6'/%3E%3Cpolyline points='8.2 13.9 7 23 12 20 17 23 15.8 13.9'/%3E%3C/svg%3E"); }
  .lp-ico-tele { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z'/%3E%3Ccircle cx='12' cy='10' r='3'/%3E%3C/svg%3E"); }
  .lp-svc-title { font-size: 9pt; font-weight: 800; color: #FFFFFF; padding-bottom: 5px; border-bottom: 2px solid #F58220; margin-bottom: 6px; }
  .lp-svc-body { font-size: 7pt; color: #C3D4DA; line-height: 1.45; min-height: 34px; }
  .lp-svc-resp-label { font-size: 6.5pt; font-weight: 700; color: #8FA8B2; letter-spacing: 0.6px; margin-top: 6px; }
  .lp-svc-resp { font-size: 7pt; font-weight: 700; color: #F58220; line-height: 1.4; }

  /* ── Página 2: condiciones generales ── */
  .lp-cond { display: flex; gap: 12px; margin-top: 8px; }
  .lp-cond-box { flex: 1; border: 1px solid #D7E4E8; border-radius: 5px; padding: 10px 14px; }
  .lp-cond-title { font-size: 9pt; font-weight: 800; color: #063B4A; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 8px; }
  .lp-bullet { font-size: 8pt; color: #2B3A40; line-height: 1.35; padding: 2px 0 2px 13px; background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'%3E%3Ccircle cx='4' cy='4' r='2.6' fill='%23F58220'/%3E%3C/svg%3E") no-repeat left 8px/6px 6px; }

  /* ── Página 2: requisitos ── */
  .lp-reqs { border: 1px solid #D7E4E8; border-radius: 6px; padding: 8px 14px; margin-top: 5px; display: flex; flex-wrap: wrap; }
  .lp-req { width: 33.33%; display: flex; gap: 8px; align-items: flex-start; padding: 4px 10px 4px 0; }
  .lp-req-num { width: 20px; height: 20px; flex: none; border-radius: 50%; background: #185A6E; color: #FFFFFF; font-size: 8.5pt; font-weight: 800; line-height: 20px; text-align: center; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .lp-req-text { font-size: 8pt; color: #2B3A40; line-height: 1.35; }
  .lp-req-note { color: #F58220; }

  /* ── Página 2: cierre ── */
  .lp-cta { background: #063B4A; border-radius: 6px; padding: 14px 24px 16px; margin-top: 12px; text-align: center; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .lp-cta-title { font-size: 14pt; font-weight: 800; color: #FFFFFF; margin-bottom: 5px; }
  .lp-cta-body { font-size: 8.5pt; color: #C3D4DA; line-height: 1.45; margin-bottom: 10px; }
  .lp-cta-btns { display: flex; gap: 12px; justify-content: center; }
  .lp-btn { display: block; padding: 10px 24px; border-radius: 4px; font-size: 9.5pt; font-weight: 700; text-decoration: none; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .lp-btn-orange { background: #F58220; color: #FFFFFF; }
  .lp-btn-white { background: #FFFFFF; color: #063B4A; }

  /* ── Cabecera de las tablas de precios de esta plantilla ── */
  .pt-header { background: #063B4A !important; }
  .pt-header .pt-title { color: white !important; }
</style>
<div class="lp">

<!-- ══════ PÁGINA 1 ══════ -->
<div class="lp-page">
  <img src="${LP_HEADER}" class="lp-full-bleed" />
  <div class="lp-page-content">

    <div class="lp-title">Propuesta de renta empresarial</div>
    <div class="lp-subtitle">Preparada para {{razon_social}} — Atención: {{name}}</div>

    <div class="lp-meta">
      <div class="lp-meta-card">
        <div class="lp-meta-label">Folio</div>
        <div class="lp-meta-value">{{folio}}</div>
      </div>
      <div class="lp-meta-card">
        <div class="lp-meta-label">Fecha de elaboración</div>
        <div class="lp-meta-value">{{fecha}}</div>
      </div>
      <div class="lp-meta-card">
        <div class="lp-meta-label">Vigencia</div>
        <div class="lp-meta-value">{{fecha_vigencia}}</div>
      </div>
    </div>

    <div class="lp-hero-wrap">
      <pricing-table data-title="RESUMEN" data-table-type="resumen" data-items-b64="W10=" data-iva-rate="16"></pricing-table>
      <img src="${LP_MASCOTA_HERO}" class="lp-hero-mascota" />
    </div>

    <div class="lp-cards">
      <div class="lp-card">
        <div class="lp-card-label">Tarifa vigente</div>
        <div class="lp-card-strong">Durante todo el periodo contratado, sin incrementos.</div>
      </div>
      <div class="lp-card">
        <div class="lp-card-label">Pago inicial y garantía</div>
        <div class="lp-card-body">Se definen conforme a las condiciones particulares.</div>
      </div>
    </div>

    <pricing-table data-title="UNIDADES PROPUESTAS" data-table-type="tabulador" data-items-b64="W10=" data-iva-rate="16"></pricing-table>
    <pricing-table data-title="COSTOS ADICIONALES" data-table-type="costos" data-items-b64="W10=" data-iva-rate="16"></pricing-table>
    <pricing-table data-title="ADECUACIONES" data-table-type="adicionales" data-items-b64="W10=" data-iva-rate="16"></pricing-table>

    <div class="lp-steps">
      <div class="lp-steps-title">Siguiente paso</div>
      <div class="lp-steps-row">
        <div class="lp-step">
          <div class="lp-step-num lp-step-navy">1</div>
          <div class="lp-step-label">Confirma la propuesta</div>
        </div>
        <div class="lp-step">
          <div class="lp-step-num lp-step-orange">2</div>
          <div class="lp-step-label">Comparte documentos</div>
        </div>
        <div class="lp-step">
          <div class="lp-step-num lp-step-navy">3</div>
          <div class="lp-step-label">Firma y realiza el pago</div>
        </div>
        <div class="lp-step">
          <div class="lp-step-num lp-step-orange">4</div>
          <div class="lp-step-label">Programamos la entrega</div>
        </div>
      </div>
    </div>

  </div>
  <img src="${LP_FOOTER}" class="lp-full-bleed lp-page-footer" />
</div>

<!-- ══════ PÁGINA 2 ══════ -->
<div class="lp-page" style="page-break-before: always;">
  <img src="${LP_HEADER}" class="lp-full-bleed" />
  <div class="lp-page-content">

    <div class="lp-title">Todo claro antes de contratar</div>
    <div class="lp-subtitle">Servicios, cobertura, responsabilidades y requisitos</div>

    <div class="lp-incl-wrap">
      <div class="lp-mascota">
        <img src="${LP_MASCOTA_APUNTA}" />
      </div>
      <div class="lp-incl">
        <div class="lp-h2">Lo más importante ya está incluido</div>
        <div class="lp-incl-cols">
          <div class="lp-incl-col">
            <div class="lp-check">Kilometraje ilimitado.</div>
            <div class="lp-check">Mantenimiento preventivo y correctivo.</div>
            <div class="lp-check">Asistencia en camino.</div>
            <div class="lp-check">GPS y telemetría con acceso para el cliente.</div>
            <div class="lp-check">Gestoría de trámites vehiculares.</div>
          </div>
          <div class="lp-incl-col">
            <div class="lp-check">Unidad sustituta en los supuestos del contrato.</div>
            <div class="lp-check">Cambio de llantas cada 60,000 km.</div>
            <div class="lp-check">Atención especializada durante toda la renta.</div>
            <div class="lp-check">Acompañamiento estratégico y seguimiento de tu cuenta.</div>
            <div class="lp-check">Campaña preventiva para fomentar una conducción segura.</div>
          </div>
        </div>
      </div>
    </div>

    <div class="lp-svcs">
      <div class="lp-svc">
        <div class="lp-svc-ico lp-ico-mant"></div>
        <div class="lp-svc-title">Mantenimiento</div>
        <div class="lp-svc-body">Coordinamos atención técnica en sitio cuando las condiciones de operación lo permiten.</div>
        <div class="lp-svc-resp-label">RESPALDO</div>
        <div class="lp-svc-resp">+186 talleres en red</div>
        <div class="lp-svc-resp">Preventivo en menos de 6 horas</div>
      </div>
      <div class="lp-svc">
        <div class="lp-svc-ico lp-ico-gest"></div>
        <div class="lp-svc-title">Gestoría</div>
        <div class="lp-svc-body">Apoyamos en multas, corralones y trámites para reducir cargas a tu equipo.</div>
        <div class="lp-svc-resp-label">RESPALDO</div>
        <div class="lp-svc-resp">+344 multas evitadas</div>
        <div class="lp-svc-resp">+40 corralones evitados</div>
      </div>
      <div class="lp-svc">
        <div class="lp-svc-ico lp-ico-cap"></div>
        <div class="lp-svc-title">Capacitación</div>
        <div class="lp-svc-body">Formación para conductores con instructores certificados por NSC, CESVI y Cruz Roja.</div>
        <div class="lp-svc-resp-label">RESPALDO</div>
        <div class="lp-svc-resp">+4,000 capacitados</div>
        <div class="lp-svc-resp">80 clientes sin siniestros</div>
      </div>
      <div class="lp-svc">
        <div class="lp-svc-ico lp-ico-tele"></div>
        <div class="lp-svc-title">Telemetría</div>
        <div class="lp-svc-body">Recorridos, velocidad y hábitos de conducción con acceso directo para ti.</div>
        <div class="lp-svc-resp-label">RESPALDO</div>
        <div class="lp-svc-resp">Telemetría 24/7</div>
        <div class="lp-svc-resp">Geocercas y alertas</div>
      </div>
    </div>

    <div class="lp-h2">Condiciones generales</div>
    <div class="lp-cond">
      <div class="lp-cond-box">
        <div class="lp-cond-title">Seguro y deducibles</div>
        <div class="lp-bullet">Deducible de 10% por robo total.</div>
        <div class="lp-bullet">Deducible de 10% por pérdida total por daños materiales.</div>
        <div class="lp-bullet">Plan con 0% de deducible disponible con costo adicional.</div>
        <div class="lp-bullet">Cobertura aplicable únicamente en territorio nacional.</div>
        <div class="lp-bullet">Responsabilidad civil conforme a la póliza contratada.</div>
      </div>
      <div class="lp-cond-box">
        <div class="lp-cond-title">Queda a tu cargo</div>
        <div class="lp-bullet">Multas de tránsito locales o federales.</div>
        <div class="lp-bullet">Daños por negligencia o uso distinto al autorizado.</div>
        <div class="lp-bullet">Reportar cualquier incidencia o daño detectado en la unidad.</div>
        <div class="lp-bullet">Daños por vandalismo, salvo cobertura contratada.</div>
        <div class="lp-bullet">Lavado especial por suciedad excesiva.</div>
      </div>
    </div>

    <div class="lp-h2">Requisitos para contratación <span class="lp-h2-orange">(Persona moral)</span></div>
    <div class="lp-reqs">
      <div class="lp-req">
        <div class="lp-req-num">1</div>
        <div class="lp-req-text">Constancia de situación fiscal actualizada</div>
      </div>
      <div class="lp-req">
        <div class="lp-req-num">2</div>
        <div class="lp-req-text">Opinión positiva del SAT</div>
      </div>
      <div class="lp-req">
        <div class="lp-req-num">3</div>
        <div class="lp-req-text">Acta constitutiva y poderes del representante</div>
      </div>
      <div class="lp-req">
        <div class="lp-req-num">4</div>
        <div class="lp-req-text">Identificación oficial y comprobante de domicilio</div>
      </div>
      <div class="lp-req">
        <div class="lp-req-num">5</div>
        <div class="lp-req-text">Licencia vigente de los conductores</div>
      </div>
      <div class="lp-req">
        <div class="lp-req-num">6</div>
        <div class="lp-req-text">Firma del contrato y del pagaré, así como pago del depósito en garantía. <span class="lp-req-note">Sujeto a las condiciones particulares de la negociación.</span></div>
      </div>
      <div class="lp-req">
        <div class="lp-req-num">7</div>
        <div class="lp-req-text">Carátula del estado de cuenta bancario</div>
      </div>
    </div>

    <div class="lp-cta">
      <div class="lp-cta-title">Tu flota puede estar operando en cuestión de días</div>
      <div class="lp-cta-body">Esta propuesta es válida hasta el {{fecha_vigencia}}. Confírmala y programamos la entrega en cuanto se complete la validación documental.</div>
      <div class="lp-cta-btns">
        <a class="lp-btn lp-btn-orange" href="mailto:{{correo_electronico}}?subject=Confirmo%20propuesta%20{{folio}}">Confirmar por correo</a>
        <a class="lp-btn lp-btn-white" href="https://wa.me/52{{telefono}}">Confirmar por WhatsApp</a>
      </div>
    </div>

  </div>
  <img src="${LP_FOOTER}" class="lp-full-bleed lp-page-footer" />
</div>

</div>`;

export const SEED_TEMPLATES = [
  {
    name:         'Propuesta Comercial MAXIRent',
    description:  'Plantilla oficial MAXIRent — TARIFAS, ADECUACIONES y VALOR DEL ACUERDO',
    content_html: PROPUESTA_COMERCIAL_HTML,
  },
  {
    name:         'Propuesta de Renta Empresarial (LP)',
    description:  'Propuesta de renta empresarial con precios del tabulador por plazo — '
                + 'UNIDADES PROPUESTAS, COSTOS ADICIONALES y ADECUACIONES',
    content_html: PROPUESTA_LP_HTML,
  },
];
