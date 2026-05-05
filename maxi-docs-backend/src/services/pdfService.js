import puppeteer from 'puppeteer';
import { buildPricingTableHtml } from './catalogService.js';

// ── Procesa nodos <pricing-table> embebidos en el HTML ────────
// Los nodos guardan items como base64 JSON en data-items-b64
function processPricingTableNodes(html) {
  return html.replace(
    /<pricing-table([^>]*)><\/pricing-table>/g,
    (_, attrs) => {
      try {
        const titleM = attrs.match(/data-title="([^"]*)"/)
        const b64M   = attrs.match(/data-items-b64="([^"]*)"/)
        const ivaM   = attrs.match(/data-iva="([^"]*)"/)

        const title = titleM?.[1] ?? 'Cotización'
        const items = b64M
          ? JSON.parse(Buffer.from(b64M[1], 'base64').toString('utf8'))
          : []
        const iva   = Number(ivaM?.[1] ?? 16)

        if (!items?.length) return ''

        return `<div style="margin:16px 0;">
          <div style="font-weight:bold;font-size:11pt;margin-bottom:8px;color:#1B3055;">
            ${title.toUpperCase()}
          </div>
          ${buildPricingTableHtml(items, iva)}
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
export function fillTemplate(html, data) {
  // 1. Reemplazar variables
  let result = html.replace(/\{\{(\w+)\}\}/g, (_match, key) => data[key] ?? '')
  // 2. Procesar tablas de precios interactivas
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
export async function generatePdf(html) {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage', // necesario en Railway/Docker
    ],
  });

  try {
    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
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
export function wrapDocumentHtml(contentHtml, title = 'Documento') {
  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Georgia', 'Times New Roman', serif;
          font-size: 12pt;
          line-height: 1.6;
          color: #1a1a1a;
          background: white;
        }
        .document-body {
          max-width: 170mm;
          margin: 0 auto;
          padding: 10mm 0;
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
