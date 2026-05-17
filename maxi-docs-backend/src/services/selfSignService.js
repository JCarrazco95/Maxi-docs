/**
 * Servicio de firma electrónica propio — sin DocuSeal
 * Embebe la firma dibujada directamente en el PDF usando pdf-lib
 */
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Embebe una o varias firmas en el PDF y devuelve el Buffer del PDF firmado.
 *
 * @param {string} pdfUrl  — URL local del PDF (http://localhost:3001/uploads/...)
 * @param {Array}  signers — [{ name, email, signatureDataUrl, fieldConfig }]
 *                           signatureDataUrl: 'data:image/png;base64,...'
 *                           fieldConfig:      [{ type, x, y, w, h, page }] en %
 * @returns {Buffer}  PDF firmado con certificado al final
 */
export async function embedSignaturesInPdf(pdfSource, signers) {
  // pdfSource puede ser un Buffer (desde DB) o una URL
  let pdfBytes;
  if (Buffer.isBuffer(pdfSource)) {
    pdfBytes = pdfSource;
  } else {
    // Intentar leer desde URL (R2 o filesystem local)
    try {
      const resp = await fetch(pdfSource);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      pdfBytes = Buffer.from(await resp.arrayBuffer());
    } catch {
      // Fallback: leer desde filesystem local
      const filename = pdfSource.split('/').pop();
      const pdfPath  = join(__dirname, '../../uploads/documents', filename);
      const { readFileSync } = await import('fs');
      pdfBytes = readFileSync(pdfPath);
    }
  }

  const pdfDoc   = await PDFDocument.load(pdfBytes);
  const pages    = pdfDoc.getPages();
  const font     = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  for (const signer of signers) {
    if (!signer.signatureDataUrl) continue;

    // Decodificar imagen de firma (base64 PNG)
    const base64Data = signer.signatureDataUrl.replace(/^data:image\/\w+;base64,/, '');
    const sigBytes   = Buffer.from(base64Data, 'base64');
    const sigImage   = await pdfDoc.embedPng(sigBytes);

    const fieldCfg = signer.fieldConfig ?? []; // Campos donde va la firma

    for (const field of fieldCfg) {
      if (field.type !== 'signature' && field.type !== 'initials') continue;

      const pageIdx = (field.page ?? 1) - 1;
      const page    = pages[pageIdx];
      if (!page) continue;

      const { width: pw, height: ph } = page.getSize();

      // Convertir % a puntos PDF (origin bottom-left en pdf-lib)
      const x = (field.x / 100) * pw;
      const y = ph - ((field.y / 100) * ph) - ((field.h / 100) * ph);
      const w = (field.w / 100) * pw;
      const h = (field.h / 100) * ph;

      // Dibujar la firma
      page.drawImage(sigImage, { x, y, width: w, height: h });

      // Añadir nombre del firmante debajo
      page.drawText(signer.name ?? '', {
        x: x + 2,
        y: y - 12,
        size: 7,
        font,
        color: rgb(0.3, 0.3, 0.3),
      });
    }

    // Campos de tipo date/text
    for (const field of fieldCfg) {
      if (field.type !== 'date' && field.type !== 'text') continue;

      const pageIdx = (field.page ?? 1) - 1;
      const page    = pages[pageIdx];
      if (!page) continue;

      const { width: pw, height: ph } = page.getSize();
      const x = (field.x / 100) * pw;
      const y = ph - ((field.y / 100) * ph) - ((field.h / 100) * ph) + 4;
      const txt = field.type === 'date'
        ? new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })
        : (signer.name ?? '')

      page.drawText(txt, { x, y, size: 9, font, color: rgb(0.1, 0.1, 0.5) });
    }
  }

  // ── Página de certificado de firma ─────────────────────────────
  const certPage = pdfDoc.addPage([595, 842]); // A4
  const now      = new Date();

  certPage.drawRectangle({ x: 0, y: 0, width: 595, height: 842, color: rgb(0.97, 0.97, 1) });
  certPage.drawRectangle({ x: 0, y: 800, width: 595, height: 42, color: rgb(0.105, 0.188, 0.333) });
  certPage.drawText('CERTIFICADO DE FIRMA ELECTRÓNICA', { x: 30, y: 816, size: 14, font: fontBold, color: rgb(1,1,1) });

  const lines = [
    `Documento firmado electrónicamente`,
    `Fecha y hora: ${now.toLocaleString('es-MX')}`,
    ``,
    ...signers.map((s, i) => [
      `Firmante ${i + 1}: ${s.name} <${s.email}>`,
      `  Firmado el: ${s.signedAt ? new Date(s.signedAt).toLocaleString('es-MX') : now.toLocaleString('es-MX')}`,
      `  IP: ${s.ip ?? 'N/D'}`,
      ``,
    ]).flat(),
    `Este certificado garantiza la autenticidad e integridad del documento.`,
    `Firma válida conforme al CCOM de México (Art. 89 y 90).`,
  ];

  lines.forEach((line, i) => {
    certPage.drawText(line, {
      x: 30,
      y: 760 - (i * 18),
      size: 10,
      font: line.startsWith('Firmante') ? fontBold : font,
      color: rgb(0.1, 0.1, 0.1),
    });
  });

  const signedBytes = await pdfDoc.save();
  return Buffer.from(signedBytes);
}

/**
 * Guarda el PDF firmado en filesystem local (solo como caché, no es la fuente de verdad).
 * En producción la fuente de verdad es la columna signed_pdf_content en PostgreSQL.
 */
export function saveSignedPdfLocal(documentId, buffer) {
  try {
    const filename = `${documentId}_firmado.pdf`;
    const outPath  = join(__dirname, '../../uploads/documents', filename);
    writeFileSync(outPath, buffer);
  } catch { /* ignorar en prod */ }
}
