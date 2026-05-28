import { Router } from 'express';
import { query } from '../db/connection.js';
import { extractVariables, generateThumbnail, wrapDocumentHtml } from '../services/pdfService.js';

// Genera thumbnail en background sin bloquear la respuesta
async function scheduleThumbnail(templateId, contentHtml) {
  try {
    const wrapped = wrapDocumentHtml(contentHtml, 'Plantilla')
    const url     = await generateThumbnail(wrapped, templateId)
    await query(`UPDATE templates SET thumbnail_url = $1 WHERE id = $2`, [url, templateId])
  } catch (e) {
    console.warn('[Thumbnail] Error generando thumbnail:', e.message)
  }
}

const router = Router();

// GET /api/templates — lista todas las plantillas de la cuenta
router.get('/', async (req, res) => {
  const { accountId } = req.mondayContext;
  const result = await query(
    `SELECT id, name, description, variables, thumbnail_url, created_at, updated_at
     FROM templates
     WHERE monday_account_id = $1
     ORDER BY updated_at DESC`,
    [accountId]
  );
  res.json(result.rows);
});

// GET /api/templates/:id — detalle de una plantilla
// Busca por ID primero (sin filtro de cuenta) para que funcione desde
// el editor en nueva pestaña donde el contexto de Monday puede variar
router.get('/:id', async (req, res) => {
  const { accountId, isAdmin } = req.mondayContext;
  const result = await query(
    `SELECT * FROM templates WHERE id = $1`,
    [req.params.id]
  );
  const tpl = result.rows[0];
  if (!tpl) return res.status(404).json({ error: 'Template not found' });
  // Verificar pertenencia solo para no-admin y cuando no es 'dev'
  if (!isAdmin && tpl.monday_account_id !== accountId && accountId !== 'dev') {
    return res.status(403).json({ error: 'Sin permiso para esta plantilla' });
  }
  res.json(tpl);
});

// POST /api/templates — crea una plantilla nueva
router.post('/', async (req, res) => {
  const { accountId, userId } = req.mondayContext;
  const { name, description = '', content_html } = req.body;

  if (!name || !content_html) {
    return res.status(400).json({ error: 'name y content_html son requeridos' });
  }

  const variables = extractVariables(content_html);

  const result = await query(
    `INSERT INTO templates (name, description, content_html, variables, monday_user_id, monday_account_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [name, description, content_html, JSON.stringify(variables), userId, accountId]
  );

  const tpl = result.rows[0]
  // Generar thumbnail en background (no bloquea la respuesta)
  scheduleThumbnail(tpl.id, content_html)
  res.status(201).json(tpl);
});

// PUT /api/templates/:id — actualiza una plantilla
router.put('/:id', async (req, res) => {
  const { accountId } = req.mondayContext;
  const { name, description, content_html } = req.body;

  const variables = content_html ? extractVariables(content_html) : undefined;

  const result = await query(
    `UPDATE templates
     SET name        = COALESCE($1, name),
         description = COALESCE($2, description),
         content_html= COALESCE($3, content_html),
         variables   = COALESCE($4, variables)
     WHERE id = $5 AND monday_account_id = $6
     RETURNING *`,
    [name, description, content_html, variables ? JSON.stringify(variables) : null, req.params.id, accountId]
  );

  if (!result.rows[0]) return res.status(404).json({ error: 'Template not found' });
  const tpl = result.rows[0]
  if (content_html) scheduleThumbnail(tpl.id, content_html)
  res.json(tpl);
});

// POST /api/templates/seed — crea o actualiza la plantilla MAXIRent (idempotente)
router.post('/seed', async (req, res) => {
  const { accountId, userId } = req.mondayContext;
  const TPL_NAME = 'Propuesta Comercial MAXIRent';

  // Renombrar v2 → sin v2
  await query(
    `UPDATE templates SET name = $1 WHERE monday_account_id = $2 AND name = 'Propuesta Comercial MAXIRent v2'`,
    [TPL_NAME, accountId]
  ).catch(() => {});

  // Eliminar duplicados — dejar solo el más reciente
  await query(
    `DELETE FROM templates WHERE monday_account_id = $1 AND name = $2
     AND id NOT IN (
       SELECT id FROM templates WHERE monday_account_id = $1 AND name = $2
       ORDER BY created_at DESC LIMIT 1
     )`,
    [accountId, TPL_NAME]
  ).catch(() => {});

  const content_html = `<style>
  .mr, .mr * { box-sizing: border-box; }
  .mr { font-family: Arial, Helvetica, sans-serif; font-size:9.5pt; color:#222; }
  /* ── Layout por página: cada .mr-page ocupa al menos una hoja A4 completa ──
     A4 = 297mm. Puppeteer aplica 15mm de margen arriba y abajo → área útil 267mm.
     Usamos flex column con min-height 267mm; el footer recibe margin-top:auto
     para empujarse al borde inferior aunque el contenido sea corto. */
  .mr-page {
    display: flex;
    flex-direction: column;
    min-height: 267mm;
  }
  .mr-page-content { flex: 1 1 auto; min-height: 0; }
  /* ── Full-bleed (borde a borde A4) ──
     Ancho EXPLÍCITO 210mm para que el browser NO use el tamaño natural del PNG
     (que es mucho mayor). Negative margins de -15mm sacan la imagen fuera del
     área de Puppeteer hasta los bordes físicos de la página A4. */
  .mr-full-bleed {
    display: block;
    width: 210mm;
    height: auto;
    margin-left: -15mm;
    margin-right: -15mm;
  }
  /* Header pegado al borde superior */
  .mr-page-header { margin-top: -15mm; margin-bottom: 6px; }
  /* Footer empujado al borde inferior */
  .mr-page-footer { margin-top: auto; margin-bottom: -15mm; }
  /* ── Página publicitaria: cubre la hoja A4 completa (210×297mm) ──
     overflow:hidden + object-fit:cover garantizan que la imagen llene el
     rectángulo sin deformarse aunque su aspect ratio difiera ligeramente. */
  .mr-ad-page {
    page-break-before: always;
    page-break-inside: avoid;
    display: block;
    width: 210mm;
    height: 297mm;
    margin: -15mm;
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
    <pricing-table data-title="TARIFAS" data-table-type="tarifas" data-items-b64="W10=" data-iva-rate="0"></pricing-table>
    <p class="mr-obs-label">Observaciones:</p>
    <div class="mr-obs">Se requiere Pago por anticipado 30 días, garantía de 30 días + Firma de contrato + Firma pagaré</div>
    <pricing-table data-title="ADECUACIONES" data-table-type="accesorios" data-items-b64="W10=" data-iva-rate="16"></pricing-table>
    <pricing-table data-title="VALOR DEL ACUERDO INICIAL" data-table-type="acuerdo" data-items-b64="W10=" data-iva-rate="0"></pricing-table>
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
<div class="mr-page" style="page-break-before:always;">
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

  const variables = extractVariables(content_html);
  const desc = 'Plantilla oficial MAXIRent — TARIFAS, ADECUACIONES y VALOR DEL ACUERDO';

  // Verificar si ya existe
  const existing = await query(
    `SELECT id FROM templates WHERE monday_account_id = $1 AND name = $2`,
    [accountId, TPL_NAME]
  );

  let tpl;
  if (existing.rows.length > 0) {
    // Actualizar contenido
    const upd = await query(
      `UPDATE templates SET content_html = $1, variables = $2, description = $3, updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [content_html, JSON.stringify(variables), desc, existing.rows[0].id]
    );
    tpl = upd.rows[0];
  } else {
    // Insertar nueva
    const ins = await query(
      `INSERT INTO templates (name, description, content_html, variables, monday_user_id, monday_account_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [TPL_NAME, desc, content_html, JSON.stringify(variables), userId, accountId]
    );
    tpl = ins.rows[0];
  }

  if (tpl) scheduleThumbnail(tpl.id, content_html);
  res.json({ ok: true, message: 'Plantilla actualizada' });
});

// POST /api/templates/migrate-dev — copia las plantillas de 'dev' a la cuenta real
// Úsalo una sola vez para importar plantillas creadas en local a Monday.com
router.post('/migrate-dev', async (req, res) => {
  const { accountId, userId } = req.mondayContext;

  if (accountId === 'dev') {
    return res.status(400).json({ error: 'Ya estás en modo dev, conéctate desde Monday.com' });
  }

  // Buscar plantillas del account 'dev' que no existan ya en la cuenta real
  const devTemplates = await query(
    `SELECT * FROM templates WHERE monday_account_id = 'dev'`
  );

  if (devTemplates.rows.length === 0) {
    return res.json({ migrated: 0, message: 'No hay plantillas en dev para migrar' });
  }

  let migrated = 0, updated = 0;
  for (const tpl of devTemplates.rows) {
    const exists = await query(
      `SELECT id FROM templates WHERE name = $1 AND monday_account_id = $2`,
      [tpl.name, accountId]
    );

    if (exists.rows.length > 0) {
      // Actualizar si ya existe (fuerza reemplazo con la versión más reciente)
      await query(
        `UPDATE templates
         SET content_html = $1, description = $2, variables = $3, updated_at = NOW()
         WHERE name = $4 AND monday_account_id = $5`,
        [tpl.content_html, tpl.description, JSON.stringify(tpl.variables), tpl.name, accountId]
      );
      updated++;
    } else {
      await query(
        `INSERT INTO templates (name, description, content_html, variables, monday_user_id, monday_account_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [tpl.name, tpl.description, tpl.content_html, JSON.stringify(tpl.variables), userId, accountId]
      );
      migrated++;
    }
  }

  res.json({
    migrated,
    updated,
    message: `${migrated} nueva(s) y ${updated} actualizada(s) en tu cuenta`,
  });
});

// DELETE /api/templates/:id
router.delete('/:id', async (req, res) => {
  const { accountId } = req.mondayContext;
  await query(
    `DELETE FROM templates WHERE id = $1 AND monday_account_id = $2`,
    [req.params.id, accountId]
  );
  res.status(204).end();
});

export default router;
