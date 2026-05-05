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
export async function sendForSignature({ documentName, pdfUrl, signers, expireDays = null }) {
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

  // Campo de firma único en la primera página, en el bloque de firmas de la propuesta
  // Coordenadas en porcentaje del tamaño de la página (A4)
  // x=5%  → margen izquierdo
  // y=77% → ~77% desde arriba (zona de firma "Nombre y firma del cliente")
  // w=38% → ancho del bloque izquierdo
  // h=9%  → altura del campo
  // Para ajustar: modifica SIGNATURE_X, SIGNATURE_Y en .env o edita aquí directamente
  const SIG_X = Number(process.env.SIGNATURE_X ?? 5);
  const SIG_Y = Number(process.env.SIGNATURE_Y ?? 77);
  const SIG_W = Number(process.env.SIGNATURE_W ?? 38);
  const SIG_H = Number(process.env.SIGNATURE_H ?? 9);
  const SIG_P = Number(process.env.SIGNATURE_PAGE ?? 1);

  const signatureField = {
    name:     'Firma del cliente',
    type:     'signature',
    required: true,
    position: { x: SIG_X, y: SIG_Y, w: SIG_W, h: SIG_H, page: SIG_P },
  };

  const template = await docusealPost('/templates/pdf', {
    name:      documentName,
    documents: [documentSource],
    // Definimos explícitamente solo el campo de firma → el PDF queda de solo lectura
    submitters: [{ name: 'First Party', fields: [signatureField] }],
  });

  console.log(`[DocuSeal] Template creado: ID ${template.id}`);

  // 2. Crear el envío con todos los firmantes
  const expireAt = expireDays
    ? new Date(Date.now() + expireDays * 86_400_000).toISOString()
    : undefined;

  const submission = await docusealPost('/submissions', {
    template_id: template.id,
    send_email:  true,
    ...(expireAt ? { expire_at: expireAt } : {}),
    submitters: signers.map(s => ({
      role:  template.submitters?.[0]?.name ?? 'First Party',
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
