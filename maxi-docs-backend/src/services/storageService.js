import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
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
 * Elimina un archivo de R2.
 */
export async function deleteFile(key) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/**
 * Construye la key de R2 para un documento.
 */
export function buildPdfKey(documentId) {
  return `documents/${documentId}.pdf`;
}
