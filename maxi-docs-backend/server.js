import 'dotenv/config';
import express from 'express';
import { query } from './src/db/connection.js';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { extractMondayContext, requireEditor, requireAdmin } from './src/middleware/mondayAuth.js';
import templatesRouter      from './src/routes/templates.js';
import documentsRouter      from './src/routes/documents.js';
import signaturesRouter     from './src/routes/signatures.js';
import catalogRouter        from './src/routes/catalog.js';
import approvalsRouter      from './src/routes/approvals.js';
import contentLibraryRouter from './src/routes/contentLibrary.js';
import settingsRouter       from './src/routes/settings.js';
import paymentsRouter       from './src/routes/payments.js';
import aiRouter             from './src/routes/ai.js';
import embedRouter          from './src/routes/embed.js';
import integrationsRouter   from './src/routes/integrations.js';
import dealRoomsRouter      from './src/routes/dealRooms.js';
import cpqRouter            from './src/routes/cpq.js';
import workspacesRouter     from './src/routes/workspaces.js';
import authRouter           from './src/routes/auth.js';
import mondayRouter         from './src/routes/monday.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middlewares globales ──────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:8301',
  'https://maxi-docs.vercel.app',
  ...(process.env.FRONTEND_URL || '').split(',').map(u => u.trim()).filter(Boolean),
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('CORS: origen no permitido'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));

// ── Archivos estáticos (PDFs y thumbnails en desarrollo) ──────────
app.use('/uploads', express.static(join(__dirname, 'uploads')));

// ── Health check ─────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'maxi-docs-backend', timestamp: new Date().toISOString() });
});

// ── Rutas de la API ───────────────────────────────────────────────
app.use('/api', extractMondayContext);
// Templates: crear/editar requiere role editor o superior
app.use('/api/templates',       templatesRouter);
app.use('/api/documents',       documentsRouter);
app.use('/api/signatures',      signaturesRouter);
app.use('/api/catalog',         catalogRouter);
app.use('/api/approvals',       approvalsRouter);
app.use('/api/content-library', contentLibraryRouter);
app.use('/api/settings',        settingsRouter);
app.use('/api/payments',        paymentsRouter);
app.use('/api/ai',              aiRouter);
app.use('/api/embed',           embedRouter);
app.use('/api/integrations',    integrationsRouter);
app.use('/api/rooms',           dealRoomsRouter);
app.use('/api/cpq',             cpqRouter);
app.use('/api/workspaces',      workspacesRouter);
app.use('/api/monday',          mondayRouter);
// Auth público — sin extractMondayContext (acceso externo via Google OAuth)
app.use('/api/auth',           authRouter);

// ── Error handler global ─────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.stack ?? err.message);
  const status = err.status ?? 500;
  res.status(status).json({
    error: err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// Columnas opcionales — se agregan si no existen (idempotente)
async function ensureColumns() {
  const cols = [
    `ALTER TABLE catalog_categories ADD COLUMN IF NOT EXISTS monday_group_id TEXT`,
    `ALTER TABLE catalog_products   ADD COLUMN IF NOT EXISTS monday_item_id  TEXT`,
    `ALTER TABLE catalog_products   ADD COLUMN IF NOT EXISTS sort_order      INTEGER DEFAULT 0`,
    `ALTER TABLE catalog_products   ADD COLUMN IF NOT EXISTS active          BOOLEAN DEFAULT true`,
    `ALTER TABLE documents          ADD COLUMN IF NOT EXISTS owner_email     TEXT`,
    `ALTER TABLE documents          ADD COLUMN IF NOT EXISTS owner_name      TEXT`,
    `ALTER TABLE documents          ADD COLUMN IF NOT EXISTS content_html    TEXT`,
    `ALTER TABLE documents          ADD COLUMN IF NOT EXISTS pdf_url         TEXT`,
    `ALTER TABLE documents          ADD COLUMN IF NOT EXISTS pdf_hash        VARCHAR(64)`,
    `ALTER TABLE documents          ADD COLUMN IF NOT EXISTS doc_number      VARCHAR(50)`,
    `ALTER TABLE documents          ADD COLUMN IF NOT EXISTS approval_status VARCHAR(50)`,
    `ALTER TABLE signatures         ADD COLUMN IF NOT EXISTS viewed_at       TIMESTAMPTZ`,
    `ALTER TABLE signatures         ADD COLUMN IF NOT EXISTS signed_at       TIMESTAMPTZ`,
    `ALTER TABLE signatures         ADD COLUMN IF NOT EXISTS time_spent_seconds INT`,
    `ALTER TABLE signatures         ADD COLUMN IF NOT EXISTS signing_order   INT DEFAULT 1`,
  ];
  for (const sql of cols) {
    try { await query(sql); } catch {}
  }
}
ensureColumns();

app.listen(PORT, () => {
  console.log(`\n Maxi-Docs Backend corriendo en http://localhost:${PORT}`);
  console.log(` Health check: http://localhost:${PORT}/health\n`);
});
