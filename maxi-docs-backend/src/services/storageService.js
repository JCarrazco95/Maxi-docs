import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { writeFileSync, mkdirSync, readFileSync, existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Usa almacenamiento local cuando R2 no está configurado (modo desarrollo)
const R2_CONFIGURED =
  process.env.R2_ACCOUNT_ID &&
  process.env.R2_ACCOUNT_ID !== 'tu_account_id';

// Cloudflare R2 es 100% compatible con la API de S3
const s3 = R2_CONFIGURED
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    })
  : null;

const BUCKET = process.env.R2_BUCKET_NAME;
const PUBLIC_URL = process.env.R2_PUBLIC_URL;

/**
 * Sube un PDF a R2 (producción) o al sistema de archivos local (desarrollo).
 * @param {string} key — nombre del archivo, ej: "documents/uuid.pdf"
 * @param {Buffer} buffer — contenido del PDF
 * @returns {string} URL publica del archivo
 */
export async function uploadPdf(key, buffer) {
  if (!R2_CONFIGURED) {
    // Sin R2: guardar también en filesystem local como caché (no es la fuente de verdad)
    try {
      const uploadsDir = join(__dirname, '../../uploads/documents');
      mkdirSync(uploadsDir, { recursive: true });
      const filename = key.split('/').pop();
      writeFileSync(join(uploadsDir, filename), buffer);
    } catch { /* ignorar errores de filesystem en prod */ }
    // Devolver null — el caller guardará en DB y usará la URL de la API
    return null;
  }

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: 'application/pdf',
      CacheControl: 'max-age=31536000',
    })
  );
  return `${PUBLIC_URL}/${key}`;
}

/**
 * Genera una URL pre-firmada para descarga temporal (expira en 1 hora).
 * Util para compartir documentos sin hacerlos completamente publicos.
 */
export async function getPresignedDownloadUrl(key, expiresInSeconds = 3600) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
}

/**
 * Elimina un archivo de R2 o del filesystem local.
 */
export async function deleteFile(key) {
  if (!R2_CONFIGURED) {
    const filepath = join(ATTACHMENTS_DIR, key.replace(/^attachments\//, ''));
    if (existsSync(filepath)) unlinkSync(filepath);
    return;
  }
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/**
 * Construye la key de R2 para un documento.
 */
export function buildPdfKey(documentId) {
  return `documents/${documentId}.pdf`;
}

// Carpeta local para archivos que no son el PDF principal del documento
// (ej. adjuntos de soporte) cuando R2 no está configurado.
const ATTACHMENTS_DIR = join(__dirname, '../../uploads/attachments');

/**
 * Construye la key de storage para un adjunto de documento. Incluye un uuid
 * para evitar colisiones entre archivos con el mismo nombre.
 */
export function buildAttachmentKey(documentId, filename) {
  return `attachments/${documentId}/${randomUUID()}-${filename}`;
}

/**
 * Sube un archivo arbitrario (no necesariamente PDF) a R2 o al filesystem
 * local. A diferencia de uploadPdf, no asume ningún content-type.
 * @returns {string|null} URL pública si R2 está configurado, null en local
 *          (el caller sirve el archivo vía la propia API en ese caso).
 */
export async function uploadFile(key, buffer, contentType) {
  if (!R2_CONFIGURED) {
    const filepath = join(ATTACHMENTS_DIR, key.replace(/^attachments\//, ''));
    mkdirSync(dirname(filepath), { recursive: true });
    writeFileSync(filepath, buffer);
    return null;
  }

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType || 'application/octet-stream',
    })
  );
  return `${PUBLIC_URL}/${key}`;
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/**
 * Descarga el contenido de un archivo (R2 o local) como Buffer. Usado para
 * adjuntarlo a un correo saliente.
 */
export async function downloadFile(key) {
  if (!R2_CONFIGURED) {
    const filepath = join(ATTACHMENTS_DIR, key.replace(/^attachments\//, ''));
    if (!existsSync(filepath)) return null;
    return readFileSync(filepath);
  }

  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  return streamToBuffer(res.Body);
}
