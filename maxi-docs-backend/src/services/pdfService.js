import puppeteer from 'puppeteer';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { join as pathJoin, dirname as pathDirname, extname } from 'path';
import { fileURLToPath as fileUrlToPath } from 'url';

const __dirnamePdf = pathDirname(fileUrlToPath(import.meta.url));
import { buildPricingTableHtml } from './catalogService.js';

// Carpeta raíz de uploads (dos niveles arriba de services/)
const UPLOADS_DIR = pathJoin(__dirnamePdf, '../../uploads');

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

/**
 * Reemplaza <img src="/uploads/..."> por data URIs base64.
 * Esto garantiza que Puppeteer puede renderizar las imágenes sin peticiones HTTP.
 */
function embedLocalImages(html) {
  return html.replace(/(<img[^>]+src=")\/uploads\/([^"]+)(")/g, (match, pre, filename, post) => {
    const filepath = pathJoin(UPLOADS_DIR, filename);
    if (!existsSync(filepath)) return match; // si no existe, dejar como está
    try {
      const ext  = extname(filename).toLowerCase();
      const mime = MIME[ext] ?? 'image/jpeg';
      const b64  = readFileSync(filepath).toString('base64');
      return `${pre}data:${mime};base64,${b64}${post}`;
    } catch {
      return match;
    }
  });
}

// ── Procesa nodos <pricing-table> embebidos en el HTML ────────
// Los nodos guardan items como base64 JSON en data-items-b64
function parseAllTables(html) {
  // Extrae todos los pricing-table del HTML para calcular totales del tipo "acuerdo"
  const tables = { tarifas: [], accesorios: [] }
  const re = /<pricing-table([^>]*)><\/pricing-table>/g
  let m
  while ((m = re.exec(html)) !== null) {
    const attrs    = m[1]
    const typeM    = attrs.match(/data-table-type="([^"]*)"/)
    const b64M     = attrs.match(/data-items-b64="([^"]*)"/)
    const tableType = typeM?.[1]
    if (!b64M || !tableType) continue
    try {
      const its = JSON.parse(Buffer.from(b64M[1], 'base64').toString('utf8'))
      if (tableType === 'tarifas')    tables.tarifas.push(...its)
      if (tableType === 'accesorios') tables.accesorios.push(...its)
    } catch {}
  }
  return tables
}

const fmt = n => `$${Number(n||0).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})}`

export function processPricingTableNodes(html) {
  // Pre-calcular totales de todas las tablas (para el tipo "acuerdo")
  const allTables = parseAllTables(html)
  // TARIFAS: subtotal = renta mensual + entrega + recolección (deducible es solo informativo)
  const totalTarifas = allTables.tarifas.reduce((s,i) => {
    const m = (Number(i.dailyRate)||0)*30*(Number(i.quantity)||1)
    const d = Number(i.delivery)  || 0
    const r = Number(i.retrieval) || 0
    return s + m + d + r
  }, 0)
  // ADECUACIONES: total sin IVA
  const totalAcc     = allTables.accesorios.reduce((s,i) => s + (Number(i.price)||0)*(Number(i.quantity)||1), 0)
  const tarifasNames = allTables.tarifas.map(i => i.name).filter(Boolean)

  return html.replace(
    /<pricing-table([^>]*)><\/pricing-table>/g,
    (_, attrs) => {
      try {
        const titleM    = attrs.match(/data-title="([^"]*)"/)
        const b64M      = attrs.match(/data-items-b64="([^"]*)"/)
        const typeM     = attrs.match(/data-table-type="([^"]*)"/)
        const colsM     = attrs.match(/data-columns-b64="([^"]*)"/)

        const title     = titleM?.[1] ?? 'Cotización'
        const tableType = typeM?.[1] ?? 'renta'
        const items     = b64M ? JSON.parse(Buffer.from(b64M[1], 'base64').toString('utf8')) : []
        // IVA fijo en 16% — ya no es configurable por tabla. No leemos
        // data-iva-rate: documentos generados antes de este cambio pueden
        // traerlo guardado en 0 y no hay forma de corregirlo desde la UI.
        const ivaRate   = 16
        const hdrStyle  = `background:#1B3055;color:white;-webkit-print-color-adjust:exact;print-color-adjust:exact;`
        const TH        = (t,a='left') => `<th style="padding:7px 10px;font-size:8.5pt;text-align:${a};white-space:nowrap;${hdrStyle}">${t}</th>`
        const TD        = (t,a='left',extra='') => `<td style="padding:7px 10px;font-size:9pt;text-align:${a};border-bottom:1px solid #e5e7eb;${extra}">${t??''}</td>`
        const tblStyle  = `width:100%;border-collapse:collapse;font-family:Arial,sans-serif;margin:8px 0;border:1px solid #e5e7eb;`
        const tbl       = (head,body,foot='') => `<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;margin:4px 0;">${head}${body}${foot}</table>`

        // ── TIPO ACUERDO — auto calculado ───────────────────────────
        if (tableType === 'acuerdo') {
          const subtotal = totalTarifas + totalAcc
          const ivaAmt   = subtotal * ivaRate / 100
          const total    = subtotal + ivaAmt
          if (subtotal === 0) return ''
          const head = `<thead><tr>${TH('DESCRIPCIÓN')}${TH('SUBTOTAL','right')}${TH(`IVA ${ivaRate}%`,'right')}${TH('TOTAL','right')}</tr></thead>`
          let body = '<tbody>'
          // Una fila por cada item de TARIFAS: subtotal = renta mensual + entrega + recolección
          // (deducible es solo informativo, no suma)
          for (const item of allTables.tarifas) {
            const mensual   = (Number(item.dailyRate)||0) * 30 * (Number(item.quantity)||1)
            const delivery  = Number(item.delivery)  || 0
            const retrieval = Number(item.retrieval) || 0
            const subItem   = mensual + delivery + retrieval
            if (subItem === 0) continue
            body += `<tr>${TD(`Renta mensual ${item.name||''}`)}${TD(fmt(subItem),'right')}${TD(fmt(subItem*ivaRate/100),'right')}${TD(fmt(subItem*(1+ivaRate/100)),'right','font-weight:700;')}</tr>`
          }
          // Adecuaciones sin IVA (el IVA se suma en VALOR)
          if (totalAcc > 0) {
            body += `<tr>${TD('Adecuaciones')}${TD(fmt(totalAcc),'right')}${TD(fmt(totalAcc*ivaRate/100),'right')}${TD(fmt(totalAcc*(1+ivaRate/100)),'right','font-weight:700;')}</tr>`
          }
          body += '</tbody>'
          const foot = `<tfoot>
            <tr><td colspan="3" style="text-align:right;padding:5px 10px;font-weight:600;font-size:9pt;">Subtotal</td><td style="text-align:right;padding:5px 10px;font-weight:700;">${fmt(subtotal)}</td></tr>
            <tr><td colspan="3" style="text-align:right;padding:5px 10px;font-weight:600;font-size:9pt;">IVA ${ivaRate}%</td><td style="text-align:right;padding:5px 10px;font-weight:700;">${fmt(ivaAmt)}</td></tr>
            <tr style="border-top:2px solid #F5A000;"><td colspan="3" style="text-align:right;padding:8px 10px;font-weight:800;font-size:10pt;">TOTAL</td><td style="text-align:right;padding:8px 10px;font-weight:900;font-size:12pt;color:#F5A000;">${fmt(total)}</td></tr>
          </tfoot>`
          return `<div style="margin:12px 0;"><div style="font-weight:700;font-size:10pt;text-align:center;color:#1B3055;text-transform:uppercase;margin-bottom:6px;letter-spacing:.5px;">${title}</div><table style="${tblStyle}">${head}${body}${foot}</table></div>`
        }

        if (!items?.length) return ''

        // ── TABLA TARIFAS — con título ─────────────────────────────
        if (tableType === 'tarifas') {
          return `<div style="margin:12px 0;">
            <div style="font-weight:700;font-size:10pt;text-align:center;color:#1B3055;text-transform:uppercase;margin-bottom:6px;letter-spacing:.5px;">${title}</div>
            ${buildPricingTableHtml(items, ivaRate, 'tarifas')}
          </div>`
        }

        // ── PERSONALIZADA ───────────────────────────────────────────
        if (tableType === 'personalizada' && colsM) {
          const columns = JSON.parse(Buffer.from(colsM[1], 'base64').toString('utf8'))
          if (columns.length > 0) {
            const head = `<thead><tr>${columns.map(c => TH(c.name.toUpperCase())).join('')}</tr></thead>`
            const body = '<tbody>' + items.map(i => `<tr>${columns.map(c => TD(i[c.id]??'')).join('')}</tr>`).join('') + '</tbody>'
            return `<div style="margin:12px 0;">${tbl(head,body)}</div>`
          }
        }

        return `<div style="margin:12px 0;">
          <div style="font-weight:700;font-size:10pt;text-align:center;color:#1B3055;text-transform:uppercase;margin-bottom:4px;">${title}</div>
          ${buildPricingTableHtml(items, ivaRate, tableType)}
        </div>`
      } catch {
        return ''
      }
    }
  )
}

/**
 * Reemplaza variables {{nombre_variable}} en el HTML con los valores reales
 * y procesa los nodos <pricing-table> embebidos en el documento.
 */
/**
 * Solo reemplaza {{variables}} — preserva los nodos <pricing-table> intactos.
 * Usar para guardar en DB (permite re-editar el documento).
 */
export function applyVariables(html, data) {
  return (html || '').replace(/\{\{(\w+)\}\}/g, (_match, key) => data[key] ?? '')
}

export function fillTemplate(html, data) {
  // 1. Reemplazar variables
  let result = (html || '').replace(/\{\{(\w+)\}\}/g, (_match, key) => data[key] ?? '')
  // 2. Procesar tablas de precios interactivas (solo para PDF — expande <pricing-table>)
  result = processPricingTableNodes(result)
  return result
}

/**
 * Extrae todas las variables {{campo}} de un HTML.
 * Util para mostrarlas en el editor y saber que datos son necesarios.
 * @param {string} html
 * @returns {string[]}
 */
export function extractVariables(html) {
  const matches = html.matchAll(/\{\{(\w+)\}\}/g);
  return [...new Set([...matches].map((m) => m[1]))];
}

/**
 * Genera un PDF a partir de HTML.
 * @param {string} html — HTML completo del documento (con variables ya reemplazadas)
 * @returns {Buffer} — Buffer del PDF generado
 */
// Flags de Chromium para correr Puppeteer en contenedores Railway.
// El plan del usuario tiene 8GB de RAM disponibles, así que memoria NO es el
// problema. NO usamos --single-process ni --no-zygote: causan que Chromium
// tire "Cannot use V8 Proxy resolver in single process mode" y muera con
// signal en versiones recientes de Chromium — están deprecated.
const PUPPETEER_CONTAINER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-software-rasterizer',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-default-apps',
  '--disable-sync',
  '--disable-translate',
  '--hide-scrollbars',
  '--metrics-recording-only',
  '--mute-audio',
  '--no-first-run',
  '--safebrowsing-disable-auto-update',
  '--disable-features=VizDisplayCompositor,AudioServiceOutOfProcess',
];

// Resuelve el executablePath de Chromium: si PUPPETEER_EXECUTABLE_PATH está
// seteado Y el binario EXISTE, lo usamos. Si está seteado pero apunta a un
// binario que ya no existe (típicamente porque la env var quedó huérfana en
// Railway después de que el Dockerfile dejó de instalar chromium del apt),
// caemos a undefined → Puppeteer usa su Chromium bundled (PUPPETEER_CACHE_DIR).
function resolveExecutablePath() {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (!envPath) return undefined;
  if (existsSync(envPath)) return envPath;
  console.warn(`[PDF] PUPPETEER_EXECUTABLE_PATH="${envPath}" no existe; usando Chromium bundled`);
  return undefined;
}

export async function generatePdf(html) {
  const browser = await puppeteer.launch({
    headless: true,                      // modo headless clásico — el 'new' puede tener bugs con Chromium de Debian slim
    executablePath: resolveExecutablePath(),
    args: PUPPETEER_CONTAINER_ARGS,
    dumpio: true,                        // seguimos volcando stderr a logs por si algo falla
    handleSIGINT:  false,
    handleSIGTERM: false,
    handleSIGHUP:  false,
    protocolTimeout: 120000,
  });

  try {
    const page = await browser.newPage();

    // Incrustar imágenes locales como base64 — Puppeteer no necesita HTTP
    const htmlReady = embedLocalImages(html);

    await page.setContent(htmlReady, { waitUntil: 'networkidle0' });

    // Si el template define su propio @page o usa imágenes full-bleed, dejamos
    // que el CSS controle los márgenes (margen 0 en Puppeteer). Puppeteer ignora
    // el @page del CSS si se le pasa un margin explícito, así que solo aplicamos
    // los 15mm por defecto cuando el template NO pide full-bleed.
    const wantsFullBleed = /@page\b/.test(html) || /mr-full-bleed/.test(html);
    const margin = wantsFullBleed
      ? { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
      : { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' };

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin,
    });

    return pdf;
  } finally {
    await browser.close();
  }
}

/**
 * HTML base para envolver el contenido del documento.
 * Aplica estilos basicos tipo carta/contrato.
 */
/**
 * Genera un PNG thumbnail (miniatura) de la primera página del HTML.
 * Viewport A4 a escala reducida. Devuelve la URL pública del PNG.
 */
export async function generateThumbnail(html, templateId) {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: resolveExecutablePath(),
    args: PUPPETEER_CONTAINER_ARGS,
    dumpio: true,
    handleSIGINT:  false,
    handleSIGTERM: false,
    handleSIGHUP:  false,
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Capturar solo la primera "página" visible (620px de alto = primera mitad)
    const buffer = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: 794, height: 560 },
    });

    const dir = pathJoin(__dirnamePdf, '../../uploads/thumbnails');
    mkdirSync(dir, { recursive: true });
    const filename = `tpl_${templateId}.png`;
    writeFileSync(pathJoin(dir, filename), buffer);

    const base = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3001}`;
    return `${base}/uploads/thumbnails/${filename}`;
  } finally {
    await browser.close();
  }
}

export function wrapDocumentHtml(contentHtml, title = 'Documento') {
  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <style>
        /* CRÍTICO: sin esto Puppeteer no renderiza fondos de color */
        * {
          box-sizing: border-box; margin: 0; padding: 0;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        body {
          font-family: Arial, Helvetica, sans-serif;
          font-size: 10pt;
          color: #222;
          background: white;
        }
        /* El template define su propio layout — no restringir el ancho */
        .document-body {
          max-width: 100%;
          margin: 0;
          padding: 0;
        }
        h1 { font-size: 18pt; margin-bottom: 16px; }
        h2 { font-size: 14pt; margin: 20px 0 10px; }
        p  { margin-bottom: 12px; }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 16px 0;
        }
        th, td {
          border: 1px solid #ccc;
          padding: 8px 12px;
          text-align: left;
        }
        th { background: #f5f5f5; font-weight: bold; }
        .signature-block {
          margin-top: 40px;
          display: flex;
          gap: 60px;
        }
        .signature-line {
          border-top: 1px solid #333;
          padding-top: 8px;
          min-width: 200px;
          font-size: 10pt;
          color: #555;
        }
      </style>
    </head>
    <body>
      <div class="document-body">
        ${contentHtml}
      </div>
    </body>
    </html>
  `;
}
