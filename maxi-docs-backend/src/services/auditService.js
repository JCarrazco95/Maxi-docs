import crypto from 'crypto';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { query } from '../db/connection.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Calcula SHA-256 de un Buffer o de un archivo local dado su URL
export function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function hashPdfFile(pdfUrl) {
  try {
    const filename = pdfUrl.split('/').pop();
    const path     = join(__dirname, '../../uploads/documents', filename);
    const buf      = readFileSync(path);
    return hashBuffer(buf);
  } catch {
    return null;
  }
}

// Registra un evento en document_events
export async function logEvent({ documentId, action, actor = {}, ip = null, pdfHash = null, metadata = {} }) {
  try {
    await query(
      `INSERT INTO document_events
         (document_id, action, actor_id, actor_name, actor_email, ip, pdf_hash, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        documentId,
        action,
        actor.id   ?? null,
        actor.name ?? null,
        actor.email ?? null,
        ip,
        pdfHash,
        JSON.stringify(metadata),
      ]
    );
  } catch (err) {
    // Audit nunca debe romper el flujo principal
    console.error('[Audit] Error logging event:', err.message);
  }
}

// Devuelve el historial de eventos de un documento
export async function getEvents(documentId) {
  const res = await query(
    `SELECT id, action, actor_name, actor_email, ip, pdf_hash, metadata, created_at
     FROM document_events
     WHERE document_id = $1
     ORDER BY created_at ASC`,
    [documentId]
  );
  return res.rows;
}
