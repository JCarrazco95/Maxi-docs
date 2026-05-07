import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BASE    = process.env.DOCUSEAL_API_URL || 'https://api.docuseal.com';
const API_KEY = process.env.DOCUSEAL_API_KEY;

async function docusealPost(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Token': API_KEY,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!res.ok) {
    console.error(`[DocuSeal] ${path} ${res.status}:`, text.slice(0, 400));
    throw new Error(`DocuSeal ${res.status}: ${data?.error ?? data?.message ?? text.slice(0, 200)}`);
  }

  console.log(`[DocuSeal] ${path} OK`);
  return data;
}

// Lee el PDF desde almacenamiento local y lo convierte a base64
// (necesario porque localhost:3001 no es accesible desde Internet)
function pdfToBase64(pdfUrl) {
  const filename = pdfUrl.split('/').pop();
  const filePath = join(__dirname, '../../uploads/documents', filename);
  return readFileSync(filePath).toString('base64');
}

/**
 * Envía un documento a DocuSeal para firma electrónica.
 * Flujo: 1) crear plantilla desde PDF  2) crear envío con firmantes
 */
export async function sendForSignature({ documentName, pdfUrl, signers, expireDays = null, fieldConfig = null }) {
  if (!API_KEY || API_KEY === 'tu_api_key') {
    const err = new Error('DocuSeal no está configurado. Agrega DOCUSEAL_API_KEY en el .env del backend.');
    err.status = 503;
    throw err;
  }

  // 1. Subir el PDF como plantilla (en base64 si es localhost, por URL si es público)
  let documentSource;
  if (pdfUrl.startsWith('http://localhost') || pdfUrl.startsWith('http://127.')) {
    documentSource = { name: documentName, file: pdfToBase64(pdfUrl) };
  } else {
    documentSource = { name: documentName, url: pdfUrl };
  }

  // Construir los campos del template
  // NOTA: siempre usamos UN solo rol 'First Party' — es el formato que DocuSeal acepta
  // Los campos con posición personalizada del usuario reemplazan a los del .env
  // DocuSeal acepta dos formatos de posición:
  //   position: { x, y, w, h, page }  → valores en % (0-100)
  //   areas:   [{ x, y, w, h, page }] → valores como fracción (0-1)
  // Usamos 'areas' para campos personalizados y 'position' para el default

  let templateFields;

  if (fieldConfig && fieldConfig.length > 0) {
    // Campos configurados por el usuario — formato 'areas' (0-1)
    templateFields = fieldConfig.map((f, i) => ({
      name:     `${f.type}_${i + 1}`,
      type:     f.type,
      required: true,
      areas: [{
        x:    f.x / 100,
        y:    f.y / 100,
        w:    f.w / 100,
        h:    f.h / 100,
        page: f.page ?? 1,
      }],
    }));
    console.log(`[DocuSeal] Campos personalizados: ${templateFields.length}`,
      templateFields.map(f => `${f.name}@(${f.areas[0].x.toFixed(2)},${f.areas[0].y.toFixed(2)})`).join(' '));
  } else {
    // Default: firma en posición del .env — formato 'position' (0-100)
    templateFields = [{
      name:     'Firma del cliente',
      type:     'signature',
      required: true,
      position: {
        x:    Number(process.env.SIGNATURE_X    ?? 5),
        y:    Number(process.env.SIGNATURE_Y    ?? 77),
        w:    Number(process.env.SIGNATURE_W    ?? 38),
        h:    Number(process.env.SIGNATURE_H    ?? 9),
        page: Number(process.env.SIGNATURE_PAGE ?? 1),
      },
    }];
  }

  const submitterTemplates = [{ name: 'First Party', fields: templateFields }];

  let template;
  try {
    template = await docusealPost('/templates/pdf', {
      name:       documentName,
      documents:  [documentSource],
      submitters: submitterTemplates,
    });
  } catch (err) {
    // Si falla con campos personalizados, reintentar con la firma por defecto
    console.warn('[DocuSeal] Reintentando con firma por defecto:', err.message);
    const fallback = [{ name: 'First Party', fields: [{ name: 'Firma del cliente', type: 'signature', required: true, position: { x: Number(process.env.SIGNATURE_X??5), y: Number(process.env.SIGNATURE_Y??77), w: Number(process.env.SIGNATURE_W??38), h: Number(process.env.SIGNATURE_H??9), page: Number(process.env.SIGNATURE_PAGE??1) } }] }];
    template = await docusealPost('/templates/pdf', { name: documentName, documents: [documentSource], submitters: fallback });
  }

  console.log(`[DocuSeal] Template creado: ID ${template.id}, roles: ${submitterTemplates.map(s => s.name).join(', ')}`);

  // 2. Crear el envío — mapear cada firmante a su rol por índice
  const expireAt = expireDays
    ? new Date(Date.now() + expireDays * 86_400_000).toISOString()
    : undefined;

  const submission = await docusealPost('/submissions', {
    template_id: template.id,
    send_email:  true,
    ...(expireAt ? { expire_at: expireAt } : {}),
    submitters: signers.map(s => ({
      role:  'First Party',
      email: s.email,
      name:  s.name,
    })),
  });

  const submitters = Array.isArray(submission) ? submission : submission.submitters ?? [];

  return {
    opensignDocumentId: String(template.id),
    signUrls: submitters.map((sub, i) => ({
      email:   sub.email ?? signers[i]?.email ?? '',
      signUrl: sub.embed_src ?? sub.slug
        ? `https://docuseal.com/s/${sub.slug}`
        : '',
    })),
  };
}

export async function getSignatureStatus(docusealTemplateId) {
  try {
    const res = await fetch(`${BASE}/templates/${docusealTemplateId}/submissions`, {
      headers: { 'X-Auth-Token': API_KEY },
    });
    const data = await res.json();
    const submissions = Array.isArray(data) ? data : data.data ?? [];
    const allSigned = submissions.length > 0 && submissions.every(s => s.status === 'completed');
    return allSigned ? 'signed' : 'pending';
  } catch {
    return 'pending';
  }
}
