import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { extractMondayContext } from './src/middleware/mondayAuth.js';
import templatesRouter from './src/routes/templates.js';
import documentsRouter from './src/routes/documents.js';
import signaturesRouter from './src/routes/signatures.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middlewares globales ──────────────────────────────────────────
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:8301').split(',');
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)),
  credentials: true,
}));
app.use(express.json());

// ── PDFs locales (desarrollo sin R2) ─────────────────────────────
app.use('/uploads', express.static(join(__dirname, 'uploads')));

// ── Health check ─────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'maxi-docs-backend', timestamp: new Date().toISOString() });
});

// ── Portal del firmante (público, sin autenticación) ─────────────
app.get('/api/portal/:signatureId', (req, _res, next) => {
  req.mondayContext = { accountId: 'portal', userId: 'portal', isAdmin: false };
  next();
}, signaturesRouter);

// ── Rutas de la API ───────────────────────────────────────────────
app.use('/api', extractMondayContext);
app.use('/api/templates', templatesRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/signatures', signaturesRouter);

// ── Error handler global ─────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.stack ?? err.message);
  const status = err.status ?? 500;
  res.status(status).json({
    error: err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

app.listen(PORT, () => {
  console.log(`\n Maxi-Docs Backend corriendo en http://localhost:${PORT}`);
  console.log(` Health check: http://localhost:${PORT}/health\n`);
});
