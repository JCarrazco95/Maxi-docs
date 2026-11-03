/**
 * Propuestas de una oportunidad y su aprobación por el cliente.
 *
 * A un cliente se le pueden mandar varias cotizaciones para la misma
 * oportunidad (mismo item de Monday). Desde cualquiera de sus enlaces ve todas
 * las que se le han enviado, lado a lado, y aprueba UNA. Al aprobarla, las
 * demás quedan como "no seleccionadas" y la elección ya no se puede cambiar
 * desde el portal: para reabrirla, el cliente habla con su ejecutivo.
 *
 * documents.client_selection: NULL (sin decidir) | 'approved' | 'not_selected'
 *
 * Las funciones reciben `db` inyectable para poder probarlas contra una base
 * de prueba sin levantar el servidor.
 */
import { query } from '../db/connection.js';
import { extractQuoteValues } from '../routes/documents.js';

// Una propuesta cuenta como "enviada al cliente" en cualquiera de estos estados
const ESTADOS_ENVIADOS = ['sent', 'signed'];

function plazoDe(doc, quote) {
  let plazo = null;
  try {
    const filled = typeof doc.filled_data === 'string' ? JSON.parse(doc.filled_data) : (doc.filled_data ?? {});
    plazo = filled.plazo || null;
  } catch { /* ignorar */ }
  return plazo || quote?.plazoMinimo || null;
}

/** Lo que el portal muestra de cada propuesta (nunca el HTML ni el PDF en crudo). */
export function resumenPropuesta(doc) {
  let quote = null;
  try { quote = extractQuoteValues(doc.content_html); } catch { /* sin tablas */ }
  return {
    id:             doc.id,
    nombre:         doc.name,
    folio:          doc.doc_number ?? null,
    pdf_url:        `/api/documents/${doc.id}/pdf`,
    unidades:       quote?.unidades ?? [],
    unidades_count: quote?.unidadesCount ?? 0,
    plazo:          plazoDe(doc, quote),
    renta_mensual:  Math.round(quote?.rentaMensual ?? 0),
    valor_sin_iva:  quote?.totalSinIVA ?? 0,
    valor_con_iva:  quote?.totalConIVA ?? 0,
    seleccion:      doc.client_selection ?? null,
    seleccionada_en: doc.client_selected_at ?? null,
    creada_en:      doc.created_at ?? null,
  };
}

/** Datos de la firma (enlace del portal) y del documento con el que se abrió. */
async function cargarFirma(signatureId, db) {
  const r = await db(
    `SELECT s.id AS signature_id, s.signer_name, s.signer_email,
            d.id AS document_id, d.monday_account_id, d.monday_item_id
     FROM signatures s JOIN documents d ON d.id = s.document_id
     WHERE s.id = $1`,
    [signatureId]
  );
  return r.rows[0] ?? null;
}

/**
 * Propuestas de la misma oportunidad que el documento dado: las enviadas al
 * cliente, más el propio documento aunque siga en borrador. Si el documento no
 * está ligado a un item de Monday, la "oportunidad" es solo él.
 */
export async function listarPropuestas({ documentId, db = query }) {
  const base = await db(
    `SELECT monday_account_id, monday_item_id FROM documents WHERE id = $1`,
    [documentId]
  );
  const doc = base.rows[0];
  if (!doc) return [];

  const columnas = `id, name, doc_number, content_html, filled_data, status,
                    client_selection, client_selected_at, created_at`;
  const r = doc.monday_item_id
    ? await db(
        `SELECT ${columnas} FROM documents
         WHERE monday_account_id IS NOT DISTINCT FROM $1 AND monday_item_id = $2
           AND (status = ANY($3) OR id = $4)
         ORDER BY created_at ASC`,
        [doc.monday_account_id, doc.monday_item_id, ESTADOS_ENVIADOS, documentId]
      )
    : await db(`SELECT ${columnas} FROM documents WHERE id = $1`, [documentId]);

  return r.rows.map(resumenPropuesta);
}

/** Propuestas que ve el cliente desde su enlace del portal. */
export async function propuestasDelPortal({ signatureId, db = query }) {
  const firma = await cargarFirma(signatureId, db);
  if (!firma) return null;
  const propuestas = await listarPropuestas({ documentId: firma.document_id, db });
  const aprobada   = propuestas.find(p => p.seleccion === 'approved') ?? null;
  return { propuestas, aprobada_id: aprobada?.id ?? null };
}

/**
 * El cliente aprueba una propuesta desde su enlace del portal.
 *
 * Devuelve { ok: true, aprobada, descartadas, firma } o
 *          { ok: false, status, code, error, aprobada_id? }.
 */
export async function aprobarPropuesta({ signatureId, documentId, db = query }) {
  const firma = await cargarFirma(signatureId, db);
  if (!firma) return { ok: false, status: 404, code: 'ENLACE_INVALIDO', error: 'El enlace no es válido o ya expiró.' };

  const propuestas = await listarPropuestas({ documentId: firma.document_id, db });
  if (!propuestas.some(p => p.id === documentId)) {
    return { ok: false, status: 404, code: 'NO_ES_PROPUESTA', error: 'Esa propuesta no pertenece a este enlace.' };
  }

  const previa = propuestas.find(p => p.seleccion === 'approved');
  if (previa) {
    return {
      ok: false, status: 409, code: 'YA_APROBADA', aprobada_id: previa.id,
      error: previa.id === documentId
        ? 'Esta propuesta ya está aprobada.'
        : 'Ya aprobaste otra propuesta. Si quieres cambiarla, contacta a tu ejecutivo.',
    };
  }

  const ids = propuestas.map(p => p.id);
  const quien = [firma.signer_name, firma.signer_email ? `<${firma.signer_email}>` : ''].filter(Boolean).join(' ');

  // Un solo UPDATE marca la elegida y descarta las demás. El índice único
  // parcial (una sola 'approved' por item) cubre dos aprobaciones simultáneas.
  let r;
  try {
    r = await db(
      `UPDATE documents
         SET client_selection   = CASE WHEN id = $1 THEN 'approved' ELSE 'not_selected' END,
             client_selected_at = NOW(),
             client_selected_by = $3
       WHERE id = ANY($2)
         AND NOT EXISTS (
           SELECT 1 FROM documents x WHERE x.id = ANY($2) AND x.client_selection = 'approved'
         )
       RETURNING id, client_selection`,
      [documentId, ids, quien || null]
    );
  } catch (e) {
    if (e.code === '23505') {
      return { ok: false, status: 409, code: 'YA_APROBADA', error: 'Ya aprobaste otra propuesta. Si quieres cambiarla, contacta a tu ejecutivo.' };
    }
    throw e;
  }
  if (!r.rows.length) {
    return { ok: false, status: 409, code: 'YA_APROBADA', error: 'Ya aprobaste otra propuesta. Si quieres cambiarla, contacta a tu ejecutivo.' };
  }

  const full = await db(`SELECT * FROM documents WHERE id = $1`, [documentId]);
  return {
    ok:          true,
    aprobada:    full.rows[0],
    descartadas: r.rows.filter(x => x.client_selection === 'not_selected').map(x => x.id),
    firma,
  };
}

/** ¿La oportunidad ya tiene una propuesta aprobada por el cliente? */
export async function propuestaAprobadaDelItem({ accountId, mondayItemId, db = query }) {
  if (!mondayItemId) return null;
  const r = await db(
    `SELECT id, doc_number, name FROM documents
     WHERE monday_account_id IS NOT DISTINCT FROM $1 AND monday_item_id = $2
       AND client_selection = 'approved'
     LIMIT 1`,
    [accountId, String(mondayItemId)]
  );
  return r.rows[0] ?? null;
}

/** Cuántas propuestas de la oportunidad tendrá el cliente al enviarle este documento. */
export async function contarPropuestasAlEnviar({ documentId, db = query }) {
  const propuestas = await listarPropuestas({ documentId, db });
  return propuestas.length;
}
